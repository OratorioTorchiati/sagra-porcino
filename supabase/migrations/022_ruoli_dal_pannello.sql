-- =====================================================================================
-- 022 — Ruoli dal pannello: l'Admin promuove e declassa (D95)
--
-- - Superadmin: il primo Admin (l'account "staff"). Non si può declassare né cancellare dal pannello.
-- - Un Admin può: giocatore → Mod o Admin; Mod → Admin; Mod → giocatore.
-- - Togliere o abbassare un Admin (a Mod o a giocatore) lo può fare solo il superadmin.
-- - Nessuno cambia il proprio ruolo. Ogni cambio resta nel registro.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

alter table public.players add column if not exists superadmin boolean not null default false;
update public.players set superadmin = true where lower(nickname) = 'staff' and role = 'admin';

-- Profilo per l'app: come in 001, con superadmin (il pannello mostra i bottoni giusti)
create or replace function public._player_json(p players)
returns jsonb language sql stable as $$
  select jsonb_build_object('nickname', p.nickname, 'avatar', p.avatar, 'role', p.role, 'created_at', p.created_at,
                            'superadmin', p.superadmin);
$$;

-- Scheda del giocatore: come in 011, con superadmin
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
    'superadmin', v_player.superadmin,
    'disabled', v_player.disabled,
    'created_at', v_player.created_at,
    'card', _player_card(v_player.id),
    -- Telefoni con cui si è registrato (il codice "EF27-B764" lo calcola l'app dal device_id)
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'device_id', d.device_id, 'created_at', d.created_at, 'user_agent', d.user_agent, 'banned', _device_banned(d.device_id),
        'same_fingerprint', (select count(distinct d2.player_id) from devices d2
                             where d2.fingerprint = d.fingerprint and d2.player_id <> v_player.id))
        order by d.created_at)
      from devices d where d.player_id = v_player.id), '[]'),
    -- Telefoni da cui è entrato (sessioni ancora valide)
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object('device_id', s.device_id, 'last_seen_at', s.last_seen_at, 'user_agent', s.user_agent,
                                          'banned', _device_banned(s.device_id))
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
        'rejected', (select count(*) from attempts a where a.player_id = v_player.id and a.game_id = g.id and a.status = 'rejected'),
        'pending', (select count(*) from attempts a where a.player_id = v_player.id and a.game_id = g.id and a.status = 'pending'))
        order by g.sort)
      from games g), '[]'),
    'login_failures', (select count(*) from login_failures f
                       where f.nickname_lower = lower(v_player.nickname) and f.failed_at > now() - interval '15 minutes')));
end;
$$;

-- Cambio di ruolo: p_role = 'player' | 'staff' (Mod) | 'admin'
create or replace function public.staff_set_role(p_token text, p_nickname text, p_role text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_admin players := _admin_player(p_token);
  v_player players;
begin
  if v_admin.id is null then return _admin_denied(p_token); end if;
  if p_role is null or p_role not in ('player', 'staff', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'ROLE_INVALID');
  end if;
  select * into v_player from players where lower(nickname) = lower(trim(coalesce(p_nickname, '')));
  if v_player.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  if v_player.id = v_admin.id then return jsonb_build_object('ok', false, 'error', 'ROLE_SELF'); end if;
  if v_player.superadmin then return jsonb_build_object('ok', false, 'error', 'ROLE_SUPERADMIN'); end if;
  if v_player.role = p_role then return jsonb_build_object('ok', true, 'role', p_role); end if;
  -- Un Admin lo toglie o lo abbassa solo il superadmin
  if v_player.role = 'admin' and not v_admin.superadmin then
    return jsonb_build_object('ok', false, 'error', 'ROLE_ONLY_SUPERADMIN');
  end if;

  update players set role = p_role where id = v_player.id;
  perform _staff_log(v_admin, 'role', v_player.nickname, jsonb_build_object('from', v_player.role, 'to', p_role));
  return jsonb_build_object('ok', true, 'role', p_role);
end;
$$;

revoke execute on function public.staff_set_role(text, text, text) from public;
grant execute on function public.staff_set_role(text, text, text) to anon, authenticated;
