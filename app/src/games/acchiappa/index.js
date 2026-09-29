// Modulo di "Acchiappa il porcino", caricato solo quando serve (import dinamico).

import config from './config.js';
import { createAcchiappa } from './game.js';
import { ALL_SPRITES, GOOD, BAD_POISONOUS, BAD_OBJECTS } from './sprites.js';
import { rasterizeSprites } from '../engine/sprites.js';
import { canvasDpr } from '../engine/dpr.js';
import { createRng } from '../engine/rng.js';
import { STEP_S } from '../engine/step.js';

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

  /**
   * Partita di prova invisibile (qualche secondo di gioco in pochi millisecondi, su un canvas fuori schermo),
   * fatta sulla schermata delle regole: alla prima partita vera il browser ha già ottimizzato il codice del gioco.
   * Senza, i primi secondi della prima partita avevano degli scatti (dalla seconda no). Nessun suono né vibrazione:
   * si toccano solo porcini.
   */
  warmUp(assets) {
    const [w, h] = [360, 640];
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const noop = () => {};
    const game = createAcchiappa({
      rng: createRng(1),
      config,
      assets,
      hud: { set: noop, pulse: noop, ring: noop },
      log: noop,
      flash: noop,
    });
    game.resize(w, h);
    for (let i = 1; i <= 480; i++) {
      const t = i * STEP_S;
      game.update(STEP_S, t);
      if (i % 20 === 0) {
        game.draw(ctx);
        const porcino = game.snapshot().find((e) => e.good);
        if (porcino) game.onPointerDown(porcino.x, porcino.y, t);
      }
    }
  },

  /** Righe di statistiche per la schermata finale */
  summary(stats) {
    return [
      ['Porcini presi', stats.caught],
      ['Errori', stats.errors],
      ['Serie migliore', stats.maxStreak],
    ];
  },
};
