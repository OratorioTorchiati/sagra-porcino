-- =====================================================================================
-- 039 — Mappa della sagra (D136)
--
-- - Nuova sezione "mappa": si accende, si spegne e si ordina come le altre (all'inizio spenta).
-- - Immagine della mappa NEL DATABASE (non nell'app): la carica l'Admin dalle Configurazioni, già rimpicciolita e
--   compressa dal suo telefono. I telefoni la scaricano una volta sola per versione e la tengono in memoria.
-- - Punti di interesse: tipologia, titolo, descrizione facoltativa, posizione sul disegno (x, y da 0 a 1) e posizione
--   reale facoltativa (lat, lng: serve per "Apri in Google Maps / Mappe" a piedi). Li modificano Mod e Admin.
-- - get_app_config porta le versioni (punti e immagine): il telefono riscarica solo ciò che è cambiato.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- ---------- Sezione ----------

create or replace function public._section_ids()
returns text[] language sql immutable as $$
  select array['menu', 'giochi', 'feedback', 'mappa', 'sponsor'];
$$;

create or replace function public._orderable_section_ids()
returns text[] language sql immutable as $$
  select array['menu', 'giochi', 'feedback', 'mappa'];
$$;

-- Mappa spenta all'inizio (se non è già stata decisa)
insert into settings (key, value) values ('sections', '{"mappa": false}')
on conflict (key) do update set value = settings.value || '{"mappa": false}' where not (settings.value ? 'mappa');

-- ---------- Tabelle ----------

-- Tipologie dei punti (le icone e i colori sono nell'app, src/lib/map-data.js)
create or replace function public._map_types()
returns text[] language sql immutable as $$
  select array['ristorazione', 'bar', 'cassa', 'info', 'wc', 'soccorso', 'palco', 'bambini', 'parcheggio',
               'ingresso', 'rifiuti', 'altro'];
$$;

create table if not exists public.map_points (
  id bigint generated always as identity primary key,
  type text not null,
  title text not null check (length(title) between 1 and 60),
  description text check (description is null or length(description) <= 300),
  x real not null check (x between 0 and 1),
  y real not null check (y between 0 and 1),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.map_points enable row level security;
revoke all on public.map_points from anon, authenticated;

-- Una sola immagine (id = 1), in base64
create table if not exists public.map_image (
  id int primary key default 1 check (id = 1),
  mime text not null,
  data text not null,
  width int not null,
  height int not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.map_image enable row level security;
revoke all on public.map_image from anon, authenticated;

-- Versione dei punti: cambia a ogni aggiunta, modifica o cancellazione
create or replace function public._map_points_touch()
returns void language sql volatile set search_path = public as $$
  insert into settings (key, value) values ('map_points_version', to_jsonb(now()::text))
  on conflict (key) do update set value = excluded.value;
$$;

create or replace function public._map_point_json(p map_points)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', p.id, 'type', p.type, 'title', p.title, 'description', p.description,
    'x', p.x, 'y', p.y, 'lat', p.lat, 'lng', p.lng);
$$;
revoke execute on function public._map_points_touch(), public._map_point_json(map_points), public._map_types()
  from public, anon, authenticated;

-- ---------- Lettura (per tutti) ----------

-- Punti (in ordine di inserimento: la numerazione per tipologia la fa l'app) e dati dell'immagine, senza l'immagine
create or replace function public.get_map()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true,
    'version', _setting('map_points_version') #>> '{}',
    'points', coalesce((select jsonb_agg(_map_point_json(p) order by p.id) from map_points p), '[]'),
    'image', (select jsonb_build_object('version', updated_at::text, 'width', width, 'height', height) from map_image));
$$;

-- L'immagine (base64): il telefono la chiede solo quando la sua versione è cambiata
create or replace function public.get_map_image()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('ok', true, 'version', updated_at::text, 'mime', mime, 'data', data,
    'width', width, 'height', height) from map_image), jsonb_build_object('ok', false, 'error', 'NO_MAP'));
$$;

revoke execute on function public.get_map(), public.get_map_image() from public;
grant execute on function public.get_map(), public.get_map_image() to anon, authenticated;

-- ---------- Modifica dei punti (Mod e Admin) ----------

-- Nuovo punto (p_id null) o modifica. Restituisce il punto salvato.
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
  perform _map_points_touch();
  perform _staff_log(v_staff, 'map', v_title, jsonb_build_object('point', v_point.id, 'type', p_type, 'new', p_id is null));
  return jsonb_build_object('ok', true, 'point', _map_point_json(v_point));
end;
$$;

create or replace function public.staff_map_delete_point(p_token text, p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_point map_points;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  delete from map_points where id = p_id returning * into v_point;
  if v_point.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  perform _map_points_touch();
  perform _staff_log(v_staff, 'map', v_point.title, jsonb_build_object('point', v_point.id, 'deleted', true));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- Immagine (solo Admin) ----------

-- Immagine già preparata dal telefono dell'Admin (o dallo script): base64, al massimo ~3 MB di testo
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
  perform _staff_log(v_admin, 'map', null, jsonb_build_object('image', true, 'kb', length(p_data) * 3 / 4 / 1024));
  return jsonb_build_object('ok', true, 'version', (select updated_at::text from map_image));
end;
$$;

revoke execute on function public.staff_map_save_point(text, bigint, text, text, text, real, real, double precision, double precision),
  public.staff_map_delete_point(text, bigint), public.staff_set_map_image(text, text, text, int, int) from public;
grant execute on function public.staff_map_save_point(text, bigint, text, text, text, real, real, double precision, double precision),
  public.staff_map_delete_point(text, bigint), public.staff_set_map_image(text, text, text, int, int) to anon, authenticated;

-- ---------- Configurazione dell'app ----------

-- Come in 038, con le versioni della mappa (punti e immagine)
create or replace function public.get_app_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'sections', _sections(), 'winners', _winners(), 'leaderboard_public', _leaderboard_public(),
    'sections_order', _sections_order(), 'feedback_anonymous', _feedback_anonymous(),
    'menu_version', _setting('menu') ->> 'updated_at', 'sponsor_columns', _sponsor_columns(),
    'map_version', _setting('map_points_version') #>> '{}',
    'map_image_version', (select updated_at::text from map_image));
$$;
