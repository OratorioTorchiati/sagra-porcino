// Carte del Memory: foto vere dei luoghi del paese (contenuti/memory/ → npm run memory-images, D72, D103).
// Ogni carta: id, didascalia breve (10–12 lettere al massimo), foto (src) su uno sfondo colorato `bg`; ogni carta
// ha un colore diverso (ma si distinguono anche senza). Una carta può avere anche un disegno (svg) al posto della foto.

import arcoUrl from './photos/arco.webp';
import campoUrl from './photos/campo.webp';
import cannoneUrl from './photos/cannone.webp';
import chiesaUrl from './photos/chiesa.webp';
import incoronataUrl from './photos/incoronata.webp';
import monumentoUrl from './photos/monumento.webp';
import municipioUrl from './photos/municipio.webp';
import salvatoreUrl from './photos/salvatore.webp';

export const CARDS = [
  { id: 'municipio', caption: 'Municipio', src: municipioUrl, bg: '#fde3dc' },
  { id: 'monumento', caption: 'Monumento', src: monumentoUrl, bg: '#e2e8f0' },
  { id: 'salvatore', caption: 'Salvatore', src: salvatoreUrl, bg: '#f9e0a8' },
  { id: 'chiesa', caption: 'Chiesa', src: chiesaUrl, bg: '#e8e0f5' },
  { id: 'arco', caption: 'Arco', src: arcoUrl, bg: '#e6f0d8' },
  { id: 'cannone', caption: 'Cannone', src: cannoneUrl, bg: '#f6e4c8' },
  { id: 'campo', caption: 'Campo', src: campoUrl, bg: '#dcecf7' },
  { id: 'incoronata', caption: 'Incoronata', src: incoronataUrl, bg: '#d9f0ec' },
];

/** Retro delle carte, uguale per tutte, a tema porcino */
export const CARD_BACK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" rx="8" fill="#7a4a1e"/>
  <rect x="6" y="6" width="88" height="88" rx="5" fill="none" stroke="#c8861a" stroke-width="2.5" stroke-dasharray="4 4"/>
  <path d="M40 54 C37 62 37 70 41 74 C44 77 56 77 59 74 C63 70 63 62 60 54 Z" fill="#f1e5cc"/>
  <path d="M24 52 C24 36 36 26 50 26 C64 26 76 36 76 52 C76 56 72 57 69 56 C58 54 42 54 31 56 C28 57 24 56 24 52 Z" fill="#c08a52"/>
</svg>`;
