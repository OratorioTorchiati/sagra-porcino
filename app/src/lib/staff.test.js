import { describe, expect, it } from 'vitest';
import { isoToRomeLocal, romeLocalToIso, toCsv, noteLabel } from './staff.js';

describe('date del pannello staff (ora italiana)', () => {
  it('ottobre è ora legale (+02:00)', () => {
    expect(romeLocalToIso('2026-10-18T23:00')).toBe('2026-10-18T23:00:00+02:00');
    expect(isoToRomeLocal('2026-10-18T23:00:00+02:00')).toBe('2026-10-18T23:00');
    expect(isoToRomeLocal('2026-10-18T21:00:00Z')).toBe('2026-10-18T23:00');
  });

  it('dopo il cambio d\'ora è +01:00', () => {
    expect(romeLocalToIso('2026-11-02T10:00')).toBe('2026-11-02T10:00:00+01:00');
  });

  it('vuoto = nessun limite', () => {
    expect(romeLocalToIso('')).toBe(null);
    expect(isoToRomeLocal(null)).toBe('');
  });
});

describe('CSV', () => {
  it('separatore ; e virgolette solo dove servono', () => {
    const csv = toCsv([['Posizione', 'Nickname'], [1, 'a;b'], [2, 'dice "ciao"']]);
    expect(csv).toBe('﻿Posizione;Nickname\r\n1;"a;b"\r\n2;"dice ""ciao"""\r\n');
  });
});

describe('motivi delle partite', () => {
  it('in italiano semplice, codice sconosciuto così com\'è', () => {
    expect(noteLabel('tocchi_troppo_regolari')).toMatch(/regolari/);
    expect(noteLabel('nuovo_codice')).toBe('nuovo_codice');
  });
});
