// npm run db:setup — genera supabase/setup.sql dalle migrazioni e lo verifica: stesso database delle 43 migrazioni (domande del quiz escluse),
// e rieseguendolo sullo stesso database non cambia nulla.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { consolidate, splitSql } from './consolidate.mjs';
import { freshDb, migrationFiles, snapshot, diff, MIG } from './lib.mjs';

const OUT = fileURLToPath(new URL('../../../supabase/setup.sql', import.meta.url));
const LAST = migrationFiles().at(-1).slice(0, 3);

// Database di riferimento: le migrazioni una dopo l'altra
const ref = await freshDb();
for (const f of migrationFiles()) await ref.exec(fs.readFileSync(MIG + f, 'utf8'));
const a = await snapshot(ref, { skipData: ['quiz_questions'] });

const title = (file) => {
  const m = /^--\s*\d{3}\s*[—-]\s*(.+)$/m.exec(fs.readFileSync(MIG + file, 'utf8'));
  return m ? m[1].trim() : file;
};

// commenti storici ("Come in 039, con …") → solo la parte utile
const cleanComments = (s) =>
  s
    .replace(/^(\s*--\s*)Come in \d{3}(?: e \d{3})?\s*[:,]?\s*con\s+/gim, '$1Con ')
    .replace(/^(\s*--\s*)Come in \d{3}(?: e \d{3})?\s*[:,]?\s*/gim, '$1')
    .replace(/^(\s*--)\s*\n/gm, '');

const code = (s) => s.replace(/--[^\n]*/g, '').trim();
const isQuizInsert = (stmt) => /^insert\s+into\s+(public\.)?quiz_questions/i.test(code(stmt));
// permessi sulle funzioni: tutti insieme nella sezione finale (così il file si può rieseguire senza sorprese)
const isFunctionPrivilege = (stmt) => {
  const c = code(stmt);
  return (/^(grant|revoke)\b/i.test(c) && /\bfunctions?\b/i.test(c) && !/\bon\s+(table|all\s+tables|sequence)/i.test(c)) ||
    (/^do\s/i.test(c) && /grant execute on function/i.test(c));
};

const kept = consolidate();
let out = `-- =====================================================================================
-- SETUP — Sagra del Porcino: tutto il database in un solo file (D147)
--
-- Per un progetto Supabase NUOVO (es. quello di produzione): Supabase → SQL Editor → incolla tutto → Run.
-- Si può rieseguire. È il risultato delle migrazioni 001–${LAST} (supabase/migrations/) senza i passaggi intermedi:
-- ogni funzione compare una sola volta, nella versione finale, e i permessi delle funzioni sono tutti in fondo.
-- Verificato con uno script di confronto su un Postgres locale: stesse tabelle, funzioni, permessi e dati
-- iniziali delle migrazioni eseguite una dopo l'altra.
-- Le domande del quiz NON sono qui (le risposte non vanno nel repository pubblico): si caricano dopo.
-- Le migrazioni successive (${String(Number(LAST) + 1).padStart(3, '0')} in poi) vanno eseguite dopo questo file.
-- =====================================================================================

-- le funzioni possono usare tabelle e funzioni definite più avanti nel file
set check_function_bodies = off;
`;
let current = null;
let count = 0;
for (const it of kept) {
  // login_locks (016) è stata sostituita da login_blocks (017): in un database nuovo non serve crearla e poi toglierla
  if (isQuizInsert(it.stmt) || isFunctionPrivilege(it.stmt) || /login_locks/.test(code(it.stmt))) continue;
  let stmt = it.stmt;
  if (it.file !== current) {
    current = it.file;
    stmt = stmt.replace(/^\s*-- =+[\s\S]*?-- =+\s*\n/, ''); // via l'intestazione del file originale
    out += `\n\n-- #####################################################################################\n-- ${it.file.slice(0, 3)} · ${title(it.file)}\n-- #####################################################################################\n`;
  }
  out += cleanComments(stmt).replace(/^\s*\n/, '\n');
  count++;
}

// Permessi delle funzioni, dal database di riferimento
const sig = (f) => `public.${f.sig}`;
const forApp = a.functions.filter((f) => /anon=X/.test(f.acl)).map(sig);
const unknown = a.functions.filter((f) => !/^(postgres=X\/postgres,service_role=X\/postgres|anon=X\/postgres,authenticated=X\/postgres,postgres=X\/postgres,service_role=X\/postgres)$/.test(f.acl));
if (unknown.length) throw new Error(`permessi inattesi: ${JSON.stringify(unknown)}`);
out += `

-- #####################################################################################
-- Permessi delle funzioni
-- #####################################################################################
-- Prima nessuna funzione è chiamabile dall'app; poi solo queste (${forApp.length}), che controllano da sole
-- chi le chiama (token del giocatore, ruolo Mod o Admin). Le altre (${a.functions.length - forApp.length}) sono interne.

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
${forApp.map((s) => `  ${s}`).join(',\n')}
to anon, authenticated;
`;
out = out.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
fs.writeFileSync(OUT, out);
const before = migrationFiles().reduce((s, f) => s + splitSql(fs.readFileSync(MIG + f, 'utf8')).length, 0);
console.log(`setup.sql: ${count + 3} istruzioni (prima ${before}), ${out.split('\n').length} righe`);

// Verifica
const db = await freshDb();
try {
  await db.exec(out);
} catch (e) {
  console.log('ERRORE eseguendo setup.sql:', e.message);
  process.exit(1);
}
const b = await snapshot(db, { skipData: ['quiz_questions'] });
const d = diff(a, b);
console.log(d.length ? d.slice(0, 40).join('\n') : `✅ setup.sql = migrazioni 001–${LAST} (struttura, funzioni, permessi, dati iniziali)`);
await db.exec(out);
const d2 = diff(b, await snapshot(db, { skipData: ['quiz_questions'] }));
console.log(d2.length ? `rieseguito: ${d2.length} differenze\n${d2.slice(0, 10).join('\n')}` : '✅ si può rieseguire senza cambiare nulla');
