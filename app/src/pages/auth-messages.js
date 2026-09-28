// Messaggi in italiano semplice per i codici di errore del server (registrazione e accesso).

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
      return 'Il PIN deve avere 4 cifre.';
    case 'AVATAR_INVALID':
      return 'Scegli un personaggio.';
    case 'DEVICE_MISSING':
      return 'Il telefono non è stato riconosciuto. Ricarica la pagina e riprova.';
    case 'WRONG_CREDENTIALS':
      return result.attempts_left <= 3
        ? `Nickname o PIN sbagliati. Ancora ${result.attempts_left} ${result.attempts_left === 1 ? 'tentativo' : 'tentativi'}, poi dovrai aspettare 15 minuti.`
        : 'Nickname o PIN sbagliati.';
    case 'LOCKED': {
      const minutes = Math.max(1, Math.ceil((result.retry_after_s ?? 900) / 60));
      return `Troppi tentativi sbagliati. Riprova tra ${minutes} ${minutes === 1 ? 'minuto' : 'minuti'}.`;
    }
    case 'DISABLED':
      return 'Questo account è stato disattivato. Rivolgiti allo stand della sagra.';
    default:
      return 'Qualcosa non ha funzionato. Riprova tra poco.';
  }
}

export const OFFLINE_MESSAGE = 'Serve un attimo di connessione. Riprova tra poco.';
export const NOT_CONFIGURED_MESSAGE = 'Gli account non sono ancora attivi. Riprova più tardi.';

/** Dove andare dopo registrazione o accesso (impostato da chi chiede di entrare, es. un gioco). */
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
    return path || '/profilo';
  } catch {
    return '/profilo';
  }
}
