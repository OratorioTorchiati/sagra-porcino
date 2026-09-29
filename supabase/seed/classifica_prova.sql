-- =====================================================================================
-- Classifica di prova (Tappa 6): 200 giocatori finti "zzf001".."zzf200" con punteggi validi nei 4 giochi.
-- Contiene apposta dei PARI MERITO:
--   zzf001 e zzf002 → stessi punteggi (entrambi 1°); zzf003 → 3°;
--   zzf004 e zzf005 → pari al 4°; zzf020 e zzf021 → pari al 20° (compaiono entrambi nei primi 20).
-- Tutti gli altri hanno punteggi casuali più bassi.
--
-- Come usarlo: SQL Editor → incolla → Run. Per cancellarli (anche i loro tentativi):
--   delete from players where nickname like 'zzf%';
-- =====================================================================================

do $$
declare
  v_avatars text[] := _avatar_ids();
  v_id uuid;
  v_scores int[];
  i int;
begin
  for i in 1..200 loop
    v_scores := case
      when i in (1, 2) then array[5000, 1000, 3000, 1000]      -- 10.000
      when i = 3 then array[4800, 1000, 3000, 1000]            -- 9.800
      when i in (4, 5) then array[4500, 950, 2800, 950]        -- 9.200
      when i between 6 and 19 then array[4400 - i * 20, 900, 2600 - i * 10, 900 - i * 5]
      when i in (20, 21) then array[3000, 800, 2000, 800]      -- 6.600
      else array[(random() * 2800)::int, (random() * 790)::int, (random() * 1900)::int, (random() * 790)::int]
    end;
    insert into players (nickname, avatar, pin_hash)
    values ('zzf' || lpad(i::text, 3, '0'), v_avatars[1 + (i % array_length(v_avatars, 1))], 'x')
    on conflict do nothing
    returning id into v_id;
    continue when v_id is null;
    insert into attempts (player_id, game_id, day, seed, submitted_at, client_score, raw_score, status)
    values
      (v_id, 'acchiappa', current_date, 1, now(), v_scores[1], v_scores[1], 'valid'),
      (v_id, 'quiz',      current_date, 1, now(), v_scores[2], v_scores[2], 'valid'),
      (v_id, 'cadono',    current_date, 1, now(), v_scores[3], v_scores[3], 'valid'),
      (v_id, 'memory',    current_date, 1, now(), v_scores[4], v_scores[4], 'valid');
  end loop;
end $$;

-- Controllo: i primi della classifica (posizione con pari merito)
select rank() over (order by l.total desc) as posizione, p.nickname, l.total
from leaderboard l join players p on p.id = l.player_id
where p.role = 'player' and not p.disabled and l.total > 0
order by l.total desc, lower(p.nickname)
limit 25;
