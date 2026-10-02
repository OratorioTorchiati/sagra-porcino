// Regole del PIN (D82), uguali a _pin_problem in supabase/migrations/016_pin_sicurezza.sql.

export const PIN_LENGTH = 5;

/**
 * Problema del PIN scelto, null se va bene.
 * 'PIN_INVALID' = non ha 5 cifre; 'PIN_TOO_SIMPLE' = cifre tutte uguali (00000) o scala (12345, 98765).
 */
export function pinProblem(pin) {
  if (!/^[0-9]{5}$/.test(pin ?? '')) return 'PIN_INVALID';
  if (/^(.)\1{4}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'PIN_TOO_SIMPLE';
  return null;
}

export const PIN_TOO_SIMPLE_MESSAGE = 'Troppo semplice! Sforzati di più';

/** PIN scritto per entrare: 5 cifre (D125: niente più PIN a 4 cifre, il database di produzione parte vuoto) */
export const LOGIN_PIN_RE = /^[0-9]{5}$/;

/** Lunghezza minima del nickname (come _nickname_problem sul server) */
export const NICK_MIN = 3;
