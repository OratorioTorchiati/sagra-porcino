-- =====================================================================================
-- 027 — Nuovo punteggio del Memory (D106)
--
-- Da 0 a 1000: 100 × coppie trovate + 100 × precisione + 100 × tempo avanzato
--   precisione     = coppie / (coppie + errori × 0,5)      errori = mosse sbagliate
--   tempo avanzato = 1 − secondi / durata della partita    solo se si trovano tutte le coppie
-- 1 coppia = 1xx, 4 coppie = 4xx, 8 coppie = 8xx + precisione + tempo. Prima: 30 punti per coppia se non
-- completato, 1000 − 3 × secondi − 20 × mosse in più se completato. Le partite già giocate restano col loro punteggio.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- Come in 026, con il nuovo punteggio del Memory
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
  v_errors int; v_precision numeric; v_time_left numeric; -- Memory (D106)
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
    else
      -- Punteggio (D106, come app/src/games/memory/logic.js): 100 × coppie + 100 × precisione + 100 × tempo avanzato
      v_errors := greatest(0, v_moves - v_pairs);
      v_precision := case when v_pairs > 0 then v_pairs / (v_pairs + v_errors * 0.5) else 0 end;
      v_time_left := 0;
      if v_pairs = 8 then
        v_seconds := round(v_last_match_ms / 100.0) / 10;
        v_time_left := greatest(0, 1 - v_seconds / p_game.duration_s);
        if v_seconds < 5 then v_rejected := true; v_notes := array_append(v_notes, 'troppo_veloce'); end if;
        if v_moves = 8 then v_flagged := true; v_notes := array_append(v_notes, 'memory_perfetto'); end if;
      end if;
      v_score := round(100 * (v_pairs + v_precision + v_time_left))::int;
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
