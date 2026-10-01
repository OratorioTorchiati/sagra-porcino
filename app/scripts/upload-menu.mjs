// Pubblica un menù CSV sul database, come "📄 Carica file" del Pannello Admin (D120):
// `npm run menu:upload` (contenuti/menu.csv) oppure `npm run menu:upload -- percorso/del/file.csv`.
// Legge app/.env.local (indirizzo, chiave pubblica e account Admin TEST_STAFF_*); la password non viene mai stampata.
// I piatti segnati come terminati restano tali se hanno lo stesso nome nella stessa categoria (036).

import fs from 'node:fs';
import { parseMenuCsv } from './menu-csv.js';

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const BASE = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
const headers = { 'Content-Type': 'application/json', apikey: KEY, ...(KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${KEY}` }) };

async function rpc(name, params) {
  const r = await fetch(`${BASE}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(params) });
  return r.json().catch(() => null);
}

const file = process.argv[2] ?? new URL('../../contenuti/menu.csv', import.meta.url);
let menu;
try {
  menu = parseMenuCsv(fs.readFileSync(file, 'utf8'));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (!env.TEST_STAFF_NICKNAME || !env.TEST_STAFF_PASSWORD) {
  console.error('Mancano TEST_STAFF_NICKNAME / TEST_STAFF_PASSWORD in app/.env.local (account Admin).');
  process.exit(1);
}
const login = await rpc('login', { p_nickname: env.TEST_STAFF_NICKNAME, p_secret: env.TEST_STAFF_PASSWORD });
if (!login?.ok) {
  console.error(`Accesso non riuscito: ${login?.error ?? 'nessuna risposta'}`);
  process.exit(1);
}

const saved = await rpc('staff_set_menu', { p_token: login.token, p_menu: { categories: menu.categories } });
await rpc('logout', { p_token: login.token }).catch(() => null);
if (!saved?.ok) {
  console.error(`Menù non pubblicato: ${saved?.error ?? 'nessuna risposta'}`);
  process.exit(1);
}
console.log(`Menù pubblicato su ${new URL(BASE).host}: ${menu.categories.length} categorie, ${saved.dishes} piatti.`);
