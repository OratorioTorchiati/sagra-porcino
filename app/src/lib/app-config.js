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
let config = readJson(KEY, null); // { sections: { menu: true, ... } }

/** La sezione è accesa? (senza informazioni: sì) */
export function sectionOn(id) {
  return config?.sections?.[id] !== false;
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
    const next = { sections: result.sections ?? {} };
    const changed = JSON.stringify(next) !== JSON.stringify(config);
    config = next;
    writeJson(KEY, next);
    if (changed) listeners.forEach((fn) => fn(config));
  } catch {
    // senza rete: va bene l'ultima copia
  }
  return config;
}
