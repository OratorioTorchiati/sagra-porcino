// Simulazione di partite intere di "Porcini che cadono" (senza disegno).

import { describe, expect, it } from 'vitest';
import config from './config.js';
import { createCadono } from './game.js';
import { createRng } from '../engine/rng.js';
import { cadonoScore } from './scoring.js';

/** Punteggio atteso rifatto dalle statistiche della partita (come sul server) */
const expectedScore = (stats, durationMs) =>
  cadonoScore({ caught: stats.porcini + stats.golden * config.goldenWeight, fallen: stats.fallen, lives: stats.lives }, durationMs, config);

const WIDTH = 390;
const HEIGHT = 700;
const DT = 1 / 60;

/** `aim(snapshot)` restituisce la x a cui portare il cestino in questo frame (o null). */
function simulate(seed, aim) {
  const actions = [];
  let t = 0;
  const game = createCadono({
    rng: createRng(seed),
    config,
    assets: {},
    hud: { set() {}, pulse() {} },
    log: (...data) => actions.push([Math.round(t * 1000), ...data]),
    flash() {},
    shake() {},
  });
  game.resize(WIDTH, HEIGHT);
  const seen = new Map();
  while (!game.isOver(t)) {
    t += DT;
    game.update(DT, t);
    const snap = game.snapshot();
    for (const i of snap.items) seen.set(i.id, i.type);
    const x = aim(snap);
    if (x !== null) game.onPointerMove(x);
  }
  const durationMs = Math.round(t * 1000);
  return { game, result: game.result({ durationMs }), durationMs, actions, t, seen: [...seen.values()], endText: game.endText() };
}

// Giocatore bravo: va sotto il porcino più vicino al cestino tra quelli ancora in alto, evitando le bombe basse
function good({ items, rimY, basket }) {
  const reach = basket.width / 2 + 40;
  const threats = items.filter((i) => i.type === 'bomb' && i.y < rimY && i.y > rimY - 220);
  const safe = (x) => !threats.some((b) => Math.abs(b.x - x) < reach);
  // Prima di tutto: se una bomba sta per cadere nel cestino, spostarsi nel punto sicuro più vicino
  if (!safe(basket.x)) {
    const options = [];
    for (let x = basket.width / 2; x <= 390 - basket.width / 2; x += 10) if (safe(x)) options.push(x);
    options.sort((a, b) => Math.abs(a - basket.x) - Math.abs(b - basket.x));
    return options[0] ?? null;
  }
  const targets = items.filter((i) => i.type !== 'bomb' && i.y < rimY && safe(i.x)).sort((a, b) => b.y - a.y);
  return targets[0]?.x ?? null;
}

// Giocatore sfortunato: insegue le bombe
const bombChaser = ({ items, rimY }) => items.filter((i) => i.type === 'bomb' && i.y < rimY).sort((a, b) => b.y - a.y)[0]?.x ?? null;

describe('Porcini che cadono (simulazione)', () => {
  it('le bombe finiscono le vite e chiudono la partita prima dei 2 minuti', () => {
    const { result, t, endText, durationMs } = simulate(1, bombChaser);
    expect(result.stats.lives).toBe(0);
    expect(result.stats.bombs).toBe(config.lives);
    expect(t).toBeLessThan(config.durationS);
    expect(endText).toBe('Hai finito le vite!');
    // finita prima: la parte del tempo è solo quella resistita, niente vite rimaste
    expect(result.rawScore).toBe(expectedScore(result.stats, durationMs));
    expect(result.rawScore).toBeLessThan(1000 * (config.scoreWeights.catch + config.scoreWeights.time));
  });

  it('giocatore bravo: quasi tutti i porcini presi, punteggio coerente con quanto preso', () => {
    const { result, durationMs } = simulate(2, good);
    const { porcini, golden, fallen } = result.stats;
    const caught = porcini + golden * config.goldenWeight;
    expect(caught / (caught + fallen)).toBeGreaterThan(0.8);
    expect(result.rawScore).toBe(expectedScore(result.stats, durationMs));
    expect(result.rawScore).toBeLessThanOrEqual(1000);
  });

  it('chi arriva alla fine con vite rimaste ha tutta la parte del tempo e quella delle vite', () => {
    const { result, t, endText, durationMs } = simulate(3, good);
    if (result.stats.lives > 0) {
      expect(t).toBeGreaterThanOrEqual(config.durationS);
      expect(endText).toBe('Tempo scaduto!');
      expect(result.rawScore).toBe(expectedScore(result.stats, durationMs));
    }
  });

  it('ogni mazzo ha il suo porcino d\'oro e la quota di bombe prevista', () => {
    const { seen } = simulate(4, good);
    expect(seen.length).toBeGreaterThanOrEqual(config.deckSize);
    const firstDeck = seen.slice(0, config.deckSize);
    expect(firstDeck.filter((t) => t === 'golden')).toHaveLength(config.goldenPerDeck);
    expect(firstDeck.filter((t) => t === 'bomb').length).toBe(Math.round(config.bombShare[0] * config.deckSize));
  });

  it('registra il dito (solo quando si sposta), prese e porcini persi', () => {
    const { actions } = simulate(5, good);
    const types = new Set(actions.map((a) => a[1]));
    expect(types.has('move')).toBe(true);
    const moves = actions.filter((a) => a[1] === 'move');
    expect(moves.every((m, i) => i === 0 || m[2] !== moves[i - 1][2])).toBe(true); // niente doppioni
    expect(types.has('catch')).toBe(true);
    const catchRow = actions.find((a) => a[1] === 'catch');
    expect(catchRow).toHaveLength(5); // [ms, 'catch', tipo, x elemento, x cestino]
  });

  it('stesso seme → stessa partita', () => {
    const a = simulate(42, good);
    const b = simulate(42, good);
    expect(a.actions).toEqual(b.actions);
    expect(a.result).toEqual(b.result);
  });
});
