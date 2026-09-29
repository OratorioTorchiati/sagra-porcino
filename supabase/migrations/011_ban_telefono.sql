-- =====================================================================================
-- 011 — Ban del telefono (D78)
--
-- - "Ban account" (= disattiva): l'account non entra, non gioca, sparisce dalla classifica; il telefono con cui
--   si è registrato resta legato a lui (niente nuovo account). Si toglie con "Togli ban".
-- - "Ban telefono": blocca il TELEFONO (il suo codice): da lì non si entra con NESSUN account e non ci si
--   registra; le sessioni aperte da quel telefono si chiudono. Si toglie con "Sblocca".
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

create table if not exists public.banned_devices (
  device_id uuid primary key,
  banned_at timestamptz not null default now(),
  staff_nickname text not null
);
alter table public.banned_devices enable row level security;
revoke all on public.banned_devices from anon, authenticated;

create or replace function public._device_banned(p_device_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_device_id is not null and exists (select 1 from banned_devices where device_id = p_device_id);
$$;

-- Accesso: come in 001, più il controllo del telefono bloccato
create or replace function public.login(
  p_nickname text, p_secret text,
  p_device_id uuid default null, p_fingerprint text default null, p_user_agent text default null
)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_nick text := lower(coalesce(p_nickname, ''));
  v_failures int;
  v_player players;
  v_max_failures constant int := 10;
  v_lock constant interval := interval '15 minutes';
begin
  select count(*) into v_failures from login_failures
  where nickname_lower = v_nick and failed_at > now() - v_lock;
  if v_failures >= v_max_failures then
    return jsonb_build_object('ok', false, 'error', 'LOCKED', 'retry_after_s',
      (select ceil(extract(epoch from (min(failed_at) + v_lock - now())))::int from (
        select failed_at from login_failures where nickname_lower = v_nick and failed_at > now() - v_lock
        order by failed_at desc limit v_max_failures) last_failures));
  end if;

  -- Telefono bloccato dallo staff: da qui non si entra con nessun account
  if _device_banned(p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'DEVICE_BANNED');
  end if;

  select * into v_player from players where lower(nickname) = v_nick;
  if v_player.id is null or p_secret is null or v_player.pin_hash <> extensions.crypt(p_secret, v_player.pin_hash) then
    insert into login_failures (nickname_lower) values (v_nick);
    return jsonb_build_object('ok', false, 'error', 'WRONG_CREDENTIALS', 'attempts_left', greatest(0, v_max_failures - v_failures - 1));
  end if;
  if v_player.disabled then
    return jsonb_build_object('ok', false, 'error', 'DISABLED');
  end if;

  delete from login_failures where nickname_lower = v_nick;
  return jsonb_build_object('ok', true, 'token', _new_session(v_player.id, p_device_id, p_fingerprint, p_user_agent),
                            'player', _player_json(v_player));
end;
$$;

-- Registrazione: come in 001, più il controllo del telefono bloccato
create or replace function public.register(
  p_nickname text, p_avatar text, p_pin text,
  p_device_id uuid, p_fingerprint text default null, p_user_agent text default null
)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_problem text;
  v_existing text;
  v_player players;
begin
  if p_device_id is null then
    return jsonb_build_object('ok', false, 'error', 'DEVICE_MISSING');
  end if;
  if _device_banned(p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'DEVICE_BANNED');
  end if;
  select p.nickname into v_existing from devices d join players p on p.id = d.player_id where d.device_id = p_device_id;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'error', 'DEVICE_ALREADY_USED', 'nickname_hint', _mask_nickname(v_existing));
  end if;
  v_problem := _nickname_problem(p_nickname);
  if v_problem is not null then
    return jsonb_build_object('ok', false, 'error', v_problem);
  end if;
  if p_avatar is null or not (p_avatar = any (_avatar_ids())) then
    return jsonb_build_object('ok', false, 'error', 'AVATAR_INVALID');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'PIN_INVALID');
  end if;

  insert into players (nickname, avatar, pin_hash)
  values (p_nickname, p_avatar, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  returning * into v_player;
  insert into devices (device_id, player_id, fingerprint, user_agent)
  values (p_device_id, v_player.id, left(p_fingerprint, 128), left(p_user_agent, 300));

  return jsonb_build_object('ok', true, 'token', _new_session(v_player.id, p_device_id, p_fingerprint, p_user_agent),
                            'player', _player_json(v_player));
exception
  -- Due registrazioni in contemporanea con lo stesso nickname o dallo stesso telefono
  when unique_violation then
    if exists (select 1 from devices where device_id = p_device_id) then
      return jsonb_build_object('ok', false, 'error', 'DEVICE_ALREADY_USED', 'nickname_hint', '***');
    end if;
    return jsonb_build_object('ok', false, 'error', 'NICKNAME_TAKEN');
end;
$$;

-- Scheda del giocatore: come in 008, con i telefoni bloccati segnati
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

-- Blocca / sblocca un telefono (per codice). Bloccandolo si chiudono le sessioni aperte da lì.
create or replace function public.staff_ban_device(p_token text, p_device_id uuid, p_ban boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_owner text := (select p.nickname from devices d join players p on p.id = d.player_id where d.device_id = p_device_id);
begin
  if v_staff.id is null then return _staff_denied(); end if;
  if p_device_id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  if p_ban then
    insert into banned_devices (device_id, staff_nickname) values (p_device_id, v_staff.nickname)
    on conflict (device_id) do nothing;
    delete from sessions where device_id = p_device_id;
  else
    delete from banned_devices where device_id = p_device_id;
  end if;
  perform _staff_log(v_staff, case when p_ban then 'device_ban' else 'device_unban' end, v_owner,
    jsonb_build_object('device', upper(left(replace(p_device_id::text, '-', ''), 8))));
  return jsonb_build_object('ok', true);
end;
$$;

-- Elenco dei telefoni bloccati (per sbloccarli)
create or replace function public.staff_banned_devices(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
begin
  if v_staff.id is null then return _staff_denied(); end if;
  return jsonb_build_object('ok', true, 'devices', coalesce((
    select jsonb_agg(jsonb_build_object('device_id', b.device_id, 'banned_at', b.banned_at, 'staff', b.staff_nickname,
                                        'nickname', (select p.nickname from devices d join players p on p.id = d.player_id where d.device_id = b.device_id))
                     order by b.banned_at desc)
    from banned_devices b), '[]'));
end;
$$;

revoke execute on function public._device_banned(uuid) from public, anon, authenticated;
revoke execute on function public.staff_ban_device(text, uuid, boolean), public.staff_banned_devices(text) from public;
grant execute on function public.staff_ban_device(text, uuid, boolean) to anon, authenticated;
grant execute on function public.staff_banned_devices(text) to anon, authenticated;
