// Carte del Memory. SEGNAPOSTO: 8 illustrazioni originali generiche finché non arrivano le foto vere
// dei luoghi del paese (contenuti/memory/, Tappa 10). Ogni carta: id, didascalia breve e disegno.
// Oltre al disegno, ogni carta ha un colore di sfondo diverso (ma si distinguono anche senza colori).

const card = (bg, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" rx="8" fill="${bg}"/>${body}</svg>`;

export const CARDS = [
  {
    id: 'campanile',
    caption: 'Il campanile',
    svg: card('#dcebf5', `
      <path d="M50 6 L50 14 M46 9 L54 9" stroke="#5a3a1a" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M36 32 L50 14 L64 32 Z" fill="#8a3b22" stroke="#4d1f10" stroke-width="2"/>
      <rect x="38" y="32" width="24" height="60" fill="#c98f5a" stroke="#6b4217" stroke-width="2"/>
      <path d="M44 52 L44 42 C44 37 56 37 56 42 L56 52 Z" fill="#3b2a1e"/>
      <path d="M47 50 C47 44 53 44 53 50 Z" fill="#e8b10c"/>
      <path d="M38 60 L62 60 M38 74 L62 74" stroke="#a8703f" stroke-width="2"/>
      <rect x="46" y="80" width="8" height="12" fill="#6b4217"/>
      <path d="M8 92 L92 92" stroke="#7a9a5a" stroke-width="4"/>`),
  },
  {
    id: 'fontana',
    caption: 'La fontana',
    svg: card('#e3f0e8', `
      <path d="M50 30 C42 20 34 22 30 34 M50 30 C58 20 66 22 70 34 M50 30 L50 18" fill="none" stroke="#3d9ad6" stroke-width="3" stroke-linecap="round"/>
      <circle cx="30" cy="40" r="2.5" fill="#3d9ad6"/><circle cx="70" cy="40" r="2.5" fill="#3d9ad6"/>
      <rect x="45" y="30" width="10" height="40" fill="#b8b1a4" stroke="#6d6658" stroke-width="2"/>
      <ellipse cx="50" cy="30" rx="10" ry="3" fill="#cfc8bb" stroke="#6d6658" stroke-width="2"/>
      <path d="M14 70 L86 70 L80 88 L20 88 Z" fill="#b8b1a4" stroke="#6d6658" stroke-width="2"/>
      <ellipse cx="50" cy="70" rx="36" ry="6" fill="#7cc3ec" stroke="#6d6658" stroke-width="2"/>`),
  },
  {
    id: 'chiesa',
    caption: 'La chiesa',
    svg: card('#f3e7d3', `
      <path d="M18 44 L50 16 L82 44 Z" fill="#b5553a" stroke="#6b2a18" stroke-width="2"/>
      <rect x="22" y="44" width="56" height="46" fill="#efe6d6" stroke="#8a7a60" stroke-width="2"/>
      <circle cx="50" cy="34" r="6" fill="#7cc3ec" stroke="#6b2a18" stroke-width="2"/>
      <path d="M41 90 L41 70 C41 60 59 60 59 70 L59 90 Z" fill="#7a4a1e" stroke="#4d2c0e" stroke-width="2"/>
      <rect x="28" y="54" width="8" height="12" rx="4" fill="#7cc3ec"/><rect x="64" y="54" width="8" height="12" rx="4" fill="#7cc3ec"/>
      <path d="M50 8 L50 16 M46 11 L54 11" stroke="#5a3a1a" stroke-width="2.5" stroke-linecap="round"/>`),
  },
  {
    id: 'castagno',
    caption: 'Il castagno',
    svg: card('#eaf3dc', `
      <path d="M44 92 L46 60 L54 60 L56 92 Z" fill="#7a4a1e" stroke="#4d2c0e" stroke-width="2"/>
      <path d="M50 62 L38 52 M50 64 L62 54" stroke="#7a4a1e" stroke-width="4" stroke-linecap="round"/>
      <circle cx="34" cy="40" r="18" fill="#5f8f2e" stroke="#35561a" stroke-width="2"/>
      <circle cx="66" cy="40" r="18" fill="#5f8f2e" stroke="#35561a" stroke-width="2"/>
      <circle cx="50" cy="28" r="20" fill="#6fa336" stroke="#35561a" stroke-width="2"/>
      <circle cx="36" cy="38" r="3.5" fill="#7a3f1d"/><circle cx="60" cy="30" r="3.5" fill="#7a3f1d"/><circle cx="66" cy="46" r="3.5" fill="#7a3f1d"/><circle cx="48" cy="22" r="3.5" fill="#7a3f1d"/>`),
  },
  {
    id: 'ponte',
    caption: 'Il ponte',
    svg: card('#d9ecf7', `
      <path d="M4 50 L96 50 L96 64 L4 64 Z" fill="#b9a88e" stroke="#6d5f48" stroke-width="2"/>
      <path d="M22 64 C22 44 78 44 78 64 L78 90 L96 90 L96 64 M22 64 L22 90 L4 90 L4 64" fill="#b9a88e" stroke="#6d5f48" stroke-width="2"/>
      <path d="M8 44 L92 44" stroke="#6d5f48" stroke-width="3"/>
      <path d="M12 44 L12 50 M30 44 L30 50 M50 44 L50 50 M70 44 L70 50 M88 44 L88 50" stroke="#6d5f48" stroke-width="2.5"/>
      <path d="M24 80 C30 76 36 84 42 80 C48 76 54 84 60 80 C66 76 72 84 76 80" fill="none" stroke="#3d9ad6" stroke-width="3" stroke-linecap="round"/>`),
  },
  {
    id: 'borgo',
    caption: 'Il borgo',
    svg: card('#f6ead8', `
      <path d="M6 50 L26 32 L46 50 Z" fill="#c0492b" stroke="#6b2a18" stroke-width="2"/>
      <rect x="10" y="50" width="32" height="40" fill="#f1d9a8" stroke="#8a6a3a" stroke-width="2"/>
      <path d="M40 42 L64 20 L88 42 Z" fill="#a83b22" stroke="#6b2a18" stroke-width="2"/>
      <rect x="44" y="42" width="40" height="48" fill="#e9c98f" stroke="#8a6a3a" stroke-width="2"/>
      <rect x="18" y="58" width="8" height="8" fill="#7cc3ec" stroke="#8a6a3a" stroke-width="1.5"/>
      <rect x="52" y="52" width="9" height="9" fill="#7cc3ec" stroke="#8a6a3a" stroke-width="1.5"/><rect x="68" y="52" width="9" height="9" fill="#7cc3ec" stroke="#8a6a3a" stroke-width="1.5"/>
      <rect x="59" y="72" width="10" height="18" fill="#7a4a1e"/><rect x="28" y="74" width="8" height="16" fill="#7a4a1e"/>`),
  },
  {
    id: 'piazza',
    caption: 'La piazza',
    svg: card('#ece6f3', `
      <path d="M6 92 L94 92 L80 66 L20 66 Z" fill="#d8cdb8" stroke="#8a7a60" stroke-width="2"/>
      <path d="M13 79 L87 79 M35 66 L28 92 M50 66 L50 92 M65 66 L72 92" stroke="#b3a68e" stroke-width="1.5"/>
      <path d="M30 66 L30 22" stroke="#3b3b3b" stroke-width="3"/>
      <path d="M22 22 L38 22 L35 12 L25 12 Z" fill="#ffe082" stroke="#3b3b3b" stroke-width="2"/>
      <rect x="52" y="52" width="32" height="5" rx="2" fill="#8a5a2e"/><rect x="52" y="44" width="32" height="5" rx="2" fill="#8a5a2e"/>
      <path d="M55 57 L55 66 M81 57 L81 66" stroke="#3b3b3b" stroke-width="3"/>`),
  },
  {
    id: 'bosco',
    caption: 'Il bosco',
    svg: card('#e1efd9', `
      <path d="M26 12 L42 44 L10 44 Z M26 28 L46 64 L6 64 Z" fill="#2f6b3a" stroke="#1b4022" stroke-width="2"/>
      <rect x="23" y="64" width="6" height="14" fill="#6b4217"/>
      <path d="M72 20 L86 48 L58 48 Z M72 36 L90 70 L54 70 Z" fill="#3c8048" stroke="#1b4022" stroke-width="2"/>
      <rect x="69" y="70" width="6" height="12" fill="#6b4217"/>
      <path d="M44 92 C44 84 60 84 60 92 Z" fill="#8b5a2b" stroke="#4f2f12" stroke-width="1.5"/>
      <path d="M48 92 L48 97 L56 97 L56 92" fill="#f1e5cc" stroke="#b59c70" stroke-width="1.5"/>`),
  },
];

/** Retro delle carte, uguale per tutte, a tema porcino */
export const CARD_BACK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" rx="8" fill="#7a4a1e"/>
  <rect x="6" y="6" width="88" height="88" rx="5" fill="none" stroke="#c8861a" stroke-width="2.5" stroke-dasharray="4 4"/>
  <path d="M40 54 C37 62 37 70 41 74 C44 77 56 77 59 74 C63 70 63 62 60 54 Z" fill="#f1e5cc"/>
  <path d="M24 52 C24 36 36 26 50 26 C64 26 76 36 76 52 C76 56 72 57 69 56 C58 54 42 54 31 56 C28 57 24 56 24 52 Z" fill="#c08a52"/>
</svg>`;
