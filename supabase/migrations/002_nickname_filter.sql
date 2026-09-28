-- =====================================================================================
-- 002 — Filtro nickname: niente bestemmie né insulti, senza censurare parole innocue
--
-- Tre tipi di regola (tabella banned_words, colonna kind):
--   contains    → vietato se la radice compare ovunque (porco, madonn, diocan...)
--   word        → vietato se è una PAROLA a sé (dio: "SonoDio", "Il_Dio" sì; "Armadio", "Claudio" no)
--   word_start  → vietato se una parola INIZIA così (prete: "PreteRosso" sì; "Interprete" no)
-- Parole nel nickname: separate da _, cifre e passaggi minuscola→Maiuscola (PorcoDio → porco + dio).
-- Le cifre si leggono anche come lettere (p0rc0 → porco).
-- Eccezioni (tabella allowed_words): parole innocue che contengono una radice vietata (porcospino...).
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

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

create or replace function public._nickname_problem(p_nickname text)
returns text language sql stable set search_path = public as $$
  select case
    when p_nickname is null or p_nickname !~ '^[A-Za-z0-9_]{3,16}$' then 'NICKNAME_INVALID'
    when _nickname_is_offensive(p_nickname) then 'NICKNAME_NOT_ALLOWED'
    when exists (select 1 from players p where lower(p.nickname) = lower(p_nickname)) then 'NICKNAME_TAKEN'
    else null
  end;
$$;

-- Permessi: le funzioni interne restano non chiamabili dal client
revoke execute on function public._nickname_is_offensive(text) from public, anon, authenticated;
revoke execute on function public._nickname_problem(text) from public, anon, authenticated;
