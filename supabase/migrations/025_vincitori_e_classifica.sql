-- =====================================================================================
-- 025 — Vincitori e visibilità della classifica (D101)
--
-- - Numero vincitori deciso dall'Admin (0–99, 0 = nessun premio): l'app adatta le scritte in "Come funziona"
--   e sulla classifica. Il colore delle righe premiate resta com'è.
-- - Classifica visibile anche senza account (sì/no, predefinito sì). Con "no" il server la dà solo a chi
--   ha fatto l'accesso (classifica e scheda punti di un giocatore).
-- - get_app_config manda anche questi due valori (l'app li tiene sul telefono come le sezioni).
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

insert into public.settings (key, value) values ('winners', '10') on conflict (key) do nothing;
insert into public.settings (key, value) values ('leaderboard_public', 'true') on conflict (key) do nothing;

create or replace function public._winners()
returns int language sql stable security definer set search_path = public as $$
  select coalesce((_setting('winners') #>> '{}')::int, 10);
$$;

create or replace function public._leaderboard_public()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((_setting('leaderboard_public') #>> '{}')::boolean, true);
$$;

-- Come in 021, con vincitori e visibilità della classifica
create or replace function public.get_app_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'sections', _sections(), 'winners', _winners(), 'leaderboard_public', _leaderboard_public());
$$;

-- ---------- Configurazioni ----------

-- Come in 023, con vincitori e visibilità della classifica
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

-- Come in 024, con vincitori e visibilità della classifica
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
    'games', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'enabled', enabled, 'duration_s', duration_s) order by sort) from games));
end;
$$;

-- ---------- Classifica solo con l'account ----------

-- Come in 007, con LOGIN_REQUIRED se la classifica non è pubblica e manca l'accesso
create or replace function public.get_leaderboard(p_token text default null, p_version bigint default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_version bigint := (select last_value from leaderboard_version_seq);
  v_player players := case when p_token is null then null else _session_player(p_token) end;
  v_me jsonb;
begin
  -- Classifica solo per chi ha un account, se l'Admin l'ha deciso (D101)
  if v_player.id is null and not _leaderboard_public() then
    return jsonb_build_object('ok', false, 'error', 'LOGIN_REQUIRED', 'window', _window_state());
  end if;
  if p_version is not null and p_version = v_version then
    return jsonb_build_object('ok', true, 'unchanged', true, 'version', v_version, 'window', _window_state());
  end if;
  if v_player.id is not null then
    v_me := _player_card(v_player.id);
  end if;
  return jsonb_build_object(
    'ok', true,
    'version', v_version,
    'window', _window_state(),
    'players', (select count(*) from _leaderboard_rows()),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('position', r.position, 'nickname', r.nickname, 'avatar', r.avatar, 'total', r.total)
                       order by r.position, lower(r.nickname))
      from (
        select x.nickname, x.avatar, x.total, rank() over (order by x.total desc)::int as position
        from _leaderboard_rows() x
      ) r
      where r.position <= 20), '[]'),
    'me', v_me);
end;
$$;

-- Come in 007, con il token (serve se la classifica non è pubblica)
drop function if exists public.get_player_card(text);
create or replace function public.get_player_card(p_nickname text, p_token text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not _leaderboard_public() and (p_token is null or (_session_player(p_token)).id is null) then
    return jsonb_build_object('ok', false, 'error', 'LOGIN_REQUIRED');
  end if;
  select id into v_id from players
  where lower(nickname) = lower(trim(p_nickname)) and role = 'player' and not disabled;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'player', _player_card(v_id));
end;
$$;

-- ---------- Permessi ----------

revoke execute on function public._winners(), public._leaderboard_public() from public, anon, authenticated;
revoke execute on function public.get_player_card(text, text) from public;
grant execute on function public.get_player_card(text, text) to anon, authenticated;
