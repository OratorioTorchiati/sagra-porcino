// Stato dei giochi dal server (tentativi rimasti oggi, miglior punteggio, apertura/chiusura),
// con una copia sul telefono per mostrarlo anche senza rete.

import { rpc } from './api.js';
import { readJson, writeJson } from './storage.js';
import { currentPlayer, sessionToken } from './account.js';

const KEY = 'sagra-stato-giochi';

/** { state, savedAt, nickname } dell'ultima risposta salvata (solo se dello stesso giocatore) */
export function cachedGamesState() {
  const cached = readJson(KEY, null);
  const nickname = currentPlayer()?.nickname ?? null;
  return cached && cached.nickname === nickname ? cached : null;
}

/** Chiede lo stato al server. Lancia NetworkError se manca la rete. */
export async function fetchGamesState() {
  const state = await rpc('get_games_state', { p_token: sessionToken() });
  writeJson(KEY, { state, savedAt: Date.now(), nickname: currentPlayer()?.nickname ?? null });
  return state;
}

/** Dati di un gioco dallo stato ({ id, enabled, attempts_used_today, best }) */
export function gameInfo(state, gameId) {
  return state?.games?.find((g) => g.id === gameId) ?? null;
}

/** Tentativi rimasti oggi (null = illimitati per lo staff o sconosciuti) */
export function attemptsLeft(state, gameId) {
  const info = gameInfo(state, gameId);
  if (!state || !info || state.unlimited || info.attempts_used_today === null) return null;
  return Math.max(0, state.attempts_per_day - info.attempts_used_today);
}

/** Testo fisso quando un gioco non ha più tentativi (D64) */
export const NO_ATTEMPTS_TEXT = 'Hai esaurito i tentativi per oggi. Torna domani';

const dateFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

/** Motivo per cui ora non si può giocare (null se si può). Lo staff non ha limiti. */
export function blockedReason(state, gameId) {
  if (!state || state.unlimited) return null;
  const info = gameInfo(state, gameId);
  if (info && !info.enabled) return { code: 'disabled', text: 'Questo gioco al momento non è disponibile.' };
  if (state.window === 'not_yet') {
    const when = state.open_from ? dateFormat.format(new Date(state.open_from)) : null;
    return { code: 'not_yet', text: when ? `I giochi aprono ${when}.` : 'I giochi non sono ancora aperti.' };
  }
  if (state.window === 'closed') return { code: 'closed', text: 'I giochi sono conclusi.' };
  if (attemptsLeft(state, gameId) === 0) return { code: 'no_attempts', text: NO_ATTEMPTS_TEXT };
  return null;
}
