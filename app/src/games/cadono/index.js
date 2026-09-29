// Modulo di "Porcini che cadono", caricato solo quando serve (import dinamico).

import config from './config.js';
import { createCadono } from './game.js';
import { FALLING, BASKET, BASKET_ASPECT, GOLDEN } from './sprites.js';
import { PORCINI } from '../shared/porcini.js';
import { rasterizeSprites, rasterizeSvg } from '../engine/sprites.js';
import { canvasDpr } from '../engine/dpr.js';

export default {
  config,
  hud: [
    { key: 'time', label: 'Tempo' },
    { key: 'score', label: 'Punti' },
    { key: 'lives', label: 'Vite' },
  ],

  rulesGallery: {
    // La bomba non serve: c'è già l'icona 💣 accanto alla regola
    good: [...Object.values(PORCINI), GOLDEN],
  },

  async loadAssets() {
    const dpr = canvasDpr();
    const [sprites, basket] = await Promise.all([
      rasterizeSprites(FALLING, config.itemSize * dpr),
      rasterizeSvg(BASKET, config.basketWidth * dpr, (config.basketWidth / BASKET_ASPECT) * dpr),
    ]);
    return { sprites, basket };
  },

  create: createCadono,

  summary(stats) {
    return [
      ['Porcini presi', stats.porcini],
      ['Porcini d\'oro', stats.golden],
      ['Bombe prese', stats.bombs],
      ['Bonus vite rimaste', stats.bonus ? `+${stats.bonus}` : '—'],
    ];
  },
};
