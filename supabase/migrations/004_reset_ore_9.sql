-- =====================================================================================
-- 004 — Tentativi che si rinnovano alle 9 di mattina (non a mezzanotte) e nomi dei giochi aggiornati
--
-- - Il "giorno dei tentativi" va dalle 9:00 alle 8:59 del giorno dopo (ora italiana): chi gioca dopo
--   mezzanotte la prima sera usa ancora i tentativi della sera. Ora configurabile in settings.attempts_reset_hour.
-- - Nomi dei giochi: "Quiz" e "Memory Torchiati" (come nell'app).
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

insert into public.settings (key, value) values ('attempts_reset_hour', '9')
on conflict (key) do nothing;

update public.games set name = 'Quiz' where id = 'quiz';
update public.games set name = 'Memory Torchiati' where id = 'memory';

-- Giorno dei tentativi: prima dell'ora di rinnovo conta ancora come il giorno prima
create or replace function public._today()
returns date language sql stable set search_path = public as $$
  select ((now() at time zone coalesce(_setting('timezone') #>> '{}', 'Europe/Rome'))
          - make_interval(hours => coalesce((_setting('attempts_reset_hour') #>> '{}')::int, 0)))::date;
$$;

-- Come in 003, più 'reset_hour' (per scrivere "alle 9 tornano 3")
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
          (select count(*) from attempts a where a.player_id = v_player.id and a.game_id = g.id and a.day = v_today) end,
        'best', case when v_player.id is null then null else
          (select max(a.raw_score) from attempts a where a.player_id = v_player.id and a.game_id = g.id and a.status in ('valid', 'flagged')) end
      ) order by g.sort)
      from games g));
end;
$$;

revoke execute on function public._today() from public, anon, authenticated;
