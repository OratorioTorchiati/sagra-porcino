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
check('reinvio dello stesso tentativo → nessun doppione (resta il primo esito)', resubmit?.status === 'rejected' && resubmit.raw_score === 0, JSON.stringify(resubmit));
const stateAfterFake = (await rpc('get_games_state', { p_token: t5Token })).body;
check('...e il tentativo resta usato', stateAfterFake?.games?.find((g) => g.id === 'acchiappa')?.attempts_used_today === perDay);
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
  if (starts[2]?.attempt_id) {
    const centered = actions.map((a) => (a[1] === 'tap' ? [...a.slice(0, 8), 0] : a)); // distanza dal centro 0 px
    const bot = (await rpc('submit_score', { p_attempt_id: starts[2].attempt_id, p_raw_score: state.score, p_stats: { durationMs: 60000 }, p_actions: centered })).body;
    check('Acchiappa con tocchi sempre al centro esatto → segnalata (possibile bot)', bot?.status === 'flagged', JSON.stringify(bot));
  }
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
  ];
  const denied = [];
  for (const [name, params] of calls) {
    for (const token of [t5Token, null]) {
      const res = (await rpc(name, { p_token: token, ...params })).body;
      if (res?.error !== 'NOT_STAFF') denied.push(`${name}(${token ? 'giocatore' : 'senza sessione'}): ${JSON.stringify(res)}`);
    }
  }
  check('pannello staff: un giocatore normale o senza sessione riceve NOT_STAFF da tutte le 19 funzioni', denied.length === 0, denied.join(' | '));
  const stillThere = (await rpc('login', { p_nickname: t5Nick, p_secret: '5555' })).body;
  check('...e i tentativi del giocatore non hanno cambiato nulla (PIN e account intatti)', stillThere?.ok === true);
}

// Pannello staff con un account staff di prova (facoltativo): TEST_STAFF_NICKNAME e TEST_STAFF_PASSWORD in app/.env.local
if (env.TEST_STAFF_NICKNAME && env.TEST_STAFF_PASSWORD) {
  const staffLogin = (await rpc('login', { p_nickname: env.TEST_STAFF_NICKNAME, p_secret: env.TEST_STAFF_PASSWORD })).body;
  check('staff: accesso con nickname + password', staffLogin?.ok && staffLogin.player.role === 'staff', staffLogin?.error);
  const S = staffLogin?.token;
  const staff = async (name, params = {}) => (await rpc(`staff_${name}`, { p_token: S, ...params })).body;

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
  const v = (await rpc('register', { p_nickname: vNick, p_avatar: 'riccio', p_pin: '1111', p_device_id: vDevice })).body;
  const vStart = (await rpc('start_attempt', { p_token: v.token, p_game_id: 'memory' })).body;
  await sleep(6500);
  await rpc('submit_score', { p_attempt_id: vStart.attempt_id, p_raw_score: 942, p_stats: { durationMs: 6000 }, p_actions: memoryActions(10, 6000) });
  const reset = await staff('reset_pin', { p_nickname: vNick, p_new_pin: '4321' });
  const oldSession = (await rpc('get_my_profile', { p_token: v.token })).body;
  const newLogin = (await rpc('login', { p_nickname: vNick, p_secret: '4321' })).body;
  check('staff: reset PIN → il vecchio accesso si chiude, si entra col nuovo PIN', reset?.ok && oldSession?.ok === false && newLogin?.ok, JSON.stringify(reset));
  check('staff: PIN non di 4 cifre → rifiutato', (await staff('reset_pin', { p_nickname: vNick, p_new_pin: '12' }))?.error === 'PIN_INVALID');

  const cardBefore = (await rpc('get_player_card', { p_nickname: vNick })).body.player;
  await staff('add_extra_points', { p_nickname: vNick, p_points: 100, p_reason: 'prova' });
  const cardAfter = (await rpc('get_player_card', { p_nickname: vNick })).body.player;
  check('staff: punti extra +100 → totale in classifica +100', cardAfter.total === cardBefore.total + 100 && cardAfter.extra_total === 100, `${cardBefore.total} → ${cardAfter.total}`);
  const extraId = (await staff('player_detail', { p_nickname: vNick })).player.extra_points[0].id;
  await staff('delete_extra_points', { p_id: extraId });
  check('staff: togliere i punti extra → totale di prima', (await rpc('get_player_card', { p_nickname: vNick })).body.player.total === cardBefore.total);
  check('staff: punti extra senza motivo → rifiutati', (await staff('add_extra_points', { p_nickname: vNick, p_points: 5, p_reason: ' ' }))?.error === 'REASON_REQUIRED');

  await staff('set_disabled', { p_nickname: vNick, p_disabled: true });
  const disabledLogin = (await rpc('login', { p_nickname: vNick, p_secret: '4321' })).body;
  const boardDisabled = (await rpc('get_player_card', { p_nickname: vNick })).body;
  check('staff: disattivato → non entra e sparisce dalla classifica', disabledLogin?.error === 'DISABLED' && boardDisabled?.error === 'NOT_FOUND');
  await staff('set_disabled', { p_nickname: vNick, p_disabled: false });
  check('staff: riattivato → entra di nuovo', (await rpc('login', { p_nickname: vNick, p_secret: '4321' })).body?.ok === true);

  check('staff: cancellazione con nickname sbagliato → rifiutata', (await staff('delete_player', { p_nickname: vNick, p_confirm: 'altro' }))?.error === 'CONFIRM_MISMATCH');
  const del = await staff('delete_player', { p_nickname: vNick, p_confirm: vNick });
  const reRegister = (await rpc('register', { p_nickname: `zzw${suffix}`, p_avatar: 'riccio', p_pin: '1111', p_device_id: vDevice })).body;
  check('staff: cancellato → account sparito e il telefono può registrarsi di nuovo', del?.ok && (await staff('search_players', { p_query: vNick })).players.length === 0 && reRegister?.ok, JSON.stringify(reRegister));

  const flagged = await staff('review_list', { p_status: 'flagged' });
  const mine = flagged?.attempts?.find((a) => a.nickname === t5Nick);
  check('staff: la partita segnalata (Memory perfetto) è nella lista da controllare', Boolean(mine), JSON.stringify(flagged?.attempts?.slice(0, 2)));
  if (mine) {
    const approved = await staff('set_attempt_status', { p_attempt_id: mine.id, p_status: 'valid' });
    const after = await staff('review_list', {});
    const t5Card = (await rpc('get_player_card', { p_nickname: t5Nick })).body.player;
    check('staff: partita approvata → esce dall\'elenco e resta valida (Memory 982)', approved?.ok && !after.attempts.some((a) => a.id === mine.id) && t5Card.best.memory === 982, JSON.stringify(t5Card.best));
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
  const x = (await rpc('register', { p_nickname: xNick, p_avatar: 'riccio', p_pin: '2222', p_device_id: xDevice })).body;
  const xStart = (await rpc('start_attempt', { p_token: x.token, p_game_id: 'memory' })).body;
  await sleep(6500);
  const xRes = (await rpc('submit_score', { p_attempt_id: xStart.attempt_id, p_raw_score: 982, p_stats: { durationMs: 6000 }, p_actions: memoryActions(8, 6000) })).body;
  const excluded = await staff('ban_player', { p_attempt_id: xStart.attempt_id });
  const xLogin = (await rpc('login', { p_nickname: xNick, p_secret: '2222' })).body;
  const xAgain = (await rpc('register', { p_nickname: `zzy${suffix}`, p_avatar: 'riccio', p_pin: '2222', p_device_id: xDevice })).body;
  const xList = await staff('review_list', {});
  check('staff: ban → non entra più, il telefono non può creare un altro account, la partita sparisce',
    xRes?.status === 'flagged' && excluded?.ok && xLogin?.error === 'DISABLED' && xAgain?.error === 'DEVICE_ALREADY_USED' && !xList.attempts.some((a) => a.id === xStart.attempt_id),
    JSON.stringify({ xRes: xRes?.status, excluded, xLogin: xLogin?.error, xAgain: xAgain?.error }));
  // Ban del telefono: da quel telefono non si entra con nessun account e non ci si registra
  const dNick = `zzd${suffix}`;
  const dDevice = crypto.randomUUID();
  const dOther = crypto.randomUUID();
  const d = (await rpc('register', { p_nickname: dNick, p_avatar: 'riccio', p_pin: '3333', p_device_id: dDevice })).body;
  const dBan = await staff('ban_device', { p_device_id: dDevice, p_ban: true });
  const dSession = (await rpc('get_my_profile', { p_token: d.token })).body;
  const dLogin = (await rpc('login', { p_nickname: dNick, p_secret: '3333', p_device_id: dDevice })).body;
  const friendLogin = (await rpc('login', { p_nickname: t5Nick, p_secret: '5555', p_device_id: dDevice })).body;
  const dRegister = (await rpc('register', { p_nickname: `zze${suffix}`, p_avatar: 'riccio', p_pin: '3333', p_device_id: dDevice })).body;
  const dElsewhere = (await rpc('login', { p_nickname: dNick, p_secret: '3333', p_device_id: dOther })).body;
  check('staff: ban telefono → da lì non si entra con nessun account (nemmeno di altri), non ci si registra, le sessioni si chiudono',
    dBan?.ok && dSession?.ok === false && dLogin?.error === 'DEVICE_BANNED' && friendLogin?.error === 'DEVICE_BANNED' && dRegister?.error === 'DEVICE_BANNED',
    JSON.stringify({ dSession: dSession?.error, dLogin: dLogin?.error, friendLogin: friendLogin?.error, dRegister: dRegister?.error }));
  check('staff: ...ma lo stesso account da un altro telefono entra (il ban è del telefono, non dell\'account)', dElsewhere?.ok === true);
  const dList = await staff('banned_devices');
  const dDetail = await staff('player_detail', { p_nickname: dNick });
  check('staff: il telefono bloccato è nell\'elenco e segnato nella scheda del giocatore', dList?.devices?.some((x) => x.device_id === dDevice && x.nickname === dNick) && dDetail?.player?.devices?.[0]?.banned === true);
  await staff('ban_device', { p_device_id: dDevice, p_ban: false });
  check('staff: sbloccato → da quel telefono si entra di nuovo', (await rpc('login', { p_nickname: dNick, p_secret: '3333', p_device_id: dDevice })).body?.ok === true);

  check('staff: il giocatore bannato sparisce dalla classifica', (await rpc('get_player_card', { p_nickname: xNick })).body?.error === 'NOT_FOUND');

  const settings = await staff('get_settings');
  check('staff: impostazioni leggibili', settings?.ok && settings.games.length === 4 && Number.isInteger(settings.attempts_per_day));
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
  if (mine) {
    const rep = await staff('attempt_replay', { p_attempt_id: mine.id });
    check('staff: "Rivedi partita" riceve seme, azioni e durata', rep?.ok && rep.attempt.seed !== null && Array.isArray(rep.attempt.actions) && rep.attempt.actions.length > 5 && rep.attempt.stats.durationMs > 0);
  }
  const quizRep = await staff('attempt_replay', { p_attempt_id: quiz.attempt_id });
  check('staff: replay del quiz con le domande della partita (e la risposta giusta)', quizRep?.attempt?.questions?.length === 5 &&
    quizRep.attempt.questions.every((q, i) => q.id === quiz.questions[i].id && Number.isInteger(q.correct)));
  await rpc('logout', { p_token: S });
} else {
  console.log('(controlli con un account staff saltati: mancano TEST_STAFF_NICKNAME / TEST_STAFF_PASSWORD in app/.env.local)');
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} controlli superati. Giocatori di prova: ${nick}, ${lockNick}, ${t5Nick} (da cancellare prima della sagra).`);
process.exit(failed ? 1 : 0);
