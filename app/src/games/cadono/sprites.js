// Disegni originali di "Porcini che cadono": porcino d'oro, bomba (tonda nera con miccia accesa,
// riconoscibilissima) e cestino di vimini. I porcini normali sono quelli in comune (shared/porcini.js).

import { svg100, porcino, PORCINI } from '../shared/porcini.js';

const sparkle = (x, y, s) =>
  `<path d="M${x} ${y - s} L${x + s * 0.3} ${y - s * 0.3} L${x + s} ${y} L${x + s * 0.3} ${y + s * 0.3} L${x} ${y + s} L${x - s * 0.3} ${y + s * 0.3} L${x - s} ${y} L${x - s * 0.3} ${y - s * 0.3} Z" fill="#fff8c4" stroke="#c99a00" stroke-width="1"/>`;

export const GOLDEN = porcino({
  cap: '#e8b10c',
  capDark: '#8a6200',
  highlight: '#fff0a0',
  stem: '#fff4d2',
  stemLine: '#c9a24a',
  extra: `${sparkle(16, 14, 8)}${sparkle(86, 22, 7)}${sparkle(82, 72, 6)}${sparkle(18, 66, 5)}`,
});

export const BOMB = svg100(`
  <circle cx="46" cy="60" r="31" fill="#262626" stroke="#000" stroke-width="2.5"/>
  <ellipse cx="35" cy="47" rx="10" ry="6" transform="rotate(-35 35 47)" fill="#707070" opacity="0.85"/>
  <rect x="55" y="23" width="17" height="13" rx="3" transform="rotate(35 63 29)" fill="#4a4a4a" stroke="#000" stroke-width="2"/>
  <path d="M68 23 C71 14 78 15 81 9" fill="none" stroke="#8a6a3a" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M82 1 L85 7 L92 7 L86 11 L89 18 L82 13 L76 17 L78 10 L73 6 L80 6 Z" fill="#ffb300" stroke="#e65100" stroke-width="1.5"/>
  <circle cx="82" cy="9.5" r="2.8" fill="#fff59d"/>
`);

/** Proporzioni del cestino (larghezza : altezza) e altezza del bordo, in frazione dell'altezza */
export const BASKET_ASPECT = 140 / 90;
export const BASKET_RIM = 28 / 90;

export const BASKET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 90" width="140" height="90">
  <path d="M9 34 L131 34 L118 83 C117 87 113 89 109 89 L31 89 C27 89 23 87 22 83 Z" fill="#c68a45" stroke="#6b4217" stroke-width="3" stroke-linejoin="round"/>
  <path d="M13 49 L127 49 M17 63 L123 63 M20 76 L120 76" stroke="#8f5b24" stroke-width="3"/>
  <path d="M34 36 L39 87 M52 36 L55 88 M70 36 L70 88 M88 36 L85 88 M106 36 L101 87" stroke="#8f5b24" stroke-width="2.5"/>
  <rect x="3" y="26" width="134" height="13" rx="6.5" fill="#a8702f" stroke="#6b4217" stroke-width="3"/>
  <path d="M12 30 L128 30" stroke="#d9a35f" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
</svg>`;

export const FALLING = { ...PORCINI, golden: GOLDEN, bomb: BOMB };
