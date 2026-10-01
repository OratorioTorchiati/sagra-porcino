-- =====================================================================================
-- 034 — Le recensioni migliori diventano 5 (D117)
--
-- La pagina Feedback ne mostra 3 e le altre 2 arrivano una alla volta, come in una chat di gruppo.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- Come in 032, con le 5 migliori (più stelle, poi le più recenti, con almeno 15 caratteri di testo)
create or replace function public.get_feedback_highlights()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'reviews', coalesce((
    select jsonb_agg(jsonb_build_object('nickname', r.nickname, 'avatar', r.avatar, 'stars', r.stars, 'text', r.text) order by r.stars desc, r.created_at desc)
    from (
      select p.nickname, p.avatar, f.stars, f.text, f.created_at
      from feedback f left join players p on p.id = f.player_id
      where f.deleted_at is null and length(trim(coalesce(f.text, ''))) >= 15 and (p.id is null or not p.disabled)
      order by f.stars desc, f.created_at desc
      limit 5
    ) r), '[]'));
$$;
