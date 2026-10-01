// Simulazione di partite intere (senza disegno): comparsa degli elementi, tocchi, punteggio, fine partita.

import { describe, expect, it } from 'vitest';
import config from './config.js';
import { createAcchiappa } from './game.js';
import { createRng } from '../engine/rng.js';
import { applyHit, initialScoreState } from './scoring.js';

const WIDTH = 390;
const HEIGHT = 700;
const DT = 1 / 60;

/**
 * Gioca una partita. `choose(entities, t)` restituisce l'elemento da toccare in questo frame (o null).
 */
function simulate(seed, choose) {
  const actions = [];
  const hudValues = {};
  let t = 0;
  const game = createAcchiappa({
    rng: createRng(seed),
    config,
    assets: {},
    hud: { set: (k, v) => (hudValues[k] = v), pulse: () => {} },
    log: (...data) => actions.push([Math.round(t * 1000), ...data]),
    flash: () => {},
  });
  game.resize(WIDTH, HEIGHT);

  let maxOnScreen = 0;
  const sizes = [];
  let popOutOfBounds = 0;
  while (!game.isOver(t)) {
    t += DT;
    game.update(DT, t);
    const entities = game.snapshot();
    maxOnScreen = Math.max(maxOnScreen, entities.length);
    for (const e of entities) {
      sizes.push(e.size);
      if (e.mode === 'pop' && (e.x < 0 || e.x > WIDTH || e.y < 0 || e.y > HEIGHT)) popOutOfBounds++;
    }
    const target = choose(entities, t);
    if (target) game.onPointerDown(target.x, target.y, t);
  }
  return { result: game.result(), actions, hudValues, maxOnScreen, sizes, popOutOfBounds, t };
}

// Giocatore bravo: tocca ogni porcino dopo 0,4 s dalla comparsa, se è sullo schermo
const perfect = (entities) =>
  entities.find((e) => e.good && e.age > 0.4 && e.x > 10 && e.x < WIDTH - 10 && e.y > 10 && e.y < HEIGHT - 10) ?? null;

// Giocatore distratto: tocca qualsiasi cosa dopo 0,5 s
const careless = (entities) => entities.find((e) => e.age > 0.5 && e.x > 10 && e.x < WIDTH - 10 && e.y > 10 && e.y < HEIGHT - 10) ?? null;

describe('Acchiappa il porcino (simulazione)', () => {
  it('dura quanto la durata della configurazione', () => {
    const { t } = simulate(1, () => null);
    expect(t).toBeGreaterThanOrEqual(config.durationS);
    expect(t).toBeLessThan(config.durationS + 2 * DT);
  });

  it('rispetta dimensioni e numero massimo di elementi a schermo', () => {
    const { maxOnScreen, sizes, popOutOfBounds } = simulate(2, () => null);
    expect(maxOnScreen).toBeGreaterThan(3);
    expect(maxOnScreen).toBeLessThanOrEqual(Math.max(...config.maxOnScreen));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(config.sizeMin);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(config.sizeMax);
    expect(popOutOfBounds).toBe(0); // chi spunta all'interno resta sempre toccabile
  });

  it('giocatore bravo: nessun errore, serie lunga, moltiplicatore massimo', () => {
    const { result, hudValues, actions } = simulate(3, perfect);
    expect(result.stats.errors).toBe(0);
    expect(result.stats.caught / config.durationS).toBeGreaterThan(0.6); // porcini al secondo
    expect(result.stats.maxStreak).toBe(result.stats.caught);
    expect(hudValues.score).toBe(result.rawScore);
    // Il punteggio si rifà dal registro dei tocchi (come sul server)
    let state = initialScoreState();
    for (const [ms, , , , hit] of actions.filter((a) => a[1] === 'tap' && a[4] !== 'none')) state = applyHit(state, hit, ms, config).state;
    expect(state.score).toBe(result.rawScore);
    expect(result.rawScore).toBeGreaterThan(result.stats.caught * config.pointsPerPorcino * 2);
  });

  it('giocatore distratto: errori e serie azzerate', () => {
    const { result } = simulate(4, careless);
    expect(result.stats.errors).toBeGreaterThan(5);
    expect(result.stats.maxStreak).toBeLessThan(result.stats.caught);
  });

  it('registra ogni tocco con tempo, posizione ed esito', () => {
    const { actions, result } = simulate(5, careless);
    const taps = actions.filter((a) => a[1] === 'tap');
    expect(taps.length).toBe(result.stats.caught + result.stats.errors);
    const [ms, type, x, y, outcome, kind, ageMs, size, dist] = taps[0];
    expect(type).toBe('tap');
    expect(ms).toBeGreaterThan(0);
    expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
    expect(['good', 'bad']).toContain(outcome);
    expect(typeof kind).toBe('string');
    expect(ageMs).toBeGreaterThanOrEqual(500);
    expect(size).toBeGreaterThanOrEqual(config.sizeMin);
    expect(dist).toBe(0);
  });

  it('un tocco a vuoto viene registrato e non cambia nulla', () => {
    let tapped = false;
    const { actions, result } = simulate(6, (entities, t) => {
      if (!tapped && t > 1) {
        tapped = true;
        return { x: -500, y: -500 };
      }
      return null;
    });
    expect(actions.some((a) => a[1] === 'tap' && a[4] === 'none')).toBe(true);
    expect(result.rawScore).toBe(0);
  });

  it('stesso seme → stessa partita; seme diverso → partita diversa', () => {
    const a = simulate(42, perfect);
    const b = simulate(42, perfect);
    const c = simulate(43, perfect);
    expect(a.actions).toEqual(b.actions);
    expect(a.result).toEqual(b.result);
    expect(c.actions).not.toEqual(a.actions);
  });
});
