-- =====================================================================================
-- 037 — Recensioni migliori: bastano 5 caratteri di testo (prima 15) (D124)
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- Come in 034 (le 5 migliori: più stelle, poi le più recenti), con almeno 5 caratteri di testo
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
