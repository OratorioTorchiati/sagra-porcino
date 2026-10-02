import { describe, it, expect } from 'vitest';
import { naturalCompare, sponsorSpan, sponsorFit } from './sponsors.js';

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

describe('come sta un\'immagine nel riquadro (D129)', () => {
  it('lo riempie se si taglia poco, altrimenti intera', () => {
    expect(sponsorFit(1, { cols: 2, rows: 2 })).toBe('cover'); // Vit, quadrato in 2×2
    expect(sponsorFit(1.6, { cols: 1, rows: 1 })).toBe('contain'); // largo in un quadrato
    expect(sponsorFit(2.2, { cols: 2, rows: 1 })).toBe('cover'); // largo in 2 colonne: si taglia ~9%
    expect(sponsorFit(2.5, { cols: 2, rows: 1 })).toBe('contain'); // Raffael: si taglierebbe il 20%
  });
});
