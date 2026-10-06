-- =====================================================================================
-- SETUP — Sagra del Porcino: tutto il database in un solo file (D147)
--
-- Per un progetto Supabase NUOVO (es. quello di produzione): Supabase → SQL Editor → incolla tutto → Run.
-- Si può rieseguire. È il risultato delle migrazioni 001–043 (supabase/migrations/) senza i passaggi intermedi:
-- ogni funzione compare una sola volta, nella versione finale, e i permessi delle funzioni sono tutti in fondo.
-- Verificato con uno script di confronto su un Postgres locale: stesse tabelle, funzioni, permessi e dati
-- iniziali delle migrazioni eseguite una dopo l'altra.
-- Le domande del quiz NON sono qui (le risposte non vanno nel repository pubblico): si caricano dopo.
-- Le migrazioni successive (044 in poi) vanno eseguite dopo questo file.
-- =====================================================================================

-- le funzioni possono usare tabelle e funzioni definite più avanti nel file
set check_function_bodies = off;

-- #####################################################################################
-- 001 · Account dei giocatori (Tappa 4)
-- #####################################################################################
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
               'cinghialotto', 'foglia', 'abetino', 'gufetto', 'cestino', 'lumachina',
               'ovolaccio', 'fungo_giallo', 'fungo_stregato', 'riccio_castagna'];
$$;
-- ---------- Funzioni interne (non chiamabili dal client) ----------

create or replace function public._nickname_problem(p_nickname text)
returns text language sql stable set search_path = public as $$
  select case
    when p_nickname is null or p_nickname !~ '^[A-Za-z0-9_]{3,16}$' then 'NICKNAME_INVALID'
    when _nickname_is_offensive(p_nickname) then 'NICKNAME_NOT_ALLOWED'
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
  select jsonb_build_object('nickname', p.nickname, 'avatar', p.avatar, 'role', p.role, 'created_at', p.created_at,
                            'superadmin', p.superadmin);
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
-- Accesso con nickname + PIN (o password per lo staff). Blocco di 15 minuti dopo 10 errori (D23).
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

-- #####################################################################################
-- 002 · Filtro nickname: niente bestemmie né insulti, senza censurare parole innocue
-- #####################################################################################
alter table public.banned_words
  add column if not exists kind text not null default 'contains' check (kind in ('contains', 'word', 'word_start'));
create table if not exists public.allowed_words (word text primary key);
alter table public.allowed_words enable row level security;
revoke all on public.allowed_words from anon, authenticated;
-- Radici sempre vietate (si aggiungono a quelle della migrazione 001)
insert into public.banned_words (word, kind) values
  ('porco', 'contains'), ('porca', 'contains'), ('madonn', 'contains'), ('gesu', 'contains'),
  ('bestemm', 'contains'), ('dioca', 'contains'), ('dioporc', 'contains'), ('diobest', 'contains'),
  ('diomaial', 'contains'), ('dioboia', 'contains'), ('dioladr', 'contains'), ('diomerd', 'contains'),
  ('dioschif', 'contains'), ('dioinfam', 'contains'), ('diolupo', 'contains'), ('dioserp', 'contains'),
  ('boiadio', 'contains'), ('cristodio', 'contains'), ('ostiadio', 'contains'),
  ('dio', 'word'), ('iddio', 'word'), ('dii', 'word'),
  ('prete', 'word_start'), ('preti', 'word_start'), ('cristo', 'word_start'),
  -- Correzioni alla 001: come radici "ovunque" bloccavano anche Nazionale, Nazario, Hancock...
  ('nazi', 'word'), ('nazist', 'contains'), ('dick', 'word'), ('cock', 'word')
on conflict (word) do update set kind = excluded.kind;
-- Parole innocue che contengono o iniziano con una radice vietata
insert into public.allowed_words (word) values
  ('porcospin'), ('cristof'), ('gesuald'), ('negroni'), ('figaro')
on conflict (word) do nothing;
-- true se il nickname contiene bestemmie o insulti
create or replace function public._nickname_is_offensive(p_nickname text)
returns boolean language plpgsql stable set search_path = public as $$
declare
  v_tokens text[];
  v_flat text;
  v_allowed text;
begin
  -- Parole separate: underscore, cifre e passaggi minuscola→Maiuscola ("PorcoDio" → porco, dio)
  v_tokens := array_remove(
    regexp_split_to_array(lower(regexp_replace(p_nickname, '([a-z])([A-Z])', '\1_\2', 'g')), '[_0-9]+'),
    '');
  -- Tutto attaccato, con le cifre lette come lettere ("p0rc0" → porco), senza le parole ammesse
  v_flat := translate(lower(replace(p_nickname, '_', '')), '013457', 'oieast');
  for v_allowed in select word from allowed_words loop
    v_flat := replace(v_flat, v_allowed, '');
  end loop;

  if exists (select 1 from banned_words where kind = 'contains' and position(word in v_flat) > 0) then
    return true;
  end if;
  return exists (
    select 1
    from banned_words b, unnest(v_tokens) as t(token)
    where (b.kind = 'word' and t.token = b.word)
       or (b.kind = 'word_start' and t.token like b.word || '%'
           and not exists (select 1 from allowed_words a where t.token like a.word || '%'))
  );
end;
$$;

-- #####################################################################################
-- 003 · Giochi, tentativi e punteggi (Tappa 5)
-- #####################################################################################
-- ---------- Impostazioni ----------

insert into public.settings (key, value) values
  ('attempts_per_day', '3'),
  ('timezone', '"Europe/Rome"'),
  ('games_open_from', 'null'),                            -- da impostare prima della sagra (es. "2026-10-17T15:00:00+02:00")
  ('games_open_until', '"2026-10-18T23:00:00+02:00"')     -- chiusura della classifica (D19)
on conflict (key) do nothing;
-- ---------- Tabelle ----------

create table if not exists public.games (
  id text primary key,
  name text not null,
  sort int not null,
  enabled boolean not null default true,   -- interruttore per lo staff
  duration_s int not null,                 -- durata massima della partita
  max_raw_score int not null               -- tetto di plausibilità (da app/src/games/*/scoring.js)
);
insert into public.games (id, name, sort, duration_s, max_raw_score) values
  ('acchiappa', 'Acchiappa il porcino', 1, 60, 16200),
  ('quiz', 'Quiz', 2, 100, 1000),
  ('cadono', 'Porcini che cadono', 3, 60, 4770),
  ('memory', 'Memory Torchiati', 4, 120, 1000)
on conflict (id) do update set name = excluded.name, sort = excluded.sort,
  duration_s = excluded.duration_s, max_raw_score = excluded.max_raw_score;  -- "enabled" non si tocca

create table if not exists public.quiz_questions (
  id int generated by default as identity primary key,
  text text not null,
  options text[] not null check (array_length(options, 1) = 4),
  correct_index int not null check (correct_index between 0 and 3),
  active boolean not null default true
);
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  game_id text not null references public.games (id),
  day date not null,                        -- giorno (ora italiana) in cui è iniziato: 3 tentativi per giorno
  started_at timestamptz not null default now(),
  seed bigint not null,
  quiz_question_ids int[],
  submitted_at timestamptz,
  client_score int,                         -- punteggio dichiarato dal telefono
  raw_score int,                            -- punteggio ricalcolato dal server (quello che conta)
  stats jsonb,
  actions jsonb,
  status text not null default 'pending' check (status in ('pending', 'valid', 'flagged', 'rejected')),
  check_notes text[] not null default '{}'  -- motivi di esclusione/segnalazione, per lo staff
);
create index if not exists attempts_player_game_day_idx on public.attempts (player_id, game_id, day);
create index if not exists attempts_game_status_idx on public.attempts (game_id, status);
alter table public.games enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.attempts enable row level security;
revoke all on public.games, public.quiz_questions, public.attempts from anon, authenticated;
-- ---------- Funzioni interne ----------

create or replace function public._setting(p_key text)
returns jsonb language sql stable set search_path = public as $$
  select value from settings where key = p_key;
$$;
-- Giorno di oggi nel fuso della sagra
create or replace function public._today()
returns date language sql stable set search_path = public as $$
  select ((now() at time zone coalesce(_setting('timezone') #>> '{}', 'Europe/Rome'))
          - make_interval(hours => coalesce((_setting('attempts_reset_hour') #>> '{}')::int, 0)))::date;
$$;
-- 'not_yet' | 'open' | 'closed' secondo la finestra generale
create or replace function public._window_state()
returns text language plpgsql stable set search_path = public as $$
declare
  v_from timestamptz := (_setting('games_open_from') #>> '{}')::timestamptz;
  v_until timestamptz := (_setting('games_open_until') #>> '{}')::timestamptz;
begin
  if v_from is not null and now() < v_from then return 'not_yet'; end if;
  if v_until is not null and now() >= v_until then return 'closed'; end if;
  return 'open';
end;
$$;
create or replace function public._attempts_per_day()
returns int language sql stable set search_path = public as $$
  select coalesce((_setting('attempts_per_day') #>> '{}')::int, 3);
$$;
-- Moltiplicatore di Acchiappa (come app/src/games/acchiappa/config.js)
create or replace function public._acchiappa_multiplier(p_streak int)
returns int language sql immutable as $$
  select case when p_streak >= 15 then 4 when p_streak >= 10 then 3 when p_streak >= 5 then 2 else 1 end;
$$;
-- Controlli di una partita inviata. Restituisce { status, score, notes[], correct? }.
create or replace function public._check_attempt(p_attempt attempts, p_game games, p_raw int, p_stats jsonb, p_actions jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_notes text[] := '{}';
  v_rejected boolean := false;
  v_flagged boolean := false;
  v_score int := 0;
  v_correct int;
  v_dur int := (p_stats ->> 'durationMs')::int;
  v_elapsed_ms numeric := extract(epoch from (now() - p_attempt.started_at)) * 1000;
  v_row jsonb;
  -- Acchiappa
  v_streak int := 0; v_good int := 0; v_fast int := 0; v_taps int := 0; v_center int := 0;
  v_level int := 1; v_ends int; v_tap_ms int;
  v_end int := p_game.duration_s * 1000; -- fine della partita: ogni oggetto toccato la anticipa di 2 s (D81)
  v_prev_ms int; v_int_n int := 0; v_int_sum numeric := 0; v_int_sq numeric := 0; v_std numeric;
  -- Porcini che cadono
  v_lives int := 3; v_catches int := 0; v_precise int := 0;
  -- Memory
  v_moves int := 0; v_pairs int := 0; v_last_match_ms int; v_seconds numeric; v_extra int;
  -- Quiz
  v_q_ms int; -- tempo per domanda del quiz
  v_nq int; -- domande della partita del quiz
  v_steps int; -- step della partita: domande del quiz, coppie del Memory (D107)
  v_errors int; v_precision numeric; v_time_left numeric; -- Memory (D106)
  v_answer jsonb; v_q quiz_questions; v_ms int; v_seen int[] := '{}'; v_all_fast boolean := true; v_answered int := 0; v_sum_ms int := 0;
begin
  -- La durata con cui è stata giocata la partita (l'Admin può cambiarla, D99); per le vecchie partite quella del gioco
  p_game.duration_s := coalesce(p_attempt.duration_s, p_game.duration_s);
  v_end := p_game.duration_s * 1000;
  -- step della partita (domande, coppie): quelli ricordati nella partita; per le vecchie partite quelli del gioco
  v_steps := coalesce(p_attempt.steps, array_length(p_attempt.quiz_question_ids, 1), p_game.steps);
  -- tempo per domanda: durata della partita diviso le sue domande
  v_nq := v_steps;
  v_q_ms := p_game.duration_s * 1000 / v_nq;
  if p_actions is null or jsonb_typeof(p_actions) <> 'array' then
    return jsonb_build_object('status', 'rejected', 'score', 0, 'notes', array['azioni_mancanti']);
  end if;
  if jsonb_array_length(p_actions) > 6000 then
    return jsonb_build_object('status', 'rejected', 'score', 0, 'notes', array['troppe_azioni']);
  end if;
  if v_dur is null or v_dur < 0 then
    return jsonb_build_object('status', 'rejected', 'score', 0, 'notes', array['durata_mancante']);
  end if;
  if now() > p_attempt.started_at + interval '6 hours' then
    v_rejected := true; v_notes := array_append(v_notes, 'inviata_dopo_6_ore');
  end if;
  -- Il tempo di gioco non può superare il tempo reale passato dall'avvio
  if v_dur > v_elapsed_ms + 2000 then
    v_rejected := true; v_notes := array_append(v_notes, 'piu_veloce_dell_orologio');
  end if;
  if p_game.id <> 'quiz' and v_dur > p_game.duration_s * 1000 + 3000 then
    v_rejected := true; v_notes := array_append(v_notes, 'durata_troppo_lunga');
  end if;

  if p_game.id = 'acchiappa' then
    -- [ms, 'tap', x, y, esito, tipo, età_ms, dimensione, distanza]
    for v_row in select value from jsonb_array_elements(p_actions) loop
      continue when v_row ->> 1 <> 'tap';
      if (v_row ->> 0)::int > v_end + 500 then
        v_rejected := true; v_notes := array_append(v_notes, 'tocco_oltre_la_fine');
      end if;
      -- Moltiplicatore a timer (come app/src/games/acchiappa/scoring.js, D84): timer a zero → giù di un livello
      -- col timer al 50%; tornati a ×1 si riparte dalla serie
      v_tap_ms := (v_row ->> 0)::int;
      while v_level > 1 and v_tap_ms >= v_ends loop
        v_level := v_level - 1;
        v_ends := case when v_level > 1 then v_ends + _acchiappa_level_ms(v_level) / 2 end;
        if v_level = 1 then v_streak := 0; end if;
      end loop;
      if v_row ->> 4 = 'good' then
        v_score := v_score + 5 * v_level;
        if v_level = 1 then
          -- da ×1 a ×2 con 5 porcini di fila, timer al 25%
          v_streak := v_streak + 1;
          if v_streak >= 5 then
            v_level := 2;
            v_ends := v_tap_ms + _acchiappa_level_ms(2) / 4;
          end if;
        else
          -- ogni porcino ricarica il timer; se supera il tempo pieno si sale, col timer al 25% (a ×4 si ferma al pieno)
          v_ends := v_ends + _acchiappa_level_boost_ms(v_level);
          if v_ends - v_tap_ms > _acchiappa_level_ms(v_level) then
            if v_level < 4 then
              v_level := v_level + 1;
              v_ends := v_tap_ms + _acchiappa_level_ms(v_level) / 4;
            else
              v_ends := v_tap_ms + _acchiappa_level_ms(4);
            end if;
          end if;
        end if;
        v_good := v_good + 1;
        if (v_row ->> 6)::int < 150 then v_fast := v_fast + 1; end if;
        -- distanza del tocco dal centro del porcino (px): un dito quasi mai colpisce il centro esatto
        if (v_row ->> 8)::int <= 2 then v_center := v_center + 1; end if;
      elsif v_row ->> 4 = 'bad' and _acchiappa_is_poisonous(v_row ->> 5) then
        -- fungo velenoso: si riparte da ×1
        v_streak := 0; v_level := 1; v_ends := null;
      elsif v_row ->> 4 = 'bad' then
        -- oggetto: il moltiplicatore non cambia, la partita finisce 2 s prima (mai prima del tocco)
        v_end := greatest(v_tap_ms, v_end - 2000);
      end if;
      if v_row ->> 4 in ('good', 'bad') then
        v_taps := v_taps + 1;
        if v_prev_ms is not null then
          v_int_n := v_int_n + 1;
          v_int_sum := v_int_sum + ((v_row ->> 0)::int - v_prev_ms);
          v_int_sq := v_int_sq + ((v_row ->> 0)::int - v_prev_ms) ^ 2;
        end if;
        v_prev_ms := (v_row ->> 0)::int;
      end if;
    end loop;
    if v_dur < v_end - 1000 then
      v_rejected := true; v_notes := array_append(v_notes, 'partita_troppo_corta');
    end if;
    if v_dur > v_end + 1000 then
      v_rejected := true; v_notes := array_append(v_notes, 'durata_troppo_lunga');
    end if;
    if v_good >= 10 and v_center > v_good * 0.5 then
      v_flagged := true; v_notes := array_append(v_notes, 'tocchi_al_centro');
    end if;
    if v_good >= 10 and v_fast > v_good * 0.2 then
      v_flagged := true; v_notes := array_append(v_notes, 'reazioni_troppo_rapide');
    end if;
    if v_int_n >= 20 then
      v_std := sqrt(greatest(0, v_int_sq / v_int_n - (v_int_sum / v_int_n) ^ 2));
      if v_std < 35 then v_flagged := true; v_notes := array_append(v_notes, 'tocchi_troppo_regolari'); end if;
    end if;

  elsif p_game.id = 'cadono' then
    -- [ms, 'catch', tipo, x_elemento, x_cestino]
    for v_row in select value from jsonb_array_elements(p_actions) loop
      continue when v_row ->> 1 <> 'catch';
      v_catches := v_catches + 1;
      if abs((v_row ->> 3)::numeric - (v_row ->> 4)::numeric) <= 1 then v_precise := v_precise + 1; end if;
      if v_row ->> 2 = 'porcino' then v_score := v_score + 10;
      elsif v_row ->> 2 = 'golden' then v_score := v_score + 50;
      elsif v_row ->> 2 = 'bomb' then v_lives := v_lives - 1;
      end if;
    end loop;
    -- Bonus sopravvivenza: arrivati alla fine del minuto con vite rimaste
    if v_lives > 0 and v_dur >= p_game.duration_s * 1000 - 1000 then
      v_score := v_score + v_lives * 50;
    elsif v_lives > 0 then
      v_rejected := true; v_notes := array_append(v_notes, 'finita_prima_con_vite');
    end if;
    if v_catches >= 20 and v_precise > v_catches * 0.8 then
      v_flagged := true; v_notes := array_append(v_notes, 'prese_troppo_precise');
    end if;

  elsif p_game.id = 'memory' then
    -- [ms, 'flip', indice, id_carta, esito]
    for v_row in select value from jsonb_array_elements(p_actions) loop
      continue when v_row ->> 1 <> 'flip';
      if v_row ->> 4 = 'match' then
        v_pairs := v_pairs + 1; v_moves := v_moves + 1; v_last_match_ms := (v_row ->> 0)::int;
      elsif v_row ->> 4 = 'mismatch' then
        v_moves := v_moves + 1;
      end if;
    end loop;
    if v_pairs > v_steps then
      v_rejected := true; v_notes := array_append(v_notes, 'troppe_coppie');
    else
      -- Punteggio (D107, come app/src/games/memory/logic.js): 1000 × (80% coppie trovate sul totale + 10% precisione
      -- + 10% tempo avanzato, solo se si trovano tutte)
      v_errors := greatest(0, v_moves - v_pairs);
      v_precision := case when v_pairs > 0 then v_pairs / (v_pairs + v_errors * 0.5) else 0 end;
      v_time_left := 0;
      if v_pairs = v_steps then
        v_seconds := round(v_last_match_ms / 100.0) / 10;
        v_time_left := greatest(0, 1 - v_seconds / p_game.duration_s);
        -- meno di 0,6 s a coppia: impossibile per una persona
        if v_seconds < v_steps * 0.6 then v_rejected := true; v_notes := array_append(v_notes, 'troppo_veloce'); end if;
        if v_moves = v_steps then v_flagged := true; v_notes := array_append(v_notes, 'memory_perfetto'); end if;
      end if;
      v_score := round(1000 * (0.8 * v_pairs / v_steps + 0.1 * v_precision + 0.1 * v_time_left))::int;
    end if;

  elsif p_game.id = 'quiz' then
    -- Punteggio calcolato SOLO qui, dalle risposte: stats.answers = [{questionId, choice, ms}]
    v_correct := 0;
    for v_answer in select value from jsonb_array_elements(coalesce(p_stats -> 'answers', '[]'::jsonb)) loop
      select * into v_q from quiz_questions
      where id = (v_answer ->> 'questionId')::int and id = any (p_attempt.quiz_question_ids);
      if v_q.id is null or v_q.id = any (v_seen) then
        v_rejected := true; v_notes := array_append(v_notes, 'domanda_non_prevista');
        continue;
      end if;
      v_seen := v_seen || v_q.id;
      v_ms := least(greatest(coalesce((v_answer ->> 'ms')::int, v_q_ms), 0), v_q_ms);
      v_sum_ms := v_sum_ms + v_ms;
      if v_answer ->> 'choice' is not null then
        v_answered := v_answered + 1;
        if v_ms >= 800 then v_all_fast := false; end if;
      end if;
      if (v_answer ->> 'choice')::int = v_q.correct_index then
        v_correct := v_correct + 1;
        -- 1000 punti al massimo in tutto, qualunque sia il numero di domande (con 5: 150 + fino a 50 di velocità)
        v_score := v_score + round((750 + 250 * (1 - v_ms / v_q_ms::numeric)) / v_nq)::int;
      end if;
    end loop;
    if v_sum_ms > v_elapsed_ms + 3000 then
      v_rejected := true; v_notes := array_append(v_notes, 'piu_veloce_dell_orologio');
    end if;
    v_score := least(v_score, 1000); -- gli arrotondamenti non superano il massimo
    if v_answered >= ceil(v_nq * 0.8) and v_all_fast and v_correct >= ceil(v_nq * 0.8) then
      v_flagged := true; v_notes := array_append(v_notes, 'risposte_troppo_rapide');
    end if;
  end if;

  -- Il punteggio dichiarato dal telefono deve coincidere con quello ricalcolato (tranne il quiz)
  if p_game.id <> 'quiz' and abs(coalesce(p_raw, -1) - v_score) > (case when p_game.id = 'memory' then 3 else 0 end) then
    v_rejected := true; v_notes := array_append(v_notes, 'punteggio_non_coerente');
  end if;
  if v_score > p_game.max_raw_score then
    v_rejected := true; v_notes := array_append(v_notes, 'oltre_il_massimo');
  end if;

  return jsonb_build_object(
    'status', case when v_rejected then 'rejected' when v_flagged then 'flagged' else 'valid' end,
    'score', v_score, 'notes', v_notes, 'correct', v_correct);
end;
$$;
-- ---------- RPC pubbliche ----------

-- Stato dei giochi (anche senza account): finestra, tentativi usati oggi, miglior punteggio
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
    'unlimited', coalesce(v_player.role in ('staff', 'admin'), false) or _attempts_per_day() = 0,
    'games', (
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'enabled', g.enabled,
        'duration_s', g.duration_s,
        'steps', g.steps,
        'attempts_used_today', case when v_player.id is null then null else
          coalesce((select u.used from attempts_used u where u.player_id = v_player.id and u.game_id = g.id and u.day = v_today), 0) end,
        'best', case when v_player.id is null then null else
          (select max(a.raw_score) from attempts a where a.player_id = v_player.id and a.game_id = g.id and a.status in ('valid', 'flagged')) end
      ) order by g.sort)
      from games g));
end;
$$;
-- Avvio di un tentativo: si conta SUBITO (chiudere l'app non lo restituisce)
create or replace function public.start_attempt(p_token text, p_game_id text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_player players := _session_player(p_token);
  v_game games;
  v_staff boolean;
  v_unlimited boolean;
  v_used int;
  v_per_day int := _attempts_per_day();
  v_window text := _window_state();
  v_qids int[];
  v_seen int[];
  v_attempt attempts;
begin
  if v_player.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_LOGGED_IN');
  end if;
  v_staff := v_player.role in ('staff', 'admin');
  v_unlimited := v_staff or v_per_day = 0; -- 0 tentativi al giorno = illimitati per tutti (D97)
  select * into v_game from games where id = p_game_id;
  if v_game.id is null then
    return jsonb_build_object('ok', false, 'error', 'GAME_UNKNOWN');
  end if;
  if not v_staff then
    -- Sezione Minigiochi spenta dall'Admin (D93)
    if not _section_on('giochi') then return jsonb_build_object('ok', false, 'error', 'SECTION_OFF'); end if;
    if not v_game.enabled then return jsonb_build_object('ok', false, 'error', 'GAME_DISABLED'); end if;
    if v_window = 'not_yet' then return jsonb_build_object('ok', false, 'error', 'GAMES_NOT_OPEN', 'open_from', _setting('games_open_from')); end if;
    if v_window = 'closed' then return jsonb_build_object('ok', false, 'error', 'GAMES_CLOSED'); end if;
  end if;

  -- Un avvio alla volta per giocatore e gioco (niente doppio tocco che supera il limite)
  perform pg_advisory_xact_lock(hashtext(v_player.id::text || ':' || p_game_id));
  -- Tentativi usati oggi: dal contatore (le esclusioni confermate cancellano la partita, ma il tentativo resta usato)
  select coalesce((select used from attempts_used where player_id = v_player.id and game_id = p_game_id and day = _today()), 0) into v_used;
  if not v_unlimited and v_used >= v_per_day then
    return jsonb_build_object('ok', false, 'error', 'NO_ATTEMPTS_LEFT', 'attempts_per_day', v_per_day);
  end if;

  if p_game_id = 'quiz' then
    -- N domande a caso (N = step del gioco, deciso dall'Admin, D104), evitando quelle già capitate (se ce ne sono abbastanza)
    select coalesce(array_agg(distinct q), '{}') into v_seen
    from attempts a, unnest(a.quiz_question_ids) as q where a.player_id = v_player.id and a.game_id = 'quiz';
    v_qids := array(select id from quiz_questions where active and not (id = any (v_seen)) order by random() limit v_game.steps);
    if coalesce(array_length(v_qids, 1), 0) < v_game.steps then
      v_qids := array(select id from quiz_questions where active order by random() limit v_game.steps);
    end if;
    if coalesce(array_length(v_qids, 1), 0) = 0 then
      return jsonb_build_object('ok', false, 'error', 'QUIZ_EMPTY');
    end if;
  end if;

  insert into attempts_used (player_id, game_id, day, used) values (v_player.id, p_game_id, _today(), 1)
  on conflict (player_id, game_id, day) do update set used = attempts_used.used + 1;

  -- la partita ricorda durata e step (domande del quiz, coppie del Memory); con meno domande di N (poche attive)
  -- la durata scende in proporzione
  insert into attempts (player_id, game_id, day, seed, quiz_question_ids, duration_s, steps)
  values (v_player.id, p_game_id, _today(), floor(random() * 4294967296)::bigint, v_qids,
          case when p_game_id = 'quiz' then v_game.duration_s / v_game.steps * array_length(v_qids, 1) else v_game.duration_s end,
          case when p_game_id = 'quiz' then array_length(v_qids, 1) else v_game.steps end)
  returning * into v_attempt;

  return jsonb_build_object(
    'ok', true,
    'attempt_id', v_attempt.id,
    'seed', v_attempt.seed,
    'duration_s', v_attempt.duration_s, -- durata decisa dall'Admin (D99): il gioco la usa al posto della sua
    'steps', v_attempt.steps, -- domande del quiz, coppie del Memory (D107)
    'unlimited', v_unlimited,
    'attempts_left', case when v_unlimited then null else v_per_day - v_used - 1 end,
    'attempts_per_day', v_per_day,
    -- Domande del quiz SENZA la risposta giusta
    'questions', case when p_game_id = 'quiz' then (
      select jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'options', to_jsonb(q.options))
                       order by array_position(v_qids, q.id))
      from quiz_questions q where q.id = any (v_qids)) end);
end;
$$;
-- Invio del punteggio. Basta l'id del tentativo (casuale, lo conosce solo chi l'ha avviato): così il
-- punteggio fatto offline arriva anche se nel frattempo la sessione è cambiata. Idempotente.
create or replace function public.submit_score(p_attempt_id uuid, p_raw_score int, p_stats jsonb, p_actions jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_attempt attempts;
  v_game games;
  v_check jsonb;
  v_best int;
begin
  select * into v_attempt from attempts where id = p_attempt_id for update;
  if v_attempt.id is null then
    return jsonb_build_object('ok', false, 'error', 'ATTEMPT_UNKNOWN');
  end if;
  select * into v_game from games where id = v_attempt.game_id;

  if v_attempt.submitted_at is null then
    v_check := _check_attempt(v_attempt, v_game, p_raw_score, p_stats, p_actions);
    update attempts set
      submitted_at = now(),
      client_score = p_raw_score,
      raw_score = (v_check ->> 'score')::int,
      stats = p_stats,
      actions = p_actions,
      status = v_check ->> 'status',
      check_notes = array(select jsonb_array_elements_text(v_check -> 'notes'))
    where id = v_attempt.id
    returning * into v_attempt;
  end if;

  select max(raw_score) into v_best from attempts
  where player_id = v_attempt.player_id and game_id = v_attempt.game_id and status in ('valid', 'flagged');

  return jsonb_build_object(
    'ok', true,
    'status', v_attempt.status,
    'raw_score', v_attempt.raw_score,
    'best', v_best,
    'correct', case when v_attempt.game_id = 'quiz' then
      (select count(*) from jsonb_array_elements(coalesce(v_attempt.stats -> 'answers', '[]')) a
       join quiz_questions q on q.id = (a ->> 'questionId')::int and q.correct_index = (a ->> 'choice')::int) end,
    'total', coalesce(array_length(v_attempt.quiz_question_ids, 1), 0));
end;
$$;
-- (Qui c'erano 15 domande di esempio con le risposte: tolte dal repository pubblico, D149.
-- Le domande si caricano dal pannello Admin o con npm run prod:copy.)

-- #####################################################################################
-- 004 · Tentativi che si rinnovano alle 9 di mattina (non a mezzanotte) e nomi dei giochi aggiornati
-- #####################################################################################
insert into public.settings (key, value) values ('attempts_reset_hour', '9')
on conflict (key) do nothing;
update public.games set name = 'Quiz' where id = 'quiz';
update public.games set name = 'Memory Torchiati' where id = 'memory';

-- #####################################################################################
-- 005 · Acchiappa il porcino: punti dimezzati e moltiplicatore a tempo (D67)
-- #####################################################################################
update public.games set max_raw_score = 8100 where id = 'acchiappa';
-- Serie minima per ogni moltiplicatore (come config.js → multipliers[].minStreak)
create or replace function public._acchiappa_level_min(p_level int)
returns int language sql immutable as $$
  select case p_level when 2 then 5 when 3 then 10 when 4 then 15 else 0 end;
$$;
-- Durata in ms di ogni moltiplicatore (come config.js → multipliers[].durationS)
create or replace function public._acchiappa_level_ms(p_level int)
returns int language sql immutable as $$
  select case p_level when 2 then 7000 when 3 then 6000 when 4 then 5000 else 0 end;
$$;

-- #####################################################################################
-- 007 · Classifica (Tappa 6, D71)
-- #####################################################################################
-- ---------- Tabelle ----------

-- Punti extra dati a un giocatore durante le giornate (staff, Tappa 8; eventuali oggetti segreti, Tappa 7)
create table if not exists public.extra_points (
  id bigint generated by default as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  points int not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists extra_points_player_idx on public.extra_points (player_id);
-- Riassunto per giocatore, sempre aggiornato dai trigger qui sotto
create table if not exists public.leaderboard (
  player_id uuid primary key references public.players (id) on delete cascade,
  best jsonb not null default '{}',       -- { "acchiappa": 1234, "quiz": 800, ... } migliori per gioco
  games_total int not null default 0,     -- somma dei migliori
  extra_total int not null default 0,     -- somma dei punti extra
  total int not null default 0,           -- games_total + extra_total
  updated_at timestamptz not null default now()
);
create index if not exists leaderboard_total_idx on public.leaderboard (total desc);
alter table public.extra_points enable row level security;
alter table public.leaderboard enable row level security;
revoke all on public.extra_points, public.leaderboard from anon, authenticated;
-- Versione della classifica: avanza a ogni cambiamento (per non rimandare la classifica se è uguale)
create sequence if not exists public.leaderboard_version_seq;
revoke all on sequence public.leaderboard_version_seq from anon, authenticated;
-- ---------- Aggiornamento del riassunto ----------

-- Ricalcola la riga di UN giocatore (migliori per gioco + extra) e fa avanzare la versione
create or replace function public._refresh_leaderboard(p_player_id uuid)
returns void language plpgsql volatile set search_path = public as $$
declare
  v_best jsonb;
  v_games int;
  v_extra int;
begin
  if not exists (select 1 from players where id = p_player_id) then
    return;
  end if;
  select coalesce(jsonb_object_agg(game_id, best), '{}'), coalesce(sum(best), 0)
    into v_best, v_games
  from (
    select game_id, max(raw_score) as best
    from attempts
    where player_id = p_player_id and status in ('valid', 'flagged') and raw_score is not null
    group by game_id
  ) b;
  select coalesce(sum(points), 0) into v_extra from extra_points where player_id = p_player_id;
  -- Nessun punto e nessuna riga: niente da fare (es. un tentativo appena avviato)
  if v_games + v_extra = 0 and not exists (select 1 from leaderboard where player_id = p_player_id) then
    return;
  end if;

  insert into leaderboard (player_id, best, games_total, extra_total, total, updated_at)
  values (p_player_id, v_best, v_games, v_extra, v_games + v_extra, now())
  on conflict (player_id) do update set
    best = excluded.best, games_total = excluded.games_total, extra_total = excluded.extra_total,
    total = excluded.total, updated_at = now()
  where leaderboard.best is distinct from excluded.best or leaderboard.extra_total is distinct from excluded.extra_total;

  if found then
    perform nextval('leaderboard_version_seq');
  end if;
end;
$$;
create or replace function public._leaderboard_on_attempt()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _refresh_leaderboard(coalesce(new.player_id, old.player_id));
  return null;
end;
$$;
drop trigger if exists attempts_leaderboard on public.attempts;
create trigger attempts_leaderboard
after insert or update of status, raw_score or delete on public.attempts
for each row execute function public._leaderboard_on_attempt();
drop trigger if exists extra_points_leaderboard on public.extra_points;
create trigger extra_points_leaderboard
after insert or update or delete on public.extra_points
for each row execute function public._leaderboard_on_attempt();
-- Cambi di nickname, personaggio, ruolo o disattivazione: la classifica mostrata cambia
create or replace function public._leaderboard_on_player()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform nextval('leaderboard_version_seq');
  return null;
end;
$$;
drop trigger if exists players_leaderboard on public.players;
create trigger players_leaderboard
after update of nickname, avatar, role, disabled or delete on public.players
for each row execute function public._leaderboard_on_player();
-- ---------- Lettura ----------

-- Giocatori che compaiono in classifica (niente staff né disattivati, almeno 1 punto)
create or replace function public._leaderboard_rows()
returns table (player_id uuid, nickname text, avatar text, total int, best jsonb, extra_total int)
language sql stable set search_path = public as $$
  select l.player_id, p.nickname, p.avatar, l.total, l.best, l.extra_total
  from leaderboard l
  join players p on p.id = l.player_id
  where p.role = 'player' and not p.disabled and l.total > 0;
$$;
-- Posizione con pari merito: 1 + quanti hanno più punti
create or replace function public._leaderboard_position(p_total int)
returns int language sql stable set search_path = public as $$
  select 1 + count(*)::int from _leaderboard_rows() r where r.total > p_total;
$$;
-- Scheda di un giocatore (la stessa del profilo): personaggio, punti totali, posizione, migliori per gioco, extra
create or replace function public._player_card(p_player_id uuid)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'nickname', p.nickname,
    'avatar', p.avatar,
    'total', coalesce(l.total, 0),
    'position', case when coalesce(l.total, 0) > 0 and p.role = 'player' and not p.disabled
                     then _leaderboard_position(l.total) end,
    'best', coalesce(l.best, '{}'),
    'extra_total', coalesce(l.extra_total, 0),
    'players', (select count(*) from _leaderboard_rows()))
  from players p
  left join leaderboard l on l.player_id = p.id
  where p.id = p_player_id;
$$;
-- Classifica: primi 20 (con i pari merito del 20°) + la riga di chi la guarda.
-- p_version = ultima versione ricevuta: se non è cambiato nulla risponde solo { unchanged: true }.
create or replace function public.get_leaderboard(p_token text default null, p_version bigint default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_version bigint := (select last_value from leaderboard_version_seq);
  v_player players := case when p_token is null then null else _session_player(p_token) end;
  v_me jsonb;
begin
  -- Classifica solo per chi ha un account, se l'Admin l'ha deciso (D101)
  if v_player.id is null and not _leaderboard_public() then
    return jsonb_build_object('ok', false, 'error', 'LOGIN_REQUIRED', 'window', _window_state());
  end if;
  if p_version is not null and p_version = v_version then
    return jsonb_build_object('ok', true, 'unchanged', true, 'version', v_version, 'window', _window_state());
  end if;
  if v_player.id is not null then
    v_me := _player_card(v_player.id);
  end if;
  return jsonb_build_object(
    'ok', true,
    'version', v_version,
    'window', _window_state(),
    'players', (select count(*) from _leaderboard_rows()),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('position', r.position, 'nickname', r.nickname, 'avatar', r.avatar, 'total', r.total)
                       order by r.position, lower(r.nickname))
      from (
        select x.nickname, x.avatar, x.total, rank() over (order by x.total desc)::int as position
        from _leaderboard_rows() x
      ) r
      where r.position <= 20), '[]'),
    'me', v_me);
end;
$$;
-- ---------- Riassunto iniziale dei punteggi già fatti ----------

select _refresh_leaderboard(id) from public.players;

-- #####################################################################################
-- 008 · Pannello staff (Tappa 8, D73)
-- #####################################################################################
create table if not exists public.staff_log (
  id bigint generated by default as identity primary key,
  staff_nickname text not null,
  action text not null,
  target text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists staff_log_created_idx on public.staff_log (created_at desc);
alter table public.staff_log enable row level security;
revoke all on public.staff_log from anon, authenticated;
-- ---------- Aiuti ----------

-- Account staff della sessione (null se non è staff)
create or replace function public._staff_player(p_token text)
returns public.players language plpgsql volatile security definer set search_path = public as $$
declare
  v_player players := _session_player(p_token);
begin
  if v_player.id is null or v_player.role not in ('staff', 'admin') then
    return null;
  end if;
  return v_player;
end;
$$;
create or replace function public._staff_denied()
returns jsonb language sql immutable as $$
  select jsonb_build_object('ok', false, 'error', 'NOT_STAFF');
$$;
create or replace function public._staff_log(p_staff players, p_action text, p_target text, p_details jsonb default null)
returns void language sql volatile security definer set search_path = public as $$
  insert into staff_log (staff_nickname, action, target, details) values (p_staff.nickname, p_action, p_target, p_details);
$$;
-- Giocatore (non staff) dal nickname
create or replace function public._find_player(p_nickname text)
returns public.players language sql stable security definer set search_path = public as $$
  select * from players where lower(nickname) = lower(trim(coalesce(p_nickname, ''))) and role = 'player';
$$;
-- Scheda completa di un giocatore per lo staff
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
-- Nuovo PIN (dopo aver controllato di persona il codice del telefono). Chiude tutte le sessioni e sblocca l'accesso.
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
-- Disattiva / riattiva (un account disattivato non entra e non compare in classifica; il telefono resta legato)
create or replace function public.staff_set_disabled(p_token text, p_nickname text, p_disabled boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_player players := _find_player(p_nickname);
begin
  if v_staff.id is null then return _staff_denied(); end if;
  if v_player.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  update players set disabled = coalesce(p_disabled, false) where id = v_player.id;
  if p_disabled then
    delete from sessions where player_id = v_player.id;
  end if;
  perform _staff_log(v_staff, case when p_disabled then 'disable' else 'enable' end, v_player.nickname);
  return jsonb_build_object('ok', true);
end;
$$;
-- Cancella DEFINITIVAMENTE (account, punteggi, sessioni; il telefono torna libero). Serve riscrivere il nickname.
create or replace function public.staff_delete_player(p_token text, p_nickname text, p_confirm text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_player players := _find_player(p_nickname);
begin
  if v_staff.id is null then return _staff_denied(); end if;
  if v_player.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  if p_confirm is null or lower(trim(p_confirm)) <> lower(v_player.nickname) then
    return jsonb_build_object('ok', false, 'error', 'CONFIRM_MISMATCH');
  end if;
  perform _staff_log(v_staff, 'delete', v_player.nickname,
    jsonb_build_object('total', (select total from leaderboard where player_id = v_player.id)));
  delete from players where id = v_player.id;   -- dispositivi, sessioni, tentativi, punti extra: a cascata
  return jsonb_build_object('ok', true);
end;
$$;
-- Punti extra (+ o −) con motivo
create or replace function public.staff_add_extra_points(p_token text, p_nickname text, p_points int, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_player players := _find_player(p_nickname);
begin
  if v_staff.id is null then return _staff_denied(); end if;
  if v_player.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  if p_points is null or p_points = 0 or abs(p_points) > 10000 then
    return jsonb_build_object('ok', false, 'error', 'POINTS_INVALID');
  end if;
  if length(trim(coalesce(p_reason, ''))) < 2 then
    return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
  end if;
  insert into extra_points (player_id, points, reason) values (v_player.id, p_points, left(trim(p_reason), 200));
  perform _staff_log(v_staff, 'extra_points', v_player.nickname, jsonb_build_object('points', p_points, 'reason', trim(p_reason)));
  return jsonb_build_object('ok', true);
end;
$$;
create or replace function public.staff_delete_extra_points(p_token text, p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_row extra_points;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  delete from extra_points where id = p_id returning * into v_row;
  if v_row.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  perform _staff_log(v_staff, 'extra_points_removed', (select nickname from players where id = v_row.player_id),
    jsonb_build_object('points', v_row.points, 'reason', v_row.reason));
  return jsonb_build_object('ok', true);
end;
$$;
-- ---------- Partite da controllare ----------

-- 'flagged' = contate ma segnalate (possibili bot); 'rejected' = escluse in automatico
create or replace function public.staff_review_list(p_token text, p_status text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
begin
  if v_staff.id is null then return _staff_denied(); end if;
  return jsonb_build_object('ok', true, 'attempts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'nickname', p.nickname, 'game_id', a.game_id, 'status', a.status,
      'raw_score', a.raw_score, 'client_score', a.client_score, 'notes', a.check_notes, 'submitted_at', a.submitted_at)
      order by a.submitted_at desc)
    from (select * from attempts where status in ('flagged', 'rejected') order by submitted_at desc nulls last limit 300) a
    join players p on p.id = a.player_id and not p.disabled), '[]'));
end;
$$;
-- Approva (valid) o scarta (rejected) una partita segnalata; rimette (valid) una partita esclusa
create or replace function public.staff_set_attempt_status(p_token text, p_attempt_id uuid, p_status text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_attempt attempts;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  if p_status <> 'valid' then
    return jsonb_build_object('ok', false, 'error', 'STATUS_INVALID');
  end if;
  select * into v_attempt from attempts where id = p_attempt_id for update;
  if v_attempt.id is null or v_attempt.status not in ('flagged', 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  update attempts set status = 'valid', check_notes = array_append(check_notes, 'approvata_da_staff') where id = v_attempt.id;
  perform _staff_log(v_staff, 'attempt_valid', (select nickname from players where id = v_attempt.player_id),
    jsonb_build_object('attempt_id', v_attempt.id, 'game_id', v_attempt.game_id, 'from', v_attempt.status, 'raw_score', v_attempt.raw_score));
  return jsonb_build_object('ok', true);
end;
$$;
-- ---------- Telefoni sospetti ----------

-- Stessa impronta tecnica su più account. Solo indicativo: telefoni uguali (stesso modello e browser)
-- possono avere la stessa impronta anche se sono di persone diverse.
create or replace function public.staff_suspicious_devices(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
begin
  if v_staff.id is null then return _staff_denied(); end if;
  return jsonb_build_object('ok', true, 'groups', coalesce((
    select jsonb_agg(jsonb_build_object('fingerprint', left(g.fingerprint, 8), 'count', g.n, 'nicknames', g.nicknames) order by g.n desc)
    from (
      select d.fingerprint, count(distinct d.player_id) as n,
             jsonb_agg(distinct p.nickname) as nicknames
      from devices d join players p on p.id = d.player_id
      where d.fingerprint is not null and p.role = 'player'
      group by d.fingerprint
      having count(distinct d.player_id) >= 2
      order by count(distinct d.player_id) desc
      limit 50
    ) g), '[]'));
end;
$$;
-- ---------- Impostazioni ----------

create or replace function public.staff_get_settings(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _admin_player(p_token);
begin
  if v_staff.id is null then return _admin_denied(p_token); end if;
  return jsonb_build_object('ok', true,
    'attempts_per_day', _attempts_per_day(),
    'attempts_reset_hour', coalesce((_setting('attempts_reset_hour') #>> '{}')::int, 0),
    'games_open_from', _setting('games_open_from'),
    'games_open_until', _setting('games_open_until'),
    'window', _window_state(),
    'sections', _sections(),
    'winners', _winners(),
    'leaderboard_public', _leaderboard_public(),
    'sections_order', _sections_order(),
    'feedback_anonymous', _feedback_anonymous(),
    'sponsor_columns', _sponsor_columns(),
    'map_osm', _map_osm(),
    'map_bounds', _setting('map_bounds'),
    'games', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'enabled', enabled, 'duration_s', duration_s, 'steps', steps) order by sort) from games));
end;
$$;
-- p_values: { attempts_per_day?, attempts_reset_hour?, games_open_from?, games_open_until?, games?: { id: true|false } }
-- Date in formato ISO con fuso (es. "2026-10-17T15:00:00+02:00"), null = nessun limite.
create or replace function public.staff_update_settings(p_token text, p_values jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _admin_player(p_token);
  v_n int;
  v_key text;
  v_game record;
begin
  if v_staff.id is null then return _admin_denied(p_token); end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'VALUES_INVALID');
  end if;

  if p_values ? 'attempts_per_day' then
    v_n := (p_values ->> 'attempts_per_day')::int;
    -- 0 = illimitati; al massimo 99 (D97)
    if v_n is null or v_n < 0 or v_n > 99 then return jsonb_build_object('ok', false, 'error', 'ATTEMPTS_INVALID'); end if;
    update settings set value = to_jsonb(v_n) where key = 'attempts_per_day';
  end if;
  if p_values ? 'attempts_reset_hour' then
    v_n := (p_values ->> 'attempts_reset_hour')::int;
    if v_n is null or v_n < 0 or v_n > 23 then return jsonb_build_object('ok', false, 'error', 'HOUR_INVALID'); end if;
    insert into settings (key, value) values ('attempts_reset_hour', to_jsonb(v_n))
    on conflict (key) do update set value = excluded.value;
  end if;
  foreach v_key in array array['games_open_from', 'games_open_until'] loop
    if p_values ? v_key then
      if jsonb_typeof(p_values -> v_key) = 'null' then
        update settings set value = 'null' where key = v_key;
      else
        -- valida la data (errore se non è una data)
        perform (p_values ->> v_key)::timestamptz;
        update settings set value = to_jsonb(p_values ->> v_key) where key = v_key;
      end if;
    end if;
  end loop;
  -- Sezioni dell'app accese/spente: { menu: true|false, giochi: true|false, ... } (D93)
  if jsonb_typeof(p_values -> 'sections') = 'object' then
    for v_game in select key, value from jsonb_each(p_values -> 'sections') loop
      if not (v_game.key = any (_section_ids())) or jsonb_typeof(v_game.value) <> 'boolean' then
        return jsonb_build_object('ok', false, 'error', 'SECTION_INVALID');
      end if;
    end loop;
    insert into settings (key, value) values ('sections', _sections() || (p_values -> 'sections'))
    on conflict (key) do update set value = excluded.value;
  end if;
  -- Classifica (D101): quanti vincono (0 = nessun premio) e se la vede anche chi non ha un account
  if p_values ? 'winners' then
    v_n := (p_values ->> 'winners')::int;
    if v_n is null or v_n < 0 or v_n > 99 then return jsonb_build_object('ok', false, 'error', 'WINNERS_INVALID'); end if;
    insert into settings (key, value) values ('winners', to_jsonb(v_n))
    on conflict (key) do update set value = excluded.value;
  end if;
  if p_values ? 'leaderboard_public' then
    if jsonb_typeof(p_values -> 'leaderboard_public') <> 'boolean' then
      return jsonb_build_object('ok', false, 'error', 'VALUES_INVALID');
    end if;
    insert into settings (key, value) values ('leaderboard_public', p_values -> 'leaderboard_public')
    on conflict (key) do update set value = excluded.value;
  end if;
  -- Aspetto (D108): ordine delle sezioni nella home e nel pannello (tutte le ordinabili, ognuna una volta; Sponsor no)
  if p_values ? 'sections_order' then
    if jsonb_typeof(p_values -> 'sections_order') <> 'array'
       or (select array_agg(x order by x) from jsonb_array_elements_text(p_values -> 'sections_order') x)
          is distinct from (select array_agg(x order by x) from unnest(_orderable_section_ids()) x) then
      return jsonb_build_object('ok', false, 'error', 'ORDER_INVALID');
    end if;
    insert into settings (key, value) values ('sections_order', p_values -> 'sections_order')
    on conflict (key) do update set value = excluded.value;
  end if;
  -- Feedback anche senza account (D108)
  if p_values ? 'feedback_anonymous' then
    if jsonb_typeof(p_values -> 'feedback_anonymous') <> 'boolean' then
      return jsonb_build_object('ok', false, 'error', 'VALUES_INVALID');
    end if;
    insert into settings (key, value) values ('feedback_anonymous', p_values -> 'feedback_anonymous')
    on conflict (key) do update set value = excluded.value;
  end if;
  -- Sponsor (D126): colonne della tabella nella home, da 1 a 4
  if p_values ? 'sponsor_columns' then
    v_n := (p_values ->> 'sponsor_columns')::int;
    if v_n is null or v_n < 1 or v_n > 4 then return jsonb_build_object('ok', false, 'error', 'SPONSOR_COLUMNS_INVALID'); end if;
    insert into settings (key, value) values ('sponsor_columns', to_jsonb(v_n))
    on conflict (key) do update set value = excluded.value;
  end if;
  -- Mappa (D138): l'immagine viene da OpenStreetMap → sotto la mappa "© OpenStreetMap contributors"
  if p_values ? 'map_osm' then
    if jsonb_typeof(p_values -> 'map_osm') <> 'boolean' then
      return jsonb_build_object('ok', false, 'error', 'VALUES_INVALID');
    end if;
    insert into settings (key, value) values ('map_osm', p_values -> 'map_osm')
    on conflict (key) do update set value = excluded.value;
  end if;
  if jsonb_typeof(p_values -> 'games') = 'object' then
    for v_game in select key, value from jsonb_each(p_values -> 'games') loop
      update games set enabled = (v_game.value)::text::boolean where id = v_game.key;
    end loop;
  end if;

  perform _staff_log(v_staff, 'settings', null, p_values);
  perform nextval('leaderboard_version_seq'); -- "Classifica finale" può cambiare
  return jsonb_build_object('ok', true);
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
  return jsonb_build_object('ok', false, 'error', 'DATE_INVALID');
end;
$$;

-- #####################################################################################
-- 009 · Pannello staff: ricerca, classifica e registro a pagine; "Rivedi partita" (D74, D75)
-- #####################################################################################

create or replace function public.staff_search_players(p_token text, p_query text, p_page int default 0)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_q text := lower(trim(coalesce(p_query, '')));
  v_page int := greatest(coalesce(p_page, 0), 0);
  v_size constant int := 20;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  if v_q = '' then
    return jsonb_build_object('ok', true, 'players', '[]'::jsonb, 'total', 0, 'page', 0, 'page_size', v_size);
  end if;
  return jsonb_build_object('ok', true, 'page', v_page, 'page_size', v_size,
    'total', (select count(*) from players where strpos(lower(nickname), v_q) > 0),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nickname', x.nickname, 'avatar', x.avatar, 'role', x.role, 'disabled', x.disabled,
        'total', coalesce(l.total, 0), 'created_at', x.created_at) order by x.ord)
      from (
        select p.*, row_number() over (order by (lower(p.nickname) = v_q) desc, (lower(p.nickname) like v_q || '%') desc, lower(p.nickname)) as ord
        from players p
        where strpos(lower(p.nickname), v_q) > 0
        order by ord
        offset v_page * v_size limit v_size
      ) x
      left join leaderboard l on l.player_id = x.id), '[]'));
end;
$$;
-- Dati per rivedere una partita
create or replace function public.staff_attempt_replay(p_token text, p_attempt_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_attempt attempts;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  select * into v_attempt from attempts where id = p_attempt_id;
  if v_attempt.id is null or v_attempt.submitted_at is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'attempt', jsonb_build_object(
    'id', v_attempt.id,
    'nickname', (select nickname from players where id = v_attempt.player_id),
    'game_id', v_attempt.game_id,
    'status', v_attempt.status,
    'seed', v_attempt.seed,
    'duration_s', v_attempt.duration_s,
    'steps', v_attempt.steps,
    'raw_score', v_attempt.raw_score,
    'client_score', v_attempt.client_score,
    'notes', v_attempt.check_notes,
    'stats', v_attempt.stats,
    'actions', v_attempt.actions,
    'submitted_at', v_attempt.submitted_at,
    'questions', case when v_attempt.game_id = 'quiz' then (
      select jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'options', to_jsonb(q.options), 'correct', q.correct_index)
                       order by array_position(v_attempt.quiz_question_ids, q.id))
      from quiz_questions q where q.id = any (v_attempt.quiz_question_ids)) end));
end;
$$;
create or replace function public.staff_leaderboard(p_token text, p_page int default 0, p_all boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_page int := greatest(coalesce(p_page, 0), 0);
  v_size constant int := 50;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  return jsonb_build_object('ok', true, 'window', _window_state(), 'page', v_page, 'page_size', v_size,
    'total', (select count(*) from _leaderboard_rows()),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('position', r.position, 'nickname', r.nickname, 'total', r.total,
                                          'best', r.best, 'extra_total', r.extra_total)
                       order by r.position, lower(r.nickname))
      from (
        select x.*, rank() over (order by x.total desc)::int as position,
               row_number() over (order by x.total desc, lower(x.nickname)) as ord
        from _leaderboard_rows() x
      ) r
      where p_all or (r.ord > v_page * v_size and r.ord <= (v_page + 1) * v_size)), '[]'));
end;
$$;
create or replace function public.staff_log_list(p_token text, p_page int default 0, p_day date default null,
                                                 p_staff text default null, p_action text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _admin_player(p_token);
  v_page int := greatest(coalesce(p_page, 0), 0);
  v_size constant int := 100;
begin
  if v_staff.id is null then return _admin_denied(p_token); end if;
  return jsonb_build_object('ok', true, 'page', v_page, 'page_size', v_size,
    'operators', coalesce((select jsonb_agg(distinct staff_nickname) from staff_log), '[]'),
    'total', (select count(*) from staff_log l
              where (p_day is null or (l.created_at at time zone 'Europe/Rome')::date = p_day)
                and (p_staff is null or l.staff_nickname = p_staff)
                and (p_action is null or l.action = p_action or (p_action = 'attempt' and l.action like 'attempt_%')
                     or (p_action = 'extra' and l.action like 'extra_points%') or (p_action = 'account' and l.action in ('disable', 'enable', 'delete')))),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('staff', l.staff_nickname, 'action', l.action, 'target', l.target,
                                          'details', l.details, 'created_at', l.created_at) order by l.created_at desc)
      from (
        select * from staff_log l
        where (p_day is null or (l.created_at at time zone 'Europe/Rome')::date = p_day)
          and (p_staff is null or l.staff_nickname = p_staff)
          and (p_action is null or l.action = p_action or (p_action = 'attempt' and l.action like 'attempt_%')
               or (p_action = 'extra' and l.action like 'extra_points%') or (p_action = 'account' and l.action in ('disable', 'enable', 'delete')))
        order by l.created_at desc
        offset v_page * v_size limit v_size
      ) l), '[]'));
end;
$$;

-- #####################################################################################
-- 010 · Revisione staff delle partite: Approva / Conferma esclusione / Ban (D76, D77)
-- #####################################################################################
create table if not exists public.attempts_used (
  player_id uuid not null references public.players (id) on delete cascade,
  game_id text not null references public.games (id),
  day date not null,
  used int not null default 0,
  primary key (player_id, game_id, day)
);
alter table public.attempts_used enable row level security;
revoke all on public.attempts_used from anon, authenticated;
-- Contatore iniziale dai tentativi già fatti (solo la prima volta: se la tabella è vuota)
insert into public.attempts_used (player_id, game_id, day, used)
select player_id, game_id, day, count(*) from public.attempts
where not exists (select 1 from public.attempts_used)
group by player_id, game_id, day;
-- Conferma esclusione: la partita non conta e sparisce (anche dal database); il tentativo resta usato
create or replace function public.staff_confirm_exclusion(p_token text, p_attempt_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_attempt attempts;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  select * into v_attempt from attempts where id = p_attempt_id and status in ('flagged', 'rejected');
  if v_attempt.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  delete from attempts where id = v_attempt.id;
  perform _staff_log(v_staff, 'exclusion', (select nickname from players where id = v_attempt.player_id),
    jsonb_build_object('game_id', v_attempt.game_id, 'from', v_attempt.status, 'raw_score', v_attempt.raw_score, 'notes', v_attempt.check_notes));
  return jsonb_build_object('ok', true);
end;
$$;
-- Ban del giocatore di una partita: account disattivato (non entra, non gioca, fuori dalla classifica) e
-- telefono bloccato (resta legato all'account: niente nuovo account). La partita viene cancellata.
-- Solo lo staff lo fa, mai il server da solo.
create or replace function public.staff_ban_player(p_token text, p_attempt_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_attempt attempts;
  v_player players;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  select * into v_attempt from attempts where id = p_attempt_id;
  if v_attempt.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  select * into v_player from players where id = v_attempt.player_id and role = 'player';
  if v_player.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  update players set disabled = true where id = v_player.id;
  delete from sessions where player_id = v_player.id;
  delete from attempts where id = v_attempt.id;
  perform _staff_log(v_staff, 'ban', v_player.nickname,
    jsonb_build_object('game_id', v_attempt.game_id, 'raw_score', v_attempt.raw_score, 'notes', v_attempt.check_notes));
  return jsonb_build_object('ok', true);
end;
$$;

-- #####################################################################################
-- 011 · Ban del telefono (D78)
-- #####################################################################################
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

-- #####################################################################################
-- 012 · Registro degli accessi (D79)
-- #####################################################################################
create table if not exists public.access_log (
  id bigint generated by default as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  device_id uuid,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists access_log_player_idx on public.access_log (player_id, created_at desc);
alter table public.access_log enable row level security;
revoke all on public.access_log from anon, authenticated;
-- Accessi già fatti (dalle sessioni ancora presenti), solo la prima volta
insert into public.access_log (player_id, device_id, user_agent, created_at)
select player_id, device_id, user_agent, created_at from public.sessions
where not exists (select 1 from public.access_log);
-- Ogni nuova sessione = un accesso
create or replace function public._log_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into access_log (player_id, device_id, user_agent, created_at)
  values (new.player_id, new.device_id, new.user_agent, new.created_at);
  return null;
end;
$$;
drop trigger if exists sessions_access_log on public.sessions;
create trigger sessions_access_log after insert on public.sessions
for each row execute function public._log_access();

-- #####################################################################################
-- 013 · Ultimi accessi di UN telefono (D79)
-- #####################################################################################

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

-- #####################################################################################
-- 014 · Acchiappa il porcino: ogni porcino ricarica il tempo del moltiplicatore (D80)
-- #####################################################################################

-- Tempo aggiunto da ogni porcino (come config.js → multipliers[].boostS)
create or replace function public._acchiappa_level_boost_ms(p_level int)
returns int language sql immutable as $$
  select case p_level when 2 then 1500 when 3 then 1000 when 4 then 500 else 0 end;
$$;
-- Funghi velenosi (come sprites.js → BAD_POISONOUS); gli altri elementi cattivi sono oggetti
create or replace function public._acchiappa_is_poisonous(p_kind text)
returns boolean language sql immutable as $$
  select p_kind in ('ovolaccio', 'velenosoGiallo', 'velenosoViola', 'riccio');
$$;

-- #####################################################################################
-- 016 · PIN più sicuro (D82)
-- #####################################################################################

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

-- #####################################################################################
-- 017 · Blocco dei tentativi per nickname + IP (D83)
-- #####################################################################################
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
revoke all on public.login_blocks from anon, authenticated; -- sostituita da login_blocks

-- IP del telefono che fa la richiesta (dalle intestazioni aggiunte dalla rete di Supabase); '?' se manca
create or replace function public._client_ip()
returns text language plpgsql stable as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
  v_forwarded text[] := string_to_array(coalesce(v_headers ->> 'x-forwarded-for', ''), ',');
begin
  return coalesce(
    nullif(trim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(trim(v_forwarded[array_length(v_forwarded, 1)]), ''),
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

-- #####################################################################################
-- 020 · Personaggi velenosi e cambio del personaggio dal profilo (D85)
-- #####################################################################################

-- Cambio del personaggio (dal profilo)
create or replace function public.set_avatar(p_token text, p_avatar text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_player players := _session_player(p_token);
begin
  if v_player.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_LOGGED_IN');
  end if;
  if p_avatar is null or not (p_avatar = any (_avatar_ids())) then
    return jsonb_build_object('ok', false, 'error', 'AVATAR_INVALID');
  end if;
  update players set avatar = p_avatar where id = v_player.id returning * into v_player;
  return jsonb_build_object('ok', true, 'player', _player_json(v_player));
end;
$$;

-- #####################################################################################
-- 021 · Ruoli Mod e Admin, sezioni dell'app accendibili (D93)
-- #####################################################################################
-- ---------- Ruoli ----------

alter table public.players drop constraint if exists players_role_check;
alter table public.players add constraint players_role_check check (role in ('player', 'staff', 'admin'));
-- L'account "staff" (quello creato in 008) diventa Admin
update public.players set role = 'admin' where lower(nickname) = 'staff' and role = 'staff';
-- Solo Admin
create or replace function public._admin_player(p_token text)
returns public.players language plpgsql volatile security definer set search_path = public as $$
declare
  v_player players := _session_player(p_token);
begin
  if v_player.id is null or v_player.role <> 'admin' then
    return null;
  end if;
  return v_player;
end;
$$;
-- Mod che prova una funzione da Admin → NOT_ADMIN; giocatore o nessuna sessione → NOT_STAFF
create or replace function public._admin_denied(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if _staff_player(p_token) is not null then
    return jsonb_build_object('ok', false, 'error', 'NOT_ADMIN');
  end if;
  return _staff_denied();
end;
$$;
-- ---------- Sezioni dell'app ----------

-- Sezioni che l'Admin può accendere o spegnere (stessi id di app/src/lib/app-config.js)
create or replace function public._section_ids()
returns text[] language sql immutable as $$
  select array['menu', 'giochi', 'feedback', 'mappa', 'calendario', 'sponsor'];
$$;
insert into public.settings (key, value) values ('sections', '{"menu": true, "giochi": true}')
on conflict (key) do nothing;
-- Tutte le sezioni, con quelle mai impostate accese
create or replace function public._sections()
returns jsonb language sql stable set search_path = public as $$
  select (select jsonb_object_agg(id, true) from unnest(_section_ids()) as id) || coalesce(_setting('sections'), '{}');
$$;
create or replace function public._section_on(p_id text)
returns boolean language sql stable set search_path = public as $$
  select coalesce((_sections() ->> p_id)::boolean, true);
$$;
-- Per l'app (anche senza account): quali sezioni mostrare
create or replace function public.get_app_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'sections', _sections(), 'winners', _winners(), 'leaderboard_public', _leaderboard_public(),
    'sections_order', _sections_order(), 'feedback_anonymous', _feedback_anonymous(),
    'menu_version', _setting('menu') ->> 'updated_at', 'sponsor_columns', _sponsor_columns(),
    'map_version', _setting('map_points_version') #>> '{}',
    'map_image_version', (select updated_at::text from map_image), 'map_osm', _map_osm(),
    'events_version', _setting('events_version') #>> '{}');
$$;

-- #####################################################################################
-- 022 · Ruoli dal pannello: l'Admin promuove e declassa (D95)
-- #####################################################################################
alter table public.players add column if not exists superadmin boolean not null default false;
update public.players set superadmin = true where lower(nickname) = 'staff' and role = 'admin';
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

-- #####################################################################################
-- 023 · Menù caricato dal pannello Admin (D96) e tentativi illimitati (D97)
-- #####################################################################################
-- Menù: { categories: [{ name, dishes: [{ name, description, price, symbols[], allergens[] }] }], updated_at, by }
create or replace function public.get_menu()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'menu', _setting('menu'));
$$;
create or replace function public.staff_set_menu(p_token text, p_menu jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_admin players := _admin_player(p_token);
  v_category jsonb;
  v_dish jsonb;
  v_dishes int := 0;
  v_price numeric;
begin
  if v_admin.id is null then return _admin_denied(p_token); end if;
  if p_menu is null or jsonb_typeof(p_menu -> 'categories') is distinct from 'array'
     or jsonb_array_length(p_menu -> 'categories') = 0 or jsonb_array_length(p_menu -> 'categories') > 40 then
    return jsonb_build_object('ok', false, 'error', 'MENU_INVALID');
  end if;
  for v_category in select value from jsonb_array_elements(p_menu -> 'categories') loop
    if jsonb_typeof(v_category -> 'name') is distinct from 'string' or length(v_category ->> 'name') not between 1 and 60
       or jsonb_typeof(v_category -> 'dishes') is distinct from 'array' then
      return jsonb_build_object('ok', false, 'error', 'MENU_INVALID');
    end if;
    for v_dish in select value from jsonb_array_elements(v_category -> 'dishes') loop
      v_dishes := v_dishes + 1;
      if jsonb_typeof(v_dish -> 'price') is distinct from 'number' then return jsonb_build_object('ok', false, 'error', 'MENU_INVALID'); end if;
      v_price := (v_dish ->> 'price')::numeric;
      if jsonb_typeof(v_dish -> 'name') is distinct from 'string' or length(v_dish ->> 'name') not between 1 and 100
         or v_price < 0 or v_price > 1000
         or length(coalesce(v_dish ->> 'description', '')) > 300
         or jsonb_typeof(coalesce(v_dish -> 'symbols', '[]')) <> 'array'
         or jsonb_typeof(coalesce(v_dish -> 'allergens', '[]')) <> 'array'
         or exists (select 1 from jsonb_array_elements_text(coalesce(v_dish -> 'symbols', '[]')) s
                    where s not in ('porcini', 'vegetariano', 'piccante')) then
        return jsonb_build_object('ok', false, 'error', 'MENU_INVALID');
      end if;
    end loop;
  end loop;
  if v_dishes = 0 or v_dishes > 400 then return jsonb_build_object('ok', false, 'error', 'MENU_INVALID'); end if;

  insert into settings (key, value)
  values ('menu', jsonb_build_object('categories', _menu_keep_sold_out(p_menu -> 'categories'), 'updated_at', now(), 'by', v_admin.nickname))
  on conflict (key) do update set value = excluded.value;
  perform _staff_log(v_admin, 'menu', null, jsonb_build_object('dishes', v_dishes));
  return jsonb_build_object('ok', true, 'dishes', v_dishes);
end;
$$;

-- #####################################################################################
-- 024 · Impostazioni dei singoli giochi e domande del quiz dal pannello (D99)
-- #####################################################################################
alter table public.attempts add column if not exists duration_s int;
-- ---------- Solo Admin: domande del quiz ----------

create or replace function public.staff_quiz_list(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_admin players := _admin_player(p_token);
begin
  if v_admin.id is null then return _admin_denied(p_token); end if;
  return jsonb_build_object('ok', true, 'questions', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'text', text, 'options', to_jsonb(options), 'correct', correct_index, 'active', active) order by id)
    from quiz_questions), '[]'));
end;
$$;
-- p_questions: [{ id?, text, options: [4 testi], correct: 0–3, active }]; senza id = domanda nuova.
-- Le domande non si cancellano (le partite passate le ricordano): si spengono con active = false.
create or replace function public.staff_quiz_save(p_token text, p_questions jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_admin players := _admin_player(p_token);
  v_q jsonb;
  v_n int := 0;
begin
  if v_admin.id is null then return _admin_denied(p_token); end if;
  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) > 500 then
    return jsonb_build_object('ok', false, 'error', 'QUIZ_INVALID');
  end if;
  -- prima si controlla tutto, poi si salva (niente salvataggi a metà)
  for v_q in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(v_q -> 'text') is distinct from 'string' or length(trim(v_q ->> 'text')) not between 3 and 300
       or jsonb_typeof(v_q -> 'options') is distinct from 'array' or jsonb_array_length(v_q -> 'options') <> 4
       or exists (select 1 from jsonb_array_elements(v_q -> 'options') o
                  where jsonb_typeof(o) is distinct from 'string' or length(trim(o #>> '{}')) not between 1 and 120)
       or jsonb_typeof(v_q -> 'correct') is distinct from 'number' or (v_q ->> 'correct')::int not between 0 and 3
       or jsonb_typeof(v_q -> 'active') is distinct from 'boolean' then
      return jsonb_build_object('ok', false, 'error', 'QUIZ_INVALID');
    end if;
  end loop;
  for v_q in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(v_q -> 'id') = 'number' then
      update quiz_questions set text = trim(v_q ->> 'text'),
        options = array(select trim(o) from jsonb_array_elements_text(v_q -> 'options') o),
        correct_index = (v_q ->> 'correct')::int, active = (v_q ->> 'active')::boolean
      where id = (v_q ->> 'id')::int;
    else
      insert into quiz_questions (text, options, correct_index, active)
      values (trim(v_q ->> 'text'), array(select trim(o) from jsonb_array_elements_text(v_q -> 'options') o),
              (v_q ->> 'correct')::int, (v_q ->> 'active')::boolean);
    end if;
    v_n := v_n + 1;
  end loop;
  perform _staff_log(v_admin, 'quiz', null, jsonb_build_object('questions', v_n));
  return jsonb_build_object('ok', true, 'saved', v_n, 'active', (select count(*) from quiz_questions where active));
end;
$$;

-- #####################################################################################
-- 025 · Vincitori e visibilità della classifica (D101)
-- #####################################################################################
insert into public.settings (key, value) values ('winners', '10') on conflict (key) do nothing;
insert into public.settings (key, value) values ('leaderboard_public', 'true') on conflict (key) do nothing;
create or replace function public._winners()
returns int language sql stable security definer set search_path = public as $$
  select coalesce((_setting('winners') #>> '{}')::int, 10);
$$;
create or replace function public._leaderboard_public()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((_setting('leaderboard_public') #>> '{}')::boolean, true);
$$;
create or replace function public.get_player_card(p_nickname text, p_token text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not _leaderboard_public() and (p_token is null or (_session_player(p_token)).id is null) then
    return jsonb_build_object('ok', false, 'error', 'LOGIN_REQUIRED');
  end if;
  select id into v_id from players
  where lower(nickname) = lower(trim(p_nickname)) and role = 'player' and not disabled;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'player', _player_card(v_id));
end;
$$;

-- #####################################################################################
-- 026 · Numero di domande del quiz deciso dall'Admin (D104)
-- #####################################################################################
alter table public.games add column if not exists questions int;
update public.games set questions = 5 where id = 'quiz' and questions is null;

-- #####################################################################################
-- 028 · Memory in percentuale e step dei giochi (D107)
-- #####################################################################################
alter table public.games add column if not exists steps int;
alter table public.attempts add column if not exists steps int;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name = 'questions') then
    update public.games set steps = coalesce(steps, questions) where id = 'quiz';
  end if;
end $$;
update public.games set steps = coalesce(steps, 5) where id = 'quiz';
update public.games set steps = coalesce(steps, 8) where id = 'memory';
create or replace function public.staff_set_game(p_token text, p_game_id text, p_seconds int, p_steps int default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_admin players := _admin_player(p_token);
  v_game games;
  v_duration int;
  v_questions int;
begin
  if v_admin.id is null then return _admin_denied(p_token); end if;
  select * into v_game from games where id = p_game_id;
  if v_game.id is null then return jsonb_build_object('ok', false, 'error', 'GAME_UNKNOWN'); end if;
  if p_game_id = 'quiz' then
    if p_seconds is null or p_seconds < 5 or p_seconds > 60 then return jsonb_build_object('ok', false, 'error', 'DURATION_INVALID'); end if;
    -- Numero di domande (D104): da 3 a 20, non più di quelle attive
    v_questions := coalesce(p_steps, v_game.steps);
    if v_questions < 3 or v_questions > 20 then return jsonb_build_object('ok', false, 'error', 'QUESTIONS_INVALID'); end if;
    if v_questions > (select count(*) from quiz_questions where active) then
      return jsonb_build_object('ok', false, 'error', 'QUESTIONS_TOO_FEW');
    end if;
    v_duration := p_seconds * v_questions;
  else
    if p_seconds is null or p_seconds < 20 or p_seconds > 600 then return jsonb_build_object('ok', false, 'error', 'DURATION_INVALID'); end if;
    v_duration := p_seconds;
  end if;
  update games set
    duration_s = v_duration,
    steps = coalesce(v_questions, steps),
    -- più tempo = più punti possibili (Quiz e Memory hanno sempre 1000 al massimo)
    max_raw_score = case when id in ('acchiappa', 'cadono') then ceil(max_raw_score::numeric * v_duration / duration_s)::int else max_raw_score end
  where id = p_game_id;
  perform _staff_log(v_admin, 'game', p_game_id, jsonb_build_object('duration_s', v_duration, 'steps', v_questions));
  return jsonb_build_object('ok', true, 'duration_s', v_duration, 'steps', v_questions);
end;
$$;
-- La vecchia colonna non serve più (le funzioni che la usavano sono state tutte sostituite qui sopra)
alter table public.games drop column if exists questions;

-- #####################################################################################
-- 029 · Feedback e Aspetto (D108)
-- #####################################################################################

update public.settings set value = value || '{"feedback": false}'
where key = 'sections' and not (value ? 'feedback');
-- Ordine delle sezioni (Aspetto, D108): quello salvato, con le sezioni mancanti in fondo
create or replace function public._sections_order()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(id order by ord), '[]') from (
    select x.id, x.ord from jsonb_array_elements_text(coalesce(_setting('sections_order'), '[]')) with ordinality as x(id, ord)
    where x.id = any (_orderable_section_ids())
    union all
    select id, 1000 + array_position(_orderable_section_ids(), id) from unnest(_orderable_section_ids()) as id
    where not coalesce(_setting('sections_order'), '[]') ? id
  ) s;
$$;
create or replace function public._feedback_anonymous()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((_setting('feedback_anonymous') #>> '{}')::boolean, false);
$$;
-- ---------- Feedback ----------

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  player_id uuid references public.players (id) on delete set null, -- null = senza account (o account cancellato)
  stars int not null check (stars between 1 and 5),
  text text check (length(text) <= 1000),
  ip_hash text, -- impronta dell'indirizzo (non l'indirizzo): solo per il limite dei feedback senza account
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_at on public.feedback (created_at desc);
create index if not exists feedback_player on public.feedback (player_id, created_at);
alter table public.feedback enable row level security; -- solo dalle funzioni qui sotto

-- Lascia un feedback: stelle 1–5, testo facoltativo
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
-- Le 3 recensioni migliori per la pagina Feedback: più stelle, poi le più recenti, con almeno 15 caratteri di testo
create or replace function public.get_feedback_highlights()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'reviews', coalesce((
    select jsonb_agg(jsonb_build_object('nickname', r.nickname, 'avatar', r.avatar, 'stars', r.stars, 'text', r.text) order by r.stars desc, r.created_at desc)
    from (
      select p.nickname, p.avatar, f.stars, f.text, f.created_at
      from feedback f left join players p on p.id = f.player_id
      where f.deleted_at is null and length(trim(coalesce(f.text, ''))) >= 5 and (p.id is null or not p.disabled)
      order by f.stars desc, f.created_at desc
      limit 5
    ) r), '[]'));
$$;
-- Pannello (Mod e Admin): cancella un feedback (es. volgare); resta nel registro
create or replace function public.staff_feedback_delete(p_token text, p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_row record;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  -- Il feedback non si cancella davvero (D114, D115): sparisce dagli Attivi e dalle nuvolette e va nei Rimossi (col
  -- testo, chi l'ha rimosso e quando); resta il segno "scritto oggi", così non se ne può lasciare un altro lo stesso giorno
  select f.stars, f.text, (select nickname from players where id = f.player_id) as nickname into v_row
  from feedback f where f.id = p_id and f.deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  update feedback set deleted_at = now(), deleted_by = v_staff.nickname where id = p_id;
  perform _staff_log(v_staff, 'feedback_delete', coalesce(v_row.nickname, 'anonimo'),
    jsonb_build_object('stars', v_row.stars, 'text', left(coalesce(v_row.text, ''), 200)));
  return jsonb_build_object('ok', true);
end;
$$;

-- #####################################################################################
-- 031 · Un feedback al giorno, e la pagina sa se l'hai già lasciato (D111)
-- #####################################################################################
-- Ha già lasciato un feedback oggi? (account, oppure impronta dell'indirizzo senza account)
create or replace function public._feedback_today(p_player_id uuid, p_ip_hash text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from feedback f
    where (f.created_at at time zone 'Europe/Rome')::date = (now() at time zone 'Europe/Rome')::date
      and case when p_player_id is not null then f.player_id = p_player_id else f.player_id is null and f.ip_hash = p_ip_hash end);
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

-- #####################################################################################
-- 032 · Feedback cancellati dallo staff: il giorno resta usato (D114)
-- #####################################################################################
alter table public.feedback add column if not exists deleted_at timestamptz;

-- #####################################################################################
-- 033 · Feedback rimossi: il testo resta, lo staff li rivede (D115)
-- #####################################################################################
alter table public.feedback add column if not exists deleted_by text;
create or replace function public.staff_feedback_list(p_token text, p_page int default 0, p_nickname text default null,
                                                      p_day date default null, p_stars int default null,
                                                      p_removed boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_page int := greatest(coalesce(p_page, 0), 0);
  v_size constant int := 20;
  v_nick text := nullif(trim(coalesce(p_nickname, '')), '');
begin
  if v_staff.id is null then return _staff_denied(); end if;
  return (
    with filtered as (
      select f.id, f.stars, f.text, f.created_at, f.deleted_at, f.deleted_by, p.nickname, p.avatar
      from feedback f left join players p on p.id = f.player_id
      -- Attivi oppure Rimossi dallo staff (D115)
      where (case when coalesce(p_removed, false) then f.deleted_at is not null else f.deleted_at is null end)
        and (v_nick is null or p.nickname ilike '%' || v_nick || '%')
        and (p_day is null or (f.created_at at time zone 'Europe/Rome')::date = p_day)
        and (p_stars is null or f.stars = p_stars)
    )
    select jsonb_build_object('ok', true, 'page', v_page, 'page_size', v_size,
      'total', (select count(*) from filtered),
      'average', (select round(avg(stars), 1) from filtered),
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.id, 'nickname', x.nickname, 'avatar', x.avatar, 'stars', x.stars,
                                            'text', x.text, 'created_at', x.created_at,
                                            'deleted_at', x.deleted_at, 'deleted_by', x.deleted_by) order by x.created_at desc)
        from (select * from filtered order by created_at desc offset v_page * v_size limit v_size) x), '[]'))
  );
end;
$$;

-- #####################################################################################
-- 036 · Piatti terminati (D119)
-- #####################################################################################
-- Categorie del nuovo menù con "sold_out" ripreso dal menù attuale (stessa categoria e stesso piatto, senza maiuscole)
create or replace function public._menu_keep_sold_out(p_categories jsonb)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_set(c, '{dishes}', coalesce((
      select jsonb_agg(
        case when exists (
          select 1
          from jsonb_array_elements(coalesce(_setting('menu') -> 'categories', '[]')) oc,
               jsonb_array_elements(oc -> 'dishes') od
          where lower(oc ->> 'name') = lower(c ->> 'name') and lower(od ->> 'name') = lower(d ->> 'name')
            and (od ->> 'sold_out')::boolean
        ) then (d - 'sold_out') || '{"sold_out": true}' else d - 'sold_out' end
        order by di)
      from jsonb_array_elements(c -> 'dishes') with ordinality as x(d, di)), '[]'))
    order by ci), '[]')
  from jsonb_array_elements(p_categories) with ordinality as y(c, ci);
$$;
-- Segna un piatto (categoria + nome, senza maiuscole) come terminato o di nuovo disponibile. Solo Admin.
create or replace function public.staff_set_dish_sold_out(p_token text, p_category text, p_dish text, p_sold_out boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_admin players := _admin_player(p_token);
  v_menu jsonb;
  v_ci int;
  v_di int;
begin
  if v_admin.id is null then return _admin_denied(p_token); end if;
  if p_sold_out is null then return jsonb_build_object('ok', false, 'error', 'MENU_INVALID'); end if;
  -- Un cambio alla volta: due Admin che segnano piatti insieme non si cancellano a vicenda
  perform pg_advisory_xact_lock(hashtext('menu'));
  v_menu := _setting('menu');
  select c.ci - 1, d.di - 1 into v_ci, v_di
  from jsonb_array_elements(coalesce(v_menu -> 'categories', '[]')) with ordinality as c(cat, ci),
       jsonb_array_elements(c.cat -> 'dishes') with ordinality as d(dish, di)
  where lower(c.cat ->> 'name') = lower(trim(coalesce(p_category, '')))
    and lower(d.dish ->> 'name') = lower(trim(coalesce(p_dish, '')))
  limit 1;
  if v_ci is null then return jsonb_build_object('ok', false, 'error', 'DISH_NOT_FOUND'); end if;

  v_menu := jsonb_set(v_menu, array['categories', v_ci::text, 'dishes', v_di::text, 'sold_out'], to_jsonb(p_sold_out));
  v_menu := jsonb_set(v_menu, '{updated_at}', to_jsonb(now()));
  update settings set value = v_menu where key = 'menu';
  -- nel registro come 'menu' (filtro Menù), con il piatto e sold_out
  perform _staff_log(v_admin, 'menu', p_dish, jsonb_build_object('category', p_category, 'sold_out', p_sold_out));
  return jsonb_build_object('ok', true, 'sold_out', p_sold_out, 'menu', v_menu);
end;
$$;

-- #####################################################################################
-- 038 · Sponsor (D126)
-- #####################################################################################

-- Sezioni che si ordinano in Aspetto (sponsor no: sempre in fondo)
create or replace function public._orderable_section_ids()
returns text[] language sql immutable as $$
  select array['menu', 'giochi', 'feedback', 'mappa', 'calendario'];
$$;
-- Colonne della tabella degli sponsor (di base 2)
create or replace function public._sponsor_columns()
returns int language sql stable set search_path = public as $$
  select coalesce((_setting('sponsor_columns') #>> '{}')::int, 2);
$$;
-- Sponsor spenta all'inizio (se non è già stata decisa)
insert into settings (key, value) values ('sections', '{"sponsor": false}')
on conflict (key) do update set value = settings.value || '{"sponsor": false}' where not (settings.value ? 'sponsor');

-- #####################################################################################
-- 039 · Mappa della sagra (D136)
-- #####################################################################################

-- Mappa spenta all'inizio (se non è già stata decisa)
insert into settings (key, value) values ('sections', '{"mappa": false}')
on conflict (key) do update set value = settings.value || '{"mappa": false}' where not (settings.value ? 'mappa');
-- ---------- Tabelle ----------

-- Tipologie dei punti (le icone e i colori sono nell'app, src/lib/map-data.js)
create or replace function public._map_types()
returns text[] language sql immutable as $$
  select array['ristorazione', 'bar', 'cassa', 'info', 'wc', 'soccorso', 'palco', 'bambini', 'parcheggio',
               'ingresso', 'rifiuti', 'altro'];
$$;
create table if not exists public.map_points (
  id bigint generated always as identity primary key,
  type text not null,
  title text not null check (length(title) between 1 and 60),
  description text check (description is null or length(description) <= 300),
  x real not null check (x between 0 and 1),
  y real not null check (y between 0 and 1),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.map_points enable row level security;
revoke all on public.map_points from anon, authenticated;
-- Una sola immagine (id = 1), in base64
create table if not exists public.map_image (
  id int primary key default 1 check (id = 1),
  mime text not null,
  data text not null,
  width int not null,
  height int not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.map_image enable row level security;
revoke all on public.map_image from anon, authenticated;
-- Versione dei punti: cambia a ogni aggiunta, modifica o cancellazione
create or replace function public._map_points_touch()
returns void language sql volatile set search_path = public as $$
  insert into settings (key, value) values ('map_points_version', to_jsonb(now()::text))
  on conflict (key) do update set value = excluded.value;
$$;
create or replace function public._map_point_json(p map_points)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', p.id, 'type', p.type, 'title', p.title, 'description', p.description,
    'x', p.x, 'y', p.y, 'lat', p.lat, 'lng', p.lng);
$$;
-- ---------- Lettura (per tutti) ----------

-- Punti (in ordine di inserimento: la numerazione per tipologia la fa l'app) e dati dell'immagine, senza l'immagine
create or replace function public.get_map()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true,
    'version', _setting('map_points_version') #>> '{}',
    'points', coalesce((select jsonb_agg(_map_point_json(p) order by p.id) from map_points p), '[]'),
    'image', (select jsonb_build_object('version', updated_at::text, 'width', width, 'height', height) from map_image),
    'bounds', _setting('map_bounds'));
$$;
-- L'immagine (base64): il telefono la chiede solo quando la sua versione è cambiata
create or replace function public.get_map_image()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('ok', true, 'version', updated_at::text, 'mime', mime, 'data', data,
    'width', width, 'height', height) from map_image), jsonb_build_object('ok', false, 'error', 'NO_MAP'));
$$;
-- ---------- Modifica dei punti (Mod e Admin) ----------

-- Nuovo punto (p_id null) o modifica. Restituisce il punto salvato.
create or replace function public.staff_map_save_point(p_token text, p_id bigint, p_type text, p_title text,
                                                       p_description text, p_x real, p_y real,
                                                       p_lat double precision default null,
                                                       p_lng double precision default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_title text := trim(coalesce(p_title, ''));
  v_desc text := nullif(trim(coalesce(p_description, '')), '');
  v_point map_points;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  if p_type is null or not (p_type = any (_map_types())) or length(v_title) not between 1 and 60
     or length(coalesce(v_desc, '')) > 300 or p_x is null or p_y is null or p_x not between 0 and 1 or p_y not between 0 and 1
     or (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('ok', false, 'error', 'POINT_INVALID');
  end if;
  if p_id is null then
    insert into map_points (type, title, description, x, y, lat, lng, updated_by)
    values (p_type, v_title, v_desc, p_x, p_y, p_lat, p_lng, v_staff.nickname)
    returning * into v_point;
  else
    update map_points set type = p_type, title = v_title, description = v_desc, x = p_x, y = p_y, lat = p_lat, lng = p_lng,
      updated_at = now(), updated_by = v_staff.nickname
    where id = p_id returning * into v_point;
    if v_point.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  end if;
  -- posizione reale calcolata dagli angoli della mappa (se ci sono); quella mandata dal telefono non conta
  update map_points set lat = c.lat, lng = c.lng from _map_latlng(v_point.x, v_point.y) c
  where map_points.id = v_point.id returning map_points.* into v_point;
  perform _map_points_touch();
  perform _staff_log(v_staff, 'map', v_title, jsonb_build_object('point', v_point.id, 'type', p_type, 'new', p_id is null));
  return jsonb_build_object('ok', true, 'point', _map_point_json(v_point));
end;
$$;
create or replace function public.staff_map_delete_point(p_token text, p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_point map_points;
  v_events int := (select count(*) from events where point_id = p_id);
begin
  if v_staff.id is null then return _staff_denied(); end if;
  delete from map_points where id = p_id returning * into v_point;
  if v_point.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  perform _map_points_touch();
  if v_events > 0 then perform _events_touch(); end if;
  perform _staff_log(v_staff, 'map', v_point.title, jsonb_build_object('point', v_point.id, 'deleted', true, 'events', v_events));
  return jsonb_build_object('ok', true);
end;
$$;
-- ---------- Immagine (solo Admin) ----------

-- Immagine già preparata dal telefono dell'Admin (o dallo script): base64, al massimo ~3 MB di testo
create or replace function public.staff_set_map_image(p_token text, p_mime text, p_data text, p_width int, p_height int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_admin players := _admin_player(p_token);
begin
  if v_admin.id is null then return _admin_denied(p_token); end if;
  if p_mime is null or p_mime not in ('image/webp', 'image/jpeg', 'image/png') or p_data is null
     or length(p_data) < 100 or length(p_data) > 3000000 or p_data !~ '^[A-Za-z0-9+/=]+$'
     or p_width not between 100 and 4000 or p_height not between 100 and 4000 then
    return jsonb_build_object('ok', false, 'error', 'IMAGE_INVALID');
  end if;
  insert into map_image (id, mime, data, width, height, updated_at, updated_by)
  values (1, p_mime, p_data, p_width, p_height, now(), v_admin.nickname)
  on conflict (id) do update set mime = excluded.mime, data = excluded.data, width = excluded.width,
    height = excluded.height, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  -- immagine nuova: gli angoli di prima potrebbero non valere più → vanno reinseriti
  delete from settings where key = 'map_bounds';
  perform _map_fill_coords();
  perform _staff_log(v_admin, 'map', null, jsonb_build_object('image', true, 'kb', length(p_data) * 3 / 4 / 1024));
  return jsonb_build_object('ok', true, 'version', (select updated_at::text from map_image));
end;
$$;

-- #####################################################################################
-- 040 · Mappa da OpenStreetMap: la scritta "© OpenStreetMap contributors" (D138)
-- #####################################################################################
-- L'immagine della mappa viene da OpenStreetMap? (di base sì)
create or replace function public._map_osm()
returns boolean language sql stable set search_path = public as $$
  select coalesce((_setting('map_osm') #>> '{}')::boolean, true);
$$;

-- #####################################################################################
-- 041 · Coordinate della mappa: posizione reale dei punti calcolata dal server (D139)
-- #####################################################################################
-- Posizione reale di un punto (x, y da 0 a 1 sul disegno) dagli angoli salvati; null se gli angoli mancano.
-- In orizzontale la longitudine è proporzionale; in verticale si passa dalla proiezione di Mercatore.
create or replace function public._map_latlng(p_x real, p_y real, out lat double precision, out lng double precision)
language plpgsql stable set search_path = public as $$
declare
  v_b jsonb := _setting('map_bounds');
  v_mn double precision;
  v_ms double precision;
begin
  if v_b is null or jsonb_typeof(v_b) <> 'object' then return; end if;
  lng := (v_b ->> 'west')::double precision + p_x * ((v_b ->> 'east')::double precision - (v_b ->> 'west')::double precision);
  v_mn := ln(tan(pi() / 4 + radians((v_b ->> 'north')::double precision) / 2));
  v_ms := ln(tan(pi() / 4 + radians((v_b ->> 'south')::double precision) / 2));
  lat := degrees(2 * atan(exp(v_mn + p_y * (v_ms - v_mn))) - pi() / 2);
  lat := round(lat::numeric, 7);
  lng := round(lng::numeric, 7);
end;
$$;
-- Ricalcola la posizione reale di tutti i punti (o la toglie se gli angoli mancano)
create or replace function public._map_fill_coords()
returns void language sql volatile set search_path = public as $$
  update map_points p set lat = c.lat, lng = c.lng from map_points q, lateral _map_latlng(q.x, q.y) c where p.id = q.id;
  select _map_points_touch();
$$;
-- Angoli della mappa (solo Admin): sud-ovest e nord-est. Tutti null = toglierli.
create or replace function public.staff_set_map_bounds(p_token text, p_south double precision, p_west double precision,
                                                       p_north double precision, p_east double precision,
                                                       p_place text default null, p_source text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_admin players := _admin_player(p_token);
begin
  if v_admin.id is null then return _admin_denied(p_token); end if;
  if p_south is null and p_west is null and p_north is null and p_east is null then
    delete from settings where key = 'map_bounds';
  elsif p_south is null or p_west is null or p_north is null or p_east is null
     or p_south not between -85 and 85 or p_north not between -85 and 85 or p_west not between -180 and 180 or p_east not between -180 and 180
     or p_south >= p_north or p_west >= p_east or p_north - p_south > 1 or p_east - p_west > 1 then
    return jsonb_build_object('ok', false, 'error', 'BOUNDS_INVALID');
  else
    insert into settings (key, value)
    values ('map_bounds', jsonb_build_object('south', p_south, 'west', p_west, 'north', p_north, 'east', p_east,
      'place', left(nullif(trim(coalesce(p_place, '')), ''), 200),
      'source', case when p_source in ('openfreemap', 'image') then p_source end))
    on conflict (key) do update set value = excluded.value;
  end if;
  perform _map_fill_coords();
  perform _staff_log(v_admin, 'map', null, jsonb_build_object('bounds', _setting('map_bounds')));
  return jsonb_build_object('ok', true, 'bounds', _setting('map_bounds'));
end;
$$;

-- #####################################################################################
-- 042 · Calendario eventi (D145)
-- #####################################################################################

-- Calendario spento all'inizio (se non è già stato deciso)
insert into settings (key, value) values ('sections', '{"calendario": false}')
on conflict (key) do update set value = settings.value || '{"calendario": false}' where not (settings.value ? 'calendario');
-- ---------- Tabella ----------

create table if not exists public.events (
  id bigint generated always as identity primary key,
  day date not null,
  start_time time not null,
  end_time time check (end_time is null or end_time <> start_time),
  title text not null check (length(title) between 1 and 60),
  description text check (description is null or length(description) <= 300),
  point_id bigint references public.map_points (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists events_day_idx on public.events (day, start_time);
create index if not exists events_point_idx on public.events (point_id);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
-- Versione degli eventi: cambia a ogni aggiunta, modifica o cancellazione (anche quando sparisce un punto della mappa)
create or replace function public._events_touch()
returns void language sql volatile set search_path = public as $$
  insert into settings (key, value) values ('events_version', to_jsonb(now()::text))
  on conflict (key) do update set value = excluded.value;
$$;
create or replace function public._event_json(e events)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', e.id, 'day', e.day, 'start', to_char(e.start_time, 'HH24:MI'),
    'end', to_char(e.end_time, 'HH24:MI'), 'title', e.title, 'description', e.description, 'point', e.point_id);
$$;
-- ---------- Lettura (per tutti) ----------

-- In ordine cronologico
create or replace function public.get_events()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true,
    'version', _setting('events_version') #>> '{}',
    'events', coalesce((select jsonb_agg(_event_json(e) order by e.day, e.start_time, e.id) from events e), '[]'));
$$;
-- ---------- Modifica (Mod e Admin) ----------

-- Nuovo evento (p_id null) o modifica. Restituisce l'evento salvato.
create or replace function public.staff_event_save(p_token text, p_id bigint, p_day date, p_start time, p_end time,
                                                   p_title text, p_description text, p_point_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_title text := trim(coalesce(p_title, ''));
  v_desc text := nullif(trim(coalesce(p_description, '')), '');
  v_event events;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  if p_day is null or p_day not between date '2020-01-01' and date '2100-12-31' or p_start is null
     or p_end = p_start or length(v_title) not between 1 and 60 or length(coalesce(v_desc, '')) > 300 then
    return jsonb_build_object('ok', false, 'error', 'EVENT_INVALID');
  end if;
  if p_point_id is not null and not exists (select 1 from map_points where id = p_point_id) then
    return jsonb_build_object('ok', false, 'error', 'POINT_NOT_FOUND');
  end if;
  if p_id is null then
    insert into events (day, start_time, end_time, title, description, point_id, updated_by)
    values (p_day, p_start, p_end, v_title, v_desc, p_point_id, v_staff.nickname)
    returning * into v_event;
  else
    update events set day = p_day, start_time = p_start, end_time = p_end, title = v_title, description = v_desc,
      point_id = p_point_id, updated_at = now(), updated_by = v_staff.nickname
    where id = p_id returning * into v_event;
    if v_event.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  end if;
  perform _events_touch();
  perform _staff_log(v_staff, 'event', v_title, jsonb_build_object('event', v_event.id, 'day', p_day, 'new', p_id is null));
  return jsonb_build_object('ok', true, 'event', _event_json(v_event), 'version', _setting('events_version') #>> '{}');
end;
$$;
create or replace function public.staff_event_delete(p_token text, p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_event events;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  delete from events where id = p_id returning * into v_event;
  if v_event.id is null then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  perform _events_touch();
  perform _staff_log(v_staff, 'event', v_event.title, jsonb_build_object('event', v_event.id, 'deleted', true));
  return jsonb_build_object('ok', true, 'version', _setting('events_version') #>> '{}');
end;
$$;

-- #####################################################################################
-- 043 · Numeri per l'Admin (D146)
-- #####################################################################################
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

-- #####################################################################################
-- Permessi delle funzioni
-- #####################################################################################
-- Prima nessuna funzione è chiamabile dall'app; poi solo queste (55), che controllano da sole
-- chi le chiama (token del giocatore, ruolo Mod o Admin). Le altre (56) sono interne.

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.check_nickname(text),
  public.get_app_config(),
  public.get_events(),
  public.get_feedback_highlights(),
  public.get_feedback_page(text),
  public.get_games_state(text),
  public.get_leaderboard(text,bigint),
  public.get_map(),
  public.get_map_image(),
  public.get_menu(),
  public.get_my_profile(text),
  public.get_player_card(text,text),
  public.login(text,text,uuid,text,text),
  public.logout(text),
  public.register(text,text,text,uuid,text,text),
  public.set_avatar(text,text),
  public.staff_add_extra_points(text,text,integer,text),
  public.staff_attempt_replay(text,uuid),
  public.staff_ban_device(text,uuid,boolean),
  public.staff_ban_player(text,uuid),
  public.staff_banned_devices(text),
  public.staff_client_ip(text),
  public.staff_confirm_exclusion(text,uuid),
  public.staff_delete_extra_points(text,bigint),
  public.staff_delete_player(text,text,text),
  public.staff_event_delete(text,bigint),
  public.staff_event_save(text,bigint,date,time without time zone,time without time zone,text,text,bigint),
  public.staff_feedback_delete(text,bigint),
  public.staff_feedback_list(text,integer,text,date,integer,boolean),
  public.staff_get_settings(text),
  public.staff_leaderboard(text,integer,boolean),
  public.staff_log_list(text,integer,date,text,text),
  public.staff_map_delete_point(text,bigint),
  public.staff_map_save_point(text,bigint,text,text,text,real,real,double precision,double precision),
  public.staff_player_accesses(text,text,uuid),
  public.staff_player_detail(text,text),
  public.staff_quiz_list(text),
  public.staff_quiz_save(text,jsonb),
  public.staff_reset_pin(text,text,text),
  public.staff_review_list(text,text),
  public.staff_search_players(text,text,integer),
  public.staff_set_attempt_status(text,uuid,text),
  public.staff_set_disabled(text,text,boolean),
  public.staff_set_dish_sold_out(text,text,text,boolean),
  public.staff_set_game(text,text,integer,integer),
  public.staff_set_map_bounds(text,double precision,double precision,double precision,double precision,text,text),
  public.staff_set_map_image(text,text,text,integer,integer),
  public.staff_set_menu(text,jsonb),
  public.staff_set_role(text,text,text),
  public.staff_stats(text),
  public.staff_suspicious_devices(text),
  public.staff_update_settings(text,jsonb),
  public.start_attempt(text,text),
  public.submit_feedback(text,integer,text),
  public.submit_score(uuid,integer,jsonb,jsonb)
to anon, authenticated;
