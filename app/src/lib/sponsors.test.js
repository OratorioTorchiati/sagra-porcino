import { describe, it, expect } from 'vitest';
import { naturalCompare, sponsorSpan, sponsorLayout } from './sponsors.js';

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

describe('posizione degli sponsor (D132)', () => {
  const n = (name) => ({ name, big: false, shape: 'square' });
  const G = (name, shape = 'square') => ({ name, big: true, shape });
  const where = (items, columns) => sponsorLayout(items, columns).map((p) => `${p.item.name}:${p.row},${p.col}`).join(' ');

  it('il grande 2×2 in alto a sinistra, il 2 accanto in alto a destra (mezze colonne)', () => {
    expect(where([G('1'), n('2'), n('3'), n('4')], 3)).toBe('1:1,1 2:1,5 3:2,5 4:3,3');
  });

  it('ultima riga con uno solo su 3 colonne: al centro', () => {
    expect(where([n('1'), n('2'), n('3'), n('4')], 3)).toBe('1:1,1 2:1,3 3:1,5 4:2,3');
  });

  it('ultima riga con due su 3 colonne: centrati a metà colonna', () => {
    expect(where([n('1'), n('2'), n('3'), n('4'), n('5')], 3)).toBe('1:1,1 2:1,3 3:1,5 4:2,2 5:2,4');
  });

  it('riga piena: niente spostamenti', () => {
    expect(where([n('1'), n('2'), n('3')], 3)).toBe('1:1,1 2:1,3 3:1,5');
  });

  it('il grande largo che non entra va alla riga dopo (lì, da solo, al centro); il successivo riempie il buco', () => {
    expect(where([n('1'), n('2'), G('3', 'wide'), n('4')], 3)).toBe('1:1,1 2:1,3 3:2,2 4:1,5');
  });
});
