import { describe, it, expect } from 'vitest';
import { naturalCompare } from './sponsors.js';

describe('ordine degli sponsor (D126)', () => {
  it('i numeri contano come numeri: 10 dopo 9, non dopo 1', () => {
    const files = ['10-forno.webp', '2-bar.webp', '1-macelleria.webp', '9-pizzeria.webp', '11-banca.webp'];
    expect(files.sort(naturalCompare)).toEqual(['1-macelleria.webp', '2-bar.webp', '9-pizzeria.webp', '10-forno.webp', '11-banca.webp']);
  });

  it('a parità di numero conta il nome, senza badare alle maiuscole', () => {
    expect(['3-Zeta.webp', '3-alfa.webp'].sort(naturalCompare)).toEqual(['3-alfa.webp', '3-Zeta.webp']);
  });
});
