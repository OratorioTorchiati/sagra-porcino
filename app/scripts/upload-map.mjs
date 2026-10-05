// Pubblica l'immagine della mappa sul database, come "📤 Carica una nuova mappa" delle Configurazioni (D136):
// `npm run map:upload` (la prima immagine in contenuti/mappa/) oppure `npm run map:upload -- percorso/immagine.png`.
// La rimpicciolisce (lato lungo al massimo 2000 px) e la comprime in WebP come fa il telefono dell'Admin.
// Legge app/.env.local (indirizzo, chiave pubblica e account Admin TEST_STAFF_*); la password non viene mai stampata.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

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
const rpc = async (name, params) => (await fetch(`${BASE}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(params) })).json().catch(() => null);

const dir = fileURLToPath(new URL('../../contenuti/mappa/', import.meta.url));
const file = process.argv[2] ?? path.join(dir, fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f)).sort()[0] ?? '');
if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
  console.error('Nessuna immagine: mettila in contenuti/mappa/ o passa il percorso.');
  process.exit(1);
}
const { data, info } = await sharp(file, { density: 150 })
  .flatten({ background: '#ffffff' })
  .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
  .webp({ quality: 80, effort: 6 })
  .toBuffer({ resolveWithObject: true });

if (!env.TEST_STAFF_NICKNAME || !env.TEST_STAFF_PASSWORD) {
  console.error('Mancano TEST_STAFF_NICKNAME / TEST_STAFF_PASSWORD in app/.env.local (account Admin).');
  process.exit(1);
}
const login = await rpc('login', { p_nickname: env.TEST_STAFF_NICKNAME, p_secret: env.TEST_STAFF_PASSWORD });
if (!login?.ok) {
  console.error(`Accesso non riuscito: ${login?.error ?? 'nessuna risposta'}`);
  process.exit(1);
}
const saved = await rpc('staff_set_map_image', {
  p_token: login.token, p_mime: 'image/webp', p_data: data.toString('base64'), p_width: info.width, p_height: info.height,
});
await rpc('logout', { p_token: login.token });
if (!saved?.ok) {
  console.error(`Mappa non pubblicata: ${saved?.error ?? 'nessuna risposta'}`);
  process.exit(1);
}
console.log(`Mappa pubblicata su ${new URL(BASE).host}: ${path.basename(file)} → ${info.width}×${info.height}, ${Math.round(data.length / 1024)} KB.`);
