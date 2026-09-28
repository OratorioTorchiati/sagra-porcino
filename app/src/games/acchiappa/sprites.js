// Disegni originali (SVG 100×100, centrati) degli elementi di "Acchiappa il porcino".
//
// Regola di forma, oltre al colore: i PORCINI hanno cappello a cupola e GAMBO TOZZO e panciuto;
// i funghi VELENOSI hanno GAMBO SOTTILE con anello (e volva, pois o scintille). Gli oggetti sbagliati
// non sono funghi. Tutti hanno un contorno scuro per staccarsi dallo sfondo chiaro.

import { svg100 as svg, PORCINI } from '../shared/porcini.js';

// Niente ombra: gli elementi ruotano e un'ombra che gira con loro sembrerebbe una macchia
const shadow = '';

// ---------- Porcini (buoni): disegni in comune con gli altri giochi ----------

export const GOOD = PORCINI;

// ---------- Funghi velenosi (cattivi) ----------

const ovolaccio = svg(`
  ${shadow}
  <ellipse cx="50" cy="87" rx="13" ry="6.5" fill="#f3efe6" stroke="#6d6658" stroke-width="2"/>
  <path d="M45 52 C44 64 43 76 43 86 L57 86 C57 76 56 64 55 52 Z" fill="#fbf8f1" stroke="#6d6658" stroke-width="2"/>
  <path d="M39 62 C43 57 57 57 61 62 L63 69 C55 72 45 72 37 69 Z" fill="#f3efe6" stroke="#6d6658" stroke-width="2"/>
  <path d="M11 50 C29 57 71 57 89 50 C81 59 19 59 11 50 Z" fill="#f6efe0" stroke="#6d1410" stroke-width="1.5"/>
  <path d="M7 50 C8 29 27 15 50 15 C73 15 92 29 93 50 C79 54 21 54 7 50 Z" fill="#d7261e" stroke="#6d1410" stroke-width="2.5"/>
  <g fill="#ffffff" stroke="#e9d9d0" stroke-width="0.8">
    <circle cx="30" cy="31" r="5.5"/><circle cx="50" cy="23" r="5"/><circle cx="70" cy="31" r="5.5"/>
    <circle cx="40" cy="42" r="4"/><circle cx="61" cy="42" r="4.5"/><circle cx="19" cy="44" r="3.5"/>
    <circle cx="81" cy="44" r="3.5"/><circle cx="51" cy="35" r="3"/>
  </g>
`);

const velenosoGiallo = svg(`
  ${shadow}
  <path d="M37 84 C37 93 63 93 63 84 C61 80 39 80 37 84 Z" fill="#e9edc9" stroke="#5f6420" stroke-width="2"/>
  <path d="M46 50 C45 62 44 74 44 84 L56 84 C56 74 55 62 54 50 Z" fill="#f2f5dc" stroke="#5f6420" stroke-width="2"/>
  <path d="M40 60 C44 55 56 55 60 60 L62 66 C55 69 45 69 38 66 Z" fill="#e9edc9" stroke="#5f6420" stroke-width="2"/>
  <path d="M23 52 C21 33 32 14 50 10 C68 14 79 33 77 52 C64 57 36 57 23 52 Z" fill="#c3cf3f" stroke="#4d5412" stroke-width="2.5"/>
  <path d="M50 12 L50 52 M50 12 C44 24 38 38 34 53 M50 12 C56 24 62 38 66 53 M50 12 C40 22 30 36 27 51 M50 12 C60 22 70 36 73 51" fill="none" stroke="#7d8a1e" stroke-width="1.8" stroke-linecap="round"/>
  <ellipse cx="41" cy="25" rx="6" ry="3" transform="rotate(-50 41 25)" fill="#e2ea8a" opacity="0.8"/>
`);

const velenosoViola = svg(`
  ${shadow}
  <path d="M46 50 C39 62 57 70 47 88 L57 88 C64 70 49 62 55 50 Z" fill="#eadcf3" stroke="#4b1f63" stroke-width="2"/>
  <path d="M40 62 C44 58 56 58 60 62 L61 67 C54 70 46 70 39 67 Z" fill="#dcc6ea" stroke="#4b1f63" stroke-width="2"/>
  <path d="M9 50 C11 28 29 14 50 14 C71 14 89 28 91 50 C85 47 80 55 72 51 C66 57 58 50 50 55 C42 50 34 57 28 51 C20 55 15 47 9 50 Z" fill="#8e3fb0" stroke="#3d1452" stroke-width="2.5"/>
  <g fill="#f0c8ff"><circle cx="32" cy="33" r="4.5"/><circle cx="52" cy="26" r="5"/><circle cx="70" cy="36" r="4"/><circle cx="44" cy="43" r="3"/></g>
  <g fill="#ffe24a" stroke="#b58a00" stroke-width="0.8">
    <path d="M14 14 L16 20 L22 22 L16 24 L14 30 L12 24 L6 22 L12 20 Z"/>
    <path d="M86 12 L87.5 17 L92 18.5 L87.5 20 L86 25 L84.5 20 L80 18.5 L84.5 17 Z"/>
    <path d="M84 70 L85.5 74 L89 75.5 L85.5 77 L84 81 L82.5 77 L79 75.5 L82.5 74 Z"/>
  </g>
`);

// ---------- Oggetti a tema ma sbagliati (cattivi) ----------

const castagna = svg(`
  ${shadow}
  <path d="M50 12 C55 21 82 33 84 60 C86 81 69 91 50 91 C31 91 14 81 16 60 C18 33 45 21 50 12 Z" fill="#7a3f1d" stroke="#3b1c09" stroke-width="2.5"/>
  <path d="M19 70 C28 84 72 84 81 70 C79 85 66 91 50 91 C34 91 21 85 19 70 Z" fill="#d9b98c" stroke="#3b1c09" stroke-width="2"/>
  <path d="M34 34 C30 42 28 52 29 60" fill="none" stroke="#b0703f" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
  <path d="M50 12 L50 5 M47 7 L50 12 L53 7" fill="none" stroke="#3b1c09" stroke-width="2" stroke-linecap="round"/>
`);

function riccioSvg() {
  const spikes = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const r1 = 26;
    const r2 = i % 2 ? 44 : 40;
    spikes.push(
      `M${(50 + Math.cos(a) * r1).toFixed(1)} ${(50 + Math.sin(a) * r1).toFixed(1)} L${(50 + Math.cos(a) * r2).toFixed(1)} ${(50 + Math.sin(a) * r2).toFixed(1)}`,
    );
  }
  return svg(`
    ${shadow}
    <path d="${spikes.join(' ')}" stroke="#4d6e17" stroke-width="3.5" stroke-linecap="round"/>
    <path d="${spikes.join(' ')}" stroke="#a8cf55" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="28" fill="#79a334" stroke="#3f5a12" stroke-width="2.5"/>
    <circle cx="50" cy="50" r="20" fill="none" stroke="#5f8526" stroke-width="2" stroke-dasharray="3 4"/>
    <ellipse cx="41" cy="40" rx="8" ry="5" transform="rotate(-30 41 40)" fill="#a8cf55" opacity="0.7"/>
  `);
}

function pignaSvg() {
  const scales = [];
  for (let row = 0; row < 8; row++) {
    const y = 20 + row * 9;
    const t = (y - 52) / 38;
    const halfWidth = 27 * Math.sqrt(Math.max(0, 1 - t * t));
    const count = Math.max(2, Math.round(halfWidth / 7));
    for (let i = 0; i < count; i++) {
      const x = 50 - halfWidth + 6 + ((2 * halfWidth - 12) * i) / Math.max(1, count - 1) + (row % 2 ? 3 : -3);
      scales.push(`M${(x - 6).toFixed(1)} ${y} C${(x - 6).toFixed(1)} ${y + 7} ${(x + 6).toFixed(1)} ${y + 7} ${(x + 6).toFixed(1)} ${y}`);
    }
  }
  return svg(`
    ${shadow}
    <path d="M50 6 L50 16" stroke="#5a3a1a" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="50" cy="53" rx="28" ry="39" fill="#8a5a2e" stroke="#3d2410" stroke-width="2.5"/>
    <path d="${scales.join(' ')}" fill="#a8733f" stroke="#4a2c12" stroke-width="1.8"/>
  `);
}

const foglia = svg(`
  ${shadow}
  <path d="M50 8 C56 18 66 16 66 26 C76 24 78 34 72 40 C82 42 82 54 72 56 C80 62 76 72 66 70 C66 80 58 82 52 78 L52 93 L48 93 L48 78 C42 82 34 80 34 70 C24 72 20 62 28 56 C18 54 18 42 28 40 C22 34 24 24 34 26 C34 16 44 18 50 8 Z" fill="#dd8a2e" stroke="#7a4210" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M50 16 L50 80 M50 32 L38 28 M50 32 L62 28 M50 46 L32 42 M50 46 L68 42 M50 60 L36 60 M50 60 L64 60" fill="none" stroke="#a55a16" stroke-width="2" stroke-linecap="round"/>
`);

const lumaca = svg(`
  ${shadow}
  <path d="M10 82 C12 71 28 69 44 71 L80 71 C89 71 93 77 91 84 C70 88 30 88 10 82 Z" fill="#aab07a" stroke="#4f5530" stroke-width="2.5"/>
  <path d="M22 73 L15 55 M29 71 L27 52" stroke="#4f5530" stroke-width="3" stroke-linecap="round"/>
  <circle cx="15" cy="54" r="3.5" fill="#2f331a"/><circle cx="27" cy="51" r="3.5" fill="#2f331a"/>
  <circle cx="60" cy="50" r="25" fill="#c98a3d" stroke="#6e4516" stroke-width="2.5"/>
  <path d="M60 50 C60 46 66 46 66 51 C66 57 56 58 54 51 C52 43 62 38 69 43 C77 49 73 62 62 64 C50 66 42 56 45 46" fill="none" stroke="#6e4516" stroke-width="3" stroke-linecap="round"/>
`);

export const BAD_POISONOUS = { ovolaccio, velenosoGiallo, velenosoViola };
export const BAD_OBJECTS = { castagna, riccio: riccioSvg(), pigna: pignaSvg(), foglia, lumaca };

export const ALL_SPRITES = { ...GOOD, ...BAD_POISONOUS, ...BAD_OBJECTS };
