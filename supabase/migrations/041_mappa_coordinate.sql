-- =====================================================================================
-- 041 — Coordinate della mappa: posizione reale dei punti calcolata dal server (D139)
--
-- L'Admin crea la mappa dal pannello: cerca il paese e sceglie l'area; il suo browser la disegna (OpenFreeMap, nord in
-- alto) e pubblica immagine e angoli sud-ovest e nord-est. Il server calcola latitudine e longitudine di ogni punto dalla sua posizione sul
-- disegno (proiezione delle mappe web, Mercatore): così "Apri con Google Maps / Mappe" funziona per tutti i punti.
-- - si ricalcolano tutti i punti quando si salvano gli angoli, e ogni punto quando lo si aggiunge o lo si sposta;
-- - con una nuova immagine gli angoli si azzerano (e le posizioni reali spariscono) finché non si reinseriscono.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- Posizione reale di un punto (x, y da 0 a 1 sul disegno) dagli angoli salvati; null se gli angoli mancano.
-- In orizzontale la longitudine è proporzionale; in verticale si passa dalla proiezione di Mercatore.
create or replace function public._map_latlng(p_x real, p_y real, out lat double precision, out lng double precision)
language plpgsql stable set search_path = public as $$
declare
  v_b jsonb := _setting('map_bounds');
  v_mn double precision;
  v_ms double precision;
begin
  if v_b is null or jsonb_typeof(v_b) <> 'object' then return; end if;
  lng := (v_b ->> 'west')::double precision + p_x * ((v_b ->> 'east')::double precision - (v_b ->> 'west')::double precision);
  v_mn := ln(tan(pi() / 4 + radians((v_b ->> 'north')::double precision) / 2));
  v_ms := ln(tan(pi() / 4 + radians((v_b ->> 'south')::double precision) / 2));
  lat := degrees(2 * atan(exp(v_mn + p_y * (v_ms - v_mn))) - pi() / 2);
  lat := round(lat::numeric, 7);
  lng := round(lng::numeric, 7);
end;
$$;

-- Ricalcola la posizione reale di tutti i punti (o la toglie se gli angoli mancano)
create or replace function public._map_fill_coords()
returns void language sql volatile set search_path = public as $$
  update map_points p set lat = c.lat, lng = c.lng from map_points q, lateral _map_latlng(q.x, q.y) c where p.id = q.id;
  select _map_points_touch();
$$;
revoke execute on function public._map_latlng(real, real), public._map_fill_coords() from public, anon, authenticated;

-- Angoli della mappa (solo Admin): sud-ovest e nord-est. Tutti null = toglierli.
create or replace function public.staff_set_map_bounds(p_token text, p_south double precision, p_west double precision,
                                                       p_north double precision, p_east double precision,
                                                       p_place text default null, p_source text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_admin players := _admin_player(p_token);
begin
  if v_admin.id is null then return _admin_denied(p_token); end if;
  if p_south is null and p_west is null and p_north is null and p_east is null then
    delete from settings where key = 'map_bounds';
  elsif p_south is null or p_west is null or p_north is null or p_east is null
     or p_south not between -85 and 85 or p_north not between -85 and 85 or p_west not between -180 and 180 or p_east not between -180 and 180
     or p_south >= p_north or p_west >= p_east or p_north - p_south > 1 or p_east - p_west > 1 then
    return jsonb_build_object('ok', false, 'error', 'BOUNDS_INVALID');
  else
    insert into settings (key, value)
    values ('map_bounds', jsonb_build_object('south', p_south, 'west', p_west, 'north', p_north, 'east', p_east,
      'place', left(nullif(trim(coalesce(p_place, '')), ''), 200),
      'source', case when p_source in ('openfreemap', 'image') then p_source end))
    on conflict (key) do update set value = excluded.value;
  end if;
  perform _map_fill_coords();
  perform _staff_log(v_admin, 'map', null, jsonb_build_object('bounds', _setting('map_bounds')));
  return jsonb_build_object('ok', true, 'bounds', _setting('map_bounds'));
end;
$$;
revoke execute on function public.staff_set_map_bounds(text, double precision, double precision, double precision, double precision, text, text) from public;
grant execute on function public.staff_set_map_bounds(text, double precision, double precision, double precision, double precision, text, text) to anon, authenticated;

-- Come in 039, con la posizione reale calcolata dagli angoli
create or replace function public.staff_map_save_point(p_token text, p_id bigint, p_type text, p_title text,
                                                       p_description text, p_x real, p_y real,
                                                       p_lat double precision default null,
                                                       p_lng double precision default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_title text := trim(coalesce(p_title, ''));
  v_desc text := nullif(trim(coalesce(p_description, '')), '');
  v_point map_points;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  if p_type is null or not (p_type = any (_map_types())) or length(v_title) not between 1 and 60
     or length(coalesce(v_desc, '')) > 300 or p_x is null or p_y is null or p_x not between 0 and 1 or p_y not between 0 and 1
     or (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('ok', false, 'error', 'POINT_INVALID');
  end if;
  if p_id is null then
    insert into map_points (type, title, description, x, y, lat, lng, updated_by)
    values (p_type, v_title, v_desc, p_x, p_y, p_lat, p_lng, v_staff.nickname)
    returning * into v_point;
  else
    update map_points set type = p_type, title = v_title, description = v_desc, x = p_x, y = p_y, lat = p_lat, lng = p_lng,
      updated_at = now(), updated_by = v_staff.nickname
    where id = p_id returning * into v_point;
    if v_point.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  end if;
  -- posizione reale calcolata dagli angoli della mappa (se ci sono); quella mandata dal telefono non conta
  update map_points set lat = c.lat, lng = c.lng from _map_latlng(v_point.x, v_point.y) c
  where map_points.id = v_point.id returning map_points.* into v_point;
  perform _map_points_touch();
  perform _staff_log(v_staff, 'map', v_title, jsonb_build_object('point', v_point.id, 'type', p_type, 'new', p_id is null));
  return jsonb_build_object('ok', true, 'point', _map_point_json(v_point));
end;
$$;

-- Come in 039: una nuova immagine azzera gli angoli
create or replace function public.staff_set_map_image(p_token text, p_mime text, p_data text, p_width int, p_height int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_admin players := _admin_player(p_token);
begin
  if v_admin.id is null then return _admin_denied(p_token); end if;
  if p_mime is null or p_mime not in ('image/webp', 'image/jpeg', 'image/png') or p_data is null
     or length(p_data) < 100 or length(p_data) > 3000000 or p_data !~ '^[A-Za-z0-9+/=]+$'
     or p_width not between 100 and 4000 or p_height not between 100 and 4000 then
    return jsonb_build_object('ok', false, 'error', 'IMAGE_INVALID');
  end if;
  insert into map_image (id, mime, data, width, height, updated_at, updated_by)
  values (1, p_mime, p_data, p_width, p_height, now(), v_admin.nickname)
  on conflict (id) do update set mime = excluded.mime, data = excluded.data, width = excluded.width,
    height = excluded.height, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  -- immagine nuova: gli angoli di prima potrebbero non valere più → vanno reinseriti
  delete from settings where key = 'map_bounds';
  perform _map_fill_coords();
  perform _staff_log(v_admin, 'map', null, jsonb_build_object('image', true, 'kb', length(p_data) * 3 / 4 / 1024));
  return jsonb_build_object('ok', true, 'version', (select updated_at::text from map_image));
end;
$$;

-- Come in 040, con gli angoli della mappa
create or replace function public.staff_get_settings(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _admin_player(p_token);
begin
  if v_staff.id is null then return _admin_denied(p_token); end if;
  return jsonb_build_object('ok', true,
    'attempts_per_day', _attempts_per_day(),
    'attempts_reset_hour', coalesce((_setting('attempts_reset_hour') #>> '{}')::int, 0),
    'games_open_from', _setting('games_open_from'),
    'games_open_until', _setting('games_open_until'),
    'window', _window_state(),
    'sections', _sections(),
    'winners', _winners(),
    'leaderboard_public', _leaderboard_public(),
    'sections_order', _sections_order(),
    'feedback_anonymous', _feedback_anonymous(),
    'sponsor_columns', _sponsor_columns(),
    'map_osm', _map_osm(),
    'map_bounds', _setting('map_bounds'),
    'games', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'enabled', enabled, 'duration_s', duration_s, 'steps', steps) order by sort) from games));
end;
$$;

-- Come in 039, con angoli e paese (per la scritta sotto la mappa e per sapere se i punti hanno la posizione reale)
create or replace function public.get_map()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true,
    'version', _setting('map_points_version') #>> '{}',
    'points', coalesce((select jsonb_agg(_map_point_json(p) order by p.id) from map_points p), '[]'),
    'image', (select jsonb_build_object('version', updated_at::text, 'width', width, 'height', height) from map_image),
    'bounds', _setting('map_bounds'));
$$;
