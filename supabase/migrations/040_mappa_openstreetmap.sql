-- =====================================================================================
-- 040 — Mappa da OpenStreetMap: la scritta "© OpenStreetMap contributors" (D138)
--
-- Nelle Configurazioni (scheda Mappa) l'interruttore "Immagine da OpenStreetMap" (di base acceso): se acceso, sotto la
-- mappa compare "© OpenStreetMap contributors", come chiede la licenza di OpenStreetMap.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- L'immagine della mappa viene da OpenStreetMap? (di base sì)
create or replace function public._map_osm()
returns boolean language sql stable set search_path = public as $$
  select coalesce((_setting('map_osm') #>> '{}')::boolean, true);
$$;
revoke execute on function public._map_osm() from public, anon, authenticated;

-- Come in 038, con map_osm
create or replace function public.staff_update_settings(p_token text, p_values jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _admin_player(p_token);
  v_n int;
  v_key text;
  v_game record;
begin
  if v_staff.id is null then return _admin_denied(p_token); end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'VALUES_INVALID');
  end if;

  if p_values ? 'attempts_per_day' then
    v_n := (p_values ->> 'attempts_per_day')::int;
    -- 0 = illimitati; al massimo 99 (D97)
    if v_n is null or v_n < 0 or v_n > 99 then return jsonb_build_object('ok', false, 'error', 'ATTEMPTS_INVALID'); end if;
    update settings set value = to_jsonb(v_n) where key = 'attempts_per_day';
  end if;
  if p_values ? 'attempts_reset_hour' then
    v_n := (p_values ->> 'attempts_reset_hour')::int;
    if v_n is null or v_n < 0 or v_n > 23 then return jsonb_build_object('ok', false, 'error', 'HOUR_INVALID'); end if;
    insert into settings (key, value) values ('attempts_reset_hour', to_jsonb(v_n))
    on conflict (key) do update set value = excluded.value;
  end if;
  foreach v_key in array array['games_open_from', 'games_open_until'] loop
    if p_values ? v_key then
      if jsonb_typeof(p_values -> v_key) = 'null' then
        update settings set value = 'null' where key = v_key;
      else
        -- valida la data (errore se non è una data)
        perform (p_values ->> v_key)::timestamptz;
        update settings set value = to_jsonb(p_values ->> v_key) where key = v_key;
      end if;
    end if;
  end loop;
  -- Sezioni dell'app accese/spente: { menu: true|false, giochi: true|false, ... } (D93)
  if jsonb_typeof(p_values -> 'sections') = 'object' then
    for v_game in select key, value from jsonb_each(p_values -> 'sections') loop
      if not (v_game.key = any (_section_ids())) or jsonb_typeof(v_game.value) <> 'boolean' then
        return jsonb_build_object('ok', false, 'error', 'SECTION_INVALID');
      end if;
    end loop;
    insert into settings (key, value) values ('sections', _sections() || (p_values -> 'sections'))
    on conflict (key) do update set value = excluded.value;
  end if;
  -- Classifica (D101): quanti vincono (0 = nessun premio) e se la vede anche chi non ha un account
  if p_values ? 'winners' then
    v_n := (p_values ->> 'winners')::int;
    if v_n is null or v_n < 0 or v_n > 99 then return jsonb_build_object('ok', false, 'error', 'WINNERS_INVALID'); end if;
    insert into settings (key, value) values ('winners', to_jsonb(v_n))
    on conflict (key) do update set value = excluded.value;
  end if;
  if p_values ? 'leaderboard_public' then
    if jsonb_typeof(p_values -> 'leaderboard_public') <> 'boolean' then
      return jsonb_build_object('ok', false, 'error', 'VALUES_INVALID');
    end if;
    insert into settings (key, value) values ('leaderboard_public', p_values -> 'leaderboard_public')
    on conflict (key) do update set value = excluded.value;
  end if;
  -- Aspetto (D108): ordine delle sezioni nella home e nel pannello (tutte le ordinabili, ognuna una volta; Sponsor no)
  if p_values ? 'sections_order' then
    if jsonb_typeof(p_values -> 'sections_order') <> 'array'
       or (select array_agg(x order by x) from jsonb_array_elements_text(p_values -> 'sections_order') x)
          is distinct from (select array_agg(x order by x) from unnest(_orderable_section_ids()) x) then
      return jsonb_build_object('ok', false, 'error', 'ORDER_INVALID');
    end if;
    insert into settings (key, value) values ('sections_order', p_values -> 'sections_order')
    on conflict (key) do update set value = excluded.value;
  end if;
  -- Feedback anche senza account (D108)
  if p_values ? 'feedback_anonymous' then
    if jsonb_typeof(p_values -> 'feedback_anonymous') <> 'boolean' then
      return jsonb_build_object('ok', false, 'error', 'VALUES_INVALID');
    end if;
    insert into settings (key, value) values ('feedback_anonymous', p_values -> 'feedback_anonymous')
    on conflict (key) do update set value = excluded.value;
  end if;
  -- Sponsor (D126): colonne della tabella nella home, da 1 a 4
  if p_values ? 'sponsor_columns' then
    v_n := (p_values ->> 'sponsor_columns')::int;
    if v_n is null or v_n < 1 or v_n > 4 then return jsonb_build_object('ok', false, 'error', 'SPONSOR_COLUMNS_INVALID'); end if;
    insert into settings (key, value) values ('sponsor_columns', to_jsonb(v_n))
    on conflict (key) do update set value = excluded.value;
  end if;
  -- Mappa (D138): l'immagine viene da OpenStreetMap → sotto la mappa "© OpenStreetMap contributors"
  if p_values ? 'map_osm' then
    if jsonb_typeof(p_values -> 'map_osm') <> 'boolean' then
      return jsonb_build_object('ok', false, 'error', 'VALUES_INVALID');
    end if;
    insert into settings (key, value) values ('map_osm', p_values -> 'map_osm')
    on conflict (key) do update set value = excluded.value;
  end if;
  if jsonb_typeof(p_values -> 'games') = 'object' then
    for v_game in select key, value from jsonb_each(p_values -> 'games') loop
      update games set enabled = (v_game.value)::text::boolean where id = v_game.key;
    end loop;
  end if;

  perform _staff_log(v_staff, 'settings', null, p_values);
  perform nextval('leaderboard_version_seq'); -- "Classifica finale" può cambiare
  return jsonb_build_object('ok', true);
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
  return jsonb_build_object('ok', false, 'error', 'DATE_INVALID');
end;
$$;

-- Come in 038, con map_osm
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
    'games', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'enabled', enabled, 'duration_s', duration_s, 'steps', steps) order by sort) from games));
end;
$$;

-- Come in 039, con map_osm
create or replace function public.get_app_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'sections', _sections(), 'winners', _winners(), 'leaderboard_public', _leaderboard_public(),
    'sections_order', _sections_order(), 'feedback_anonymous', _feedback_anonymous(),
    'menu_version', _setting('menu') ->> 'updated_at', 'sponsor_columns', _sponsor_columns(),
    'map_version', _setting('map_points_version') #>> '{}',
    'map_image_version', (select updated_at::text from map_image), 'map_osm', _map_osm());
$$;
