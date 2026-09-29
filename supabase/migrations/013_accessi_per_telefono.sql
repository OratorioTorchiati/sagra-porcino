-- =====================================================================================
-- 013 — Ultimi accessi di UN telefono (D79)
--
-- Nella scheda del giocatore ogni telefono ha il suo bottone 🕒: mostra gli ultimi 20 accessi del giocatore
-- da quel telefono (non più di tutti i telefoni insieme).
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

drop function if exists public.staff_player_accesses(text, text);

create or replace function public.staff_player_accesses(p_token text, p_nickname text, p_device_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_player players;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  select * into v_player from players where lower(nickname) = lower(trim(coalesce(p_nickname, '')));
  if v_player.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  return jsonb_build_object('ok', true, 'accesses', coalesce((
    select jsonb_agg(jsonb_build_object('device_id', a.device_id, 'user_agent', a.user_agent, 'created_at', a.created_at,
                                        'registration', exists (select 1 from devices d where d.device_id = a.device_id and d.player_id = v_player.id))
                     order by a.created_at desc)
    from (
      select * from access_log
      where player_id = v_player.id and (p_device_id is null or device_id = p_device_id)
      order by created_at desc limit 20
    ) a), '[]'));
end;
$$;

revoke execute on function public.staff_player_accesses(text, text, uuid) from public;
grant execute on function public.staff_player_accesses(text, text, uuid) to anon, authenticated;
