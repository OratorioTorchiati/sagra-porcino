// Disegni originali dei porcini (SVG 100×100, centrati), usati da più giochi.
// Forma riconoscibile: cappello a cupola e GAMBO TOZZO e panciuto (i velenosi hanno il gambo sottile).

export const svg100 = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${body}</svg>`;

export function porcino({ cap, capDark, highlight, stem, stemLine, extra = '' }) {
  return svg100(`
    <path d="M35 52 C29 66 28 80 35 88 C41 94 59 94 65 88 C72 80 71 66 65 52 Z" fill="${stem}" stroke="${stemLine}" stroke-width="2.5"/>
    <path d="M40 66 C45 64 49 66 54 64 C58 66 62 64 64 66 M38 76 C44 74 49 76 54 74 C59 76 63 74 66 76 M40 85 C45 83 50 85 55 83 C59 85 62 83 63 85" fill="none" stroke="${stemLine}" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
    <path d="M19 55 C35 51 65 51 81 55 C75 62 25 62 19 55 Z" fill="#dcc79a" stroke="${capDark}" stroke-width="2"/>
    <path d="M9 50 C9 26 27 9 50 9 C73 9 91 26 91 50 C91 56 86 58 80 57 C64 54 36 54 20 57 C14 58 9 56 9 50 Z" fill="${cap}" stroke="${capDark}" stroke-width="2.5"/>
    <ellipse cx="36" cy="26" rx="13" ry="6" transform="rotate(-24 36 26)" fill="${highlight}" opacity="0.8"/>
    <ellipse cx="55" cy="18" rx="4.5" ry="2.2" fill="${highlight}" opacity="0.7"/>
    ${extra}
  `);
}

/** Le 4 varietà di porcino (docs/03-GIOCHI.md) */
export const PORCINI = {
  porcinoClassico: porcino({ cap: '#8b5a2b', capDark: '#4f2f12', highlight: '#b07a45', stem: '#f1e5cc', stemLine: '#b59c70' }),
  porcinoNero: porcino({ cap: '#3a261a', capDark: '#150c06', highlight: '#65462f', stem: '#e8d8b6', stemLine: '#a88f64' }),
  porcinoPinarolo: porcino({ cap: '#94401f', capDark: '#521f0b', highlight: '#c0683f', stem: '#efd9bd', stemLine: '#b58f67' }),
  porcinoEstivo: porcino({ cap: '#c9a172', capDark: '#6e5230', highlight: '#e3c49b', stem: '#f0e3c9', stemLine: '#a88b5c' }),
};
