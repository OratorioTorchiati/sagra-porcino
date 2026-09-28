import { describe, expect, it } from 'vitest';
import { deviceCode, firstValidId, isValidId } from './device.js';

const A = '3f2b8c1e-9d4a-4b7e-8f21-0c6d5e4a3b2f';
const B = 'a1b2c3d4-e5f6-4789-abcd-ef0123456789';

describe('ID dispositivo', () => {
  it('riconosce solo UUID validi', () => {
    expect(isValidId(A)).toBe(true);
    expect(isValidId('ciao')).toBe(false);
    expect(isValidId(null)).toBe(false);
    expect(isValidId(`${A}x`)).toBe(false);
  });

  it('usa il primo valido nell\'ordine localStorage → IndexedDB → cookie', () => {
    expect(firstValidId([A, B, null])).toBe(A);
    expect(firstValidId([null, B, A])).toBe(B); // localStorage cancellato: recuperato da IndexedDB
    expect(firstValidId([null, null, A])).toBe(A); // recuperato dal cookie
    expect(firstValidId(['rovinato', null, A])).toBe(A);
    expect(firstValidId([null, null, null])).toBe(null);
  });

  it('codice breve per lo staff: prime 8 cifre, maiuscole, in due gruppi', () => {
    expect(deviceCode(A)).toBe('3F2B-8C1E');
    expect(deviceCode(B)).toBe('A1B2-C3D4');
  });
});
