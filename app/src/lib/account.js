// Stato dell'account sul telefono: chiave di sessione + copia del profilo (nickname, personaggio),
// così l'app mostra il giocatore anche senza rete. La chiave vale 30 giorni (tutta la sagra).

import { rpc } from './api.js';
import { readJson, writeJson } from './storage.js';
import { getDeviceId, getFingerprint } from './device.js';

const KEY = 'sagra-account';
const listeners = new Set();

let state = readJson(KEY, null); // { token, player: { nickname, avatar, role } } oppure null

function save(next) {
  state = next;
  if (next) writeJson(KEY, next);
  else {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // niente
    }
  }
  listeners.forEach((fn) => fn(state));
}

/** Giocatore collegato ({ nickname, avatar, role }) o null. */
export function currentPlayer() {
  return state?.player ?? null;
}

export function sessionToken() {
  return state?.token ?? null;
}

/** Avvisa quando si entra o si esce (es. per aggiornare il bottone in alto a destra). */
export function onAccountChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function deviceInfo() {
  return {
    p_device_id: await getDeviceId(),
    p_fingerprint: await getFingerprint(),
    p_user_agent: navigator.userAgent,
  };
}

/**
 * Registrazione. Restituisce { ok: true } oppure { ok: false, error, ... } con i codici del server
 * (DEVICE_ALREADY_USED, NICKNAME_TAKEN, NICKNAME_INVALID, NICKNAME_NOT_ALLOWED, PIN_INVALID...).
 * Lancia NetworkError se manca la connessione.
 */
export async function register({ nickname, avatar, pin }) {
  const result = await rpc('register', { p_nickname: nickname, p_avatar: avatar, p_pin: pin, ...(await deviceInfo()) });
  if (result.ok) save({ token: result.token, player: result.player });
  return result;
}

/** Accesso con nickname + PIN. Errori: WRONG_CREDENTIALS (attempts_left), LOCKED (retry_after_s), DISABLED. */
export async function login({ nickname, pin }) {
  const result = await rpc('login', { p_nickname: nickname, p_secret: pin, ...(await deviceInfo()) });
  if (result.ok) save({ token: result.token, player: result.player });
  return result;
}

/** Esce: cancella la sessione sul telefono (e, se c'è rete, sul server). */
export async function logout() {
  const token = sessionToken();
  save(null);
  if (token) rpc('logout', { p_token: token }).catch(() => {});
}

/**
 * Aggiorna il profilo dal server. Se la sessione non vale più (scaduta, account disattivato)
 * esce dall'account. Senza rete lascia tutto com'è.
 */
export async function refreshProfile() {
  const token = sessionToken();
  if (!token) return null;
  const result = await rpc('get_my_profile', { p_token: token });
  if (result.ok) {
    save({ token, player: result.player });
    return result.player;
  }
  if (result.error === 'NOT_LOGGED_IN') save(null);
  return null;
}

/** Controllo del nickname mentre lo si scrive (solo informativo). */
export function checkNickname(nickname) {
  return rpc('check_nickname', { p_nickname: nickname });
}
