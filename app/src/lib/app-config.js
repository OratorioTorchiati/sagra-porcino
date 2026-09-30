// Sezioni dell'app accese o spente dall'Admin (D93). Il server le dice con get_app_config; l'ultima risposta
// resta sul telefono, così la home è giusta anche senza rete. Senza nessuna risposta: tutto acceso.
// Gli id devono coincidere con _section_ids() nel database (supabase/migrations/021_ruoli_e_sezioni.sql).

import { rpc, serverConfigured } from './api.js';
import { readJson, writeJson } from './storage.js';

/** Sezioni della home, nell'ordine in cui compaiono. `path` = la pagina (e le sue sottopagine). */
export const SECTIONS = [
  { id: 'menu', label: 'Menù', icon: '🍽️', path: '/menu' },
  { id: 'giochi', label: 'Minigiochi', icon: '🎮', path: '/giochi' },
];

/** Sezioni che arriveranno (nelle Configurazioni si vedono come "in arrivo") */
export const FUTURE_SECTIONS = [
  { label: 'Mappa', icon: '🗺️' },
  { label: 'Feedback', icon: '💬' },
  { label: 'Calendario eventi', icon: '📅' },
  { label: 'Sponsor', icon: '🤝' },
];

const KEY = 'sagra-config';
const listeners = new Set();
let config = readJson(KEY, null); // { sections: { menu: true, ... }, winners, leaderboard_public }

/** La sezione è accesa? (senza informazioni: sì) */
export function sectionOn(id) {
  return config?.sections?.[id] !== false;
}

/** Quanti vincono un premio (D101): 0 = nessun premio. Senza informazioni: 10 */
export function winnersCount() {
  return Number.isInteger(config?.winners) ? config.winners : 10;
}

/** La classifica si vede anche senza account? (D101, senza informazioni: sì) */
export function leaderboardPublic() {
  return config?.leaderboard_public !== false;
}

/**
 * Frase sui premi: "i primi 10 vinceranno un premio!", "il 1° vincerà un premio!", null se nessun premio.
 * `future` = "vinceranno" (Come funziona) oppure "vincono" (classifica).
 */
export function prizeText({ future = true, strong = true } = {}) {
  const n = winnersCount();
  if (n <= 0) return null;
  const b = (t) => (strong ? `<strong>${t}</strong>` : t);
  if (n === 1) return `il ${b('1°')} ${future ? 'vincerà' : 'vince'} un premio!`;
  return `i ${b(`primi ${n}`)} ${future ? 'vinceranno' : 'vincono'} un premio!`;
}

/** Sezione a cui appartiene un percorso ("/giochi/quiz" → giochi), o null */
export function sectionForPath(path) {
  return SECTIONS.find((s) => path === s.path || path.startsWith(`${s.path}/`)) ?? null;
}

/** Avvisa quando le sezioni cambiano (es. per ridisegnare la home) */
export function onConfigChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Aggiorna dal server (senza rete resta l'ultima copia). */
export async function refreshAppConfig() {
  if (!serverConfigured) return config;
  try {
    const result = await rpc('get_app_config');
    if (!result.ok) return config;
    const next = { sections: result.sections ?? {}, winners: result.winners, leaderboard_public: result.leaderboard_public };
    const changed = JSON.stringify(next) !== JSON.stringify(config);
    config = next;
    writeJson(KEY, next);
    if (changed) listeners.forEach((fn) => fn(config));
  } catch {
    // senza rete: va bene l'ultima copia
  }
  return config;
}
