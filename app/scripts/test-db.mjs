// Prova del database VERO (Supabase) con la chiave pubblica, come farebbe un telefono o un furbo:
// `npm run test:db` (legge app/.env.local). Crea giocatori di prova con nickname che iniziano per "zzt".
// Verifica i criteri di accettazione della Tappa 4 (docs/04-ROADMAP.md).

import fs from 'node:fs';
import crypto from 'node:crypto';

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
  return { status: r.status, body: await r.json().catch(() => null) };
}

const results = [];
function check(label, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`);
}

const suffix = crypto.randomBytes(3).toString('hex');
const nick = `zzt${suffix}`;
const device1 = crypto.randomUUID();
const device2 = crypto.randomUUID();
const device3 = crypto.randomUUID();

// ---------- Il client non può toccare le tabelle ----------
for (const table of ['players', 'devices', 'sessions', 'settings', 'login_failures', 'banned_words']) {
  const read = await fetch(`${BASE}/rest/v1/${table}?select=*`, { headers });
  check(`lettura diretta di "${table}" negata`, read.status >= 400, `HTTP ${read.status}`);
}
const insert = await fetch(`${BASE}/rest/v1/players`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ nickname: 'furbo', avatar: 'porcino', pin_hash: 'x' }),
});
check('scrittura diretta in "players" negata', insert.status >= 400, `HTTP ${insert.status}`);
const internal = await rpc('_session_player', { p_token: 'x'.repeat(64) });
check('funzioni interne (_...) non chiamabili', internal.status >= 400, `HTTP ${internal.status}`);

// ---------- Nickname ----------
check('nickname con spazi rifiutato', (await rpc('check_nickname', { p_nickname: 'Mario Rossi' })).body?.error === 'NICKNAME_INVALID');
check('nickname con parolaccia rifiutato', (await rpc('check_nickname', { p_nickname: 'xcazzox' })).body?.error === 'NICKNAME_NOT_ALLOWED');
check('"porcino" non scambiato per parolaccia', (await rpc('check_nickname', { p_nickname: `porcino${suffix}` })).body?.ok === true);

// Filtro bestemmie e insulti (migrazione 002): vietati...
const BLOCKED = ['PorcoDio', 'porco_dio', 'p0rc0', 'DioCane', 'diocane', 'Dio', 'dio2024', 'SonoDio', 'Il_Dio', 'DioPorco',
  'Madonna99', 'GesuCristo', 'PreteRosso', 'Il_Prete', 'CristoRe', 'PorcaMiseria', 'nazista'];
// ...ma non le parole innocue che contengono le stesse lettere
const ALLOWED = ['Armadio', 'Claudio', 'Radio_Star', 'Studio54', 'Dionisio', 'Porcellino', 'Porcospino', 'Cristoforo',
  'Gesualdo', 'Interprete', 'Nazionale', 'Nazario', 'Negroni', 'Figaro'];
const blockedFails = [];
for (const name of BLOCKED) if ((await rpc('check_nickname', { p_nickname: name })).body?.error !== 'NICKNAME_NOT_ALLOWED') blockedFails.push(name);
check(`bestemmie e insulti rifiutati (${BLOCKED.length} casi)`, blockedFails.length === 0, blockedFails.length ? `passati: ${blockedFails.join(', ')}` : '');
const allowedFails = [];
for (const name of ALLOWED) {
  const r = (await rpc('check_nickname', { p_nickname: name })).body;
  if (r?.error === 'NICKNAME_NOT_ALLOWED') allowedFails.push(name);
}
check(`parole innocue ammesse (${ALLOWED.length} casi, es. Armadio, Claudio)`, allowedFails.length === 0, allowedFails.length ? `bloccati per errore: ${allowedFails.join(', ')}` : '');

// ---------- Registrazione ----------
const reg = await rpc('register', { p_nickname: nick, p_avatar: 'riccio', p_pin: '1234', p_device_id: device1, p_fingerprint: 'test', p_user_agent: 'test-db' });
check('registrazione riuscita', reg.body?.ok === true && reg.body.token?.length === 64, JSON.stringify(reg.body?.error ?? ''));
const token = reg.body?.token;

const again = await rpc('register', { p_nickname: `zzu${suffix}`, p_avatar: 'riccio', p_pin: '1234', p_device_id: device1 });
check('stesso telefono, secondo account → rifiutato', again.body?.error === 'DEVICE_ALREADY_USED' && again.body.nickname_hint === `${nick.slice(0, 3)}***`, JSON.stringify(again.body));

const dupe = await rpc('register', { p_nickname: nick.toUpperCase(), p_avatar: 'riccio', p_pin: '1234', p_device_id: device2 });
check('nickname già usato (maiuscole diverse) → rifiutato', dupe.body?.error === 'NICKNAME_TAKEN', JSON.stringify(dupe.body));
check('...e il telefono 2 resta libero (niente account a metà)', (await rpc('register', { p_nickname: `zzv${suffix}`, p_avatar: 'x', p_pin: '1234', p_device_id: device2 })).body?.error === 'AVATAR_INVALID');
check('PIN non di 4 cifre → rifiutato', (await rpc('register', { p_nickname: `zzw${suffix}`, p_avatar: 'riccio', p_pin: '12a4', p_device_id: device3 })).body?.error === 'PIN_INVALID');

// ---------- Profilo e sessione ----------
const profile = await rpc('get_my_profile', { p_token: token });
check('profilo con la chiave di sessione', profile.body?.ok === true && profile.body.player.nickname === nick && profile.body.player.avatar === 'riccio');
check('chiave falsa → non collegato', (await rpc('get_my_profile', { p_token: 'f'.repeat(64) })).body?.error === 'NOT_LOGGED_IN');

// ---------- Accesso da un altro telefono ----------
const login2 = await rpc('login', { p_nickname: nick.toUpperCase(), p_secret: '1234', p_device_id: device3 });
check('stesso account da un altro telefono con il PIN → consentito', login2.body?.ok === true);
const wrong = await rpc('login', { p_nickname: nick, p_secret: '0000', p_device_id: device3 });
check('PIN sbagliato → rifiutato con tentativi rimasti', wrong.body?.error === 'WRONG_CREDENTIALS' && wrong.body.attempts_left === 9, JSON.stringify(wrong.body));
check('PIN giusto dopo un errore → consentito (e azzera gli errori)', (await rpc('login', { p_nickname: nick, p_secret: '1234' })).body?.ok === true);

// ---------- Blocco dopo 10 PIN sbagliati ----------
const lockNick = `zzl${suffix}`;
await rpc('register', { p_nickname: lockNick, p_avatar: 'gufetto', p_pin: '4321', p_device_id: crypto.randomUUID() });
for (let i = 0; i < 10; i++) await rpc('login', { p_nickname: lockNick, p_secret: '0000' });
const locked = await rpc('login', { p_nickname: lockNick, p_secret: '4321' });
check('dopo 10 PIN sbagliati: bloccato anche con il PIN giusto', locked.body?.error === 'LOCKED' && locked.body.retry_after_s > 800, JSON.stringify(locked.body));

// ---------- Uscita ----------
await rpc('logout', { p_token: token });
check('dopo "Esci" la chiave non vale più', (await rpc('get_my_profile', { p_token: token })).body?.error === 'NOT_LOGGED_IN');
check('le altre sessioni (altro telefono) restano valide', (await rpc('get_my_profile', { p_token: login2.body?.token })).body?.ok === true);

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} controlli superati. Giocatori di prova: ${nick}, ${lockNick} (da cancellare prima della sagra).`);
process.exit(failed ? 1 : 0);
