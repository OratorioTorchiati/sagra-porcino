// Modulo di "Acchiappa il porcino", caricato solo quando serve (import dinamico).

import config from './config.js';
import { createAcchiappa } from './game.js';
import { ALL_SPRITES, GOOD, BAD_POISONOUS, BAD_OBJECTS } from './sprites.js';
import { rasterizeSprites } from '../engine/sprites.js';
import { canvasDpr } from '../engine/dpr.js';

export default {
  config,
  hud: [
    { key: 'time', label: 'Tempo' },
    { key: 'score', label: 'Punti' },
    { key: 'multiplier', label: 'Serie', ring: true },
  ],

  /** Disegni da mostrare nella schermata delle regole */
  rulesGallery: {
    good: Object.values(GOOD),
    poison: Object.values(BAD_POISONOUS),
    objects: Object.values(BAD_OBJECTS),
  },

  async loadAssets() {
    return { sprites: await rasterizeSprites(ALL_SPRITES, config.sizeMax * canvasDpr()) };
  },

  create: createAcchiappa,

  /** Righe di statistiche per la schermata finale */
  summary(stats) {
    return [
      ['Porcini presi', stats.caught],
      ['Errori', stats.errors],
      ['Serie migliore', stats.maxStreak],
    ];
  },
};
