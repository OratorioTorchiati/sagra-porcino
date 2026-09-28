// Personaggi originali a tema bosco (docs/01-SPECIFICHE.md §9), disegnati per essere
// riconoscibili anche a 32px: forma semplice, contorno scuro, faccina, sfondo tondo colorato.
// Gli id devono coincidere con quelli ammessi dal database (supabase/migrations/001_accounts.sql, _avatar_ids).

const INK = '#2b1d12';

/** Faccina: occhi con riflesso, guance rosa, sorriso (facoltativo). (cx, cy) = centro tra gli occhi. */
function face(cx, cy, s = 1, { smile = true } = {}) {
  const eye = (x) =>
    `<circle cx="${x}" cy="${cy}" r="${4 * s}" fill="${INK}"/><circle cx="${x + 1.3 * s}" cy="${cy - 1.4 * s}" r="${1.4 * s}" fill="#fff"/>`;
  return `
    ${eye(cx - 9 * s)}${eye(cx + 9 * s)}
    <ellipse cx="${cx - 15 * s}" cy="${cy + 6 * s}" rx="${4 * s}" ry="${2.6 * s}" fill="#ef8a8a" opacity="0.55"/>
    <ellipse cx="${cx + 15 * s}" cy="${cy + 6 * s}" rx="${4 * s}" ry="${2.6 * s}" fill="#ef8a8a" opacity="0.55"/>
    ${smile ? `<path d="M${cx - 6 * s} ${cy + 7 * s} Q${cx} ${cy + 13 * s} ${cx + 6 * s} ${cy + 7 * s}" fill="none" stroke="${INK}" stroke-width="${2.4 * s}" stroke-linecap="round"/>` : ''}`;
}

const svg = (bg, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="50" fill="${bg}"/>${body}</svg>`;

function porcinoBody(cap, capDark, highlight, extra = '') {
  return `
    <path d="M33 50 C27 66 27 82 35 90 L65 90 C73 82 73 66 67 50 Z" fill="#f4e8cf" stroke="${INK}" stroke-width="2.5"/>
    <path d="M10 48 C10 24 28 10 50 10 C72 10 90 24 90 48 C90 54 85 56 80 55 C64 52 36 52 20 55 C15 56 10 54 10 48 Z" fill="${cap}" stroke="${capDark}" stroke-width="2.5"/>
    <ellipse cx="35" cy="25" rx="11" ry="5" transform="rotate(-24 35 25)" fill="${highlight}" opacity="0.8"/>
    ${extra}
    ${face(50, 67, 0.95)}`;
}

export const CHARACTERS = [
  {
    id: 'porcino',
    name: 'Porcino',
    svg: svg('#f3dcae', porcinoBody('#8b5a2b', '#4f2f12', '#b07a45')),
  },
  {
    id: 'montanaro',
    name: 'Porcino montanaro',
    svg: svg('#cfe3c4', porcinoBody('#94401f', '#521f0b', '#c0683f', `
      <path d="M28 22 C30 8 70 8 72 22 Z" fill="#3c6b3f" stroke="${INK}" stroke-width="2.5"/>
      <path d="M22 23 C35 18 65 18 78 23 C66 27 34 27 22 23 Z" fill="#2f5532" stroke="${INK}" stroke-width="2"/>
      <path d="M29 21 C38 19 62 19 71 21" stroke="#c0392b" stroke-width="3"/>
      <path d="M64 18 C70 6 78 2 82 2 C78 8 74 14 66 20 Z" fill="#f5f0e6" stroke="${INK}" stroke-width="1.5"/>`)),
  },
  {
    id: 'porcino_nero',
    name: 'Porcino nero',
    svg: svg('#e6d3f0', porcinoBody('#3a261a', '#150c06', '#65462f')),
  },
  {
    id: 'castagna',
    name: 'Castagna',
    svg: svg('#f6e1c8', `
      <path d="M50 10 C56 20 84 32 86 60 C88 82 70 92 50 92 C30 92 12 82 14 60 C16 32 44 20 50 10 Z" fill="#7a3f1d" stroke="${INK}" stroke-width="2.5"/>
      <path d="M17 72 C27 86 73 86 83 72 C81 87 67 92 50 92 C33 92 19 87 17 72 Z" fill="#d9b98c" stroke="${INK}" stroke-width="2"/>
      <path d="M32 32 C28 40 26 48 27 56" fill="none" stroke="#b0703f" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
      ${face(50, 54, 1)}`),
  },
  {
    id: 'scoiattolo',
    name: 'Scoiattolo',
    svg: svg('#dcecd2', `
      <path d="M70 88 C98 80 96 40 80 30 C92 44 86 62 72 66 Z" fill="#c8742e" stroke="${INK}" stroke-width="2.5"/>
      <path d="M26 30 L30 12 L42 26 Z M74 30 L70 12 L58 26 Z" fill="#c8742e" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="50" cy="52" r="30" fill="#d9853a" stroke="${INK}" stroke-width="2.5"/>
      <ellipse cx="50" cy="66" rx="17" ry="13" fill="#f6dfbf"/>
      <ellipse cx="50" cy="60" rx="4" ry="3" fill="${INK}"/>
      ${face(50, 48, 0.95)}`),
  },
  {
    id: 'riccio',
    name: 'Riccio',
    svg: svg('#f1e4cc', `
      <path d="M12 70 L10 52 L20 56 L18 38 L30 44 L32 26 L42 36 L50 20 L58 36 L68 26 L70 44 L82 38 L80 56 L90 52 L88 70 Z" fill="#6b4a2b" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <ellipse cx="50" cy="66" rx="30" ry="22" fill="#e8c99a" stroke="${INK}" stroke-width="2.5"/>
      <circle cx="50" cy="72" r="4" fill="${INK}"/>
      ${face(50, 62, 0.9)}`),
  },
  {
    id: 'cinghialotto',
    name: 'Cinghialotto',
    svg: svg('#e3d9c6', `
      <path d="M22 32 L20 14 L38 26 Z M78 32 L80 14 L62 26 Z" fill="#6e5a48" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <ellipse cx="50" cy="54" rx="32" ry="30" fill="#8a7058" stroke="${INK}" stroke-width="2.5"/>
      <path d="M36 28 C42 22 58 22 64 28" stroke="#5a4838" stroke-width="3" fill="none"/>
      <ellipse cx="50" cy="70" rx="15" ry="11" fill="#c9a88a" stroke="${INK}" stroke-width="2"/>
      <ellipse cx="45" cy="70" rx="2.5" ry="3.5" fill="${INK}"/><ellipse cx="55" cy="70" rx="2.5" ry="3.5" fill="${INK}"/>
      <path d="M36 74 L32 64 L39 70 Z M64 74 L68 64 L61 70 Z" fill="#fffaf0" stroke="${INK}" stroke-width="1.5"/>
      ${face(50, 46, 0.9, { smile: false })}`), // il muso copre la bocca
  },
  {
    id: 'foglia',
    name: 'Foglia d\'autunno',
    svg: svg('#fbe7c6', `
      <path d="M50 8 C57 20 68 16 68 28 C79 26 81 37 74 43 C85 45 85 58 74 60 C82 67 77 78 66 75 C66 86 57 88 52 82 L52 94 L48 94 L48 82 C43 88 34 86 34 75 C23 78 18 67 26 60 C15 58 15 45 26 43 C19 37 21 26 32 28 C32 16 43 20 50 8 Z" fill="#e0892b" stroke="#7a4210" stroke-width="2.5" stroke-linejoin="round"/>
      ${face(50, 50, 1)}`),
  },
  {
    id: 'abetino',
    name: 'Abetino',
    svg: svg('#d6ebe0', `
      <rect x="44" y="80" width="12" height="12" fill="#6b4217" stroke="${INK}" stroke-width="2"/>
      <path d="M50 8 L70 36 L62 36 L78 58 L68 58 L86 82 L14 82 L32 58 L22 58 L38 36 L30 36 Z" fill="#3c8048" stroke="#1b4022" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M50 2 L52.5 8 L59 8 L54 12 L56 18 L50 14.5 L44 18 L46 12 L41 8 L47.5 8 Z" fill="#ffd54f" stroke="#b58a00" stroke-width="1"/>
      ${face(50, 60, 0.95)}`),
  },
  {
    id: 'gufetto',
    name: 'Gufetto',
    svg: svg('#dfe3f2', `
      <path d="M24 26 L30 12 L40 24 Z M76 26 L70 12 L60 24 Z" fill="#7a5a3a" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <ellipse cx="50" cy="56" rx="30" ry="34" fill="#8e6a45" stroke="${INK}" stroke-width="2.5"/>
      <ellipse cx="50" cy="70" rx="17" ry="17" fill="#e7d3b2"/>
      <path d="M44 70 L50 66 L56 70 M44 78 L50 74 L56 78" fill="none" stroke="#b39469" stroke-width="2"/>
      <circle cx="38" cy="44" r="11" fill="#fffaf0" stroke="${INK}" stroke-width="2"/><circle cx="62" cy="44" r="11" fill="#fffaf0" stroke="${INK}" stroke-width="2"/>
      <circle cx="38" cy="44" r="5" fill="${INK}"/><circle cx="62" cy="44" r="5" fill="${INK}"/>
      <circle cx="39.5" cy="42.5" r="1.6" fill="#fff"/><circle cx="63.5" cy="42.5" r="1.6" fill="#fff"/>
      <path d="M45 53 L50 60 L55 53 Z" fill="#e8a317" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`),
  },
  {
    id: 'cestino',
    name: 'Cestino di funghi',
    svg: svg('#f4e6d0', `
      <path d="M24 44 C24 30 36 24 42 30 C44 24 58 22 60 30 C66 24 78 30 76 44 Z" fill="#8b5a2b" stroke="#4f2f12" stroke-width="2"/>
      <path d="M40 30 C40 22 54 20 56 28" fill="#c9a172" stroke="#6e5230" stroke-width="2"/>
      <path d="M12 44 L88 44 L78 88 C77 91 74 92 71 92 L29 92 C26 92 23 91 22 88 Z" fill="#c68a45" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <rect x="8" y="40" width="84" height="9" rx="4.5" fill="#a8702f" stroke="${INK}" stroke-width="2.5"/>
      <path d="M18 80 L82 80" stroke="#8f5b24" stroke-width="2.5"/>
      ${face(50, 62, 0.95)}`),
  },
  {
    id: 'lumachina',
    name: 'Lumachina',
    svg: svg('#e8efd2', `
      <path d="M8 82 C10 70 26 68 42 70 L76 70 C86 70 90 76 88 84 C68 88 28 88 8 82 Z" fill="#b5bb84" stroke="${INK}" stroke-width="2.5"/>
      <path d="M22 72 L16 52 M30 70 L28 50" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="16" cy="51" r="4" fill="${INK}"/><circle cx="28" cy="49" r="4" fill="${INK}"/>
      <circle cx="60" cy="48" r="26" fill="#d4913f" stroke="${INK}" stroke-width="2.5"/>
      <path d="M60 48 C60 44 66 44 66 49 C66 55 56 56 54 49 C52 41 62 36 69 41 C77 47 73 60 62 62 C50 64 42 54 45 44" fill="none" stroke="#7a4d18" stroke-width="3" stroke-linecap="round"/>
      <path d="M17 78 Q22 82 27 78" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`),
  },
];

export const CHARACTER_IDS = CHARACTERS.map((c) => c.id);

export function characterById(id) {
  return CHARACTERS.find((c) => c.id === id) ?? null;
}
