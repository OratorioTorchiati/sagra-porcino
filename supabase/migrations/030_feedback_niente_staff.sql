-- =====================================================================================
-- 030 — Mod e Admin non lasciano recensioni (D110)
--
-- - submit_feedback: un account Mod o Admin riceve STAFF_NOT_ALLOWED.
-- - Le recensioni lasciate quando l'account era ancora un giocatore restano (anche nelle 3 migliori).
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- Come in 029, senza lo staff
create or replace function public.submit_feedback(p_token text, p_stars int, p_text text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_player players := case when p_token is null then null else _session_player(p_token) end;
  v_text text := nullif(trim(coalesce(p_text, '')), '');
  v_ip text := md5(_client_ip());
begin
  if not _section_on('feedback') then return jsonb_build_object('ok', false, 'error', 'SECTION_OFF'); end if;
  if v_player.id is null and not _feedback_anonymous() then
    return jsonb_build_object('ok', false, 'error', 'LOGIN_REQUIRED');
  end if;
  -- Mod e Admin non lasciano recensioni (D110)
  if v_player.role in ('staff', 'admin') then return jsonb_build_object('ok', false, 'error', 'STAFF_NOT_ALLOWED'); end if;
  if p_stars is null or p_stars not between 1 and 5 then return jsonb_build_object('ok', false, 'error', 'STARS_INVALID'); end if;
  if length(v_text) > 1000 then return jsonb_build_object('ok', false, 'error', 'TEXT_TOO_LONG'); end if;
  -- Al massimo 3 al giorno a testa (account, oppure indirizzo per chi non ha l'account)
  if (select count(*) from feedback f where f.created_at > now() - interval '1 day'
      and case when v_player.id is not null then f.player_id = v_player.id else f.player_id is null and f.ip_hash = v_ip end) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'TOO_MANY');
  end if;
  insert into feedback (player_id, stars, text, ip_hash) values (v_player.id, p_stars, v_text, case when v_player.id is null then v_ip end);
  return jsonb_build_object('ok', true);
end;
$$;

