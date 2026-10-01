// "Rivedi partita" (D75): con lo stesso seme e le azioni registrate, il replay rifà la partita IDENTICA.
// Si gioca una partita simulata a passi fissi (come l'engine), poi la si rigioca solo dalle azioni.

import { describe, expect, it } from 'vitest';
import { createRng } from './engine/rng.js';
import { STEP_S } from './engine/step.js';
import acchiappaConfig from './acchiappa/config.js';
import cadonoConfig from './cadono/config.js';
import { createAcchiappa } from './acchiappa/game.js';
import { createCadono } from './cadono/game.js';

const WIDTH = 390;
const HEIGHT = 700;
const noop = () => {};
const hud = { set: noop, pulse: noop, ring: noop };

/** Partita "vera": a ogni passo il giocatore può toccare (come gli eventi tra un passo e l'altro) */
function play(create, config, seed, input) {
  const actions = [];
  let t = 0;
  const game = create({ rng: createRng(seed), config, assets: {}, hud, log: (...d) => actions.push([Math.round(t * 1000), ...d]), flash: noop, shake: noop });
  game.resize(WIDTH, HEIGHT);
  for (let step = 1; !game.isOver(t); step++) {
    t = step * STEP_S;
    game.update(STEP_S, t);
    input(game, t);
  }
  return { result: game.result(), actions };
}

/** Replay: stesso seme, nessun giocatore, solo le azioni registrate rifatte al loro passo */
function replay(create, config, seed, actions) {
  let t = 0;
  let index = 0;
  const game = create({ rng: createRng(seed), config, assets: {}, hud, log: noop, flash: noop, shake: noop, replay: true });
  game.resize(WIDTH, HEIGHT);
  for (let step = 1; !game.isOver(t); step++) {
    t = step * STEP_S;
    game.update(STEP_S, t);
    const now = Math.round(t * 1000);
    while (index < actions.length && actions[index][0] <= now) {
      const [, type, ...data] = actions[index++];
      game.replayAction(type, data, t);
    }
  }
  return game.result();
}

describe('Rivedi partita: il replay rifà la stessa partita', () => {
  it('Acchiappa il porcino (tocchi, anche sbagliati e a vuoto)', () => {
    let n = 0;
    const { result, actions } = play(createAcchiappa, acchiappaConfig, 77, (game, t) => {
      n++;
      if (n % 9 !== 0) return;
      const target = game.snapshot().find((e) => e.age > 0.3 && e.x > 10 && e.x < WIDTH - 10 && e.y > 10 && e.y < HEIGHT - 10);
      if (target) game.onPointerDown(target.x, target.y, t);
      else game.onPointerDown(50, 50, t); // tocco a vuoto
    });
    expect(result.stats.caught).toBeGreaterThan(10);
    expect(result.stats.errors).toBeGreaterThan(0);
    expect(replay(createAcchiappa, acchiappaConfig, 77, actions)).toEqual(result);
  });

  it('Porcini che cadono (il cestino segue il dito)', () => {
    const { result, actions } = play(createCadono, cadonoConfig, 55, (game, t) => {
      const snap = game.snapshot();
      const target = snap.items.filter((i) => i.type !== 'bomb').sort((a, b) => b.y - a.y)[0];
      if (target) game.onPointerMove(target.x + Math.sin(t * 7) * 13.3);
    });
    expect(actions.some((a) => a[1] === 'catch')).toBe(true);
    expect(replay(createCadono, cadonoConfig, 55, actions)).toEqual(result);
  });
});
