// Modulo del "Memory del paese", caricato solo quando serve (import dinamico).

import config from './config.js';
import { createMemory } from './game.js';
import { CARDS } from './cards.js';

export default {
  config,
  canvas: false,
  hud: [
    { key: 'time', label: 'Tempo' },
    { key: 'moves', label: 'Mosse' },
    { key: 'pairs', label: 'Coppie' },
  ],

  /** Foto già scaricate e decodificate prima della partita: una carta non si gira mai "vuota" */
  async loadAssets() {
    await Promise.all(
      CARDS.filter((c) => c.src).map((c) => {
        const img = new Image();
        img.src = c.src;
        return img.decode().catch(() => {});
      }),
    );
    return {};
  },

  create: createMemory,

  summary(stats) {
    return [
      ['Coppie trovate', `${stats.pairs}/${config.pairs}`],
      ['Mosse', stats.moves],
      ['Tempo', `${Math.round(stats.seconds)} secondi`],
    ];
  },
};
