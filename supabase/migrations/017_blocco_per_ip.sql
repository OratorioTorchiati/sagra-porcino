-- =====================================================================================
-- 017 — Blocco dei tentativi per nickname + IP (D83)
--
-- Supera il blocco per solo nickname della 016: chi sbaglia apposta il PIN di un altro blocca solo sé stesso.
-- - 5 tentativi per nickname DA QUELL'IP, poi blocco che cresce: 1 → 5 → 15 → 60 minuti (come in 016).
-- - Tetto per IP su tutti i nickname: 50 errori in un'ora da un solo IP → quell'IP si blocca (contro chi prova
--   tanti account; soglia alta perché sulla rete mobile o su un Wi-Fi tanti telefoni condividono lo stesso IP).
-- - Tetto per nickname da tutti gli IP: 20 errori in un'ora → quel nickname si blocca (contro chi cambia IP).
-- - Gli IP servono solo a questo: restano nella tabella degli errori al massimo 2 giorni.
-- - staff_client_ip: solo per lo staff, mostra l'IP che vede il server (per il controllo automatico).
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

alter table public.login_failures add column if not exists ip text;
create index if not exists login_failures_ip_idx on public.login_failures (ip, failed_at);
create index if not exists login_failures_at_idx on public.login_failures (failed_at);

-- Blocchi: 'nick_ip' (chiave "nickname|ip"), 'ip', 'nick'. Livello 1–4 e fine dell'ultimo blocco.
create table if not exists public.login_blocks (
  kind text not null check (kind in ('nick_ip', 'ip', 'nick')),
  key text not null,
  level int not null,
  locked_until timestamptz not null,
  primary key (kind, key)
);
alter table public.login_blocks enable row level security;
revoke all on public.login_blocks from anon, authenticated;

drop table if exists public.login_locks; -- sostituita da login_blocks

-- IP del telefono che fa la richiesta (dalle intestazioni aggiunte dalla rete di Supabase); '?' se manca
create or replace function public._client_ip()
returns text language plpgsql stable as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
begin
  return coalesce(
    nullif(trim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
    nullif(trim(v_headers ->> 'x-real-ip'), ''),
    '?');
end;
$$;

-- Registra il blocco se gli errori hanno raggiunto il massimo: livello che cresce se l'ultimo blocco
-- è finito da meno di 24 ore. Restituisce la fine del blocco (null se non si blocca).
create or replace function public._login_block_if(p_kind text, p_key text, p_failures int, p_max int)
returns timestamptz language plpgsql volatile as $$
declare
  v_block login_blocks;
  v_level int;
  v_until timestamptz;
begin
  if p_failures < p_max then return null; end if;
  select * into v_block from login_blocks where kind = p_kind and key = p_key;
  v_level := case when v_block.locked_until > now() - interval '24 hours' then least(v_block.level + 1, 4) else 1 end;
  v_until := now() + _login_lock_duration(v_level);
  insert into login_blocks (kind, key, level, locked_until) values (p_kind, p_key, v_level, v_until)
  on conflict (kind, key) do update set level = excluded.level, locked_until = excluded.locked_until;
  return v_until;
end;
$$;

-- Fine dell'ultimo blocco (o -infinito): gli errori si contano da lì
create or replace function public._login_block_end(p_kind text, p_key text)
returns timestamptz language sql stable as $$
  select coalesce((select locked_until from login_blocks where kind = p_kind and key = p_key), '-infinity'::timestamptz);
$$;

revoke execute on function public._client_ip(), public._login_block_if(text, text, int, int),
  public._login_block_end(text, text) from public, anon, authenticated;

-- Accesso: come in 016, con i blocchi per nickname + IP, per IP e per nickname
create or replace function public.login(
  p_nickname text, p_secret text,
  p_device_id uuid default null, p_fingerprint text default null, p_user_agent text default null
)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_nick text := lower(coalesce(p_nickname, ''));
  v_ip text := _client_ip();
  v_nick_ip text := v_nick || '|' || v_ip;
  v_max_nick_ip constant int := 5;   -- per nickname da un IP, in 24 ore
  v_max_ip constant int := 50;       -- da un IP su tutti i nickname, in un'ora
  v_max_nick constant int := 20;     -- per nickname da tutti gli IP, in un'ora
  v_until timestamptz;
  v_failures int;
  v_player players;
begin
  -- Pulizia: gli IP degli errori restano al massimo 2 giorni
  delete from login_failures where failed_at < now() - interval '2 days';

  select max(locked_until) into v_until from login_blocks
  where locked_until > now()
    and ((kind = 'nick_ip' and key = v_nick_ip) or (kind = 'ip' and key = v_ip) or (kind = 'nick' and key = v_nick));
  if v_until is not null then
    return jsonb_build_object('ok', false, 'error', 'LOCKED', 'retry_after_s', ceil(extract(epoch from (v_until - now())))::int);
  end if;

  -- Telefono bloccato dallo staff: da qui non si entra con nessun account
  if _device_banned(p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'DEVICE_BANNED');
  end if;

  select * into v_player from players where lower(nickname) = v_nick;
  if v_player.id is null or p_secret is null or v_player.pin_hash <> extensions.crypt(p_secret, v_player.pin_hash) then
    insert into login_failures (nickname_lower, ip) values (v_nick, v_ip);

    -- tetto per IP e per nickname (un'ora)
    select count(*) into v_failures from login_failures
    where ip = v_ip and failed_at > greatest(_login_block_end('ip', v_ip), now() - interval '1 hour');
    v_until := _login_block_if('ip', v_ip, v_failures, v_max_ip);
    select count(*) into v_failures from login_failures
    where nickname_lower = v_nick and failed_at > greatest(_login_block_end('nick', v_nick), now() - interval '1 hour');
    v_until := greatest(v_until, _login_block_if('nick', v_nick, v_failures, v_max_nick));

    -- 5 tentativi per nickname da questo IP (24 ore)
    select count(*) into v_failures from login_failures
    where nickname_lower = v_nick and ip = v_ip
      and failed_at > greatest(_login_block_end('nick_ip', v_nick_ip), now() - interval '24 hours');
    v_until := greatest(v_until, _login_block_if('nick_ip', v_nick_ip, v_failures, v_max_nick_ip));

    if v_until is not null then
      return jsonb_build_object('ok', false, 'error', 'LOCKED', 'retry_after_s', ceil(extract(epoch from (v_until - now())))::int);
    end if;
    return jsonb_build_object('ok', false, 'error', 'WRONG_CREDENTIALS', 'attempts_left', v_max_nick_ip - v_failures);
  end if;
  if v_player.disabled then
    return jsonb_build_object('ok', false, 'error', 'DISABLED');
  end if;

  delete from login_failures where nickname_lower = v_nick and ip = v_ip;
  delete from login_blocks where kind = 'nick_ip' and key = v_nick_ip;
  return jsonb_build_object('ok', true, 'token', _new_session(v_player.id, p_device_id, p_fingerprint, p_user_agent),
                            'player', _player_json(v_player));
end;
$$;

-- Reset del PIN dallo staff: come in 016; toglie errori e blocchi di quel nickname (da ogni IP)
create or replace function public.staff_reset_pin(p_token text, p_nickname text, p_new_pin text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_staff players := _staff_player(p_token);
  v_player players := _find_player(p_nickname);
  v_problem text := _pin_problem(p_new_pin);
  v_nick text;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  if v_player.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  if v_problem is not null then
    return jsonb_build_object('ok', false, 'error', v_problem);
  end if;
  v_nick := lower(v_player.nickname);
  update players set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 8)) where id = v_player.id;
  delete from sessions where player_id = v_player.id;
  delete from login_failures where nickname_lower = v_nick;
  delete from login_blocks where (kind = 'nick' and key = v_nick) or (kind = 'nick_ip' and key like v_nick || '|%');
  perform _staff_log(v_staff, 'reset_pin', v_player.nickname);
  return jsonb_build_object('ok', true);
end;
$$;

-- Solo staff: l'IP che vede il server e le intestazioni da cui lo prende (controllo automatico, test-db)
create or replace function public.staff_client_ip(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
begin
  if v_staff.id is null then return _staff_denied(); end if;
  return jsonb_build_object('ok', true, 'ip', _client_ip(),
    'cf_connecting_ip', v_headers ->> 'cf-connecting-ip', 'x_forwarded_for', v_headers ->> 'x-forwarded-for',
    'x_real_ip', v_headers ->> 'x-real-ip');
end;
$$;

revoke execute on function public.staff_client_ip(text) from public;
grant execute on function public.staff_client_ip(text) to anon, authenticated;
