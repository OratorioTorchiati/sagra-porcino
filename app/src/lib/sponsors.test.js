import { describe, it, expect } from 'vitest';
import { naturalCompare, sponsorSpan } from './sponsors.js';

describe('ordine degli sponsor (D126)', () => {
  it('i numeri contano come numeri: 10 dopo 9, non dopo 1', () => {
    const files = ['10-forno.webp', '2-bar.webp', '1-macelleria.webp', '9-pizzeria.webp', '11-banca.webp'];
    expect(files.sort(naturalCompare)).toEqual(['1-macelleria.webp', '2-bar.webp', '9-pizzeria.webp', '10-forno.webp', '11-banca.webp']);
  });

  it('a parità di numero conta il nome, senza badare alle maiuscole', () => {
    expect(['3-Zeta.webp', '3-alfa.webp'].sort(naturalCompare)).toEqual(['3-alfa.webp', '3-Zeta.webp']);
  });
});

describe('sponsor grandi (D129)', () => {
  it('quadrato 2×2, largo 2 colonne, alto 2 righe; i normali 1×1', () => {
    expect(sponsorSpan({ big: true, shape: 'square' }, 3)).toEqual({ cols: 2, rows: 2 });
    expect(sponsorSpan({ big: true, shape: 'wide' }, 3)).toEqual({ cols: 2, rows: 1 });
    expect(sponsorSpan({ big: true, shape: 'tall' }, 3)).toEqual({ cols: 1, rows: 2 });
    expect(sponsorSpan({ big: false, shape: 'square' }, 3)).toEqual({ cols: 1, rows: 1 });
  });

  it('con una sola colonna anche i grandi sono 1×1', () => {
    expect(sponsorSpan({ big: true, shape: 'square' }, 1)).toEqual({ cols: 1, rows: 1 });
  });
});
