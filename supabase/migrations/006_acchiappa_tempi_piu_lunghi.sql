-- =====================================================================================
-- 006 — Acchiappa il porcino: un secondo in più a ogni moltiplicatore (D68)
--
-- ×2 dura 7 s, ×3 6 s, ×4 5 s (erano 6, 5, 4). Uguale a app/src/games/acchiappa/config.js.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

create or replace function public._acchiappa_level_ms(p_level int)
returns int language sql immutable as $$
  select case p_level when 2 then 7000 when 3 then 6000 when 4 then 5000 else 0 end;
$$;

revoke execute on function public._acchiappa_level_ms(int) from public, anon, authenticated;
