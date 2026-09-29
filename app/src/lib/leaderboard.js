// Classifica dal server (supabase/migrations/007_classifica.sql), "live": finché la pagina è aperta e visibile
// si richiede ogni pochi secondi passando l'ultima versione ricevuta; se non è cambiato nulla il server
// risponde solo "invariata" (pochi byte). L'ultima classifica resta sul telefono per mostrarla senza rete.

import { rpc } from './api.js';
import { readJson, writeJson } from './storage.js';
import { currentPlayer, sessionToken } from './account.js';

const KEY = 'sagra-classifica';
const CARD_KEY = 'sagra-mia-scheda';
export const POLL_MS = 5000;

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
 * Tiene aggiornata la classifica finché non si chiama la funzione restituita.
 * onData(data) a ogni classifica nuova; onWindow(window) sempre; onOnline(bool) quando cambia la connessione.
 */
export function watchLeaderboard({ onData, onWindow, onOnline }) {
  let version = cachedLeaderboard()?.version ?? null;
  let timer = null;
  let stopped = false;
  let online = null;
  let first = true; // la prima richiesta si fa sempre; le successive solo con la pagina visibile

  function setOnline(value) {
    if (value !== online) {
      online = value;
      onOnline?.(value);
    }
  }

  async function poll() {
    clearTimeout(timer);
    if (stopped) return;
    if (first || document.visibilityState !== 'hidden') {
      first = false;
      try {
        const data = await fetchLeaderboard(version);
        if (stopped) return;
        setOnline(true);
        onWindow?.(data.window);
        if (data.ok && !data.unchanged) {
          version = data.version;
          onData(data);
        }
      } catch {
        if (!stopped) setOnline(false);
      }
    }
    if (!stopped) timer = setTimeout(poll, POLL_MS);
  }

  const wake = () => document.visibilityState !== 'hidden' && poll();
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  poll();

  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('online', wake);
  };
}

/** Scheda di un giocatore: { nickname, avatar, total, position, best: {gioco: punti}, extra_total, players } */
export async function fetchPlayerCard(nickname) {
  const res = await rpc('get_player_card', { p_nickname: nickname });
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
