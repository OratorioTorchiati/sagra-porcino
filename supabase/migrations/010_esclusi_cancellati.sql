-- =====================================================================================
-- 010 — Partite escluse cancellate; "Escludi giocatore" al posto di "Scarta" (D76)
--
-- - Le partite con dati impossibili ('rejected') NON restano nel database: submit_score risponde "non valida"
--   e le cancella. Il tentativo però resta usato: i tentativi del giorno ora si contano in attempts_used
--   (per giocatore, gioco e giorno), non contando le partite.
-- - Nuovo segnale in Acchiappa: più di metà dei porcini (almeno 10) toccati entro 2 px dal centro → segnalata.
-- - Nel pannello staff si rivedono solo le partite SEGNALATE. Le scelte sono: Approva (resta valida)
--   oppure Escludi giocatore (account disattivato + telefono bloccato; la partita sospetta si cancella).
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

create table if not exists public.attempts_used (
  player_id uuid not null references public.players (id) on delete cascade,
  game_id text not null references public.games (id),
  day date not null,
  used int not null default 0,
  primary key (player_id, game_id, day)
);
alter table public.attempts_used enable row level security;
revoke all on public.attempts_used from anon, authenticated;

-- Contatore iniziale dai tentativi già fatti (solo la prima volta: se la tabella è vuota)
insert into public.attempts_used (player_id, game_id, day, used)
select player_id, game_id, day, count(*) from public.attempts
where not exists (select 1 from public.attempts_used)
group by player_id, game_id, day;

-- Via le partite escluse rimaste dalle prove (il loro tentativo è già nel contatore)
delete from public.attempts where status = 'rejected';

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
  v_staff := v_player.role = 'staff';
  select * into v_game from games where id = p_game_id;
  if v_game.id is null then
    return jsonb_build_object('ok', false, 'error', 'GAME_UNKNOWN');
  end if;
  if not v_staff then
    if not v_game.enabled then return jsonb_build_object('ok', false, 'error', 'GAME_DISABLED'); end if;
    if v_window = 'not_yet' then return jsonb_build_object('ok', false, 'error', 'GAMES_NOT_OPEN', 'open_from', _setting('games_open_from')); end if;
    if v_window = 'closed' then return jsonb_build_object('ok', false, 'error', 'GAMES_CLOSED'); end if;
  end if;

  -- Un avvio alla volta per giocatore e gioco (niente doppio tocco che supera il limite)
  perform pg_advisory_xact_lock(hashtext(v_player.id::text || ':' || p_game_id));
  -- Tentativi usati oggi: dal contatore (le partite escluse vengono cancellate, ma il tentativo resta usato)
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

-- Come in 004, ma i tentativi usati vengono dal contatore
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
    'unlimited', coalesce(v_player.role = 'staff', false),
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

-- Come in 003, ma le partite escluse vengono cancellate subito
create or replace function public.submit_score(p_attempt_id uuid, p_raw_score int, p_stats jsonb, p_actions jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_attempt attempts;
  v_game games;
  v_check jsonb;
  v_best int;
begin
  select * into v_attempt from attempts where id = p_attempt_id for update;
  if v_attempt.id is null then
    return jsonb_build_object('ok', false, 'error', 'ATTEMPT_UNKNOWN');
  end if;
  select * into v_game from games where id = v_attempt.game_id;

  if v_attempt.submitted_at is null then
    v_check := _check_attempt(v_attempt, v_game, p_raw_score, p_stats, p_actions);
    update attempts set
      submitted_at = now(),
      client_score = p_raw_score,
      raw_score = (v_check ->> 'score')::int,
      stats = p_stats,
      actions = p_actions,
      status = v_check ->> 'status',
      check_notes = array(select jsonb_array_elements_text(v_check -> 'notes'))
    where id = v_attempt.id
    returning * into v_attempt;
  end if;

  select max(raw_score) into v_best from attempts
  where player_id = v_attempt.player_id and game_id = v_attempt.game_id and status in ('valid', 'flagged');

  -- Partita esclusa (dati impossibili): si risponde "non valida" e la si cancella dal database.
  -- Il tentativo resta usato (contatore attempts_used). Un reinvio troverà ATTEMPT_UNKNOWN.
  if v_attempt.status = 'rejected' then
    delete from attempts where id = v_attempt.id;
    return jsonb_build_object('ok', true, 'status', 'rejected', 'raw_score', 0, 'best', v_best, 'correct', null, 'total', 0);
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', v_attempt.status,
    'raw_score', v_attempt.raw_score,
    'best', v_best,
    'correct', case when v_attempt.game_id = 'quiz' then
      (select count(*) from jsonb_array_elements(coalesce(v_attempt.stats -> 'answers', '[]')) a
       join quiz_questions q on q.id = (a ->> 'questionId')::int and q.correct_index = (a ->> 'choice')::int) end,
    'total', coalesce(array_length(v_attempt.quiz_question_ids, 1), 0));
end;
$$;

-- Come in 005, più il segnale "tocchi sempre al centro esatto" in Acchiappa
create or replace function public._check_attempt(p_attempt attempts, p_game games, p_raw int, p_stats jsonb, p_actions jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_notes text[] := '{}';
  v_rejected boolean := false;
  v_flagged boolean := false;
  v_score int := 0;
  v_correct int;
  v_dur int := (p_stats ->> 'durationMs')::int;
  v_elapsed_ms numeric := extract(epoch from (now() - p_attempt.started_at)) * 1000;
  v_row jsonb;
  -- Acchiappa
  v_streak int := 0; v_good int := 0; v_fast int := 0; v_taps int := 0; v_center int := 0;
  v_level int := 1; v_ends int; v_tap_ms int;
  v_prev_ms int; v_int_n int := 0; v_int_sum numeric := 0; v_int_sq numeric := 0; v_std numeric;
  -- Porcini che cadono
  v_lives int := 3; v_catches int := 0; v_precise int := 0;
  -- Memory
  v_moves int := 0; v_pairs int := 0; v_last_match_ms int; v_seconds numeric; v_extra int;
  -- Quiz
  v_answer jsonb; v_q quiz_questions; v_ms int; v_seen int[] := '{}'; v_all_fast boolean := true; v_answered int := 0; v_sum_ms int := 0;
begin
  if p_actions is null or jsonb_typeof(p_actions) <> 'array' then
    return jsonb_build_object('status', 'rejected', 'score', 0, 'notes', array['azioni_mancanti']);
  end if;
  if jsonb_array_length(p_actions) > 6000 then
    return jsonb_build_object('status', 'rejected', 'score', 0, 'notes', array['troppe_azioni']);
  end if;
  if v_dur is null or v_dur < 0 then
    return jsonb_build_object('status', 'rejected', 'score', 0, 'notes', array['durata_mancante']);
  end if;
  if now() > p_attempt.started_at + interval '6 hours' then
    v_rejected := true; v_notes := array_append(v_notes, 'inviata_dopo_6_ore');
  end if;
  -- Il tempo di gioco non può superare il tempo reale passato dall'avvio
  if v_dur > v_elapsed_ms + 2000 then
    v_rejected := true; v_notes := array_append(v_notes, 'piu_veloce_dell_orologio');
  end if;
  if p_game.id <> 'quiz' and v_dur > p_game.duration_s * 1000 + 3000 then
    v_rejected := true; v_notes := array_append(v_notes, 'durata_troppo_lunga');
  end if;

  if p_game.id = 'acchiappa' then
    -- [ms, 'tap', x, y, esito, tipo, età_ms, dimensione, distanza]
    for v_row in select value from jsonb_array_elements(p_actions) loop
      continue when v_row ->> 1 <> 'tap';
      if (v_row ->> 0)::int > p_game.duration_s * 1000 + 500 then
        v_rejected := true; v_notes := array_append(v_notes, 'tocco_oltre_la_fine');
      end if;
      -- Moltiplicatore a tempo (come app/src/games/acchiappa/scoring.js): scaduto, scende di un livello
      v_tap_ms := (v_row ->> 0)::int;
      while v_level > 1 and v_tap_ms >= v_ends loop
        v_level := v_level - 1;
        v_streak := _acchiappa_level_min(v_level);
        v_ends := case when v_level > 1 then v_ends + _acchiappa_level_ms(v_level) end;
      end loop;
      if v_row ->> 4 = 'good' then
        v_score := v_score + 5 * v_level;
        v_streak := v_streak + 1;
        if _acchiappa_multiplier(v_streak) > v_level then
          v_level := _acchiappa_multiplier(v_streak);
          v_ends := v_tap_ms + _acchiappa_level_ms(v_level);
        end if;
        v_good := v_good + 1;
        if (v_row ->> 6)::int < 150 then v_fast := v_fast + 1; end if;
        -- distanza del tocco dal centro del porcino (px): un dito quasi mai colpisce il centro esatto
        if (v_row ->> 8)::int <= 2 then v_center := v_center + 1; end if;
      elsif v_row ->> 4 = 'bad' then
        v_streak := 0; v_level := 1; v_ends := null;
      end if;
      if v_row ->> 4 in ('good', 'bad') then
        v_taps := v_taps + 1;
        if v_prev_ms is not null then
          v_int_n := v_int_n + 1;
          v_int_sum := v_int_sum + ((v_row ->> 0)::int - v_prev_ms);
          v_int_sq := v_int_sq + ((v_row ->> 0)::int - v_prev_ms) ^ 2;
        end if;
        v_prev_ms := (v_row ->> 0)::int;
      end if;
    end loop;
    if v_dur < p_game.duration_s * 1000 - 1000 then
      v_rejected := true; v_notes := array_append(v_notes, 'partita_troppo_corta');
    end if;
    if v_good >= 10 and v_center > v_good * 0.5 then
      v_flagged := true; v_notes := array_append(v_notes, 'tocchi_al_centro');
    end if;
    if v_good >= 10 and v_fast > v_good * 0.2 then
      v_flagged := true; v_notes := array_append(v_notes, 'reazioni_troppo_rapide');
    end if;
    if v_int_n >= 20 then
      v_std := sqrt(greatest(0, v_int_sq / v_int_n - (v_int_sum / v_int_n) ^ 2));
      if v_std < 35 then v_flagged := true; v_notes := array_append(v_notes, 'tocchi_troppo_regolari'); end if;
    end if;

  elsif p_game.id = 'cadono' then
    -- [ms, 'catch', tipo, x_elemento, x_cestino]
    for v_row in select value from jsonb_array_elements(p_actions) loop
      continue when v_row ->> 1 <> 'catch';
      v_catches := v_catches + 1;
      if abs((v_row ->> 3)::numeric - (v_row ->> 4)::numeric) <= 1 then v_precise := v_precise + 1; end if;
      if v_row ->> 2 = 'porcino' then v_score := v_score + 10;
      elsif v_row ->> 2 = 'golden' then v_score := v_score + 50;
      elsif v_row ->> 2 = 'bomb' then v_lives := v_lives - 1;
      end if;
    end loop;
    -- Bonus sopravvivenza: arrivati alla fine del minuto con vite rimaste
    if v_lives > 0 and v_dur >= p_game.duration_s * 1000 - 1000 then
      v_score := v_score + v_lives * 50;
    elsif v_lives > 0 then
      v_rejected := true; v_notes := array_append(v_notes, 'finita_prima_con_vite');
    end if;
    if v_catches >= 20 and v_precise > v_catches * 0.8 then
      v_flagged := true; v_notes := array_append(v_notes, 'prese_troppo_precise');
    end if;

  elsif p_game.id = 'memory' then
    -- [ms, 'flip', indice, id_carta, esito]
    for v_row in select value from jsonb_array_elements(p_actions) loop
      continue when v_row ->> 1 <> 'flip';
      if v_row ->> 4 = 'match' then
        v_pairs := v_pairs + 1; v_moves := v_moves + 1; v_last_match_ms := (v_row ->> 0)::int;
      elsif v_row ->> 4 = 'mismatch' then
        v_moves := v_moves + 1;
      end if;
    end loop;
    if v_pairs > 8 then
      v_rejected := true; v_notes := array_append(v_notes, 'troppe_coppie');
    elsif v_pairs = 8 then
      v_seconds := round(v_last_match_ms / 100.0) / 10;
      v_extra := greatest(0, v_moves - 8);
      v_score := greatest(300, round(1000 - 3 * v_seconds - 20 * v_extra)::int);
      if v_seconds < 5 then v_rejected := true; v_notes := array_append(v_notes, 'troppo_veloce'); end if;
      if v_moves = 8 then v_flagged := true; v_notes := array_append(v_notes, 'memory_perfetto'); end if;
    else
      v_score := 30 * v_pairs;
    end if;

  elsif p_game.id = 'quiz' then
    -- Punteggio calcolato SOLO qui, dalle risposte: stats.answers = [{questionId, choice, ms}]
    v_correct := 0;
    for v_answer in select value from jsonb_array_elements(coalesce(p_stats -> 'answers', '[]'::jsonb)) loop
      select * into v_q from quiz_questions
      where id = (v_answer ->> 'questionId')::int and id = any (p_attempt.quiz_question_ids);
      if v_q.id is null or v_q.id = any (v_seen) then
        v_rejected := true; v_notes := array_append(v_notes, 'domanda_non_prevista');
        continue;
      end if;
      v_seen := v_seen || v_q.id;
      v_ms := least(greatest(coalesce((v_answer ->> 'ms')::int, 20000), 0), 20000);
      v_sum_ms := v_sum_ms + v_ms;
      if v_answer ->> 'choice' is not null then
        v_answered := v_answered + 1;
        if v_ms >= 800 then v_all_fast := false; end if;
      end if;
      if (v_answer ->> 'choice')::int = v_q.correct_index then
        v_correct := v_correct + 1;
        v_score := v_score + 150 + round(50 * (1 - v_ms / 20000.0))::int;
      end if;
    end loop;
    if v_sum_ms > v_elapsed_ms + 3000 then
      v_rejected := true; v_notes := array_append(v_notes, 'piu_veloce_dell_orologio');
    end if;
    if v_answered >= 4 and v_all_fast and v_correct >= 4 then
      v_flagged := true; v_notes := array_append(v_notes, 'risposte_troppo_rapide');
    end if;
  end if;

  -- Il punteggio dichiarato dal telefono deve coincidere con quello ricalcolato (tranne il quiz)
  if p_game.id <> 'quiz' and abs(coalesce(p_raw, -1) - v_score) > (case when p_game.id = 'memory' then 3 else 0 end) then
    v_rejected := true; v_notes := array_append(v_notes, 'punteggio_non_coerente');
  end if;
  if v_score > p_game.max_raw_score then
    v_rejected := true; v_notes := array_append(v_notes, 'oltre_il_massimo');
  end if;

  return jsonb_build_object(
    'status', case when v_rejected then 'rejected' when v_flagged then 'flagged' else 'valid' end,
    'score', v_score, 'notes', v_notes, 'correct', v_correct);
end;
$$;

-- Come in 008, senza la colonna delle escluse
create or replace function public.staff_player_detail(p_token text, p_nickname text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_player players;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  select * into v_player from players where lower(nickname) = lower(trim(coalesce(p_nickname, '')));
  if v_player.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'player', jsonb_build_object(
    'nickname', v_player.nickname,
    'avatar', v_player.avatar,
    'role', v_player.role,
    'disabled', v_player.disabled,
    'created_at', v_player.created_at,
    'card', _player_card(v_player.id),
    -- Telefoni con cui si è registrato (il codice "EF27-B764" lo calcola l'app dal device_id)
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'device_id', d.device_id, 'created_at', d.created_at, 'user_agent', d.user_agent,
        'same_fingerprint', (select count(distinct d2.player_id) from devices d2
                             where d2.fingerprint = d.fingerprint and d2.player_id <> v_player.id))
        order by d.created_at)
      from devices d where d.player_id = v_player.id), '[]'),
    -- Telefoni da cui è entrato (sessioni ancora valide)
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object('device_id', s.device_id, 'last_seen_at', s.last_seen_at, 'user_agent', s.user_agent)
        order by s.last_seen_at desc)
      from sessions s where s.player_id = v_player.id and s.expires_at > now()), '[]'),
    'extra_points', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'points', e.points, 'reason', e.reason, 'created_at', e.created_at)
        order by e.created_at desc)
      from extra_points e where e.player_id = v_player.id), '[]'),
    'games', coalesce((
      select jsonb_agg(jsonb_build_object(
        'game_id', g.id, 'name', g.name,
        'best', (select max(a.raw_score) from attempts a where a.player_id = v_player.id and a.game_id = g.id and a.status in ('valid', 'flagged')),
        'valid', (select count(*) from attempts a where a.player_id = v_player.id and a.game_id = g.id and a.status = 'valid'),
        'flagged', (select count(*) from attempts a where a.player_id = v_player.id and a.game_id = g.id and a.status = 'flagged'),
        'pending', (select count(*) from attempts a where a.player_id = v_player.id and a.game_id = g.id and a.status = 'pending'))
        order by g.sort)
      from games g), '[]'),
    'login_failures', (select count(*) from login_failures f
                       where f.nickname_lower = lower(v_player.nickname) and f.failed_at > now() - interval '15 minutes')));
end;
$$;

create or replace function public.staff_review_list(p_token text, p_status text default 'flagged')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
begin
  if v_staff.id is null then return _staff_denied(); end if;
  -- Solo le partite segnalate di giocatori non esclusi (le escluse non esistono più)
  return jsonb_build_object('ok', true, 'attempts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'nickname', p.nickname, 'game_id', a.game_id, 'status', a.status,
      'raw_score', a.raw_score, 'client_score', a.client_score, 'notes', a.check_notes, 'submitted_at', a.submitted_at)
      order by a.submitted_at desc)
    from (select * from attempts where status = 'flagged' order by submitted_at desc nulls last limit 200) a
    join players p on p.id = a.player_id and not p.disabled), '[]'));
end;
$$;

-- Approva una partita segnalata (torna "valida"). Per le partite sospette non si scarta la partita:
-- si esclude il giocatore (staff_exclude_player).
create or replace function public.staff_set_attempt_status(p_token text, p_attempt_id uuid, p_status text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_attempt attempts;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  if p_status <> 'valid' then
    return jsonb_build_object('ok', false, 'error', 'STATUS_INVALID');
  end if;
  select * into v_attempt from attempts where id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.status <> 'flagged' then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  update attempts set status = 'valid', check_notes = array_append(check_notes, 'approvata_da_staff') where id = v_attempt.id;
  perform _staff_log(v_staff, 'attempt_valid', (select nickname from players where id = v_attempt.player_id),
    jsonb_build_object('attempt_id', v_attempt.id, 'game_id', v_attempt.game_id, 'raw_score', v_attempt.raw_score));
  return jsonb_build_object('ok', true);
end;
$$;

-- Escludi il giocatore di una partita sospetta: account disattivato (non entra, non gioca, sparisce dalla
-- classifica) e telefono bloccato (resta legato all'account: non ci si può registrare di nuovo).
-- La partita sospetta viene cancellata.
create or replace function public.staff_exclude_player(p_token text, p_attempt_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_attempt attempts;
  v_player players;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  select * into v_attempt from attempts where id = p_attempt_id;
  if v_attempt.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  select * into v_player from players where id = v_attempt.player_id and role = 'player';
  if v_player.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  update players set disabled = true where id = v_player.id;
  delete from sessions where player_id = v_player.id;
  delete from attempts where id = v_attempt.id;
  perform _staff_log(v_staff, 'exclude', v_player.nickname,
    jsonb_build_object('game_id', v_attempt.game_id, 'raw_score', v_attempt.raw_score, 'notes', v_attempt.check_notes));
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.staff_exclude_player(text, uuid) from public;
grant execute on function public.staff_exclude_player(text, uuid) to anon, authenticated;
