// Immagini degli sponsor (D126): sono nell'app (app/src/assets/sponsor/, preparate da `npm run sponsor-images`
// partendo da contenuti/sponsor/), quindi restano sul telefono anche offline e non pesano sul database.
// In ordine alfabetico del nome del file, con i numeri contati come numeri: 1, 2, … 9, 10, 11 (non 1, 10, 11, 2).

const files = import.meta.glob('../assets/sponsor/*.webp', { eager: true, import: 'default' });

/** Ordine "naturale": "2-bar" prima di "10-forno" */
export const naturalCompare = (a, b) => a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' });

/** [{ name, url }] in ordine di nome del file */
export const SPONSORS = Object.keys(files)
  .sort(naturalCompare)
  .map((key) => ({ name: key.split('/').pop().replace(/\.webp$/, ''), url: files[key] }));
