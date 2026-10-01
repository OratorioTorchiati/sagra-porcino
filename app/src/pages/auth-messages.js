// Messaggi in italiano semplice per i codici di errore del server (registrazione e accesso).

import { PIN_TOO_SIMPLE_MESSAGE } from '../lib/pin.js';

export function authErrorMessage(result) {
  switch (result.error) {
    case 'NICKNAME_INVALID':
      return 'Il nickname deve avere da 3 a 16 caratteri: solo lettere, numeri e _ (niente spazi).';
    case 'NICKNAME_NOT_ALLOWED':
      return 'Questo nickname non è permesso. Scegline un altro.';
    case 'NICKNAME_TAKEN':
      return 'Questo nickname è già usato. Scegline un altro.';
    case 'DEVICE_ALREADY_USED':
      return `Da questo telefono è già stato creato un account (nickname: ${result.nickname_hint}). Accedi con quello.`;
    case 'PIN_INVALID':
      return 'Il PIN deve avere 5 cifre.';
    case 'PIN_TOO_SIMPLE':
      return `${PIN_TOO_SIMPLE_MESSAGE}: niente cifre tutte uguali o in fila (00000, 12345...).`;
    case 'AVATAR_INVALID':
      return 'Scegli un personaggio.';
    case 'DEVICE_MISSING':
      return 'Il telefono non è stato riconosciuto. Ricarica la pagina e riprova.';
    // 5 tentativi, poi un blocco che cresce a ogni volta (D82): dal 3° tentativo si vedono quelli rimasti
    case 'WRONG_CREDENTIALS':
      if (result.attempts_left === 1) return 'Non agitarti e pensa più a fondo, hai soltanto un altro tentativo.';
      if (result.attempts_left === 2) return 'Nickname o PIN sbagliati. 2 tentativi rimanenti, mantieni la calma.';
      if (result.attempts_left === 3) return 'Nickname o PIN sbagliati. 3 tentativi rimanenti.';
      return 'Nickname o PIN sbagliati.';
    case 'LOCKED': {
      const minutes = Math.max(1, Math.ceil((result.retry_after_s ?? 900) / 60));
      return `Tentativi finiti. Riprova tra ${minutes} ${minutes === 1 ? 'minuto' : 'minuti'}.`;
    }
    case 'DISABLED':
      return 'Questo account è stato bloccato dagli organizzatori. Rivolgiti allo stand della sagra.';
    case 'DEVICE_BANNED':
      return 'Questo telefono è stato bloccato dagli organizzatori. Rivolgiti allo stand della sagra.';
    default:
      return 'Qualcosa non ha funzionato. Riprova tra poco.';
  }
}

export const OFFLINE_MESSAGE = 'Serve un attimo di connessione. Riprova tra poco.';
export const NOT_CONFIGURED_MESSAGE = 'Gli account non sono ancora attivi. Riprova più tardi.';

/** Dove andare dopo registrazione o accesso (impostato da chi chiede di entrare, es. un gioco); se no la home (D121). */
const AFTER_KEY = 'sagra-dopo-accesso';

export function setAfterLogin(path) {
  try {
    sessionStorage.setItem(AFTER_KEY, path);
  } catch {
    // niente
  }
}

export function takeAfterLogin() {
  try {
    const path = sessionStorage.getItem(AFTER_KEY);
    sessionStorage.removeItem(AFTER_KEY);
    return path || '/';
  } catch {
    return '/';
  }
}
