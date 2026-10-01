// Classifica dal server (supabase/migrations/007_classifica.sql): si chiede una volta all'apertura della pagina (D116),
// passando l'ultima versione ricevuta; se non è cambiato nulla il server risponde solo "invariata" (pochi byte).
// L'ultima classifica resta sul telefono per mostrarla subito e senza rete.

import { rpc } from './api.js';
import { readJson, writeJson } from './storage.js';
import { currentPlayer, sessionToken } from './account.js';

const KEY = 'sagra-classifica';
const CARD_KEY = 'sagra-mia-scheda';

const myNickname = () => currentPlayer()?.nickname ?? null;

/** Ultima classifica salvata (solo se vista dallo stesso giocatore: contiene la sua riga) */
export function cachedLeaderboard() {
  const cached = readJson(KEY, null);
  return cached && cached.nickname === myNickname() ? cached.data : null;
}

/** { ok, version, window, players, top: [{position, nickname, avatar, total}], me } oppure { unchanged, window } */
export async function fetchLeaderboard(version = null) {
  const data = await rpc('get_leaderboard', { p_token: sessionToken(), p_version: version });
  if (data.ok && !data.unchanged) writeJson(KEY, { data, nickname: myNickname() });
  return data;
}

/**
 * Carica la classifica UNA volta, all'apertura della pagina (D116): niente aggiornamenti continui. Si rivede aggiornata
 * riaprendo la pagina o ricaricando l'app. Se la versione è quella salvata sul telefono il server risponde solo
 * "invariata" (pochi byte) e resta quella salvata.
 * onData(data) se arriva una classifica nuova; onWindow(window); onOnline(bool) com'è andata la richiesta;
 * onLocked() se la classifica è solo per chi ha un account (D101) e l'accesso manca. Restituisce "stop" (pagina chiusa).
 */
export function loadLeaderboard({ onData, onWindow, onOnline, onLocked }) {
  let stopped = false;
  fetchLeaderboard(cachedLeaderboard()?.version ?? null)
    .then((data) => {
      if (stopped) return;
      onOnline?.(true);
      onWindow?.(data.window);
      if (data.ok && !data.unchanged) onData(data);
      else if (data.error === 'LOGIN_REQUIRED') onLocked?.();
    })
    .catch(() => {
      if (!stopped) onOnline?.(false);
    });
  return () => {
    stopped = true;
  };
}

/** Scheda di un giocatore: { nickname, avatar, total, position, best: {gioco: punti}, extra_total, players } */
export async function fetchPlayerCard(nickname) {
  const res = await rpc('get_player_card', { p_nickname: nickname, p_token: sessionToken() });
  if (!res.ok) return null;
  if (nickname === myNickname()) writeJson(CARD_KEY, { card: res.player, nickname });
  return res.player;
}

/** La mia scheda salvata sul telefono (per il profilo senza rete) */
export function cachedMyCard() {
  const cached = readJson(CARD_KEY, null);
  return cached && cached.nickname === myNickname() ? cached.card : null;
}

/** 1640 → "1.640" (sempre col punto: l'italiano di Intl non lo mette nei numeri a 4 cifre) */
export const formatPoints = (n) => String(Math.round(Number(n ?? 0))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
