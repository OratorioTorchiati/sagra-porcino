-- =====================================================================================
-- 026 — Numero di domande del quiz deciso dall'Admin (D104)
--
-- - games.questions: domande per partita del quiz (da 3 a 20, predefinito 5, non più di quelle attive).
-- - La durata della partita resta "domande × secondi per domanda"; ogni partita ricorda le sue domande, quindi
--   tempo per domanda e controlli usano quelle (le partite di prima restano da 5).
-- - Punteggio: 1000 al massimo qualunque sia il numero di domande (per risposta giusta 750/N + fino a 250/N di
--   velocità; con 5 domande è come prima: 150 + fino a 50). Così il quiz pesa in classifica sempre uguale.
-- - get_games_state e staff_get_settings mandano anche il numero di domande (regole del gioco, pannello).
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

alter table public.games add column if not exists questions int;
update public.games set questions = 5 where id = 'quiz' and questions is null;

-- ---------- Partite ----------

-- Come in 024, con N domande
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
    -- N domande a caso (N deciso dall'Admin, D104), evitando quelle già capitate a questo giocatore (se ce ne sono abbastanza)
    select coalesce(array_agg(distinct q), '{}') into v_seen
    from attempts a, unnest(a.quiz_question_ids) as q where a.player_id = v_player.id and a.game_id = 'quiz';
    v_qids := array(select id from quiz_questions where active and not (id = any (v_seen)) order by random() limit v_game.questions);
    if coalesce(array_length(v_qids, 1), 0) < v_game.questions then
      v_qids := array(select id from quiz_questions where active order by random() limit v_game.questions);
    end if;
    if coalesce(array_length(v_qids, 1), 0) = 0 then
      return jsonb_build_object('ok', false, 'error', 'QUIZ_EMPTY');
    end if;
  end if;

  insert into attempts_used (player_id, game_id, day, used) values (v_player.id, p_game_id, _today(), 1)
  on conflict (player_id, game_id, day) do update set used = attempts_used.used + 1;

  insert into attempts (player_id, game_id, day, seed, quiz_question_ids, duration_s)
  values (v_player.id, p_game_id, _today(), floor(random() * 4294967296)::bigint, v_qids,
          case when p_game_id = 'quiz' then v_game.duration_s / v_game.questions * array_length(v_qids, 1) else v_game.duration_s end)
  returning * into v_attempt;

  return jsonb_build_object(
    'ok', true,
    'attempt_id', v_attempt.id,
    'seed', v_attempt.seed,
    'duration_s', v_attempt.duration_s, -- durata decisa dall'Admin (D99): il gioco la usa al posto della sua
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

-- Come in 024, con tempo per domanda e punteggio calcolati sulle domande della partita
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
  v_end int := p_game.duration_s * 1000; -- fine della partita: ogni oggetto toccato la anticipa di 2 s (D81)
  v_prev_ms int; v_int_n int := 0; v_int_sum numeric := 0; v_int_sq numeric := 0; v_std numeric;
  -- Porcini che cadono
  v_lives int := 3; v_catches int := 0; v_precise int := 0;
  -- Memory
  v_moves int := 0; v_pairs int := 0; v_last_match_ms int; v_seconds numeric; v_extra int;
  -- Quiz
  v_q_ms int; -- tempo per domanda del quiz
  v_nq int; -- domande della partita del quiz
  v_answer jsonb; v_q quiz_questions; v_ms int; v_seen int[] := '{}'; v_all_fast boolean := true; v_answered int := 0; v_sum_ms int := 0;
begin
  -- La durata con cui è stata giocata la partita (l'Admin può cambiarla, D99); per le vecchie partite quella del gioco
  p_game.duration_s := coalesce(p_attempt.duration_s, p_game.duration_s);
  v_end := p_game.duration_s * 1000;
  -- tempo per domanda: durata della partita diviso le sue domande (5 per le partite di prima)
  v_nq := coalesce(array_length(p_attempt.quiz_question_ids, 1), 5);
  v_q_ms := p_game.duration_s * 1000 / v_nq;
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
      if (v_row ->> 0)::int > v_end + 500 then
        v_rejected := true; v_notes := array_append(v_notes, 'tocco_oltre_la_fine');
      end if;
      -- Moltiplicatore a timer (come app/src/games/acchiappa/scoring.js, D84): timer a zero → giù di un livello
      -- col timer al 50%; tornati a ×1 si riparte dalla serie
      v_tap_ms := (v_row ->> 0)::int;
      while v_level > 1 and v_tap_ms >= v_ends loop
        v_level := v_level - 1;
        v_ends := case when v_level > 1 then v_ends + _acchiappa_level_ms(v_level) / 2 end;
        if v_level = 1 then v_streak := 0; end if;
      end loop;
      if v_row ->> 4 = 'good' then
        v_score := v_score + 5 * v_level;
        if v_level = 1 then
          -- da ×1 a ×2 con 5 porcini di fila, timer al 25%
          v_streak := v_streak + 1;
          if v_streak >= 5 then
            v_level := 2;
            v_ends := v_tap_ms + _acchiappa_level_ms(2) / 4;
          end if;
        else
          -- ogni porcino ricarica il timer; se supera il tempo pieno si sale, col timer al 25% (a ×4 si ferma al pieno)
          v_ends := v_ends + _acchiappa_level_boost_ms(v_level);
          if v_ends - v_tap_ms > _acchiappa_level_ms(v_level) then
            if v_level < 4 then
              v_level := v_level + 1;
              v_ends := v_tap_ms + _acchiappa_level_ms(v_level) / 4;
            else
              v_ends := v_tap_ms + _acchiappa_level_ms(4);
            end if;
          end if;
        end if;
        v_good := v_good + 1;
        if (v_row ->> 6)::int < 150 then v_fast := v_fast + 1; end if;
        -- distanza del tocco dal centro del porcino (px): un dito quasi mai colpisce il centro esatto
        if (v_row ->> 8)::int <= 2 then v_center := v_center + 1; end if;
      elsif v_row ->> 4 = 'bad' and _acchiappa_is_poisonous(v_row ->> 5) then
        -- fungo velenoso: si riparte da ×1
        v_streak := 0; v_level := 1; v_ends := null;
      elsif v_row ->> 4 = 'bad' then
        -- oggetto: il moltiplicatore non cambia, la partita finisce 2 s prima (mai prima del tocco)
        v_end := greatest(v_tap_ms, v_end - 2000);
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
    if v_dur < v_end - 1000 then
      v_rejected := true; v_notes := array_append(v_notes, 'partita_troppo_corta');
    end if;
    if v_dur > v_end + 1000 then
      v_rejected := true; v_notes := array_append(v_notes, 'durata_troppo_lunga');
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
      v_ms := least(greatest(coalesce((v_answer ->> 'ms')::int, v_q_ms), 0), v_q_ms);
      v_sum_ms := v_sum_ms + v_ms;
      if v_answer ->> 'choice' is not null then
        v_answered := v_answered + 1;
        if v_ms >= 800 then v_all_fast := false; end if;
      end if;
      if (v_answer ->> 'choice')::int = v_q.correct_index then
        v_correct := v_correct + 1;
        -- 1000 punti al massimo in tutto, qualunque sia il numero di domande (con 5: 150 + fino a 50 di velocità)
        v_score := v_score + round((750 + 250 * (1 - v_ms / v_q_ms::numeric)) / v_nq)::int;
      end if;
    end loop;
    if v_sum_ms > v_elapsed_ms + 3000 then
      v_rejected := true; v_notes := array_append(v_notes, 'piu_veloce_dell_orologio');
    end if;
    v_score := least(v_score, 1000); -- gli arrotondamenti non superano il massimo
    if v_answered >= ceil(v_nq * 0.8) and v_all_fast and v_correct >= ceil(v_nq * 0.8) then
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

-- Come in 024, con il numero di domande
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
        'duration_s', g.duration_s,
        'questions', g.questions,
        'attempts_used_today', case when v_player.id is null then null else
          coalesce((select u.used from attempts_used u where u.player_id = v_player.id and u.game_id = g.id and u.day = v_today), 0) end,
        'best', case when v_player.id is null then null else
          (select max(a.raw_score) from attempts a where a.player_id = v_player.id and a.game_id = g.id and a.status in ('valid', 'flagged')) end
      ) order by g.sort)
      from games g));
end;
$$;

-- ---------- Pannello ----------

-- Come in 025, con il numero di domande
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
    'games', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'enabled', enabled, 'duration_s', duration_s, 'questions', questions) order by sort) from games));
end;
$$;

-- Come in 024, con il numero di domande del quiz (p_questions, facoltativo)
drop function if exists public.staff_set_game(text, text, int);
create or replace function public.staff_set_game(p_token text, p_game_id text, p_seconds int, p_questions int default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_admin players := _admin_player(p_token);
  v_game games;
  v_duration int;
  v_questions int;
begin
  if v_admin.id is null then return _admin_denied(p_token); end if;
  select * into v_game from games where id = p_game_id;
  if v_game.id is null then return jsonb_build_object('ok', false, 'error', 'GAME_UNKNOWN'); end if;
  if p_game_id = 'quiz' then
    if p_seconds is null or p_seconds < 5 or p_seconds > 60 then return jsonb_build_object('ok', false, 'error', 'DURATION_INVALID'); end if;
    -- Numero di domande (D104): da 3 a 20, non più di quelle attive
    v_questions := coalesce(p_questions, v_game.questions);
    if v_questions < 3 or v_questions > 20 then return jsonb_build_object('ok', false, 'error', 'QUESTIONS_INVALID'); end if;
    if v_questions > (select count(*) from quiz_questions where active) then
      return jsonb_build_object('ok', false, 'error', 'QUESTIONS_TOO_FEW');
    end if;
    v_duration := p_seconds * v_questions;
  else
    if p_seconds is null or p_seconds < 20 or p_seconds > 600 then return jsonb_build_object('ok', false, 'error', 'DURATION_INVALID'); end if;
    v_duration := p_seconds;
  end if;
  update games set
    duration_s = v_duration,
    questions = coalesce(v_questions, questions),
    -- più tempo = più punti possibili (Quiz e Memory hanno sempre 1000 al massimo)
    max_raw_score = case when id in ('acchiappa', 'cadono') then ceil(max_raw_score::numeric * v_duration / duration_s)::int else max_raw_score end
  where id = p_game_id;
  perform _staff_log(v_admin, 'game', p_game_id, jsonb_build_object('duration_s', v_duration, 'questions', v_questions));
  return jsonb_build_object('ok', true, 'duration_s', v_duration, 'questions', v_questions);
end;
$$;

revoke execute on function public.staff_set_game(text, text, int, int) from public;
grant execute on function public.staff_set_game(text, text, int, int) to anon, authenticated;
