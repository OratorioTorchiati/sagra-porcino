-- =====================================================================================
-- 036 — Piatti terminati (D119)
--
-- L'Admin, dalla pagina Menù, segna un piatto come terminato (o di nuovo disponibile): il piatto resta nel menù,
-- un po' spento, con "Terminato" in rosso. Cambia la versione del menù (035), quindi i telefoni lo vedono al primo
-- cambio pagina. Ripubblicando il menù (dal file o da ✏️ Modifica) i piatti terminati restano tali se hanno lo
-- stesso nome nella stessa categoria.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

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
revoke execute on function public._menu_keep_sold_out(jsonb) from public, anon, authenticated;

-- Come in 023, mantenendo i piatti terminati
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
revoke execute on function public.staff_set_dish_sold_out(text, text, text, boolean) from public;
grant execute on function public.staff_set_dish_sold_out(text, text, text, boolean) to anon, authenticated;
