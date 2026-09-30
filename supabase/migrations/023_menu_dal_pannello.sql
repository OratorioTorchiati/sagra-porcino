-- =====================================================================================
-- 023 — Menù caricato dal pannello Admin (D96) e tentativi illimitati (D97)
--
-- - L'Admin carica il file del menù (CSV di Excel, stesso formato di contenuti/menu.csv): l'app lo controlla,
--   mostra l'anteprima e lo manda qui già convertito. Il server ricontrolla la forma e lo salva.
-- - get_menu: per l'app, anche senza account. Senza menù caricato l'app usa quello incluso nell'app.
-- - Ogni caricamento resta nel registro.
-- - Tentativi al giorno: da 0 a 99; 0 = illimitati per tutti i giocatori.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- Menù: { categories: [{ name, dishes: [{ name, description, price, symbols[], allergens[] }] }], updated_at, by }
create or replace function public.get_menu()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'menu', _setting('menu'));
$$;

revoke execute on function public.get_menu() from public;
grant execute on function public.get_menu() to anon, authenticated;

create or replace function public.staff_set_menu(p_token text, p_menu jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_admin players := _admin_player(p_token);
  v_category jsonb;
  v_dish jsonb;
  v_dishes int := 0;
  v_price numeric;
begin
  if v_admin.id is null then return _admin_denied(p_token); end if;
  if p_menu is null or jsonb_typeof(p_menu -> 'categories') is distinct from 'array'
     or jsonb_array_length(p_menu -> 'categories') = 0 or jsonb_array_length(p_menu -> 'categories') > 40 then
    return jsonb_build_object('ok', false, 'error', 'MENU_INVALID');
  end if;
  for v_category in select value from jsonb_array_elements(p_menu -> 'categories') loop
    if jsonb_typeof(v_category -> 'name') is distinct from 'string' or length(v_category ->> 'name') not between 1 and 60
       or jsonb_typeof(v_category -> 'dishes') is distinct from 'array' then
      return jsonb_build_object('ok', false, 'error', 'MENU_INVALID');
    end if;
    for v_dish in select value from jsonb_array_elements(v_category -> 'dishes') loop
      v_dishes := v_dishes + 1;
      if jsonb_typeof(v_dish -> 'price') is distinct from 'number' then return jsonb_build_object('ok', false, 'error', 'MENU_INVALID'); end if;
      v_price := (v_dish ->> 'price')::numeric;
      if jsonb_typeof(v_dish -> 'name') is distinct from 'string' or length(v_dish ->> 'name') not between 1 and 100
         or v_price < 0 or v_price > 1000
         or length(coalesce(v_dish ->> 'description', '')) > 300
         or jsonb_typeof(coalesce(v_dish -> 'symbols', '[]')) <> 'array'
         or jsonb_typeof(coalesce(v_dish -> 'allergens', '[]')) <> 'array'
         or exists (select 1 from jsonb_array_elements_text(coalesce(v_dish -> 'symbols', '[]')) s
                    where s not in ('porcini', 'vegetariano', 'piccante')) then
        return jsonb_build_object('ok', false, 'error', 'MENU_INVALID');
      end if;
    end loop;
  end loop;
  if v_dishes = 0 or v_dishes > 400 then return jsonb_build_object('ok', false, 'error', 'MENU_INVALID'); end if;

  insert into settings (key, value)
  values ('menu', jsonb_build_object('categories', p_menu -> 'categories', 'updated_at', now(), 'by', v_admin.nickname))
  on conflict (key) do update set value = excluded.value;
  perform _staff_log(v_admin, 'menu', null, jsonb_build_object('dishes', v_dishes));
  return jsonb_build_object('ok', true, 'dishes', v_dishes);
end;
$$;

revoke execute on function public.staff_set_menu(text, jsonb) from public;
grant execute on function public.staff_set_menu(text, jsonb) to anon, authenticated;

-- ---------- Tentativi illimitati (D97) ----------

-- Come in 021, con "0 tentativi al giorno" = illimitati
create or replace function public.start_attempt(p_token text, p_game_id text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_player players := _session_player(p_token);
  v_game games;
  v_staff boolean;
  v_unlimited boolean;
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
  v_unlimited := v_staff or v_per_day = 0; -- 0 tentativi al giorno = illimitati per tutti (D97)
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
  if not v_unlimited and v_used >= v_per_day then
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
    'unlimited', v_unlimited,
    'attempts_left', case when v_unlimited then null else v_per_day - v_used - 1 end,
    'attempts_per_day', v_per_day,
    -- Domande del quiz SENZA la risposta giusta
    'questions', case when p_game_id = 'quiz' then (
      select jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'options', to_jsonb(q.options))
                       order by array_position(v_qids, q.id))
      from quiz_questions q where q.id = any (v_qids)) end);
end;
$$;

-- Come in 021, con "0 tentativi al giorno" = illimitati
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
    'unlimited', coalesce(v_player.role in ('staff', 'admin'), false) or _attempts_per_day() = 0,
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

-- Come in 021, tentativi da 0 (illimitati) a 99
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
