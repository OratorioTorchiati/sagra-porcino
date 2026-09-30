-- =====================================================================================
-- 021 — Ruoli Mod e Admin, sezioni dell'app accendibili (D93)
--
-- - Ruoli: "staff" = Mod (giocatori, partite da controllare, telefoni, classifica); nuovo "admin" = tutto quello del
--   Mod più Configurazioni e Registro. L'account "staff" diventa Admin.
-- - Configurazioni e Registro solo per l'Admin: un Mod riceve NOT_ADMIN, un giocatore NOT_STAFF.
-- - Sezioni della home accese/spente dall'Admin (impostazione "sections"); get_app_config le dice all'app.
--   Minigiochi spenti: nessuno può avviare una partita (tranne Mod e Admin, per le prove).
-- - Admin come Mod: tentativi illimitati, fuori dalla classifica.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- ---------- Ruoli ----------

alter table public.players drop constraint if exists players_role_check;
alter table public.players add constraint players_role_check check (role in ('player', 'staff', 'admin'));

-- L'account "staff" (quello creato in 008) diventa Admin
update public.players set role = 'admin' where lower(nickname) = 'staff' and role = 'staff';

-- Account del pannello (Mod o Admin) della sessione; null se è un giocatore
create or replace function public._staff_player(p_token text)
returns public.players language plpgsql volatile security definer set search_path = public as $$
declare
  v_player players := _session_player(p_token);
begin
  if v_player.id is null or v_player.role not in ('staff', 'admin') then
    return null;
  end if;
  return v_player;
end;
$$;

-- Solo Admin
create or replace function public._admin_player(p_token text)
returns public.players language plpgsql volatile security definer set search_path = public as $$
declare
  v_player players := _session_player(p_token);
begin
  if v_player.id is null or v_player.role <> 'admin' then
    return null;
  end if;
  return v_player;
end;
$$;

-- Mod che prova una funzione da Admin → NOT_ADMIN; giocatore o nessuna sessione → NOT_STAFF
create or replace function public._admin_denied(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if _staff_player(p_token) is not null then
    return jsonb_build_object('ok', false, 'error', 'NOT_ADMIN');
  end if;
  return _staff_denied();
end;
$$;

-- ---------- Sezioni dell'app ----------

-- Sezioni che l'Admin può accendere o spegnere (stessi id di app/src/lib/app-config.js)
create or replace function public._section_ids()
returns text[] language sql immutable as $$
  select array['menu', 'giochi'];
$$;

insert into public.settings (key, value) values ('sections', '{"menu": true, "giochi": true}')
on conflict (key) do nothing;

-- Tutte le sezioni, con quelle mai impostate accese
create or replace function public._sections()
returns jsonb language sql stable set search_path = public as $$
  select (select jsonb_object_agg(id, true) from unnest(_section_ids()) as id) || coalesce(_setting('sections'), '{}');
$$;

create or replace function public._section_on(p_id text)
returns boolean language sql stable set search_path = public as $$
  select coalesce((_sections() ->> p_id)::boolean, true);
$$;

-- Per l'app (anche senza account): quali sezioni mostrare
create or replace function public.get_app_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'sections', _sections());
$$;

revoke execute on function public._admin_player(text), public._admin_denied(text), public._section_ids(),
  public._sections(), public._section_on(text) from public, anon, authenticated;
revoke execute on function public.get_app_config() from public;
grant execute on function public.get_app_config() to anon, authenticated;

-- ---------- Partite: Admin come Mod, Minigiochi spenti ----------

-- Come in 010, con l'Admin (tentativi illimitati) e la sezione Minigiochi spenta
create or replace function public.start_attempt(p_token text, p_game_id text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_player players := _session_player(p_token);
  v_game games;
  v_staff boolean;
  v_used int;
  v_per_day int := _attempts_per_day();
  v_window text := _window_state();
  v_qids int[];
  v_seen int[];
  v_attempt attempts;
begin
  if v_player.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_LOGGED_IN');
  end if;
  v_staff := v_player.role in ('staff', 'admin');
  select * into v_game from games where id = p_game_id;
  if v_game.id is null then
    return jsonb_build_object('ok', false, 'error', 'GAME_UNKNOWN');
  end if;
  if not v_staff then
    -- Sezione Minigiochi spenta dall'Admin (D93)
    if not _section_on('giochi') then return jsonb_build_object('ok', false, 'error', 'SECTION_OFF'); end if;
    if not v_game.enabled then return jsonb_build_object('ok', false, 'error', 'GAME_DISABLED'); end if;
    if v_window = 'not_yet' then return jsonb_build_object('ok', false, 'error', 'GAMES_NOT_OPEN', 'open_from', _setting('games_open_from')); end if;
    if v_window = 'closed' then return jsonb_build_object('ok', false, 'error', 'GAMES_CLOSED'); end if;
  end if;

  -- Un avvio alla volta per giocatore e gioco (niente doppio tocco che supera il limite)
  perform pg_advisory_xact_lock(hashtext(v_player.id::text || ':' || p_game_id));
  -- Tentativi usati oggi: dal contatore (le esclusioni confermate cancellano la partita, ma il tentativo resta usato)
  select coalesce((select used from attempts_used where player_id = v_player.id and game_id = p_game_id and day = _today()), 0) into v_used;
  if not v_staff and v_used >= v_per_day then
    return jsonb_build_object('ok', false, 'error', 'NO_ATTEMPTS_LEFT', 'attempts_per_day', v_per_day);
  end if;

  if p_game_id = 'quiz' then
    -- 5 domande a caso, evitando quelle già capitate a questo giocatore (se ce ne sono abbastanza)
    select coalesce(array_agg(distinct q), '{}') into v_seen
    from attempts a, unnest(a.quiz_question_ids) as q where a.player_id = v_player.id and a.game_id = 'quiz';
    v_qids := array(select id from quiz_questions where active and not (id = any (v_seen)) order by random() limit 5);
    if coalesce(array_length(v_qids, 1), 0) < 5 then
      v_qids := array(select id from quiz_questions where active order by random() limit 5);
    end if;
    if coalesce(array_length(v_qids, 1), 0) = 0 then
      return jsonb_build_object('ok', false, 'error', 'QUIZ_EMPTY');
    end if;
  end if;

  insert into attempts_used (player_id, game_id, day, used) values (v_player.id, p_game_id, _today(), 1)
  on conflict (player_id, game_id, day) do update set used = attempts_used.used + 1;

  insert into attempts (player_id, game_id, day, seed, quiz_question_ids)
  values (v_player.id, p_game_id, _today(), floor(random() * 4294967296)::bigint, v_qids)
  returning * into v_attempt;

  return jsonb_build_object(
    'ok', true,
    'attempt_id', v_attempt.id,
    'seed', v_attempt.seed,
    'unlimited', v_staff,
    'attempts_left', case when v_staff then null else v_per_day - v_used - 1 end,
    'attempts_per_day', v_per_day,
    -- Domande del quiz SENZA la risposta giusta
    'questions', case when p_game_id = 'quiz' then (
      select jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'options', to_jsonb(q.options))
                       order by array_position(v_qids, q.id))
      from quiz_questions q where q.id = any (v_qids)) end);
end;
$$;

-- Come in 010, con l'Admin
create or replace function public.get_games_state(p_token text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_player players := case when p_token is null then null else _session_player(p_token) end;
  v_today date := _today();
begin
  return jsonb_build_object(
    'ok', true,
    'server_time', now(),
    'window', _window_state(),
    'open_from', _setting('games_open_from'),
    'open_until', _setting('games_open_until'),
    'attempts_per_day', _attempts_per_day(),
    'reset_hour', coalesce((_setting('attempts_reset_hour') #>> '{}')::int, 0),
    'logged_in', v_player.id is not null,
    'unlimited', coalesce(v_player.role in ('staff', 'admin'), false),
    'games', (
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'enabled', g.enabled,
        'attempts_used_today', case when v_player.id is null then null else
          coalesce((select u.used from attempts_used u where u.player_id = v_player.id and u.game_id = g.id and u.day = v_today), 0) end,
        'best', case when v_player.id is null then null else
          (select max(a.raw_score) from attempts a where a.player_id = v_player.id and a.game_id = g.id and a.status in ('valid', 'flagged')) end
      ) order by g.sort)
      from games g));
end;
$$;

-- ---------- Solo Admin: Configurazioni e Registro ----------

-- Come in 008, solo Admin, con le sezioni dell'app
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
    'games', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'enabled', enabled) order by sort) from games));
end;
$$;

-- Come in 008, solo Admin, con le sezioni dell'app (p_values.sections)
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
    if v_n is null or v_n < 1 or v_n > 50 then return jsonb_build_object('ok', false, 'error', 'ATTEMPTS_INVALID'); end if;
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

-- Come in 009, solo Admin
create or replace function public.staff_log_list(p_token text, p_page int default 0, p_day date default null,
                                                 p_staff text default null, p_action text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _admin_player(p_token);
  v_page int := greatest(coalesce(p_page, 0), 0);
  v_size constant int := 100;
begin
  if v_staff.id is null then return _admin_denied(p_token); end if;
  return jsonb_build_object('ok', true, 'page', v_page, 'page_size', v_size,
    'operators', coalesce((select jsonb_agg(distinct staff_nickname) from staff_log), '[]'),
    'total', (select count(*) from staff_log l
              where (p_day is null or (l.created_at at time zone 'Europe/Rome')::date = p_day)
                and (p_staff is null or l.staff_nickname = p_staff)
                and (p_action is null or l.action = p_action or (p_action = 'attempt' and l.action like 'attempt_%')
                     or (p_action = 'extra' and l.action like 'extra_points%') or (p_action = 'account' and l.action in ('disable', 'enable', 'delete')))),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('staff', l.staff_nickname, 'action', l.action, 'target', l.target,
                                          'details', l.details, 'created_at', l.created_at) order by l.created_at desc)
      from (
        select * from staff_log l
        where (p_day is null or (l.created_at at time zone 'Europe/Rome')::date = p_day)
          and (p_staff is null or l.staff_nickname = p_staff)
          and (p_action is null or l.action = p_action or (p_action = 'attempt' and l.action like 'attempt_%')
               or (p_action = 'extra' and l.action like 'extra_points%') or (p_action = 'account' and l.action in ('disable', 'enable', 'delete')))
        order by l.created_at desc
        offset v_page * v_size limit v_size
      ) l), '[]'));
end;
$$;
