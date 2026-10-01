-- =====================================================================================
-- 031 — Un feedback al giorno, e la pagina sa se l'hai già lasciato (D111)
--
-- - submit_feedback: al massimo 1 feedback al giorno a testa (giorno di calendario, ora italiana), per account
--   oppure, senza account, per indirizzo (impronta).
-- - get_feedback_page(p_token): le 3 recensioni migliori + can_submit (si può ancora scrivere oggi?).
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- Ha già lasciato un feedback oggi? (account, oppure impronta dell'indirizzo senza account)
create or replace function public._feedback_today(p_player_id uuid, p_ip_hash text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from feedback f
    where (f.created_at at time zone 'Europe/Rome')::date = (now() at time zone 'Europe/Rome')::date
      and case when p_player_id is not null then f.player_id = p_player_id else f.player_id is null and f.ip_hash = p_ip_hash end);
$$;

-- Come in 030, con un solo feedback al giorno
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
  -- Un solo feedback al giorno a testa (giorno di calendario italiano; account, oppure indirizzo senza account, D111)
  if _feedback_today(v_player.id, v_ip) then
    return jsonb_build_object('ok', false, 'error', 'TOO_MANY');
  end if;
  insert into feedback (player_id, stars, text, ip_hash) values (v_player.id, p_stars, v_text, case when v_player.id is null then v_ip end);
  return jsonb_build_object('ok', true);
end;
$$;

-- Pagina Feedback: le 3 recensioni migliori (come get_feedback_highlights) e se oggi si può ancora scrivere
create or replace function public.get_feedback_page(p_token text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_player players := case when p_token is null then null else _session_player(p_token) end;
begin
  return get_feedback_highlights() || jsonb_build_object('can_submit',
    _section_on('feedback') and coalesce(v_player.role, 'player') = 'player'
    and (v_player.id is not null or _feedback_anonymous())
    and not _feedback_today(v_player.id, md5(_client_ip())));
end;
$$;

revoke execute on function public._feedback_today(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_feedback_page(text) from public;
grant execute on function public.get_feedback_page(text) to anon, authenticated;
