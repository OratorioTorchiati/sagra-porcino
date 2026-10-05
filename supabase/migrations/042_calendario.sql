-- =====================================================================================
-- 042 — Calendario eventi (D145)
--
-- - Nuova sezione "calendario": si accende, si spegne e si ordina come le altre (all'inizio spenta).
-- - Eventi: giorno, ora di inizio, ora di fine facoltativa (se è prima dell'inizio, finisce il giorno dopo),
--   titolo, descrizione facoltativa e un punto della mappa facoltativo (la "location"). Li modificano Mod e Admin.
-- - Eliminando un punto della mappa i suoi eventi restano, senza location.
-- - get_app_config porta la versione degli eventi: il telefono li riscarica solo quando cambiano.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- ---------- Sezione ----------

create or replace function public._section_ids()
returns text[] language sql immutable as $$
  select array['menu', 'giochi', 'feedback', 'mappa', 'calendario', 'sponsor'];
$$;

create or replace function public._orderable_section_ids()
returns text[] language sql immutable as $$
  select array['menu', 'giochi', 'feedback', 'mappa', 'calendario'];
$$;

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
revoke execute on function public._events_touch(), public._event_json(events) from public, anon, authenticated;

-- ---------- Lettura (per tutti) ----------

-- In ordine cronologico
create or replace function public.get_events()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true,
    'version', _setting('events_version') #>> '{}',
    'events', coalesce((select jsonb_agg(_event_json(e) order by e.day, e.start_time, e.id) from events e), '[]'));
$$;

revoke execute on function public.get_events() from public;
grant execute on function public.get_events() to anon, authenticated;

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

revoke execute on function public.staff_event_save(text, bigint, date, time, time, text, text, bigint),
  public.staff_event_delete(text, bigint) from public;
grant execute on function public.staff_event_save(text, bigint, date, time, time, text, text, bigint),
  public.staff_event_delete(text, bigint) to anon, authenticated;

-- ---------- Punti della mappa ----------

-- Come in 039: se il punto aveva eventi, restano senza location e cambia anche la versione degli eventi
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

-- ---------- Configurazione dell'app ----------

-- Come in 040, con la versione degli eventi
create or replace function public.get_app_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'sections', _sections(), 'winners', _winners(), 'leaderboard_public', _leaderboard_public(),
    'sections_order', _sections_order(), 'feedback_anonymous', _feedback_anonymous(),
    'menu_version', _setting('menu') ->> 'updated_at', 'sponsor_columns', _sponsor_columns(),
    'map_version', _setting('map_points_version') #>> '{}',
    'map_image_version', (select updated_at::text from map_image), 'map_osm', _map_osm(),
    'events_version', _setting('events_version') #>> '{}');
$$;
