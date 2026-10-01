// Prova del database VERO (Supabase) con la chiave pubblica, come farebbe un telefono o un furbo:
// `npm run test:db` (legge app/.env.local). Crea giocatori di prova con nickname che iniziano per "zzt".
// Verifica i criteri di accettazione della Tappa 4 (docs/04-ROADMAP.md).

import fs from 'node:fs';
import crypto from 'node:crypto';
import acchiappaConfig from '../src/games/acchiappa/config.js';
import { applyHit, gameEndMs, initialScoreState } from '../src/games/acchiappa/scoring.js';
import memoryConfig from '../src/games/memory/config.js';
import { memoryScore } from '../src/games/memory/logic.js';

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const BASE = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
// Crea giocatori di prova: mai sul progetto di produzione
if (!BASE || BASE.includes('qasriofmaclcbppclmzz')) {
  console.error('app/.env.local punta al progetto di PRODUZIONE (o a nessuno): la prova del database gira solo su sviluppo.');
  process.exit(1);
}
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
const reg = await rpc('register', { p_nickname: nick, p_avatar: 'riccio', p_pin: '24680', p_device_id: device1, p_fingerprint: 'test', p_user_agent: 'test-db' });
check('registrazione riuscita', reg.body?.ok === true && reg.body.token?.length === 64, JSON.stringify(reg.body?.error ?? ''));
const token = reg.body?.token;

const again = await rpc('register', { p_nickname: `zzu${suffix}`, p_avatar: 'riccio', p_pin: '24680', p_device_id: device1 });
check('stesso telefono, secondo account → rifiutato', again.body?.error === 'DEVICE_ALREADY_USED' && again.body.nickname_hint === `${nick.slice(0, 3)}***`, JSON.stringify(again.body));

const dupe = await rpc('register', { p_nickname: nick.toUpperCase(), p_avatar: 'riccio', p_pin: '24680', p_device_id: device2 });
check('nickname già usato (maiuscole diverse) → rifiutato', dupe.body?.error === 'NICKNAME_TAKEN', JSON.stringify(dupe.body));
check('...e il telefono 2 resta libero (niente account a metà)', (await rpc('register', { p_nickname: `zzv${suffix}`, p_avatar: 'x', p_pin: '24680', p_device_id: device2 })).body?.error === 'AVATAR_INVALID');
check('PIN non di 5 cifre → rifiutato', (await rpc('register', { p_nickname: `zzw${suffix}`, p_avatar: 'riccio', p_pin: '12a45', p_device_id: device3 })).body?.error === 'PIN_INVALID');
check('PIN di 4 cifre per un nuovo account → rifiutato', (await rpc('register', { p_nickname: `zzw${suffix}`, p_avatar: 'riccio', p_pin: '7391', p_device_id: device3 })).body?.error === 'PIN_INVALID');
for (const simple of ['00000', '12345', '98765']) {
  check(`PIN troppo semplice (${simple}) → rifiutato`, (await rpc('register', { p_nickname: `zzw${suffix}`, p_avatar: 'riccio', p_pin: simple, p_device_id: device3 })).body?.error === 'PIN_TOO_SIMPLE');
}

// ---------- Profilo e sessione ----------
const profile = await rpc('get_my_profile', { p_token: token });
check('profilo con la chiave di sessione', profile.body?.ok === true && profile.body.player.nickname === nick && profile.body.player.avatar === 'riccio');
check('chiave falsa → non collegato', (await rpc('get_my_profile', { p_token: 'f'.repeat(64) })).body?.error === 'NOT_LOGGED_IN');

// ---------- Cambio del personaggio dal profilo (020) ----------
const newAvatar = await rpc('set_avatar', { p_token: token, p_avatar: 'ovolaccio' });
check('cambio del personaggio (anche un velenoso)', newAvatar.body?.ok === true && newAvatar.body.player.avatar === 'ovolaccio', JSON.stringify(newAvatar.body));
check('personaggio che non esiste → rifiutato', (await rpc('set_avatar', { p_token: token, p_avatar: 'drago' })).body?.error === 'AVATAR_INVALID');
check('cambio del personaggio senza sessione → rifiutato', (await rpc('set_avatar', { p_token: null, p_avatar: 'riccio' })).body?.error === 'NOT_LOGGED_IN');

// ---------- Accesso da un altro telefono ----------
const login2 = await rpc('login', { p_nickname: nick.toUpperCase(), p_secret: '24680', p_device_id: device3 });
check('stesso account da un altro telefono con il PIN → consentito', login2.body?.ok === true);
const wrong = await rpc('login', { p_nickname: nick, p_secret: '0000', p_device_id: device3 });
check('PIN sbagliato → rifiutato con tentativi rimasti', wrong.body?.error === 'WRONG_CREDENTIALS' && wrong.body.attempts_left === 4, JSON.stringify(wrong.body));
check('PIN giusto dopo un errore → consentito (e azzera gli errori)', (await rpc('login', { p_nickname: nick, p_secret: '24680' })).body?.ok === true);

// ---------- 5 tentativi per nickname + IP, poi blocco che cresce (1, 5, 15, 60 minuti) ----------
const lockNick = `zzl${suffix}`;
await rpc('register', { p_nickname: lockNick, p_avatar: 'gufetto', p_pin: '27182', p_device_id: crypto.randomUUID() });
const lefts = [];
for (let i = 0; i < 4; i++) lefts.push((await rpc('login', { p_nickname: lockNick, p_secret: '00000' })).body?.attempts_left);
check('PIN sbagliati: tentativi rimasti 4, 3, 2, 1', lefts.join() === '4,3,2,1', lefts.join());
const fifth = (await rpc('login', { p_nickname: lockNick, p_secret: '00000' })).body;
check('5° PIN sbagliato → bloccato per 1 minuto', fifth?.error === 'LOCKED' && fifth.retry_after_s > 50 && fifth.retry_after_s <= 60, JSON.stringify(fifth));
const locked = await rpc('login', { p_nickname: lockNick, p_secret: '27182' });
check('bloccato anche con il PIN giusto', locked.body?.error === 'LOCKED', JSON.stringify(locked.body));
const lockedAt = Date.now();
// Pochi PIN sbagliati apposta (circa 11 a prova): il tetto di 50 errori in un'ora per IP (017) scatterebbe
// anche per chi lancia la prova, se la si ripete molte volte di fila.
const ghost = (await rpc('login', { p_nickname: `zzq${suffix}`, p_secret: '00000' })).body;
check('nickname che non esiste: stessa risposta di un PIN sbagliato', ghost?.error === 'WRONG_CREDENTIALS' && ghost.attempts_left === 4, JSON.stringify(ghost));

// ---------- Uscita ----------
await rpc('logout', { p_token: token });
check('dopo "Esci" la chiave non vale più', (await rpc('get_my_profile', { p_token: token })).body?.error === 'NOT_LOGGED_IN');
check('le altre sessioni (altro telefono) restano valide', (await rpc('get_my_profile', { p_token: login2.body?.token })).body?.ok === true);

// =====================================================================================
// Tappa 5: tentativi e punteggi (serve la migrazione 003)
// =====================================================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t5Nick = `zzg${suffix}`;
const t5 = await rpc('register', { p_nickname: t5Nick, p_avatar: 'scoiattolo', p_pin: '55155', p_device_id: crypto.randomUUID() });
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
check('all\'avvio il server manda la durata della partita (decisa dall\'Admin)', Number.isInteger(starts[0]?.duration_s) && starts[0].duration_s > 0, JSON.stringify(starts[0]?.duration_s));
const over = (await rpc('start_attempt', { p_token: t5Token, p_game_id: 'acchiappa' })).body;
check(`${perDay + 1}° tentativo nello stesso giorno → rifiutato`, over?.error === 'NO_ATTEMPTS_LEFT', JSON.stringify(over));
const stateAfter = (await rpc('get_games_state', { p_token: t5Token })).body;
check('lo stato mostra i tentativi usati oggi', stateAfter?.games?.find((g) => g.id === 'acchiappa')?.attempts_used_today === perDay);

// Punteggio inventato ("ho fatto 5000") → escluso
const fake = (await rpc('submit_score', { p_attempt_id: starts[0].attempt_id, p_raw_score: 5000, p_stats: { durationMs: 60000 }, p_actions: [] })).body;
check('punteggio inventato (5000 senza azioni) → escluso', fake?.status === 'rejected' && fake.raw_score === 0, JSON.stringify(fake));
const resubmit = (await rpc('submit_score', { p_attempt_id: starts[0].attempt_id, p_raw_score: 10, p_stats: { durationMs: 60000 }, p_actions: [] })).body;
check('reinvio dello stesso tentativo → nessun doppione (resta il primo esito)', resubmit?.status === 'rejected' && resubmit.raw_score === 0, JSON.stringify(resubmit));
const stateAfterFake = (await rpc('get_games_state', { p_token: t5Token })).body;
check('...e il tentativo resta usato', stateAfterFake?.games?.find((g) => g.id === 'acchiappa')?.attempts_used_today === perDay);
check('tentativo inesistente → rifiutato', (await rpc('submit_score', { p_attempt_id: crypto.randomUUID(), p_raw_score: 0, p_stats: {}, p_actions: [] })).body?.error === 'ATTEMPT_UNKNOWN');

// Memory: partita coerente (valida) e partita "perfetta" (tante mosse quante coppie: segnalata)
function memoryActions(moves, lastMs) {
  const actions = [[0, 'start']];
  const pairs = memPairs;
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
// Durata e step (coppie, domande) come li ha impostati l'Admin (D99, D104, D107): niente numeri fissi, i punteggi
// attesi si calcolano da qui con le stesse formule dell'app
const gamesNow = (await rpc('get_games_state', { p_token: t5Token })).body.games;
const memGame = gamesNow.find((g) => g.id === 'memory');
const memDur = memGame.duration_s;
const memPairs = memGame.steps;
const quizGame = gamesNow.find((g) => g.id === 'quiz');
const quizN = quizGame.steps;
// partita del Memory finita in 0,75 s a coppia (sopra il limite umano di 0,6 s a coppia)
const MEM_MS = memPairs * 750;
const memScore = (moves) =>
  memoryScore({ completed: true, seconds: Math.round(MEM_MS / 100) / 10, moves, pairs: memPairs }, { ...memoryConfig, pairs: memPairs, durationS: memDur });
const MEM_GOOD = memScore(memPairs + 2);
const MEM_PERFECT = memScore(memPairs);
const mem1 = (await rpc('start_attempt', { p_token: t5Token, p_game_id: 'memory' })).body;
const mem2 = (await rpc('start_attempt', { p_token: t5Token, p_game_id: 'memory' })).body;
const tooSoon = (await rpc('submit_score', { p_attempt_id: mem2.attempt_id, p_raw_score: MEM_GOOD, p_stats: { durationMs: MEM_MS + 5000 }, p_actions: memoryActions(memPairs + 2, MEM_MS) })).body;
check('partita inviata prima del tempo reale necessario → esclusa', tooSoon?.status === 'rejected', JSON.stringify(tooSoon));
await sleep(MEM_MS + 500);
const good = (await rpc('submit_score', { p_attempt_id: mem1.attempt_id, p_raw_score: MEM_GOOD, p_stats: { durationMs: MEM_MS }, p_actions: memoryActions(memPairs + 2, MEM_MS) })).body;
check(`Memory coerente (${memPairs + 2} mosse per ${memPairs} coppie, ${MEM_MS / 1000} s su ${memDur}) → valida con punteggio ricalcolato ${MEM_GOOD}`, good?.status === 'valid' && good.raw_score === MEM_GOOD, JSON.stringify(good));
const mem3 = (await rpc('start_attempt', { p_token: t5Token, p_game_id: 'memory' })).body;
await sleep(MEM_MS + 500);
const perfect = (await rpc('submit_score', { p_attempt_id: mem3.attempt_id, p_raw_score: MEM_PERFECT, p_stats: { durationMs: MEM_MS }, p_actions: memoryActions(memPairs, MEM_MS) })).body;
check(`Memory perfetto (${memPairs} mosse) → contato ma segnalato allo staff`, perfect?.status === 'flagged' && perfect.raw_score === MEM_PERFECT, JSON.stringify(perfect));
const wrongScore = (await rpc('start_attempt', { p_token: t5Token, p_game_id: 'cadono' })).body;
const lie = (await rpc('submit_score', { p_attempt_id: wrongScore.attempt_id, p_raw_score: 999, p_stats: { durationMs: 1000 }, p_actions: [[500, 'catch', 'bomb', 100, 100], [700, 'catch', 'bomb', 100, 100], [900, 'catch', 'bomb', 100, 100]] })).body;
check('Porcini che cadono: punteggio dichiarato diverso da quello delle azioni → escluso', lie?.status === 'rejected' && lie.raw_score === 0, JSON.stringify(lie));
check('vale il migliore tra i tentativi validi', perfect?.best === MEM_PERFECT);

// Quiz: domande dal server SENZA risposta giusta; il punteggio lo calcola il server
const quiz = (await rpc('start_attempt', { p_token: t5Token, p_game_id: 'quiz' })).body;
check(`quiz: ${quizN} domande dal server, senza la risposta giusta`, quiz?.ok && quiz.questions?.length === quizN && quiz.questions.every((q) => q.options.length === 4 && !('correct_index' in q) && !('correct' in q)), JSON.stringify(quiz?.questions?.[0]));
await sleep(3000);
const answers = quiz.questions.map((q) => ({ questionId: q.id, choice: 0, ms: 500 }));
const quizResult = (await rpc('submit_score', { p_attempt_id: quiz.attempt_id, p_raw_score: 1000, p_stats: { durationMs: 2500, answers }, p_actions: [] })).body;
check('quiz: il punteggio dichiarato dal telefono viene ignorato e ricalcolato', quizResult?.ok && quizResult.raw_score === quizResult.correct * Math.round((750 + 250 * (1 - 500 / (quizGame.duration_s * 1000 / quizN))) / quizN) && quizResult.total === quizN, // giusta in 0,5 s: (750 + 250 × velocità) / domande
  `giuste ${quizResult?.correct}, punti ${quizResult?.raw_score}`);

// Acchiappa: il server rifà il punteggio col moltiplicatore a tempo esattamente come l'app (scoring.js).
// Serie con salite, ricariche, scadenze (×4 → ×3 → ×2 → ×1), oggetti, un fungo velenoso e ripartenze;
// serve un minuto vero dall'avvio.
if (starts[1]?.attempt_id && perDay >= 2) {
  const taps = [];
  let ms = 800;
  const gaps = [310, 420, 530, 370, 460, 610, 340]; // intervalli irregolari (niente segnalazione "troppo regolari")
  for (let i = 0; i < 90; i++) {
    ms += gaps[i % gaps.length] + (i === 25 || i === 55 ? 9000 : 0); // due pause lunghe: il moltiplicatore scade
    taps.push([ms, i === 70 ? 'poison' : i === 18 || i === 40 ? 'object' : 'good']);
  }
  let state = initialScoreState();
  let endMs = starts[1].duration_s * 1000; // durata decisa dall'Admin; ogni oggetto toglie 2 s alla partita
  const actions = [[0, 'start']];
  const KIND = { good: 'estivo', poison: 'riccio', object: 'castagna' };
  for (const [t, hit] of taps) {
    if (t >= endMs) break;
    state = applyHit(state, hit, t, acchiappaConfig).state;
    if (hit === 'object') endMs = gameEndMs(endMs, t, acchiappaConfig);
    actions.push([t, 'tap', 100, 200, hit === 'good' ? 'good' : 'bad', KIND[hit], 420, 80, 5]);
  }
  const wait = starts[1].duration_s * 1000 + 1000 - (Date.now() - acchiappaStartedAt);
  if (wait > 0) {
    console.log(`(attendo ${Math.ceil(wait / 1000)} s: una partita di Acchiappa dura davvero ${starts[1].duration_s} s)`);
    await sleep(wait);
  }
  const acc = (await rpc('submit_score', { p_attempt_id: starts[1].attempt_id, p_raw_score: state.score, p_stats: { durationMs: endMs }, p_actions: actions })).body;
  check(`Acchiappa col moltiplicatore a tempo → valida, stesso punteggio dell'app (${state.score})`, acc?.status === 'valid' && acc.raw_score === state.score, JSON.stringify(acc));
  if (starts[2]?.attempt_id) {
    const centered = actions.map((a) => (a[1] === 'tap' ? [...a.slice(0, 8), 0] : a)); // distanza dal centro 0 px
    const bot = (await rpc('submit_score', { p_attempt_id: starts[2].attempt_id, p_raw_score: state.score, p_stats: { durationMs: endMs }, p_actions: centered })).body;
    check('Acchiappa con tocchi sempre al centro esatto → segnalata (possibile bot)', bot?.status === 'flagged', JSON.stringify(bot));
  }
}

// Blocco che cresce (016): finito il primo blocco (1 minuto), altri 5 errori → 5 minuti
{
  const wait = 61000 - (Date.now() - lockedAt);
  if (wait > 0) {
    console.log(`(attendo ${Math.ceil(wait / 1000)} s: finisce il primo blocco)`);
    await sleep(wait);
  }
  let last;
  for (let i = 0; i < 5; i++) last = (await rpc('login', { p_nickname: lockNick, p_secret: '00000' })).body;
  check('secondo blocco → 5 minuti', last?.error === 'LOCKED' && last.retry_after_s > 280 && last.retry_after_s <= 300, JSON.stringify(last));
}

// Classifica (007): totale = somma dei migliori per gioco, live con la versione, scheda di un giocatore
{
  const board = (await rpc('get_leaderboard', { p_token: t5Token, p_version: null })).body;
  const card = (await rpc('get_player_card', { p_nickname: t5Nick })).body;
  const best = card?.player?.best ?? {};
  const sum = Object.values(best).reduce((a, b) => a + b, 0);
  check('classifica: il mio totale è la somma dei migliori per gioco (senza normalizzare)', board?.ok && board.me?.total === sum && sum > 0, JSON.stringify(best));
  check(`classifica: Memory conta il migliore (${MEM_PERFECT}, anche se segnalato), non la somma dei tentativi`, best.memory === MEM_PERFECT);
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

// Pannello staff (008): un giocatore normale (o senza sessione) non può usare nessuna funzione staff
{
  const calls = [
    ['staff_search_players', { p_query: '' }], ['staff_player_detail', { p_nickname: t5Nick }],
    ['staff_reset_pin', { p_nickname: t5Nick, p_new_pin: '0000' }], ['staff_set_disabled', { p_nickname: t5Nick, p_disabled: true }],
    ['staff_delete_player', { p_nickname: t5Nick, p_confirm: t5Nick }], ['staff_add_extra_points', { p_nickname: t5Nick, p_points: 999, p_reason: 'furbo' }],
    ['staff_delete_extra_points', { p_id: 1 }], ['staff_review_list', { p_status: 'flagged' }],
    ['staff_set_attempt_status', { p_attempt_id: crypto.randomUUID(), p_status: 'valid' }], ['staff_suspicious_devices', {}],
    ['staff_get_settings', {}], ['staff_update_settings', { p_values: { attempts_per_day: 99 } }], ['staff_leaderboard', {}], ['staff_log_list', {}],
    ['staff_attempt_replay', { p_attempt_id: crypto.randomUUID() }], ['staff_ban_player', { p_attempt_id: crypto.randomUUID() }], ['staff_confirm_exclusion', { p_attempt_id: crypto.randomUUID() }],
    ['staff_ban_device', { p_device_id: crypto.randomUUID(), p_ban: true }], ['staff_banned_devices', {}],
    ['staff_player_accesses', { p_nickname: t5Nick }], ['staff_client_ip', {}],
  ];
  const denied = [];
  for (const [name, params] of calls) {
    for (const token of [t5Token, null]) {
      const res = (await rpc(name, { p_token: token, ...params })).body;
      if (res?.error !== 'NOT_STAFF') denied.push(`${name}(${token ? 'giocatore' : 'senza sessione'}): ${JSON.stringify(res)}`);
    }
  }
  check(`pannello staff: un giocatore normale o senza sessione riceve NOT_STAFF da tutte le ${calls.length} funzioni`, denied.length === 0, denied.join(' | '));
  const stillThere = (await rpc('login', { p_nickname: t5Nick, p_secret: '55155' })).body;
  check('...e i tentativi del giocatore non hanno cambiato nulla (PIN e account intatti)', stillThere?.ok === true);
}

// Pannello staff con un account staff di prova (facoltativo): TEST_STAFF_NICKNAME e TEST_STAFF_PASSWORD in app/.env.local
if (env.TEST_STAFF_NICKNAME && env.TEST_STAFF_PASSWORD) {
  const staffLogin = (await rpc('login', { p_nickname: env.TEST_STAFF_NICKNAME, p_secret: env.TEST_STAFF_PASSWORD })).body;
  // L'account di prova "staff" è l'Admin (021): può tutto, anche Configurazioni e Registro
  check('staff: accesso con nickname + password (Admin)', staffLogin?.ok && staffLogin.player.role === 'admin', staffLogin?.error);
  const S = staffLogin?.token;
  const staff = async (name, params = {}) => (await rpc(`staff_${name}`, { p_token: S, ...params })).body;

  // IP visto dal server (017): c'è, e non si falsifica aggiungendo intestazioni alla richiesta
  const ipSeen = await staff('client_ip');
  const withHeaders = (extra) =>
    fetch(`${BASE}/rest/v1/rpc/staff_client_ip`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify({ p_token: S }) });
  const spoofed = await (await withHeaders({ 'X-Forwarded-For': '203.0.113.7', 'X-Real-IP': '203.0.113.9' })).json().catch(() => null);
  const fakeCloudflare = await withHeaders({ 'CF-Connecting-IP': '203.0.113.8' });
  check('il server vede l\'IP di chi fa la richiesta', ipSeen?.ok && ipSeen.ip && ipSeen.ip !== '?');
  check('...e non si può falsificare con X-Forwarded-For o X-Real-IP', spoofed?.ip === ipSeen?.ip);
  check('...né con un CF-Connecting-IP finto (Cloudflare rifiuta la richiesta)', fakeCloudflare.status === 403, String(fakeCloudflare.status));

  const found = await staff('search_players', { p_query: t5Nick });
  check('staff: ricerca per nickname', found?.players?.[0]?.nickname === t5Nick && found.total >= 1);
  const empty = await staff('search_players', { p_query: '' });
  check('staff: senza ricerca nessun elenco', empty?.ok && empty.players.length === 0);
  const zz = await staff('search_players', { p_query: 'zz' });
  const zz2 = await staff('search_players', { p_query: 'zz', p_page: 1 });
  check('staff: risultati a pagine da 20', zz?.players.length === Math.min(20, zz.total) && zz.page_size === 20 &&
    (zz.total <= 20 || (zz2.players.length > 0 && !zz2.players.some((a) => zz.players.some((b) => b.nickname === a.nickname)))),
    `totale ${zz?.total}`);
  const detail = await staff('player_detail', { p_nickname: t5Nick });
  check('staff: scheda con telefono, partite e punti', detail?.ok && detail.player.devices.length === 1 && detail.player.games.length === 4 && detail.player.card.total > 0);

  // Giocatore usa e getta per le azioni pesanti
  const vNick = `zzv${suffix}`;
  const vDevice = crypto.randomUUID();
  const v = (await rpc('register', { p_nickname: vNick, p_avatar: 'riccio', p_pin: '31415', p_device_id: vDevice })).body;
  const vStart = (await rpc('start_attempt', { p_token: v.token, p_game_id: 'memory' })).body;
  await sleep(MEM_MS + 500);
  await rpc('submit_score', { p_attempt_id: vStart.attempt_id, p_raw_score: MEM_GOOD, p_stats: { durationMs: MEM_MS }, p_actions: memoryActions(memPairs + 2, MEM_MS) });
  const reset = await staff('reset_pin', { p_nickname: vNick, p_new_pin: '27182' });
  const oldSession = (await rpc('get_my_profile', { p_token: v.token })).body;
  const newLogin = (await rpc('login', { p_nickname: vNick, p_secret: '27182' })).body;
  check('staff: reset PIN → il vecchio accesso si chiude, si entra col nuovo PIN', reset?.ok && oldSession?.ok === false && newLogin?.ok, JSON.stringify(reset));
  check('staff: PIN non di 5 cifre → rifiutato', (await staff('reset_pin', { p_nickname: vNick, p_new_pin: '1234' }))?.error === 'PIN_INVALID');
  check('staff: PIN troppo semplice → rifiutato', (await staff('reset_pin', { p_nickname: vNick, p_new_pin: '11111' }))?.error === 'PIN_TOO_SIMPLE');

  const cardBefore = (await rpc('get_player_card', { p_nickname: vNick })).body.player;
  await staff('add_extra_points', { p_nickname: vNick, p_points: 100, p_reason: 'prova' });
  const cardAfter = (await rpc('get_player_card', { p_nickname: vNick })).body.player;
  check('staff: punti extra +100 → totale in classifica +100', cardAfter.total === cardBefore.total + 100 && cardAfter.extra_total === 100, `${cardBefore.total} → ${cardAfter.total}`);
  const extraId = (await staff('player_detail', { p_nickname: vNick })).player.extra_points[0].id;
  await staff('delete_extra_points', { p_id: extraId });
  check('staff: togliere i punti extra → totale di prima', (await rpc('get_player_card', { p_nickname: vNick })).body.player.total === cardBefore.total);
  check('staff: punti extra senza motivo → rifiutati', (await staff('add_extra_points', { p_nickname: vNick, p_points: 5, p_reason: ' ' }))?.error === 'REASON_REQUIRED');

  await staff('set_disabled', { p_nickname: vNick, p_disabled: true });
  const disabledLogin = (await rpc('login', { p_nickname: vNick, p_secret: '27182' })).body;
  const boardDisabled = (await rpc('get_player_card', { p_nickname: vNick })).body;
  check('staff: disattivato → non entra e sparisce dalla classifica', disabledLogin?.error === 'DISABLED' && boardDisabled?.error === 'NOT_FOUND');
  await staff('set_disabled', { p_nickname: vNick, p_disabled: false });
  check('staff: riattivato → entra di nuovo', (await rpc('login', { p_nickname: vNick, p_secret: '27182' })).body?.ok === true);

  check('staff: cancellazione con nickname sbagliato → rifiutata', (await staff('delete_player', { p_nickname: vNick, p_confirm: 'altro' }))?.error === 'CONFIRM_MISMATCH');
  const del = await staff('delete_player', { p_nickname: vNick, p_confirm: vNick });
  const reRegister = (await rpc('register', { p_nickname: `zzw${suffix}`, p_avatar: 'riccio', p_pin: '31415', p_device_id: vDevice })).body;
  check('staff: cancellato → account sparito e il telefono può registrarsi di nuovo', del?.ok && (await staff('search_players', { p_query: vNick })).players.length === 0 && reRegister?.ok, JSON.stringify(reRegister));

  const flagged = await staff('review_list', { p_status: 'flagged' });
  const mine = flagged?.attempts?.find((a) => a.nickname === t5Nick);
  check('staff: la partita segnalata (Memory perfetto) è nella lista da controllare', Boolean(mine), JSON.stringify(flagged?.attempts?.slice(0, 2)));
  if (mine) {
    const approved = await staff('set_attempt_status', { p_attempt_id: mine.id, p_status: 'valid' });
    const after = await staff('review_list', {});
    const t5Card = (await rpc('get_player_card', { p_nickname: t5Nick })).body.player;
    check(`staff: partita approvata → esce dall'elenco e resta valida (Memory ${MEM_PERFECT})`, approved?.ok && !after.attempts.some((a) => a.id === mine.id) && t5Card.best.memory === MEM_PERFECT, JSON.stringify(t5Card.best));
    check('staff: "scartare" una partita non si può (si conferma l\'esclusione o si banna)', (await staff('set_attempt_status', { p_attempt_id: mine.id, p_status: 'rejected' }))?.error === 'STATUS_INVALID');
  }

  // Le partite escluse dal server restano in attesa di revisione (non contano)
  const review = await staff('review_list', {});
  const fakeRow = review?.attempts?.find((a) => a.id === starts[0].attempt_id);
  check('staff: anche le partite escluse dal server sono da rivedere (e non contano)', fakeRow?.status === 'rejected', JSON.stringify(review?.attempts?.slice(0, 2)));
  const confirmed = await staff('confirm_exclusion', { p_attempt_id: starts[0].attempt_id });
  const reviewAfter = await staff('review_list', {});
  const stateAfterExclusion = (await rpc('get_games_state', { p_token: t5Token })).body;
  check('staff: conferma esclusione → la partita sparisce, il tentativo resta usato',
    confirmed?.ok && !reviewAfter.attempts.some((a) => a.id === starts[0].attempt_id) &&
    stateAfterExclusion?.games?.find((g) => g.id === 'acchiappa')?.attempts_used_today === perDay, JSON.stringify(confirmed));

  // Ban: account e telefono bloccati, partita cancellata (solo lo staff)
  const xNick = `zzx${suffix}`;
  const xDevice = crypto.randomUUID();
  const x = (await rpc('register', { p_nickname: xNick, p_avatar: 'riccio', p_pin: '22122', p_device_id: xDevice })).body;
  const xStart = (await rpc('start_attempt', { p_token: x.token, p_game_id: 'memory' })).body;
  await sleep(MEM_MS + 500);
  const xRes = (await rpc('submit_score', { p_attempt_id: xStart.attempt_id, p_raw_score: MEM_PERFECT, p_stats: { durationMs: MEM_MS }, p_actions: memoryActions(memPairs, MEM_MS) })).body;
  const excluded = await staff('ban_player', { p_attempt_id: xStart.attempt_id });
  const xLogin = (await rpc('login', { p_nickname: xNick, p_secret: '22122' })).body;
  const xAgain = (await rpc('register', { p_nickname: `zzy${suffix}`, p_avatar: 'riccio', p_pin: '22122', p_device_id: xDevice })).body;
  const xList = await staff('review_list', {});
  check('staff: ban → non entra più, il telefono non può creare un altro account, la partita sparisce',
    xRes?.status === 'flagged' && excluded?.ok && xLogin?.error === 'DISABLED' && xAgain?.error === 'DEVICE_ALREADY_USED' && !xList.attempts.some((a) => a.id === xStart.attempt_id),
    JSON.stringify({ xRes: xRes?.status, excluded, xLogin: xLogin?.error, xAgain: xAgain?.error }));
  // Ban del telefono: da quel telefono non si entra con nessun account e non ci si registra
  const dNick = `zzd${suffix}`;
  const dDevice = crypto.randomUUID();
  const dOther = crypto.randomUUID();
  const d = (await rpc('register', { p_nickname: dNick, p_avatar: 'riccio', p_pin: '33833', p_device_id: dDevice })).body;
  const dBan = await staff('ban_device', { p_device_id: dDevice, p_ban: true });
  const dSession = (await rpc('get_my_profile', { p_token: d.token })).body;
  const dLogin = (await rpc('login', { p_nickname: dNick, p_secret: '33833', p_device_id: dDevice })).body;
  const friendLogin = (await rpc('login', { p_nickname: t5Nick, p_secret: '55155', p_device_id: dDevice })).body;
  const dRegister = (await rpc('register', { p_nickname: `zze${suffix}`, p_avatar: 'riccio', p_pin: '33833', p_device_id: dDevice })).body;
  const dElsewhere = (await rpc('login', { p_nickname: dNick, p_secret: '33833', p_device_id: dOther })).body;
  check('staff: ban telefono → da lì non si entra con nessun account (nemmeno di altri), non ci si registra, le sessioni si chiudono',
    dBan?.ok && dSession?.ok === false && dLogin?.error === 'DEVICE_BANNED' && friendLogin?.error === 'DEVICE_BANNED' && dRegister?.error === 'DEVICE_BANNED',
    JSON.stringify({ dSession: dSession?.error, dLogin: dLogin?.error, friendLogin: friendLogin?.error, dRegister: dRegister?.error }));
  check('staff: ...ma lo stesso account da un altro telefono entra (il ban è del telefono, non dell\'account)', dElsewhere?.ok === true);
  const dList = await staff('banned_devices');
  const dDetail = await staff('player_detail', { p_nickname: dNick });
  check('staff: il telefono bloccato è nell\'elenco e segnato nella scheda del giocatore', dList?.devices?.some((x) => x.device_id === dDevice && x.nickname === dNick) && dDetail?.player?.devices?.[0]?.banned === true);
  const dAccess = await staff('player_accesses', { p_nickname: dNick });
  check('staff: ultimi accessi (registrazione e login, anche dopo essere usciti), dal più recente',
    dAccess?.accesses?.length >= 2 && dAccess.accesses.length <= 20 && dAccess.accesses.some((a) => a.device_id === dOther && !a.registration) &&
    dAccess.accesses.some((a) => a.device_id === dDevice && a.registration) &&
    dAccess.accesses.every((a, i, all) => i === 0 || all[i - 1].created_at >= a.created_at), JSON.stringify(dAccess?.accesses?.length));
  const dOnlyOther = await staff('player_accesses', { p_nickname: dNick, p_device_id: dOther });
  check('staff: ultimi accessi di un solo telefono', dOnlyOther?.accesses?.length >= 1 && dOnlyOther.accesses.every((a) => a.device_id === dOther));
  await staff('ban_device', { p_device_id: dDevice, p_ban: false });
  check('staff: sbloccato → da quel telefono si entra di nuovo', (await rpc('login', { p_nickname: dNick, p_secret: '33833', p_device_id: dDevice })).body?.ok === true);

  check('staff: il giocatore bannato sparisce dalla classifica', (await rpc('get_player_card', { p_nickname: xNick })).body?.error === 'NOT_FOUND');

  const settings = await staff('get_settings');
  check('staff: impostazioni leggibili, con le sezioni dell\'app', settings?.ok && settings.games.length === 4 && Number.isInteger(settings.attempts_per_day) && typeof settings.sections?.menu === 'boolean' && typeof settings.sections?.giochi === 'boolean', JSON.stringify(settings?.sections));
  // Sezioni: si salvano gli stessi valori (spegnerle, anche per un attimo, si vedrebbe nell'app vera)
  const sameSections = await staff('update_settings', { p_values: { sections: settings.sections } });
  const appConfig = (await rpc('get_app_config')).body;
  check('Admin: salvare le sezioni; l\'app le legge anche senza account', sameSections?.ok && JSON.stringify(appConfig?.sections) === JSON.stringify(settings.sections), JSON.stringify(appConfig));
  check('Admin: sezione sconosciuta → rifiutata', (await staff('update_settings', { p_values: { sections: { casino: true } } }))?.error === 'SECTION_INVALID');
  const same = await staff('update_settings', { p_values: { attempts_per_day: settings.attempts_per_day, attempts_reset_hour: settings.attempts_reset_hour } });
  check('staff: salvare le impostazioni (stessi valori)', same?.ok === true, JSON.stringify(same));
  const badDate = await staff('update_settings', { p_values: { attempts_per_day: 7, games_open_until: 'domani' } });
  check('staff: data non valida → rifiutata senza cambiare nulla', badDate?.error === 'DATE_INVALID' && (await staff('get_settings')).attempts_per_day === settings.attempts_per_day, JSON.stringify(badDate));
  const board = await staff('leaderboard');
  const boardAll = await staff('leaderboard', { p_all: true });
  check('staff: classifica a pagine da 50, e tutta per il CSV', board?.ok && board.rows.length === Math.min(50, board.total) && boardAll.rows.length === board.total);
  const log = await staff('log_list');
  check('staff: le azioni finiscono nel registro', log?.entries?.some((e) => e.action === 'delete' && e.target === vNick));
  const logAccount = await staff('log_list', { p_action: 'account', p_staff: env.TEST_STAFF_NICKNAME });
  const logSettings = await staff('log_list', { p_action: 'settings' });
  check('staff: registro filtrato per tipo di azione e operatore', logAccount?.entries.length > 0 &&
    logAccount.entries.every((e) => ['disable', 'enable', 'delete'].includes(e.action) && e.staff === env.TEST_STAFF_NICKNAME) &&
    logSettings.entries.every((e) => e.action === 'settings'));
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  check('staff: registro filtrato per giorno', (await staff('log_list', { p_day: tomorrow }))?.total === 0);

  // Ruoli dal pannello (022): giocatore → Admin; un Admin normale non può declassare un altro Admin (solo il superadmin)
  const me = (await rpc('get_my_profile', { p_token: S })).body?.player;
  check('Admin: l\'account di prova è il superadmin', me?.superadmin === true, JSON.stringify(me));
  check('Admin: non si cambia il proprio ruolo', (await staff('set_role', { p_nickname: env.TEST_STAFF_NICKNAME, p_role: 'player' }))?.error === 'ROLE_SELF');
  const toAdmin = await staff('set_role', { p_nickname: t5Nick, p_role: 'admin' });
  const toAdmin2 = await staff('set_role', { p_nickname: lockNick, p_role: 'admin' });
  const t5Profile = (await rpc('get_my_profile', { p_token: t5Token })).body?.player;
  check('Admin: un giocatore diventa Admin (e la sua sessione lo vede)', toAdmin?.ok && toAdmin2?.ok && t5Profile?.role === 'admin', JSON.stringify(toAdmin));
  const byNormalAdmin = (await rpc('staff_set_role', { p_token: t5Token, p_nickname: lockNick, p_role: 'staff' })).body;
  check('Admin normale: non può declassare un altro Admin', byNormalAdmin?.error === 'ROLE_ONLY_SUPERADMIN', JSON.stringify(byNormalAdmin));
  const superByNormal = (await rpc('staff_set_role', { p_token: t5Token, p_nickname: env.TEST_STAFF_NICKNAME, p_role: 'player' })).body;
  check('Admin normale: il superadmin non si tocca', superByNormal?.error === 'ROLE_SUPERADMIN', JSON.stringify(superByNormal));
  const down = [await staff('set_role', { p_nickname: lockNick, p_role: 'staff' }), await staff('set_role', { p_nickname: lockNick, p_role: 'player' }),
    await staff('set_role', { p_nickname: t5Nick, p_role: 'player' })];
  check('superadmin: declassa Admin → Mod → giocatore', down.every((r) => r?.ok), JSON.stringify(down));
  const modTry = (await rpc('staff_get_settings', { p_token: t5Token })).body;
  check('ex Admin tornato giocatore: niente pannello', modTry?.error === 'NOT_STAFF', JSON.stringify(modTry));
  check('registro: i cambi di ruolo ci sono', (await staff('log_list', { p_action: 'role' }))?.entries?.some((e) => e.target === t5Nick && e.details?.to === 'player'));

  // Menù dal pannello (023): lettura per tutti; un menù non valido viene rifiutato (niente menù vero: cambierebbe l'app)
  const menuNow = (await rpc('get_menu')).body;
  check('menù: get_menu risponde anche senza account', menuNow?.ok === true);
  // Versione del menù (035, D118): la configurazione dell'app porta la data dell'ultimo menù pubblicato
  const menuVersionNow = (await rpc('get_app_config')).body?.menu_version;
  check('menù: get_app_config porta la versione del menù', menuVersionNow === (menuNow?.menu?.updated_at ?? null), String(menuVersionNow));
  if (menuNow?.menu?.categories) {
    // Ripubblicato uguale (i giocatori non vedono differenze): la versione deve cambiare
    const republished = await staff('set_menu', { p_menu: { categories: menuNow.menu.categories } });
    const menuVersionAfter = (await rpc('get_app_config')).body?.menu_version;
    check('menù: ripubblicarlo cambia la versione', republished?.ok && menuVersionAfter && menuVersionAfter !== menuVersionNow, String(menuVersionAfter));
  }
  const badMenu = await staff('set_menu', { p_menu: { categories: [{ name: 'Primi', dishes: [{ name: '', price: 'nove' }] }] } });
  check('menù: piatto senza nome e prezzo non numerico → rifiutato', badMenu?.error === 'MENU_INVALID', JSON.stringify(badMenu));
  // Piatti terminati (036, D119): solo l'Admin; un piatto che non c'è viene rifiutato (niente cambi al menù vero)
  check('menù: un giocatore non può segnare un piatto terminato', (await rpc('staff_set_dish_sold_out', { p_token: t5Token, p_category: 'Primi', p_dish: 'Tagliatelle', p_sold_out: true })).body?.error === 'NOT_STAFF');
  const noDish = await staff('set_dish_sold_out', { p_category: 'zz categoria', p_dish: 'zz piatto', p_sold_out: true });
  check('menù: piatto che non c\'è → rifiutato', noDish?.error === 'DISH_NOT_FOUND', JSON.stringify(noDish));
  check('menù: un giocatore non può caricarlo',(await rpc('staff_set_menu', { p_token: t5Token, p_menu: { categories: [] } })).body?.error === 'NOT_STAFF');
  // Impostazioni dei giochi (024): durata (si salva la stessa, per non cambiare i giochi veri), domande del quiz
  const memoryNow = settings.games.find((g) => g.id === 'memory');
  const sameDuration = await staff('set_game', { p_game_id: 'memory', p_seconds: memoryNow.duration_s });
  check('Admin: durata di un gioco salvata (stessi secondi)', sameDuration?.ok && sameDuration.duration_s === memoryNow.duration_s, JSON.stringify(sameDuration));
  check('Admin: durata fuori limite → rifiutata', (await staff('set_game', { p_game_id: 'memory', p_seconds: 5 }))?.error === 'DURATION_INVALID');
  // Numero di domande del quiz (D104): per un attimo un altro numero, poi com'era
  const quizNow = settings.games.find((g) => g.id === 'quiz');
  const perQ = quizNow.duration_s / quizNow.steps;
  // un numero di domande diverso da quello attuale (dentro i limiti 3–20)
  const otherN = quizNow.steps < 20 ? quizNow.steps + 1 : quizNow.steps - 1;
  const set7 = await staff('set_game', { p_game_id: 'quiz', p_seconds: perQ, p_steps: otherN });
  const quiz7 = (await rpc('start_attempt', { p_token: S, p_game_id: 'quiz' })).body;
  const back5 = await staff('set_game', { p_game_id: 'quiz', p_seconds: perQ, p_steps: quizNow.steps });
  check(`quiz: con ${otherN} domande la partita ne riceve ${otherN}, con la durata giusta`, set7?.steps === otherN && quiz7?.questions?.length === otherN && quiz7.duration_s === perQ * otherN, JSON.stringify({ set7, n: quiz7?.questions?.length, d: quiz7?.duration_s }));
  check('quiz: numero di domande rimesso com\'era', back5?.steps === quizNow.steps && back5.duration_s === quizNow.duration_s, JSON.stringify(back5));
  check('quiz: 2 domande → rifiutato', (await staff('set_game', { p_game_id: 'quiz', p_seconds: perQ, p_steps: 2 }))?.error === 'QUESTIONS_INVALID');
  // Punteggio su quelle domande: nessuna risposta = 0 punti, e nessun controllo che la escluda
  const sub7 = (await rpc('submit_score', { p_attempt_id: quiz7.attempt_id, p_raw_score: 0, p_stats: { durationMs: 700, answers: quiz7.questions.map((q) => ({ questionId: q.id, choice: null, ms: 100 })) }, p_actions: [] })).body;
  check(`quiz a ${otherN} domande: partita inviata e ricalcolata dal server`, sub7?.ok === true && sub7.status !== 'rejected', JSON.stringify(sub7));
  const quizList = await staff('quiz_list');
  check('Admin: vede le domande del quiz con la risposta giusta', quizList?.ok && quizList.questions.length > 0 && Number.isInteger(quizList.questions[0].correct));
  check('quiz: domanda con 3 risposte → rifiutata', (await staff('quiz_save', { p_questions: [{ text: 'Domanda?', options: ['a', 'b', 'c'], correct: 0, active: true }] }))?.error === 'QUIZ_INVALID');
  check('quiz: un giocatore non vede le risposte', (await rpc('staff_quiz_list', { p_token: t5Token })).body?.error === 'NOT_STAFF');
  // Tentativi: da 0 (illimitati) a 99
  check('tentativi: 100 al giorno → rifiutato', (await staff('update_settings', { p_values: { attempts_per_day: 100 } }))?.error === 'ATTEMPTS_INVALID');
  // Vincitori e classifica senza account (D101)
  const sameWinners = await staff('update_settings', { p_values: { winners: settings.winners } });
  check('Admin: numero vincitori salvato; l\'app lo legge senza account', Number.isInteger(settings.winners) && sameWinners?.ok && appConfig?.winners === settings.winners, JSON.stringify(appConfig));
  check('vincitori: 100 → rifiutato', (await staff('update_settings', { p_values: { winners: 100 } }))?.error === 'WINNERS_INVALID');
  // Per un attimo la classifica diventa solo per chi ha un account, poi torna com'era
  await staff('update_settings', { p_values: { leaderboard_public: false } });
  const lockedBoard = (await rpc('get_leaderboard', { p_token: null, p_version: null })).body;
  const lockedCard = (await rpc('get_player_card', { p_nickname: t5Nick })).body;
  const openBoard = (await rpc('get_leaderboard', { p_token: t5Token, p_version: null })).body;
  const openCard = (await rpc('get_player_card', { p_nickname: t5Nick, p_token: t5Token })).body;
  await staff('update_settings', { p_values: { leaderboard_public: settings.leaderboard_public } });
  check('classifica solo con account: senza accesso → LOGIN_REQUIRED (classifica e scheda)', lockedBoard?.error === 'LOGIN_REQUIRED' && lockedCard?.error === 'LOGIN_REQUIRED');
  check('classifica solo con account: con l\'accesso si vede', openBoard?.ok === true && openCard?.ok === true);
  check('classifica: rimessa com\'era', (await rpc('get_app_config')).body?.leaderboard_public === settings.leaderboard_public);
  // Feedback (D108): per un attimo sezione accesa e solo con account, poi tutto com'era
  await staff('update_settings', { p_values: { sections: { feedback: true }, feedback_anonymous: false } });
  const fbAnon = (await rpc('submit_feedback', { p_token: null, p_stars: 5, p_text: 'prova' })).body;
  const fbBad = (await rpc('submit_feedback', { p_token: t5Token, p_stars: 6, p_text: null })).body;
  const fbStaff = (await rpc('submit_feedback', { p_token: S, p_stars: 5, p_text: 'recensione dello staff' })).body;
  check('feedback: Mod e Admin non possono lasciarne (D110)', fbStaff?.error === 'STAFF_NOT_ALLOWED', JSON.stringify(fbStaff));
  const fbText = `zz prova del database ${nick}: tutto molto buono`;
  const fbPageBefore = (await rpc('get_feedback_page', { p_token: t5Token })).body;
  const fbOk = (await rpc('submit_feedback', { p_token: t5Token, p_stars: 5, p_text: fbText })).body;
  const fbSecond = (await rpc('submit_feedback', { p_token: t5Token, p_stars: 2, p_text: null })).body;
  const fbPageAfter = (await rpc('get_feedback_page', { p_token: t5Token })).body;
  const fbList = await staff('feedback_list', { p_nickname: t5Nick });
  const fbMine = fbList?.entries?.find((f) => f.text === fbText);
  const fbStars = await staff('feedback_list', { p_nickname: t5Nick, p_stars: 5 });
  const fbNoStars = await staff('feedback_list', { p_nickname: t5Nick, p_stars: 3 });
  const fbPlayer = (await rpc('staff_feedback_list', { p_token: t5Token })).body;
  check('feedback: senza account rifiutato se non sono abilitati gli anonimi', fbAnon?.error === 'LOGIN_REQUIRED', JSON.stringify(fbAnon));
  check('feedback: stelle fuori da 1–5 rifiutate', fbBad?.error === 'STARS_INVALID', JSON.stringify(fbBad));
  check('feedback: con l\'account si invia; uno solo al giorno (D111)', fbOk?.ok === true && fbSecond?.error === 'TOO_MANY', JSON.stringify({ fbOk, fbSecond }));
  check('feedback: la pagina sa se oggi lo hai già lasciato', fbPageBefore?.can_submit === true && fbPageAfter?.can_submit === false && Array.isArray(fbPageAfter.reviews), JSON.stringify({ before: fbPageBefore?.can_submit, after: fbPageAfter?.can_submit }));
  check('feedback: lo staff li vede filtrati per nickname e stelle, con la media', fbList?.total === 1 && fbMine?.stars === 5 && fbStars?.total === 1 && fbNoStars?.total === 0 && fbList.average === 5, JSON.stringify({ total: fbList?.total, avg: fbList?.average }));
  check('feedback: un giocatore non vede l\'elenco dello staff', fbPlayer?.error === 'NOT_STAFF');
  const fbHigh = (await rpc('get_feedback_highlights')).body;
  check('feedback: le migliori (fino a 5, D117) hanno almeno 5 caratteri di testo', fbHigh?.ok && fbHigh.reviews.length <= 5 && fbHigh.reviews.every((r) => r.text.trim().length >= 5), JSON.stringify(fbHigh?.reviews?.length));
  for (const f of fbList?.entries ?? []) await staff('feedback_delete', { p_id: f.id });
  check('feedback: lo staff li cancella', (await staff('feedback_list', { p_nickname: t5Nick }))?.total === 0);
  const fbRemoved = await staff('feedback_list', { p_nickname: t5Nick, p_removed: true });
  const fbRemovedMine = fbRemoved?.entries?.find((f) => f.text === fbText);
  check('feedback: i rimossi si rivedono col testo, chi li ha rimossi e quando (D115)', Boolean(fbRemovedMine?.deleted_at) && fbRemovedMine.deleted_by === staffLogin.player.nickname, JSON.stringify(fbRemovedMine));
  const fbAfterDelete = (await rpc('submit_feedback', { p_token: t5Token, p_stars: 5, p_text: 'riprovo dopo la cancellazione' })).body;
  const fbPageDeleted = (await rpc('get_feedback_page', { p_token: t5Token })).body;
  check('feedback: cancellato dallo staff, quel giorno non se ne può scrivere un altro (D114)', fbAfterDelete?.error === 'TOO_MANY' && fbPageDeleted?.can_submit === false, JSON.stringify({ fbAfterDelete, can: fbPageDeleted?.can_submit }));
  check('aspetto: ordine delle sezioni non valido → rifiutato', (await staff('update_settings', { p_values: { sections_order: ['menu', 'menu'] } }))?.error === 'ORDER_INVALID');
  const sameOrder = await staff('update_settings', { p_values: { sections_order: settings.sections_order, sections: settings.sections, feedback_anonymous: settings.feedback_anonymous } });
  const configAfter = (await rpc('get_app_config')).body;
  check('aspetto e feedback rimessi com\'erano; l\'app legge ordine e feedback anonimi', sameOrder?.ok && JSON.stringify(configAfter?.sections_order) === JSON.stringify(settings.sections_order) &&
    configAfter.sections?.feedback === settings.sections.feedback && configAfter.feedback_anonymous === settings.feedback_anonymous, JSON.stringify(configAfter));
  if (mine) {
    const rep = await staff('attempt_replay', { p_attempt_id: mine.id });
    check('staff: "Rivedi partita" riceve seme, azioni e durata', rep?.ok && rep.attempt.seed !== null && Array.isArray(rep.attempt.actions) && rep.attempt.actions.length > 5 && rep.attempt.stats.durationMs > 0);
  }
  const quizRep = await staff('attempt_replay', { p_attempt_id: quiz.attempt_id });
  check('staff: replay del quiz con le domande della partita (e la risposta giusta)', quizRep?.attempt?.questions?.length === quizN &&
    quizRep.attempt.questions.every((q, i) => q.id === quiz.questions[i].id && Number.isInteger(q.correct)));
  await rpc('logout', { p_token: S });
} else {
  console.log('(controlli con un account staff saltati: mancano TEST_STAFF_NICKNAME / TEST_STAFF_PASSWORD in app/.env.local)');
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} controlli superati. Giocatori di prova: ${nick}, ${lockNick}, ${t5Nick} (da cancellare prima della sagra).`);
process.exit(failed ? 1 : 0);
