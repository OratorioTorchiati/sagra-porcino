-- =====================================================================================
-- 043 — Numeri per l'Admin (D146)
--
-- Pannello Admin → 📊 Numeri: giocatori registrati, partite e recensioni, in totale e giorno per giorno
-- (ora italiana). Solo conteggi di dati che il database ha già: nessun nuovo dato raccolto.
-- - Giocatori: account con ruolo giocatore (non Mod e Admin), per giorno di registrazione.
-- - Partite: tutte quelle iniziate dai giocatori, per giorno di gioco.
-- - Recensioni: tutte quelle ricevute, anche quelle poi rimosse dallo staff, per giorno di invio.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

create or replace function public.staff_stats(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_admin players := _admin_player(p_token);
  v_tz text := coalesce(_setting('timezone') #>> '{}', 'Europe/Rome');
begin
  if v_admin.id is null then return _admin_denied(p_token); end if;
  return (
    with p as (
      select (created_at at time zone v_tz)::date as day, count(*) as n from players where role = 'player' group by 1
    ), a as (
      select a.day, count(*) as n from attempts a join players pl on pl.id = a.player_id where pl.role = 'player' group by 1
    ), f as (
      select (created_at at time zone v_tz)::date as day, count(*) as n from feedback group by 1
    ), d as (
      select day from p union select day from a union select day from f
    )
    select jsonb_build_object('ok', true,
      'today', _today(),
      'totals', jsonb_build_object(
        'players', (select coalesce(sum(n), 0) from p),
        'attempts', (select coalesce(sum(n), 0) from a),
        'reviews', (select coalesce(sum(n), 0) from f)),
      'days', coalesce((select jsonb_agg(jsonb_build_object('day', d.day,
          'players', coalesce(p.n, 0), 'attempts', coalesce(a.n, 0), 'reviews', coalesce(f.n, 0)) order by d.day desc)
        from d left join p using (day) left join a using (day) left join f using (day)), '[]'))
  );
end;
$$;

revoke execute on function public.staff_stats(text) from public;
grant execute on function public.staff_stats(text) to anon, authenticated;
