import { describe, expect, it } from 'vitest';
import { menuTemplate, readMenuFile, countDishes } from './menu-data.js';

describe('menù caricato dal pannello (D96)', () => {
  it('il template da scaricare è già un menù valido (con i commenti e le lettere accentate)', () => {
    const { menu, errors } = readMenuFile(menuTemplate());
    expect(errors).toBeUndefined();
    expect(countDishes(menu)).toBe(4);
    expect(menu.categories.map((c) => c.name)).toEqual(['Primi', 'Secondi', 'Dolci', 'Bevande']);
  });

  it('un file sbagliato dà l\'elenco degli errori, riga per riga', () => {
    const { errors } = readMenuFile('categoria;piatto;prezzo\nPrimi;Tagliatelle;nove euro\nSecondi;;5,00\n');
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/Riga 2: prezzo non valido/);
    expect(errors[1]).toMatch(/Riga 3: manca il nome/);
  });
});
