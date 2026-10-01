import { describe, expect, it } from 'vitest';
import config from './config.js';
import { applyCatch, applyMiss, cadonoScore, initialState } from './scoring.js';

function play(events) {
  let state = initialState(config);
  for (const [what, type] of events) state = what === 'catch' ? applyCatch(state, type, config).state : applyMiss(state, type, config);
  return state;
}

const full = config.durationS * 1000; // partita arrivata alla fine
const w = config.scoreWeights;

describe('Porcini che cadono: punteggio in percentuale (D107)', () => {
  it('porcino +1, porcino d\'oro + goldenWeight, bomba -1 vita', () => {
    const state = play([['catch', 'porcino'], ['catch', 'porcino'], ['catch', 'golden'], ['catch', 'bomb']]);
    expect(state).toMatchObject({ caught: 2 + config.goldenWeight, porcini: 2, golden: 1, bombs: 1, lives: config.lives - 1 });
  });

  it('le vite non scendono sotto zero; le bombe cadute non contano', () => {
    const state = play(Array.from({ length: config.lives + 1 }, () => ['catch', 'bomb']).concat([['miss', 'bomb']]));
    expect(state.lives).toBe(0);
    expect(state.fallen).toBe(0);
  });

  it('tutti presi, fino alla fine, senza bombe: 1000', () => {
    expect(cadonoScore(play([['catch', 'porcino'], ['catch', 'golden']]), full, config)).toBe(1000);
  });

  it('metà dei porcini caduti: metà della parte dei porcini presi', () => {
    const state = play([['catch', 'porcino'], ['miss', 'porcino']]);
    expect(cadonoScore(state, full, config)).toBe(Math.round(1000 * (w.catch * 0.5 + w.time + w.lives)));
  });

  it('un porcino d\'oro caduto pesa come goldenWeight porcini', () => {
    const state = play([['catch', 'porcino'], ['miss', 'golden']]);
    expect(cadonoScore(state, full, config)).toBe(Math.round(1000 * (w.catch * (1 / (1 + config.goldenWeight)) + w.time + w.lives)));
  });

  it('finita a metà tempo senza vite: metà della parte del tempo, niente vite', () => {
    const state = play([['catch', 'porcino'], ...Array.from({ length: config.lives }, () => ['catch', 'bomb'])]);
    expect(cadonoScore(state, full / 2, config)).toBe(Math.round(1000 * (w.catch + w.time * 0.5)));
  });
});
