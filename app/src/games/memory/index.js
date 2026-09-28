// Modulo del "Memory del paese", caricato solo quando serve (import dinamico).

import config from './config.js';
import { createMemory } from './game.js';

export default {
  config,
  canvas: false,
  hud: [
    { key: 'time', label: 'Tempo' },
    { key: 'moves', label: 'Mosse' },
    { key: 'pairs', label: 'Coppie' },
  ],

  async loadAssets() {
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
