// Immagini degli sponsor (D126): sono nell'app (app/src/assets/sponsor/, preparate da `npm run sponsor-images`
// partendo da contenuti/sponsor/), quindi restano sul telefono anche offline e non pesano sul database.
// In ordine alfabetico del nome del file, con i numeri contati come numeri: 1, 2, … 9, 10, 11 (non 1, 10, 11, 2).
// Gli sponsor grandi (nome che finisce con "-grande", D129) occupano più riquadri secondo la forma: quadrato 2×2,
// largo 2 colonne, alto 2 righe. La forma la scrive lo script in sponsors.json.

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
 * Come sta l'immagine nel suo riquadro (D129): lo riempie ("cover") se così se ne taglia al massimo il 15%;
 * altrimenti si vede intera ("contain"), per non tagliare la scritta di un logo molto più largo o alto del riquadro.
 */
export function sponsorFit(ratio, { cols, rows }) {
  if (!ratio) return 'cover';
  const cell = cols / rows;
  const kept = Math.min(ratio, cell) / Math.max(ratio, cell); // parte che resta visibile riempiendo
  return kept >= 0.85 ? 'cover' : 'contain';
}

/** [{ name, url, big, shape, ratio }] in ordine di nome del file */
export const SPONSORS = Object.keys(files)
  .sort(naturalCompare)
  .map((key) => {
    const name = key.split('/').pop().replace(/\.webp$/, '');
    const info = manifest.find((m) => m.name === name);
    return { name, url: files[key], big: info?.big ?? false, shape: info?.shape ?? 'square', ratio: info?.ratio ?? null };
  });
