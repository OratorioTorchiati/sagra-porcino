import { describe, expect, it } from 'vitest';
import { isoToRomeLocal, romeLocalToIso, toCsv, noteLabel, deviceKind, browserName } from './staff.js';
import { playerPhones } from '../pages/staff-players.js';

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

describe('telefoni del giocatore (pannello staff)', () => {
  it('ognuno una volta sola, con registrazione, attivo e bloccato', () => {
    const phones = playerPhones({
      devices: [{ device_id: 'a', banned: false, same_fingerprint: 2 }],
      sessions: [{ device_id: 'a', banned: false }, { device_id: 'b', banned: true }, { device_id: 'b', banned: true }, { device_id: null }],
    });
    expect(phones).toEqual([
      { id: 'a', registration: true, active: true, banned: false, sameFingerprint: 2, userAgent: null },
      { id: 'b', registration: false, active: true, banned: true, sameFingerprint: 0, userAgent: null },
    ]);
  });
});

describe('telefono o computer, e browser (dal user agent)', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_4_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
  const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36';
  const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  const EDGE = `${WINDOWS} Edg/140.0.0.0`;
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  it.each([
    [IPHONE, 'mobile', 'Safari'],
    [ANDROID, 'mobile', 'Chrome'],
    [SAMSUNG, 'mobile', 'Samsung Internet'],
    [WINDOWS, 'computer', 'Chrome'],
    [EDGE, 'computer', 'Edge'],
    [MAC, 'computer', 'Safari'],
  ])('%#', (ua, kind, browser) => {
    expect(deviceKind(ua)).toBe(kind);
    expect(browserName(ua)).toBe(browser);
  });
  it('sconosciuto', () => {
    expect(deviceKind(null)).toBe(null);
    expect(browserName('')).toBe('—');
  });
});
