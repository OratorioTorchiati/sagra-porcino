// Prova di carico (Tappa 10): tanti giocatori finti sul database di SVILUPPO, come telefoni veri.
// `npm run load-test` (default: 1000 giocatori, arrivano in 5 minuti, poi altri 15 minuti di gioco).
// Opzioni: `npm run load-test -- --users 50 --ramp 60 --hold 120` (secondi).
// Legge app/.env.local; si rifiuta di partire sul progetto di produzione.
// Ogni giocatore: apre l'app, si registra (nickname "zzc…", da cancellare dopo), poi a caso guarda il menù,
// la classifica, i minigiochi, gioca (partite vere: aspetta la durata reale), apre il Feedback (a volte lo lascia).
// Le richieste sono le stesse che fa l'app (stesse cache: menù per versione, classifica per versione, feedback 5 min).
// Alla fine: richieste, errori, tempi e byte scaricati (≈ egress), salvati in prova-carico/.

import fs from 'node:fs';
import crypto from 'node:crypto';
import acchiappaConfig from '../src/games/acchiappa/config.js';
import { applyHit, gameEndMs, initialScoreState } from '../src/games/acchiappa/scoring.js';
import cadonoConfig from '../src/games/cadono/config.js';
import { applyCatch, initialState as cadonoInitial, survivalBonus } from '../src/games/cadono/scoring.js';
import memoryConfig from '../src/games/memory/config.js';
import { memoryScore } from '../src/games/memory/logic.js';

const PROD_REF = 'qasriofmaclcbppclmzz'; // progetto di produzione: qui niente giocatori finti

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const BASE = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
if (!BASE || BASE.includes(PROD_REF)) {
  console.error('app/.env.local punta al progetto di PRODUZIONE (o a nessuno): la prova di carico gira solo su sviluppo.');
  process.exit(1);
}
const headers = { 'Content-Type': 'application/json', apikey: KEY, ...(KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${KEY}` }) };

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const USERS = arg('users', 1000);
const RAMP_S = arg('ramp', 300);
const HOLD_S = arg('hold', 900);
const END_AT = Date.now() + (RAMP_S + HOLD_S) * 1000;
const RUN = crypto.randomBytes(2).toString('hex');

// ---------- Statistiche ----------
const HEADER_BYTES = 450; // intestazioni di una risposta (stima): contano nell'egress
const stats = { requests: 0, failures: 0, bodyBytes: 0, byRpc: {}, errors: {}, statuses: {} };
const latencies = [];
let active = 0;
let registered = 0;
const games = { played: 0, valid: 0, flagged: 0, rejected: 0, noAttempts: 0, other: 0 };

async function rpc(name, params) {
  const t0 = performance.now();
  const s = (stats.byRpc[name] ??= { n: 0, bytes: 0, ms: 0 });
  try {
    const r = await fetch(`${BASE}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(params) });
    const buf = Buffer.from(await r.arrayBuffer());
    const ms = performance.now() - t0;
    stats.requests++;
    stats.bodyBytes += buf.length;
    s.n++;
    s.bytes += buf.length;
    s.ms += ms;
    latencies.push(ms);
    stats.statuses[r.status] = (stats.statuses[r.status] ?? 0) + 1;
    const body = JSON.parse(buf.toString('utf8') || 'null');
    if (r.status >= 400) stats.failures++;
    if (body?.error) stats.errors[`${name}:${body.error}`] = (stats.errors[`${name}:${body.error}`] ?? 0) + 1;
    return body;
  } catch (error) {
    stats.requests++;
    stats.failures++;
    stats.errors[`${name}:RETE ${error.cause?.code ?? error.message}`] = (stats.errors[`${name}:RETE ${error.cause?.code ?? error.message}`] ?? 0) + 1;
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const AVATARS = ['porcino', 'montanaro', 'porcino_nero', 'castagna', 'scoiattolo', 'riccio', 'cinghialotto', 'foglia',
  'abetino', 'gufetto', 'cestino', 'lumachina', 'ovolaccio', 'fungo_giallo', 'fungo_stregato', 'riccio_castagna'];

// ---------- Partite plausibili (come in test-db.mjs) ----------
function memoryPlay(game) {
  const pairs = game.steps;
  const moves = pairs + Math.floor(rand(2, pairs));
  const lastMs = Math.min(Math.round(moves * rand(1400, 2600)), game.duration_s * 1000 - 500);
  const actions = [[0, 'start']];
  let ms = 500;
  const step = (lastMs - 500) / (moves * 2);
  for (let i = 0; i < moves - pairs; i++) {
    actions.push([Math.round(ms), 'flip', 0, 'a', 'first']); ms += step;
    actions.push([Math.round(ms), 'flip', 1, 'b', 'mismatch']); ms += step;
  }
  for (let i = 0; i < pairs; i++) {
    actions.push([Math.round(ms), 'flip', i * 2, `c${i}`, 'first']); ms += step;
    actions.push([i === pairs - 1 ? lastMs : Math.round(ms), 'flip', i * 2 + 1, `c${i}`, 'match']); ms += step;
  }
  const score = memoryScore(
    { completed: true, seconds: Math.round(lastMs / 100) / 10, moves, pairs },
    { ...memoryConfig, pairs, durationS: game.duration_s },
  );
  return { durationMs: lastMs, score, actions, stats: { durationMs: lastMs } };
}

function acchiappaPlay(game) {
  let state = initialScoreState();
  let endMs = game.duration_s * 1000;
  const actions = [[0, 'start']];
  let t = 800;
  while (true) {
    t += Math.round(rand(280, 900));
    if (t >= endMs) break;
    const r = Math.random();
    const hit = r < 0.05 ? 'poison' : r < 0.08 ? 'object' : 'good';
    state = applyHit(state, hit, t, acchiappaConfig).state;
    if (hit === 'object') endMs = gameEndMs(endMs, t, acchiappaConfig);
    actions.push([t, 'tap', Math.round(rand(40, 320)), Math.round(rand(80, 560)), hit === 'good' ? 'good' : 'bad',
      hit === 'good' ? 'estivo' : hit === 'poison' ? 'riccio' : 'castagna', 420, 80, Math.round(rand(2, 30))]);
  }
  return { durationMs: endMs, score: state.score, actions, stats: { durationMs: endMs } };
}

function cadonoPlay(game) {
  const config = { ...cadonoConfig, durationS: game.duration_s };
  let state = cadonoInitial(config);
  const endMs = game.duration_s * 1000;
  const actions = [[0, 'start']];
  let t = 1000;
  while (true) {
    t += Math.round(rand(900, 2200));
    if (t >= endMs) break;
    const r = Math.random();
    const type = r < 0.04 ? 'bomb' : r < 0.1 ? 'golden' : 'porcino';
    if (type === 'bomb' && state.lives <= 1) continue;
    state = applyCatch(state, type, config).state;
    const x = Math.round(rand(30, 330));
    actions.push([t, 'catch', type, x, x + Math.round(rand(-20, 20))]);
  }
  const score = state.score + survivalBonus(state, true, config);
  return { durationMs: endMs, score, actions, stats: { durationMs: endMs } };
}

function quizPlay(game, questions) {
  const answers = questions.map((q) => ({ questionId: q.id, choice: Math.floor(Math.random() * q.options.length), ms: Math.round(rand(2500, 9000)) }));
  const durationMs = Math.min(answers.reduce((n, a) => n + a.ms, 0), game.duration_s * 1000);
  return { durationMs, score: 0, actions: [], stats: { durationMs, answers } };
}

// ---------- Un giocatore ----------
async function player(index) {
  await sleep(rand(0, RAMP_S * 1000));
  active++;
  const device = crypto.randomUUID();
  let leaderboardVersion = null;
  let feedbackCheckedAt = 0;
  let feedbackDone = false;

  // Apertura dell'app: configurazione, menù (prima volta), stato dei giochi
  // Configurazione: al massimo una richiesta al minuto, come l'app (D122)
  let config = await rpc('get_app_config', {});
  let configAt = Date.now();
  const pageConfig = async () => {
    if (Date.now() - configAt >= 60000) {
      config = (await rpc('get_app_config', {})) ?? config;
      configAt = Date.now();
    }
    return config;
  };
  let menuVersion = config?.menu_version ?? null;
  await rpc('get_menu', {});
  await sleep(rand(3000, 12000));

  // Registrazione (PIN casuale; se troppo semplice se ne sceglie un altro)
  let token = null;
  for (let tries = 0; tries < 3 && !token; tries++) {
    const pin = String(Math.floor(rand(10000, 99999)));
    const reg = await rpc('register', {
      p_nickname: `zzc${RUN}${index}`, p_avatar: pick(AVATARS), p_pin: pin,
      p_device_id: device, p_fingerprint: 'load-test', p_user_agent: 'load-test',
    });
    if (reg?.ok) token = reg.token;
    else if (reg?.error !== 'PIN_TOO_SIMPLE') break;
  }
  if (!token) {
    active--;
    return;
  }
  registered++;

  // Navigazione a caso fino alla fine della prova
  while (Date.now() < END_AT) {
    await sleep(rand(4000, 20000)); // tempo per leggere / scegliere
    if (Date.now() >= END_AT) break;
    const app = await pageConfig(); // cambio pagina
    const r = Math.random();
    if (r < 0.15) {
      // Menù: si riscarica solo se è cambiata la versione (D118)
      if ((app?.menu_version ?? null) !== menuVersion) {
        menuVersion = app?.menu_version ?? null;
        await rpc('get_menu', {});
      }
    } else if (r < 0.35) {
      // Classifica: una volta all'apertura, "invariata" se non è cambiata (D116)
      const board = await rpc('get_leaderboard', { p_token: token, p_version: leaderboardVersion });
      if (board?.ok && !board.unchanged) leaderboardVersion = board.version;
    } else if (r < 0.85) {
      // Minigiochi: elenco, poi una partita
      const state = await rpc('get_games_state', { p_token: token });
      const open = (state?.games ?? []).filter((g) => g.enabled !== false);
      if (!open.length) continue;
      const game = pick(open);
      await sleep(rand(2000, 6000)); // regole del gioco
      const start = await rpc('start_attempt', { p_token: token, p_game_id: game.id });
      if (!start?.ok) {
        if (start?.error === 'NO_ATTEMPTS_LEFT') games.noAttempts++;
        else games.other++;
        continue;
      }
      const play =
        game.id === 'memory' ? memoryPlay(game)
        : game.id === 'acchiappa' ? acchiappaPlay({ ...game, duration_s: start.duration_s ?? game.duration_s })
        : game.id === 'cadono' ? cadonoPlay({ ...game, duration_s: start.duration_s ?? game.duration_s })
        : quizPlay(game, start.questions ?? []);
      await sleep(play.durationMs + rand(300, 1500)); // la partita dura davvero
      const res = await rpc('submit_score', { p_attempt_id: start.attempt_id, p_raw_score: play.score, p_stats: play.stats, p_actions: play.actions });
      games.played++;
      if (res?.status && res.status in games) games[res.status]++;
      else games.other++;
      // Dopo la partita: spesso si guarda la classifica
      if (Math.random() < 0.6) {
        await sleep(rand(2000, 6000));
        await pageConfig();
        const board = await rpc('get_leaderboard', { p_token: token, p_version: leaderboardVersion });
        if (board?.ok && !board.unchanged) leaderboardVersion = board.version;
      }
    } else if (r < 0.95) {
      // Feedback: pagina salvata 5 minuti sul telefono (D117); a volte se ne lascia uno
      if (Date.now() - feedbackCheckedAt > 5 * 60 * 1000) {
        await rpc('get_feedback_page', { p_token: token });
        feedbackCheckedAt = Date.now();
      }
      if (!feedbackDone && Math.random() < 0.3) {
        await sleep(rand(8000, 25000));
        const stars = pick([3, 4, 4, 5, 5, 5]);
        await rpc('submit_feedback', { p_token: token, p_stars: stars, p_text: Math.random() < 0.6 ? `Prova di carico: tutto bene, ${stars} stelle!` : null });
        feedbackDone = true;
      }
    }
    // altrimenti: home (solo la configurazione)
  }
  active--;
}

// ---------- Avanzamento ----------
const startedAt = Date.now();
const fmtMB = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const egress = () => stats.bodyBytes + stats.requests * HEADER_BYTES;
const pct = (p) => {
  const sorted = [...latencies].sort((a, b) => a - b);
  return sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]) : 0;
};
const ticker = setInterval(() => {
  const min = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(`[${min} min] attivi ${active}, registrati ${registered}/${USERS}, richieste ${stats.requests} (errori rete/HTTP ${stats.failures}), partite ${games.played}, scaricati ≈ ${fmtMB(egress())}, tempi p50 ${pct(0.5)} ms / p95 ${pct(0.95)} ms`);
}, 30000);

console.log(`Prova di carico su ${new URL(BASE).host}: ${USERS} giocatori "zzc${RUN}…", arrivo in ${RAMP_S} s, poi ${HOLD_S} s.`);
await Promise.all(Array.from({ length: USERS }, (_, i) => player(i)));
clearInterval(ticker);

const summary = {
  host: new URL(BASE).host,
  run: `zzc${RUN}`,
  started: new Date(startedAt).toISOString(),
  minutes: Math.round((Date.now() - startedAt) / 6000) / 10,
  users: USERS,
  registered,
  requests: stats.requests,
  failures: stats.failures,
  statuses: stats.statuses,
  latency_ms: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: Math.round(Math.max(0, ...latencies)) },
  body_mb: +(stats.bodyBytes / 1024 / 1024).toFixed(2),
  egress_estimate_mb: +(egress() / 1024 / 1024).toFixed(2),
  games,
  errors: stats.errors,
  by_rpc: Object.fromEntries(Object.entries(stats.byRpc).map(([k, v]) => [k, { n: v.n, kb: Math.round(v.bytes / 1024), avg_ms: Math.round(v.ms / v.n) }])),
};
console.log(JSON.stringify(summary, null, 2));
const outDir = new URL('../../prova-carico/', import.meta.url);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(new URL(`risultato-${summary.run}.json`, outDir), JSON.stringify(summary, null, 2));
