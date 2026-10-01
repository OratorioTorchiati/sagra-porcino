-- =====================================================================================
-- 032 — Feedback cancellati dallo staff: il giorno resta usato (D114)
--
-- - Cancellare un feedback non lo toglie dalla tabella: si segna deleted_at e si svuota il testo (il contenuto resta
--   solo nel registro dello staff, come già prima). Sparisce da elenco dello staff e nuvolette.
-- - Il limite "un feedback al giorno" (_feedback_today, 031) conta anche quelli cancellati: chi è stato moderato non
--   può riscriverlo lo stesso giorno.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

alter table public.feedback add column if not exists deleted_at timestamptz;

-- Come in 029, senza i cancellati
create or replace function public.get_feedback_highlights()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'reviews', coalesce((
    select jsonb_agg(jsonb_build_object('nickname', r.nickname, 'avatar', r.avatar, 'stars', r.stars, 'text', r.text) order by r.stars desc, r.created_at desc)
    from (
      select p.nickname, p.avatar, f.stars, f.text, f.created_at
      from feedback f left join players p on p.id = f.player_id
      where f.deleted_at is null and length(trim(coalesce(f.text, ''))) >= 15 and (p.id is null or not p.disabled)
      order by f.stars desc, f.created_at desc
      limit 3
    ) r), '[]'));
$$;

-- Come in 029, senza i cancellati
create or replace function public.staff_feedback_list(p_token text, p_page int default 0, p_nickname text default null,
                                                      p_day date default null, p_stars int default null)
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
      select f.id, f.stars, f.text, f.created_at, p.nickname, p.avatar
      from feedback f left join players p on p.id = f.player_id
      where f.deleted_at is null
        and (v_nick is null or p.nickname ilike '%' || v_nick || '%')
        and (p_day is null or (f.created_at at time zone 'Europe/Rome')::date = p_day)
        and (p_stars is null or f.stars = p_stars)
    )
    select jsonb_build_object('ok', true, 'page', v_page, 'page_size', v_size,
      'total', (select count(*) from filtered),
      'average', (select round(avg(stars), 1) from filtered),
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.id, 'nickname', x.nickname, 'avatar', x.avatar, 'stars', x.stars,
                                            'text', x.text, 'created_at', x.created_at) order by x.created_at desc)
        from (select * from filtered order by created_at desc offset v_page * v_size limit v_size) x), '[]'))
  );
end;
$$;

-- Come in 029, ma il feedback resta (segnato come cancellato, senza testo)
create or replace function public.staff_feedback_delete(p_token text, p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_row record;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  -- Il feedback non si cancella davvero (D114): sparisce da elenchi e nuvolette e il testo si svuota, ma resta il segno
  -- "scritto oggi", così chi l'ha scritto non può lasciarne un altro lo stesso giorno
  select f.stars, f.text, (select nickname from players where id = f.player_id) as nickname into v_row
  from feedback f where f.id = p_id and f.deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  update feedback set deleted_at = now(), text = null where id = p_id;
  perform _staff_log(v_staff, 'feedback_delete', coalesce(v_row.nickname, 'anonimo'),
    jsonb_build_object('stars', v_row.stars, 'text', left(coalesce(v_row.text, ''), 200)));
  return jsonb_build_object('ok', true);
end;
$$;
