// Immagini degli sponsor (D126): sono nell'app (app/src/assets/sponsor/, preparate da `npm run sponsor-images`
// partendo da contenuti/sponsor/), quindi restano sul telefono anche offline e non pesano sul database.
// In ordine alfabetico del nome del file, con i numeri contati come numeri: 1, 2, … 9, 10, 11 (non 1, 10, 11, 2).
// Gli sponsor grandi (nome che finisce con "-grande", D129) occupano più riquadri secondo la forma: quadrato 2×2,
// largo 2 colonne, alto 2 righe. La forma la scrive lo script in sponsors.json; lo script porta anche ogni immagine
// alla proporzione esatta del suo riquadro (sfondo aggiunto, niente tagli), quindi ogni casella è piena (D130).

import manifest from '../assets/sponsor/sponsors.json';

const files = import.meta.glob('../assets/sponsor/*.webp', { eager: true, import: 'default' });

/** Ordine "naturale": "2-bar" prima di "10-forno" */
export const naturalCompare = (a, b) => a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' });

/** Riquadri occupati da uno sponsor: { cols, rows } (1×1 i normali) */
export function sponsorSpan({ big, shape }, columns) {
  if (!big || columns < 2) return { cols: 1, rows: 1 };
  if (shape === 'wide') return { cols: 2, rows: 1 };
  if (shape === 'tall') return { cols: 1, rows: 2 };
  return { cols: 2, rows: 2 };
}

/**
 * Posizione di ogni sponsor nella tabella (D132): come una griglia che riempie i buchi (ognuno nel primo posto libero
 * da in alto a sinistra in cui entra). Poi, se l'ultima riga resta incompleta, i suoi sponsor vanno al centro.
 * Restituisce [{ item, row, col, cols, rows }] con righe e colonne da 1; `col` in MEZZE colonne (da 1 a 2×columns),
 * così anche 2 sponsor su 3 colonne si centrano esattamente.
 */
export function sponsorLayout(items, columns) {
  const taken = []; // taken[r][c] = casella occupata
  const free = (r, c, cols, rows) => {
    if (c + cols > columns) return false;
    for (let y = r; y < r + rows; y++) for (let x = c; x < c + cols; x++) if (taken[y]?.[x]) return false;
    return true;
  };
  const placed = items.map((item) => {
    const { cols, rows } = sponsorSpan(item, columns);
    for (let r = 0; ; r++) {
      for (let c = 0; c + cols <= columns; c++) {
        if (!free(r, c, cols, rows)) continue;
        for (let y = r; y < r + rows; y++) for (let x = c; x < c + cols; x++) (taken[y] ??= [])[x] = true;
        return { item, row: r + 1, col: c * 2 + 1, cols, rows };
      }
    }
  });
  // Ultima riga incompleta: se ci sono solo sponsor che iniziano e finiscono lì, si spostano al centro
  const lastRow = taken.length;
  const inLast = placed.filter((p) => p.row + p.rows - 1 === lastRow);
  if (inLast.length && inLast.every((p) => p.row === lastRow && p.rows === 1)) {
    const used = inLast.reduce((n, p) => n + p.cols, 0);
    if (used < columns) {
      let col = columns - used + 1; // mezze colonne: (2×columns − 2×used) / 2 + 1
      for (const p of inLast.sort((a, b) => a.col - b.col)) {
        p.col = col;
        col += p.cols * 2;
      }
    }
  }
  return placed;
}

/** [{ name, url, big, shape }] in ordine di nome del file */
export const SPONSORS = Object.keys(files)
  .sort(naturalCompare)
  .map((key) => {
    const name = key.split('/').pop().replace(/\.webp$/, '');
    const info = manifest.find((m) => m.name === name);
    return { name, url: files[key], big: info?.big ?? false, shape: info?.shape ?? 'square' };
  });
