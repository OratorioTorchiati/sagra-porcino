-- =====================================================================================
-- 001 — Account dei giocatori (Tappa 4)
--
-- Niente Supabase Auth (D21): account in una tabella nostra, PIN cifrato con bcrypt,
-- "chiave di sessione" casuale restituita al telefono (sul server solo il suo hash SHA-256).
-- Il client NON legge né scrive nessuna tabella: RLS attiva senza policy + permessi revocati.
-- Tutto passa dalle funzioni RPC qui sotto (SECURITY DEFINER), che controllano le regole.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tabelle ----------

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  avatar text not null,
  pin_hash text not null,                                   -- bcrypt (PIN per i giocatori, password per lo staff)
  role text not null default 'player' check (role in ('player', 'staff')),
  disabled boolean not null default false,
  prize_token uuid not null unique default gen_random_uuid(), -- nel QR personale per il premio (Tappa 8)
  prize_given_at timestamptz,
  created_at timestamptz not null default now()
);
-- Nickname unico senza distinzione tra maiuscole e minuscole
create unique index if not exists players_nickname_lower_key on public.players (lower(nickname));

-- Un dispositivo = un account creato (device_id chiave primaria)
create table if not exists public.devices (
  device_id uuid primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  fingerprint text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists devices_player_idx on public.devices (player_id);

-- Sessioni: una per accesso; dal dispositivo e dall'impronta lo staff vede dove si usa l'account
create table if not exists public.sessions (
  token_hash text primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  device_id uuid,
  fingerprint text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create index if not exists sessions_player_idx on public.sessions (player_id);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null
);
insert into public.settings (key, value) values ('selfie_enabled', 'false') on conflict (key) do nothing;

create table if not exists public.login_failures (
  id bigint generated always as identity primary key,
  nickname_lower text not null,
  failed_at timestamptz not null default now()
);
create index if not exists login_failures_nick_idx on public.login_failures (nickname_lower, failed_at);

-- Parole vietate nei nickname (filtro di base, confronto "contiene"; modificabile dallo staff)
create table if not exists public.banned_words (word text primary key);
insert into public.banned_words (word) values
  ('cazz'), ('merd'), ('stronz'), ('puttan'), ('troia'), ('vaffanc'), ('coglion'), ('minchi'),
  ('bastard'), ('frocio'), ('froci'), ('negro'), ('negri'), ('nazi'), ('hitler'), ('mussolini'),
  ('porcodio'), ('diocan'), ('dioporc'), ('madonnaputt'), ('suca'), ('pompin'), ('zoccol'), ('figa'),
  ('fuck'), ('shit'), ('bitch'), ('dick'), ('cock'), ('pussy'), ('whore'), ('slut')
on conflict (word) do nothing;

-- ---------- Sicurezza: il client non tocca le tabelle ----------

alter table public.players enable row level security;
alter table public.devices enable row level security;
alter table public.sessions enable row level security;
alter table public.settings enable row level security;
alter table public.login_failures enable row level security;
alter table public.banned_words enable row level security;

revoke all on public.players, public.devices, public.sessions, public.settings,
  public.login_failures, public.banned_words from anon, authenticated;

-- ---------- Costanti ----------

-- Personaggi ammessi (stessi id di app/src/characters/characters.js)
create or replace function public._avatar_ids()
returns text[] language sql immutable as $$
  select array['porcino', 'montanaro', 'porcino_nero', 'castagna', 'scoiattolo', 'riccio',
               'cinghialotto', 'foglia', 'abetino', 'gufetto', 'cestino', 'lumachina'];
$$;

-- ---------- Funzioni interne (non chiamabili dal client) ----------

create or replace function public._nickname_problem(p_nickname text)
returns text language sql stable set search_path = public as $$
  select case
    when p_nickname is null or p_nickname !~ '^[A-Za-z0-9_]{3,16}$' then 'NICKNAME_INVALID'
    when exists (select 1 from banned_words b where position(b.word in lower(p_nickname)) > 0) then 'NICKNAME_NOT_ALLOWED'
    when exists (select 1 from players p where lower(p.nickname) = lower(p_nickname)) then 'NICKNAME_TAKEN'
    else null
  end;
$$;

-- "Marco" → "Mar***" (per non rivelare tutto il nickname a chi usa lo stesso telefono)
create or replace function public._mask_nickname(p_nickname text)
returns text language sql immutable as $$
  select left(p_nickname, 3) || '***';
$$;

create or replace function public._hash_token(p_token text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- Crea una sessione e restituisce la chiave in chiaro (unica volta in cui esiste in chiaro)
create or replace function public._new_session(p_player_id uuid, p_device_id uuid, p_fingerprint text, p_user_agent text)
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into sessions (token_hash, player_id, device_id, fingerprint, user_agent)
  values (_hash_token(v_token), p_player_id, p_device_id, left(p_fingerprint, 128), left(p_user_agent, 300));
  return v_token;
end;
$$;

-- Giocatore della sessione (null se chiave assente, scaduta o account disattivato)
create or replace function public._session_player(p_token text)
returns public.players language plpgsql volatile security definer set search_path = public as $$
declare
  v_player_id uuid;
  v_player players;
begin
  if p_token is null or length(p_token) <> 64 then
    return null;
  end if;
  update sessions set last_seen_at = now()
  where token_hash = _hash_token(p_token) and expires_at > now()
  returning player_id into v_player_id;
  if v_player_id is null then
    return null;
  end if;
  select * into v_player from players where id = v_player_id;
  if v_player.id is null or v_player.disabled then
    return null;
  end if;
  return v_player;
end;
$$;

create or replace function public._player_json(p players)
returns jsonb language sql stable as $$
  select jsonb_build_object('nickname', p.nickname, 'avatar', p.avatar, 'role', p.role, 'created_at', p.created_at);
$$;

-- ---------- RPC pubbliche ----------

-- Controllo del nickname durante la digitazione (solo informativo: non prenota niente)
create or replace function public.check_nickname(p_nickname text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', _nickname_problem(p_nickname) is null, 'error', _nickname_problem(p_nickname));
$$;

-- Registrazione in un'unica operazione: o va tutto a buon fine, o non viene salvato niente (D22)
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

-- Accesso con nickname + PIN (o password per lo staff). Blocco di 15 minuti dopo 10 errori (D23).
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

create or replace function public.logout(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  delete from sessions where token_hash = _hash_token(p_token);
  return jsonb_build_object('ok', true);
end;
$$;

-- Profilo del giocatore collegato (i punti arrivano con la Tappa 6)
create or replace function public.get_my_profile(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_player players := _session_player(p_token);
begin
  if v_player.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_LOGGED_IN');
  end if;
  return jsonb_build_object('ok', true, 'player', _player_json(v_player) || jsonb_build_object('prize_token', v_player.prize_token));
end;
$$;

-- ---------- Permessi: il client può chiamare SOLO queste funzioni ----------

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.check_nickname(text) to anon, authenticated;
grant execute on function public.register(text, text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.login(text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.logout(text) to anon, authenticated;
grant execute on function public.get_my_profile(text) to anon, authenticated;
