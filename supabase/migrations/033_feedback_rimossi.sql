-- =====================================================================================
-- 033 — Feedback rimossi: il testo resta, lo staff li rivede (D115)
--
-- - Rimuovere un feedback non ne svuota più il testo: si segna chi l'ha rimosso e quando (deleted_by, deleted_at).
-- - staff_feedback_list(..., p_removed): con p_removed = true l'elenco dei Rimossi (stessi filtri), altrimenti gli Attivi.
-- I feedback rimossi prima di questa migrazione restano senza testo.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

alter table public.feedback add column if not exists deleted_by text;

-- Come in 032, con Attivi / Rimossi
drop function if exists public.staff_feedback_list(text, int, text, date, int);
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

-- Come in 032, senza svuotare il testo e con chi l'ha rimosso
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

revoke execute on function public.staff_feedback_list(text, int, text, date, int, boolean) from public;
grant execute on function public.staff_feedback_list(text, int, text, date, int, boolean) to anon, authenticated;
