-- =====================================================================================
-- 029 — Feedback e Aspetto (D108)
--
-- - Nuova sezione della home "feedback" (spenta finché l'Admin non la accende). Voto da 1 a 5 stelle + testo
--   facoltativo (max 1000 caratteri). Con l'account, oppure anche senza se l'Admin abilita i feedback anonimi.
--   Al massimo 3 feedback al giorno a testa (per account; senza account per indirizzo, salvato solo come impronta).
-- - Nella pagina Feedback le 3 recensioni migliori (più stelle, con almeno 15 caratteri di testo).
-- - Pannello (Mod e Admin): elenco a pagine con filtri per nickname, giorno e stelle, media dei voti; cancellazione
--   dei feedback volgari (finisce nel registro).
-- - Aspetto: ordine delle sezioni (home e pannello), in settings.sections_order.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- ---------- Sezioni: arriva "feedback", spenta all'inizio ----------

create or replace function public._section_ids()
returns text[] language sql immutable as $$
  select array['menu', 'giochi', 'feedback'];
$$;

update public.settings set value = value || '{"feedback": false}'
where key = 'sections' and not (value ? 'feedback');

-- Ordine delle sezioni (Aspetto, D108): quello salvato, con le sezioni mancanti in fondo
create or replace function public._sections_order()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(id order by ord), '[]') from (
    select x.id, x.ord from jsonb_array_elements_text(coalesce(_setting('sections_order'), '[]')) with ordinality as x(id, ord)
    where x.id = any (_section_ids())
    union all
    select id, 1000 + array_position(_section_ids(), id) from unnest(_section_ids()) as id
    where not coalesce(_setting('sections_order'), '[]') ? id
  ) s;
$$;

create or replace function public._feedback_anonymous()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((_setting('feedback_anonymous') #>> '{}')::boolean, false);
$$;

-- Come in 025, con ordine delle sezioni e feedback anonimi
create or replace function public.get_app_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'sections', _sections(), 'winners', _winners(), 'leaderboard_public', _leaderboard_public(),
    'sections_order', _sections_order(), 'feedback_anonymous', _feedback_anonymous());
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
  if p_stars is null or p_stars not between 1 and 5 then return jsonb_build_object('ok', false, 'error', 'STARS_INVALID'); end if;
  if length(v_text) > 1000 then return jsonb_build_object('ok', false, 'error', 'TEXT_TOO_LONG'); end if;
  -- Al massimo 3 al giorno a testa (account, oppure indirizzo per chi non ha l'account)
  if (select count(*) from feedback f where f.created_at > now() - interval '1 day'
      and case when v_player.id is not null then f.player_id = v_player.id else f.player_id is null and f.ip_hash = v_ip end) >= 3 then
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
      where length(trim(coalesce(f.text, ''))) >= 15 and (p.id is null or not p.disabled)
      order by f.stars desc, f.created_at desc
      limit 3
    ) r), '[]'));
$$;

-- Pannello (Mod e Admin): feedback a pagine da 20, filtri per nickname (anche parte), giorno e stelle
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
      where (v_nick is null or p.nickname ilike '%' || v_nick || '%')
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

-- Pannello (Mod e Admin): cancella un feedback (es. volgare); resta nel registro
create or replace function public.staff_feedback_delete(p_token text, p_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff players := _staff_player(p_token);
  v_row record;
begin
  if v_staff.id is null then return _staff_denied(); end if;
  delete from feedback f where f.id = p_id
  returning f.stars, f.text, (select nickname from players where id = f.player_id) as nickname into v_row;
  if not found then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  perform _staff_log(v_staff, 'feedback_delete', coalesce(v_row.nickname, 'anonimo'),
    jsonb_build_object('stars', v_row.stars, 'text', left(coalesce(v_row.text, ''), 200)));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- Configurazioni ----------

-- Come in 025, con ordine delle sezioni e feedback anonimi
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
  -- Aspetto (D108): ordine delle sezioni nella home e nel pannello (tutte, ognuna una volta)
  if p_values ? 'sections_order' then
    if jsonb_typeof(p_values -> 'sections_order') <> 'array'
       or (select array_agg(x order by x) from jsonb_array_elements_text(p_values -> 'sections_order') x)
          is distinct from (select array_agg(x order by x) from unnest(_section_ids()) x) then
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

-- Come in 028, con ordine delle sezioni e feedback anonimi
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
    'games', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'enabled', enabled, 'duration_s', duration_s, 'steps', steps) order by sort) from games));
end;
$$;

-- ---------- Permessi ----------

revoke execute on function public._sections_order(), public._feedback_anonymous() from public, anon, authenticated;
revoke execute on function public.submit_feedback(text, int, text), public.get_feedback_highlights(),
  public.staff_feedback_list(text, int, text, date, int), public.staff_feedback_delete(text, bigint) from public;
grant execute on function public.submit_feedback(text, int, text), public.get_feedback_highlights(),
  public.staff_feedback_list(text, int, text, date, int), public.staff_feedback_delete(text, bigint) to anon, authenticated;
