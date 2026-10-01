-- =====================================================================================
-- 035 — Versione del menù nella configurazione dell'app (D118)
--
-- Il menù resta sul telefono per 1 ora. get_app_config (chiesta a ogni cambio pagina, pochi byte) dice anche
-- quando è stato salvato l'ultimo menù: se è diverso da quello sul telefono, l'app lo richiede subito.
-- La data cambia a ogni pubblicazione, sia dal file sia da ✏️ Modifica (entrambe passano da staff_set_menu).
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

-- Come in 029, con menu_version (null se non è mai stato pubblicato un menù dal pannello)
create or replace function public.get_app_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'sections', _sections(), 'winners', _winners(), 'leaderboard_public', _leaderboard_public(),
    'sections_order', _sections_order(), 'feedback_anonymous', _feedback_anonymous(),
    'menu_version', _setting('menu') ->> 'updated_at');
$$;
