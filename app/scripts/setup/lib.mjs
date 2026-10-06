// Postgres locale (PGlite) che imita un progetto Supabase nuovo: ruoli, schema extensions, permessi di base
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MIG = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url));

export async function freshDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema if not exists extensions;
    grant usage on schema public to anon, authenticated, service_role;
    -- come Supabase: tutto ciò che si crea in public è concesso di base a anon/authenticated (le migrazioni revocano)
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  return db;
}

export const migrationFiles = () => fs.readdirSync(MIG).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();

/** Fotografia del database: struttura, funzioni, permessi e dati iniziali */
export async function snapshot(db, { skipData = [] } = {}) {
  const q = async (sql) => (await db.query(sql)).rows;
  const snap = {};
  snap.columns = await q(`select table_name, column_name, data_type, udt_name, column_default, is_nullable, is_identity, identity_generation
    from information_schema.columns where table_schema = 'public' order by table_name, column_name`);
  snap.constraints = await q(`select conrelid::regclass::text as t, conname, pg_get_constraintdef(oid) as def
    from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`);
  snap.indexes = await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`);
  snap.triggers = await q(`select tgrelid::regclass::text as t, tgname, pg_get_triggerdef(oid) as def from pg_trigger
    where not tgisinternal order by 1, 2`);
  snap.tables = await q(`select relname, relkind, relrowsecurity, relforcerowsecurity,
    coalesce((select string_agg(x::text, ',' order by x::text) from unnest(relacl) x), '') as acl
    from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'S', 'v') order by 1`);
  snap.policies = await q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`);
  snap.functions = await q(`select p.oid::regprocedure::text as sig, md5(pg_get_functiondef(p.oid)) as def,
    coalesce((select string_agg(x::text, ',' order by x::text) from unnest(p.proacl) x), '') as acl
    from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`);
  snap.data = {};
  for (const { relname } of snap.tables.filter((t) => t.relkind === 'r')) {
    if (skipData.includes(relname)) continue;
    const rows = await q(`select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h, count(*)::int as n from public.${relname} t`);
    snap.data[relname] = rows[0];
  }
  return snap;
}

/** Differenze tra due fotografie (righe che ci sono solo in una delle due) */
export function diff(a, b) {
  const out = [];
  for (const key of Object.keys(a)) {
    if (key === 'data') {
      for (const t of new Set([...Object.keys(a.data), ...Object.keys(b.data)])) {
        if (JSON.stringify(a.data[t]) !== JSON.stringify(b.data[t])) out.push(`data ${t}: ${JSON.stringify(a.data[t])} ≠ ${JSON.stringify(b.data[t])}`);
      }
      continue;
    }
    const sa = new Set(a[key].map((r) => JSON.stringify(r)));
    const sb = new Set(b[key].map((r) => JSON.stringify(r)));
    for (const r of sa) if (!sb.has(r)) out.push(`- ${key} ${r}`);
    for (const r of sb) if (!sa.has(r)) out.push(`+ ${key} ${r}`);
  }
  return out;
}
