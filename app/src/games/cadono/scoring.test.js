import { describe, expect, it } from 'vitest';
import config from './config.js';
import { applyCatch, initialState, maxRawScore, survivalBonus } from './scoring.js';

function play(types) {
  let state = initialState(config);
  for (const type of types) state = applyCatch(state, type, config).state;
  return state;
}

describe('Porcini che cadono: punti', () => {
  it('porcino +10, porcino d\'oro +50, bomba -1 vita senza togliere punti', () => {
    const state = play(['porcino', 'porcino', 'golden', 'bomb']);
    expect(state.score).toBe(70);
    expect(state).toMatchObject({ porcini: 2, golden: 1, bombs: 1, lives: 2 });
  });

  it('le vite non scendono sotto zero', () => {
    expect(play(['bomb', 'bomb', 'bomb', 'bomb']).lives).toBe(0);
  });

  it('bonus sopravvivenza: +50 per vita rimasta, solo arrivando alla fine', () => {
    const state = play(['porcino', 'bomb']);
    expect(survivalBonus(state, true, config)).toBe(100);
    expect(survivalBonus(state, false, config)).toBe(0);
    expect(survivalBonus(play(['bomb', 'bomb', 'bomb']), true, config)).toBe(0);
  });

  it('tetto di plausibilità ragionevole', () => {
    const max = maxRawScore(config);
    expect(max).toBeGreaterThan(3000);
    expect(max).toBeLessThan(50000);
  });
});
