import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { pinProblem } from './pin.js';
import { authErrorMessage } from '../pages/auth-messages.js';

describe('PIN scelto alla registrazione', () => {
  it('5 cifre', () => {
    expect(pinProblem('1234')).toBe('PIN_INVALID');
    expect(pinProblem('123456')).toBe('PIN_INVALID');
    expect(pinProblem('12a45')).toBe('PIN_INVALID');
    expect(pinProblem('')).toBe('PIN_INVALID');
    expect(pinProblem(null)).toBe('PIN_INVALID');
  });

  it.each(['00000', '11111', '99999', '12345', '01234', '56789', '98765', '43210'])('%s troppo semplice', (pin) => {
    expect(pinProblem(pin)).toBe('PIN_TOO_SIMPLE');
  });

  it.each(['12346', '90123', '13579', '11112', '48151', '24680'])('%s va bene', (pin) => {
    expect(pinProblem(pin)).toBe(null);
  });

  it('stesse regole del server (016)', () => {
    const sql = fs.readFileSync(new URL('../../../supabase/migrations/016_pin_sicurezza.sql', import.meta.url), 'utf8');
    expect(sql).toContain(`p_pin !~ '^[0-9]{5}$'`);
    expect(sql).toContain(`p_pin ~ '^(.)\\1{4}$' or position(p_pin in '0123456789') > 0 or position(p_pin in '9876543210') > 0`);
  });
});

describe('messaggi dei tentativi di accesso', () => {
  const msg = (left) => authErrorMessage({ error: 'WRONG_CREDENTIALS', attempts_left: left });
  it('dal 3° tentativo si vedono quelli rimasti', () => {
    expect(msg(4)).toBe('Nickname o PIN sbagliati.');
    expect(msg(3)).toBe('Nickname o PIN sbagliati. 3 tentativi rimanenti.');
    expect(msg(2)).toBe('Nickname o PIN sbagliati. 2 tentativi rimanenti, mantieni la calma.');
    expect(msg(1)).toBe('Non agitarti e pensa più a fondo, hai soltanto un altro tentativo.');
  });
});
