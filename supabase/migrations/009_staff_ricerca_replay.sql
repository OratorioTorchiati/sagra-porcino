-- =====================================================================================
-- 009 — Pannello staff: ricerca, classifica e registro a pagine; "Rivedi partita" (D74, D75)
--
-- - staff_search_players: niente elenco senza ricerca; risultati affini a pagine da 20 (con il totale).
-- - staff_leaderboard: classifica completa a pagine da 50 (p_all = tutta, solo per il CSV).
-- - staff_log_list: registro a pagine da 100, filtrabile per giorno, operatore e tipo di azione.
-- - staff_attempt_replay: tutto quello che serve per rivedere una partita (seme, azioni, durata;
--   per il quiz anche le domande nell'ordine della partita, con la risposta giusta: solo per lo staff).
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- La vecchia versione (senza pagine) va tolta: cambiano i parametri
drop function if exists public.staff_search_players(text, text);

create or replace function public.staff_search_players(p_token text, p_query text, p_page int default 0)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_q text := lower(trim(coalesce(p_query, '')));
  v_page int := greatest(coalesce(p_page, 0), 0);
  v_size constant int := 20;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  if v_q = '' then
    return jsonb_build_object('ok', true, 'players', '[]'::jsonb, 'total', 0, 'page', 0, 'page_size', v_size);
  end if;
  return jsonb_build_object('ok', true, 'page', v_page, 'page_size', v_size,
    'total', (select count(*) from players where strpos(lower(nickname), v_q) > 0),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nickname', x.nickname, 'avatar', x.avatar, 'role', x.role, 'disabled', x.disabled,
        'total', coalesce(l.total, 0), 'created_at', x.created_at) order by x.ord)
      from (
        select p.*, row_number() over (order by (lower(p.nickname) = v_q) desc, (lower(p.nickname) like v_q || '%') desc, lower(p.nickname)) as ord
        from players p
        where strpos(lower(p.nickname), v_q) > 0
        order by ord
        offset v_page * v_size limit v_size
      ) x
      left join leaderboard l on l.player_id = x.id), '[]'));
end;
$$;

-- Dati per rivedere una partita
create or replace function public.staff_attempt_replay(p_token text, p_attempt_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_attempt attempts;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  select * into v_attempt from attempts where id = p_attempt_id;
  if v_attempt.id is null or v_attempt.submitted_at is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'attempt', jsonb_build_object(
    'id', v_attempt.id,
    'nickname', (select nickname from players where id = v_attempt.player_id),
    'game_id', v_attempt.game_id,
    'status', v_attempt.status,
    'seed', v_attempt.seed,
    'raw_score', v_attempt.raw_score,
    'client_score', v_attempt.client_score,
    'notes', v_attempt.check_notes,
    'stats', v_attempt.stats,
    'actions', v_attempt.actions,
    'submitted_at', v_attempt.submitted_at,
    'questions', case when v_attempt.game_id = 'quiz' then (
      select jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'options', to_jsonb(q.options), 'correct', q.correct_index)
                       order by array_position(v_attempt.quiz_question_ids, q.id))
      from quiz_questions q where q.id = any (v_attempt.quiz_question_ids)) end));
end;
$$;

-- Classifica completa a pagine da 50; p_all = tutte le righe (per il CSV)
drop function if exists public.staff_leaderboard(text);

create or replace function public.staff_leaderboard(p_token text, p_page int default 0, p_all boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_page int := greatest(coalesce(p_page, 0), 0);
  v_size constant int := 50;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  return jsonb_build_object('ok', true, 'window', _window_state(), 'page', v_page, 'page_size', v_size,
    'total', (select count(*) from _leaderboard_rows()),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('position', r.position, 'nickname', r.nickname, 'total', r.total,
                                          'best', r.best, 'extra_total', r.extra_total)
                       order by r.position, lower(r.nickname))
      from (
        select x.*, rank() over (order by x.total desc)::int as position,
               row_number() over (order by x.total desc, lower(x.nickname)) as ord
        from _leaderboard_rows() x
      ) r
      where p_all or (r.ord > v_page * v_size and r.ord <= (v_page + 1) * v_size)), '[]'));
end;
$$;

-- Registro a pagine da 100, con filtri facoltativi: giorno (ora italiana), operatore, tipo di azione
drop function if exists public.staff_log_list(text);

create or replace function public.staff_log_list(p_token text, p_page int default 0, p_day date default null,
                                                 p_staff text default null, p_action text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_page int := greatest(coalesce(p_page, 0), 0);
  v_size constant int := 100;
begin
  if v_staff.id is null then return _staff_denied(); end if;
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

revoke execute on function public.staff_search_players(text, text, int), public.staff_attempt_replay(text, uuid),
  public.staff_leaderboard(text, int, boolean), public.staff_log_list(text, int, date, text, text) from public;
grant execute on function public.staff_search_players(text, text, int) to anon, authenticated;
grant execute on function public.staff_attempt_replay(text, uuid) to anon, authenticated;
grant execute on function public.staff_leaderboard(text, int, boolean) to anon, authenticated;
grant execute on function public.staff_log_list(text, int, date, text, text) to anon, authenticated;
