-- =====================================================================================
-- 016 — PIN più sicuro (D82)
--
-- - PIN di 5 cifre per i nuovi account e per i reset dello staff. Chi ha già un PIN di 4 cifre entra ancora con quello.
-- - PIN troppo semplici rifiutati (PIN_TOO_SIMPLE): cifre tutte uguali (00000, 11111...) e scale (12345, 98765...).
-- - Accesso: 5 tentativi. Finiti i tentativi l'account si blocca per un tempo che cresce a ogni blocco:
--   1 minuto, poi 5, poi 15, poi 60 (e resta 60). Si riparte da 1 minuto dopo un accesso riuscito,
--   dopo un reset del PIN dello staff o se l'ultimo blocco è finito da più di 24 ore.
--   Vale anche per i nickname che non esistono (così non si scopre quali esistono).
-- Uguale a app/src/lib/pin.js.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- Blocchi dell'accesso per nickname: livello (1–4) e fine dell'ultimo blocco
create table if not exists public.login_locks (
  nickname_lower text primary key,
  level int not null,
  locked_until timestamptz not null
);
alter table public.login_locks enable row level security;
revoke all on public.login_locks from anon, authenticated;

-- Durata del blocco per livello
create or replace function public._login_lock_duration(p_level int)
returns interval language sql immutable as $$
  select case p_level when 1 then interval '1 minute' when 2 then interval '5 minutes'
                      when 3 then interval '15 minutes' else interval '60 minutes' end;
$$;

-- Problema del PIN scelto (null se va bene): PIN_INVALID se non ha 5 cifre, PIN_TOO_SIMPLE se è facile da indovinare
create or replace function public._pin_problem(p_pin text)
returns text language sql immutable as $$
  select case
    when p_pin is null or p_pin !~ '^[0-9]{5}$' then 'PIN_INVALID'
    when p_pin ~ '^(.)\1{4}$' or position(p_pin in '0123456789') > 0 or position(p_pin in '9876543210') > 0 then 'PIN_TOO_SIMPLE'
  end;
$$;

revoke execute on function public._login_lock_duration(int), public._pin_problem(text) from public, anon, authenticated;

-- Accesso: come in 011, con 5 tentativi e blocco che cresce
create or replace function public.login(
  p_nickname text, p_secret text,
  p_device_id uuid default null, p_fingerprint text default null, p_user_agent text default null
)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_nick text := lower(coalesce(p_nickname, ''));
  v_max_failures constant int := 5;
  v_lock login_locks;
  v_level int;
  v_until timestamptz;
  v_failures int;
  v_player players;
begin
  select * into v_lock from login_locks where nickname_lower = v_nick;
  if v_lock.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'LOCKED',
      'retry_after_s', ceil(extract(epoch from (v_lock.locked_until - now())))::int);
  end if;

  -- Telefono bloccato dallo staff: da qui non si entra con nessun account
  if _device_banned(p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'DEVICE_BANNED');
  end if;

  select * into v_player from players where lower(nickname) = v_nick;
  if v_player.id is null or p_secret is null or v_player.pin_hash <> extensions.crypt(p_secret, v_player.pin_hash) then
    insert into login_failures (nickname_lower) values (v_nick);
    -- errori dopo la fine dell'ultimo blocco, nelle ultime 24 ore
    select count(*) into v_failures from login_failures
    where nickname_lower = v_nick
      and failed_at > greatest(coalesce(v_lock.locked_until, '-infinity'::timestamptz), now() - interval '24 hours');
    if v_failures >= v_max_failures then
      v_level := case when v_lock.locked_until > now() - interval '24 hours' then least(v_lock.level + 1, 4) else 1 end;
      v_until := now() + _login_lock_duration(v_level);
      insert into login_locks (nickname_lower, level, locked_until) values (v_nick, v_level, v_until)
      on conflict (nickname_lower) do update set level = excluded.level, locked_until = excluded.locked_until;
      return jsonb_build_object('ok', false, 'error', 'LOCKED',
        'retry_after_s', ceil(extract(epoch from (v_until - now())))::int);
    end if;
    return jsonb_build_object('ok', false, 'error', 'WRONG_CREDENTIALS', 'attempts_left', v_max_failures - v_failures);
  end if;
  if v_player.disabled then
    return jsonb_build_object('ok', false, 'error', 'DISABLED');
  end if;

  delete from login_failures where nickname_lower = v_nick;
  delete from login_locks where nickname_lower = v_nick;
  return jsonb_build_object('ok', true, 'token', _new_session(v_player.id, p_device_id, p_fingerprint, p_user_agent),
                            'player', _player_json(v_player));
end;
$$;

-- Registrazione: come in 011, con il PIN di 5 cifre non troppo semplice
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
  v_problem := _pin_problem(p_pin);
  if v_problem is not null then
    return jsonb_build_object('ok', false, 'error', v_problem);
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

-- Reset del PIN dallo staff: come in 008, con il PIN di 5 cifre non troppo semplice; toglie anche il blocco
create or replace function public.staff_reset_pin(p_token text, p_nickname text, p_new_pin text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_staff players := _staff_player(p_token);
  v_player players := _find_player(p_nickname);
  v_problem text := _pin_problem(p_new_pin);
begin
  if v_staff.id is null then return _staff_denied(); end if;
  if v_player.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  if v_problem is not null then
    return jsonb_build_object('ok', false, 'error', v_problem);
  end if;
  update players set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 8)) where id = v_player.id;
  delete from sessions where player_id = v_player.id;
  delete from login_failures where nickname_lower = lower(v_player.nickname);
  delete from login_locks where nickname_lower = lower(v_player.nickname);
  perform _staff_log(v_staff, 'reset_pin', v_player.nickname);
  return jsonb_build_object('ok', true);
end;
$$;
