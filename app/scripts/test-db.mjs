// Prova del database VERO (Supabase) con la chiave pubblica, come farebbe un telefono o un furbo:
// `npm run test:db` (legge app/.env.local). Crea giocatori di prova con nickname che iniziano per "zzt".
// Verifica i criteri di accettazione della Tappa 4 (docs/04-ROADMAP.md).

import fs from 'node:fs';
import crypto from 'node:crypto';
import acchiappaConfig from '../src/games/acchiappa/config.js';
import { applyHit, initialScoreState } from '../src/games/acchiappa/scoring.js';

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

// =====================================================================================
// Tappa 5: tentativi e punteggi (serve la migrazione 003)
// =====================================================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t5Nick = `zzg${suffix}`;
const t5 = await rpc('register', { p_nickname: t5Nick, p_avatar: 'scoiattolo', p_pin: '5555', p_device_id: crypto.randomUUID() });
const t5Token = t5.body?.token;

const publicState = await rpc('get_games_state', { p_token: null });
check('stato dei giochi visibile senza account (4 giochi, niente dati personali)',
  publicState.body?.ok === true && publicState.body.games?.length === 4 && publicState.body.games.every((g) => g.attempts_used_today === null));
check('avviare un gioco senza account → rifiutato', (await rpc('start_attempt', { p_token: null, p_game_id: 'acchiappa' })).body?.error === 'NOT_LOGGED_IN');

const perDay = publicState.body?.attempts_per_day ?? 3;
const starts = [];
for (let i = 0; i < perDay; i++) starts.push((await rpc('start_attempt', { p_token: t5Token, p_game_id: 'acchiappa' })).body);
const acchiappaStartedAt = Date.now();
check(`${perDay} tentativi al giorno concessi, con i rimasti che scendono`,
  starts.every((s) => s?.ok) && starts.map((s) => s.attempts_left).join(',') === [...Array(perDay).keys()].map((i) => perDay - 1 - i).join(','),
  starts.map((s) => s?.attempts_left).join(','));
const over = (await rpc('start_attempt', { p_token: t5Token, p_game_id: 'acchiappa' })).body;
check(`${perDay + 1}° tentativo nello stesso giorno → rifiutato`, over?.error === 'NO_ATTEMPTS_LEFT', JSON.stringify(over));
const stateAfter = (await rpc('get_games_state', { p_token: t5Token })).body;
check('lo stato mostra i tentativi usati oggi', stateAfter?.games?.find((g) => g.id === 'acchiappa')?.attempts_used_today === perDay);

// Punteggio inventato ("ho fatto 5000") → escluso
const fake = (await rpc('submit_score', { p_attempt_id: starts[0].attempt_id, p_raw_score: 5000, p_stats: { durationMs: 60000 }, p_actions: [] })).body;
check('punteggio inventato (5000 senza azioni) → escluso', fake?.status === 'rejected' && fake.raw_score === 0, JSON.stringify(fake));
const resubmit = (await rpc('submit_score', { p_attempt_id: starts[0].attempt_id, p_raw_score: 10, p_stats: { durationMs: 60000 }, p_actions: [] })).body;
check('reinvio dello stesso tentativo → nessun doppione (resta il primo esito)', resubmit?.status === 'rejected' && resubmit.raw_score === 0);
check('tentativo inesistente → rifiutato', (await rpc('submit_score', { p_attempt_id: crypto.randomUUID(), p_raw_score: 0, p_stats: {}, p_actions: [] })).body?.error === 'ATTEMPT_UNKNOWN');

// Memory: partita coerente (valida) e partita "perfetta" in 8 mosse (segnalata)
function memoryActions(moves, lastMs) {
  const actions = [[0, 'start']];
  const pairs = 8;
  const mismatches = moves - pairs;
  let ms = 500;
  const step = (lastMs - 500) / (moves * 2);
  for (let i = 0; i < mismatches; i++) {
    actions.push([Math.round(ms), 'flip', 0, 'a', 'first']); ms += step;
    actions.push([Math.round(ms), 'flip', 1, 'b', 'mismatch']); ms += step;
  }
  for (let i = 0; i < pairs; i++) {
    actions.push([Math.round(ms), 'flip', i * 2, `c${i}`, 'first']); ms += step;
    actions.push([i === pairs - 1 ? lastMs : Math.round(ms), 'flip', i * 2 + 1, `c${i}`, 'match']); ms += step;
  }
  return actions;
}
const mem1 = (await rpc('start_attempt', { p_token: t5Token, p_game_id: 'memory' })).body;
const mem2 = (await rpc('start_attempt', { p_token: t5Token, p_game_id: 'memory' })).body;
const tooSoon = (await rpc('submit_score', { p_attempt_id: mem2.attempt_id, p_raw_score: 942, p_stats: { durationMs: 6000 }, p_actions: memoryActions(10, 6000) })).body;
check('partita inviata prima del tempo reale necessario → esclusa', tooSoon?.status === 'rejected', JSON.stringify(tooSoon));
await sleep(6500);
const good = (await rpc('submit_score', { p_attempt_id: mem1.attempt_id, p_raw_score: 942, p_stats: { durationMs: 6000 }, p_actions: memoryActions(10, 6000) })).body;
check('Memory coerente (10 mosse, 6 s) → valida con punteggio ricalcolato 942', good?.status === 'valid' && good.raw_score === 942, JSON.stringify(good));
const mem3 = (await rpc('start_attempt', { p_token: t5Token, p_game_id: 'memory' })).body;
await sleep(6500);
const perfect = (await rpc('submit_score', { p_attempt_id: mem3.attempt_id, p_raw_score: 982, p_stats: { durationMs: 6000 }, p_actions: memoryActions(8, 6000) })).body;
check('Memory perfetto in 8 mosse → contato ma segnalato allo staff', perfect?.status === 'flagged' && perfect.raw_score === 982, JSON.stringify(perfect));
const wrongScore = (await rpc('start_attempt', { p_token: t5Token, p_game_id: 'cadono' })).body;
const lie = (await rpc('submit_score', { p_attempt_id: wrongScore.attempt_id, p_raw_score: 999, p_stats: { durationMs: 1000 }, p_actions: [[500, 'catch', 'bomb', 100, 100], [700, 'catch', 'bomb', 100, 100], [900, 'catch', 'bomb', 100, 100]] })).body;
check('Porcini che cadono: punteggio dichiarato diverso da quello delle azioni → escluso', lie?.status === 'rejected' && lie.raw_score === 0, JSON.stringify(lie));
check('vale il migliore tra i tentativi validi', perfect?.best === 982);

// Quiz: domande dal server SENZA risposta giusta; il punteggio lo calcola il server
const quiz = (await rpc('start_attempt', { p_token: t5Token, p_game_id: 'quiz' })).body;
check('quiz: 5 domande dal server, senza la risposta giusta', quiz?.ok && quiz.questions?.length === 5 && quiz.questions.every((q) => q.options.length === 4 && !('correct_index' in q) && !('correct' in q)), JSON.stringify(quiz?.questions?.[0]));
await sleep(3000);
const answers = quiz.questions.map((q) => ({ questionId: q.id, choice: 0, ms: 500 }));
const quizResult = (await rpc('submit_score', { p_attempt_id: quiz.attempt_id, p_raw_score: 1000, p_stats: { durationMs: 2500, answers }, p_actions: [] })).body;
check('quiz: il punteggio dichiarato dal telefono viene ignorato e ricalcolato', quizResult?.ok && quizResult.raw_score === quizResult.correct * 199 && quizResult.total === 5, // giusta in 0,5 s = 150 + 49
  `giuste ${quizResult?.correct}, punti ${quizResult?.raw_score}`);

// Acchiappa: il server rifà il punteggio col moltiplicatore a tempo esattamente come l'app (scoring.js).
// Serie con salite, scadenze (×4 → ×3 → ×2 → ×1), un errore e ripartenze; serve un minuto vero dall'avvio.
if (starts[1]?.attempt_id && perDay >= 2) {
  const taps = [];
  let ms = 800;
  const gaps = [310, 420, 530, 370, 460, 610, 340]; // intervalli irregolari (niente segnalazione "troppo regolari")
  for (let i = 0; i < 90; i++) {
    ms += gaps[i % gaps.length] + (i === 25 || i === 55 ? 9000 : 0); // due pause lunghe: il moltiplicatore scade
    taps.push([ms, i === 70 ? 'bad' : 'good']);
  }
  let state = initialScoreState();
  const actions = [[0, 'start']];
  for (const [t, hit] of taps) {
    state = applyHit(state, hit, t, acchiappaConfig).state;
    actions.push([t, 'tap', 100, 200, hit, hit === 'good' ? 'estivo' : 'castagna', 420, 80, 5]);
  }
  const wait = 61000 - (Date.now() - acchiappaStartedAt);
  if (wait > 0) {
    console.log(`(attendo ${Math.ceil(wait / 1000)} s: una partita di Acchiappa dura un minuto vero)`);
    await sleep(wait);
  }
  const acc = (await rpc('submit_score', { p_attempt_id: starts[1].attempt_id, p_raw_score: state.score, p_stats: { durationMs: 60000 }, p_actions: actions })).body;
  check(`Acchiappa col moltiplicatore a tempo → valida, stesso punteggio dell'app (${state.score})`, acc?.status === 'valid' && acc.raw_score === state.score, JSON.stringify(acc));
}

// Classifica (007): totale = somma dei migliori per gioco, live con la versione, scheda di un giocatore
{
  const board = (await rpc('get_leaderboard', { p_token: t5Token, p_version: null })).body;
  const card = (await rpc('get_player_card', { p_nickname: t5Nick })).body;
  const best = card?.player?.best ?? {};
  const sum = Object.values(best).reduce((a, b) => a + b, 0);
  check('classifica: il mio totale è la somma dei migliori per gioco (senza normalizzare)', board?.ok && board.me?.total === sum && sum > 0, JSON.stringify(best));
  check('classifica: Memory conta il migliore (982, anche se segnalato), non la somma dei tentativi', best.memory === 982);
  check('classifica: ho una posizione e i primi sono in ordine di punti', board?.me?.position >= 1 && board.top.every((e, i, all) => i === 0 || all[i - 1].total >= e.total));
  check('classifica: pari punti = stessa posizione', board.top.every((e, i, all) => i === 0 || (e.total === all[i - 1].total) === (e.position === all[i - 1].position)));
  check('classifica: al massimo i primi 20 (più eventuali pari merito del 20°)', board.top.every((e) => e.position <= 20));
  const again = (await rpc('get_leaderboard', { p_token: t5Token, p_version: board.version })).body;
  check('classifica live: se non cambia nulla il server risponde solo "invariata"', again?.unchanged === true && !again.top);
  const guest = (await rpc('get_leaderboard', { p_token: null, p_version: null })).body;
  check('classifica visibile anche senza account (senza la riga "me")', guest?.ok && guest.me === null && Array.isArray(guest.top));
  check('scheda di un giocatore inesistente → non trovato', (await rpc('get_player_card', { p_nickname: 'zz-nessuno' })).body?.error === 'NOT_FOUND');
  const quiz2 = (await rpc('start_attempt', { p_token: t5Token, p_game_id: 'quiz' })).body;
  const afterStart = (await rpc('get_leaderboard', { p_token: t5Token, p_version: board.version })).body;
  check('avviare una partita non cambia la classifica (nessun ricaricamento per chi la guarda)', quiz2?.ok && afterStart?.unchanged === true, JSON.stringify(quiz2));
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} controlli superati. Giocatori di prova: ${nick}, ${lockNick}, ${t5Nick} (da cancellare prima della sagra).`);
process.exit(failed ? 1 : 0);
