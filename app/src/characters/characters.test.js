import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { CHARACTERS, CHARACTER_IDS } from './characters.js';

describe('personaggi', () => {
  it('sono tra 8 e 16, con id e nomi unici', () => {
    expect(CHARACTERS.length).toBeGreaterThanOrEqual(8);
    expect(CHARACTERS.length).toBeLessThanOrEqual(16);
    expect(new Set(CHARACTER_IDS).size).toBe(CHARACTERS.length);
    expect(new Set(CHARACTERS.map((c) => c.name)).size).toBe(CHARACTERS.length);
  });

  it('gli id coincidono con quelli ammessi dal database (ultima versione: 020)', () => {
    const sql = fs.readFileSync(new URL('../../../supabase/migrations/020_personaggi_velenosi.sql', import.meta.url), 'utf8');
    const block = sql.match(/_avatar_ids\(\)[\s\S]*?array\[([\s\S]*?)\]/)[1];
    const dbIds = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(dbIds).toEqual(CHARACTER_IDS);
  });

  it('ogni disegno è un SVG 100×100', () => {
    for (const c of CHARACTERS) expect(c.svg).toMatch(/^<svg [^>]*viewBox="0 0 100 100"/);
  });
});
