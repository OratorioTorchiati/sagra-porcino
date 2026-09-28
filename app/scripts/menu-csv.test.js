import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { parseCsvRows, parseMenuCsv } from './menu-csv.js';

const HEADER = 'categoria;piatto;descrizione;prezzo;simboli;allergeni';

describe('parseCsvRows', () => {
  it('gestisce campi tra virgolette con separatori, virgolette doppie e a capo', () => {
    const rows = parseCsvRows('a;"b;c";"d ""e"""\n"f\ng";h\n', ';');
    expect(rows).toEqual([
      { line: 1, cells: ['a', 'b;c', 'd "e"'] },
      { line: 2, cells: ['f\ng', 'h'] },
    ]);
  });
});

describe('parseMenuCsv', () => {
  it('legge categorie e piatti nell\'ordine del file', () => {
    const menu = parseMenuCsv(
      [
        HEADER,
        'Primi;Tagliatelle ai porcini;Pasta fresca;9,00;porcini;glutine, uova',
        'Secondi;Salsiccia;;7;;',
        'Primi;Polenta;;6,5;vegetariana;',
      ].join('\n'),
    );
    expect(menu.categories.map((c) => c.name)).toEqual(['Primi', 'Secondi']);
    expect(menu.categories[0].dishes).toEqual([
      { name: 'Tagliatelle ai porcini', description: 'Pasta fresca', price: 9, symbols: ['porcini'], allergens: ['glutine', 'uova'] },
      { name: 'Polenta', description: '', price: 6.5, symbols: ['vegetariano'], allergens: [] },
    ]);
    expect(menu.categories[1].dishes[0].price).toBe(7);
  });

  it('ignora BOM, commenti, righe vuote e ";;;;;" di Excel', () => {
    const menu = parseMenuCsv(
      ['﻿# commento', '"# commento; salvato da Excel"', HEADER, ';;;;;', '', 'Dolci;Torta;;4,00;;'].join('\r\n'),
    );
    expect(menu.categories).toHaveLength(1);
  });

  it('categoria vuota = stessa della riga sopra', () => {
    const menu = parseMenuCsv([HEADER, 'Bevande;Acqua;;1,00;;', ';Vino;;3,00;;'].join('\n'));
    expect(menu.categories[0].dishes.map((d) => d.name)).toEqual(['Acqua', 'Vino']);
  });

  it('accetta colonne in ordine diverso e il separatore virgola', () => {
    const menu = parseMenuCsv(['piatto,prezzo,categoria', 'Acqua,"1,50",Bevande'].join('\n'));
    expect(menu.categories[0]).toEqual({
      name: 'Bevande',
      dishes: [{ name: 'Acqua', description: '', price: 1.5, symbols: [], allergens: [] }],
    });
  });

  it('accetta prezzi con simbolo dell\'euro', () => {
    const menu = parseMenuCsv([HEADER, 'Dolci;Torta;;€ 4,50;;'].join('\n'));
    expect(menu.categories[0].dishes[0].price).toBe(4.5);
  });

  it('segnala tutti gli errori con il numero di riga', () => {
    const csv = [HEADER, 'Primi;;;9,00;;', 'Primi;Gnocchi;;nove;;', 'Primi;Risotto;;8;funghetti;'].join('\n');
    expect(() => parseMenuCsv(csv)).toThrow(/Riga 2: manca il nome del piatto/);
    expect(() => parseMenuCsv(csv)).toThrow(/Riga 3: prezzo non valido "nove"/);
    expect(() => parseMenuCsv(csv)).toThrow(/Riga 4: simbolo sconosciuto "funghetti"/);
  });

  it('segnala le colonne obbligatorie mancanti', () => {
    expect(() => parseMenuCsv('categoria;nome;costo\nPrimi;Gnocchi;8')).toThrow(/mancano le colonne piatto, prezzo/);
  });

  it('menù senza piatti = nessuna categoria (non è un errore)', () => {
    expect(parseMenuCsv(HEADER)).toEqual({ categories: [] });
  });

  it('il file vero contenuti/menu.csv è valido', () => {
    const text = fs.readFileSync(new URL('../../contenuti/menu.csv', import.meta.url), 'utf8');
    expect(() => parseMenuCsv(text)).not.toThrow();
  });
});
