// Coda degli invii (docs/02-ARCHITETTURA.md §2.2): il punteggio viene prima salvato sul telefono,
// poi inviato. Senza rete si ritenta da solo (all'apertura dell'app, al ritorno della rete, e con attese
// crescenti). Ogni invio ha l'id del tentativo: il server lo accetta una volta sola, niente doppioni.

import { rpc, NetworkError } from './api.js';
import { readJson, writeJson } from './storage.js';

const KEY = 'sagra-coda-invii';
const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];

let queue = readJson(KEY, []); // [{ attemptId, gameId, rawScore, stats, actions }]
const results = new Map(); // attemptId → risposta del server
const listeners = new Set();
let flushing = false;
let retryTimer = null;
let retryIndex = 0;

function save() {
  writeJson(KEY, queue);
}

function notify(attemptId, result) {
  listeners.forEach((fn) => fn(attemptId, result));
}

/** Avvisa quando il server ha risposto per un tentativo: fn(attemptId, risultato). */
export function onSubmitResult(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isPending(attemptId) {
  return queue.some((item) => item.attemptId === attemptId);
}

export function resultFor(attemptId) {
  return results.get(attemptId) ?? null;
}

export function pendingCount() {
  return queue.length;
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  if (!queue.length) return;
  const delay = RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)];
  retryIndex++;
  retryTimer = setTimeout(flush, delay);
}

/** Prova a inviare tutto quello che è in coda. */
export async function flush() {
  if (flushing || !queue.length) return;
  flushing = true;
  try {
    for (const item of [...queue]) {
      let result;
      try {
        result = await rpc('submit_score', {
          p_attempt_id: item.attemptId,
          p_raw_score: item.rawScore,
          p_stats: item.stats,
          p_actions: item.actions,
        });
      } catch (error) {
        if (error instanceof NetworkError) {
          // Avvisa che per ora resta in attesa (la pagina mostra "in attesa di connessione")
          queue.forEach((q) => notify(q.attemptId, { ok: false, offline: true }));
          scheduleRetry();
          return;
        }
        // Errore "vero" (richiesta rifiutata): non serve ritentare all'infinito
        result = { ok: false, error: 'SUBMIT_FAILED' };
      }
      queue = queue.filter((q) => q.attemptId !== item.attemptId);
      save();
      results.set(item.attemptId, result);
      notify(item.attemptId, result);
    }
    retryIndex = 0;
  } finally {
    flushing = false;
  }
}

/** Mette in coda un punteggio e prova subito a inviarlo. */
export function enqueueScore(item) {
  if (!isPending(item.attemptId)) {
    queue.push(item);
    save();
  }
  retryIndex = 0;
  return flush();
}

/** Da chiamare all'avvio dell'app: invia quello che era rimasto in sospeso. */
export function startQueue() {
  window.addEventListener('online', () => {
    retryIndex = 0;
    flush();
  });
  flush();
}
