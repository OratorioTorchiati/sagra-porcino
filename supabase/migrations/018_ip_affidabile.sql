-- =====================================================================================
-- 018 — IP del telefono solo da fonti affidabili (D83)
--
-- Verificato il 29/09 sul progetto: l'intestazione cf-connecting-ip la mette Cloudflare (se un telefono prova a
-- mandarla finta la richiesta viene rifiutata con 403). In X-Forwarded-For invece il PRIMO valore può essere
-- scritto da chi fa la richiesta: come riserva si usa l'ULTIMO, quello aggiunto dalla rete di Supabase.
--
-- Come applicarla: Supabase → SQL Editor → incolla tutto il file → Run. Si può rieseguire.
-- =====================================================================================

create or replace function public._client_ip()
returns text language plpgsql stable as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
  v_forwarded text[] := string_to_array(coalesce(v_headers ->> 'x-forwarded-for', ''), ',');
begin
  return coalesce(
    nullif(trim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(trim(v_forwarded[array_length(v_forwarded, 1)]), ''),
    '?');
end;
$$;

revoke execute on function public._client_ip() from public, anon, authenticated;
