import { describe, expect, it } from 'vitest';
import config from './config.js';
import { applyHit, initialScoreState, maxRawScore, multiplierFor } from './scoring.js';

function play(hits) {
  let state = initialScoreState();
  const points = [];
  for (const hit of hits) {
    const r = applyHit(state, hit, config);
    state = r.state;
    points.push(r.points);
  }
  return { state, points };
}

describe('multiplierFor (tabella di 03-GIOCHI.md)', () => {
  it.each([
    [0, 1], [4, 1],
    [5, 2], [9, 2],
    [10, 3], [19, 3],
    [20, 4], [100, 4],
  ])('serie %i → ×%i', (streak, expected) => {
    expect(multiplierFor(streak, config)).toBe(expected);
  });
});

describe('applyHit', () => {
  it('i primi 5 porcini valgono 10, dal 6° in poi ×2', () => {
    const { points } = play(Array(7).fill('good'));
    expect(points).toEqual([10, 10, 10, 10, 10, 20, 20]);
  });

  it('serie lunga: ×3 dall\'11° porcino e ×4 dal 21°', () => {
    const { points, state } = play(Array(22).fill('good'));
    expect(points[10]).toBe(30);
    expect(points[20]).toBe(40);
    expect(state.score).toBe(5 * 10 + 5 * 20 + 10 * 30 + 2 * 40);
    expect(state.maxStreak).toBe(22);
  });

  it('un elemento cattivo azzera la serie ma non toglie punti', () => {
    const { state, points } = play([...Array(6).fill('good'), 'bad', 'good']);
    expect(points.at(-2)).toBe(0);
    expect(points.at(-1)).toBe(10); // si riparte da ×1
    expect(state.score).toBe(5 * 10 + 20 + 10);
    expect(state.errors).toBe(1);
    expect(state.caught).toBe(7);
    expect(state.maxStreak).toBe(6);
  });
});

describe('maxRawScore', () => {
  it('è molto sopra un punteggio realistico ma non infinito', () => {
    const max = maxRawScore(config);
    expect(max).toBeGreaterThan(5000);
    expect(max).toBeLessThan(100000);
  });
});
