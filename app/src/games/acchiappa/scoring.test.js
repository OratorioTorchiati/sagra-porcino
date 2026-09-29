import { describe, expect, it } from 'vitest';
import config from './config.js';
import { applyHit, currentMultiplier, expire, initialScoreState, maxRawScore, secondsLeft } from './scoring.js';

/** Gioca una sequenza di [ms, 'good'|'bad'] */
function play(hits) {
  let state = initialScoreState();
  const points = [];
  for (const [ms, hit] of hits) {
    const r = applyHit(state, hit, ms, config);
    state = r.state;
    points.push(r.points);
  }
  return { state, points };
}

/** n porcini presi a distanza di `gapMs` a partire da `fromMs` */
const goods = (n, fromMs = 0, gapMs = 100) => Array.from({ length: n }, (_, i) => [fromMs + i * gapMs, 'good']);

describe('punti e moltiplicatore', () => {
  it('ogni porcino vale 5; dal 6° di fila ×2', () => {
    const { points } = play(goods(7));
    expect(points).toEqual([5, 5, 5, 5, 5, 10, 10]);
  });

  it('serie veloce: ×3 dall\'11° porcino e ×4 dal 21°', () => {
    const { points, state } = play(goods(22));
    expect(points[10]).toBe(15);
    expect(points[20]).toBe(20);
    expect(state.score).toBe(5 * 5 + 5 * 10 + 10 * 15 + 2 * 20);
    expect(state.maxStreak).toBe(22);
  });

  it('un elemento cattivo azzera serie e moltiplicatore ma non toglie punti', () => {
    const { state, points } = play([...goods(6), [700, 'bad'], [800, 'good']]);
    expect(points.at(-2)).toBe(0);
    expect(points.at(-1)).toBe(5); // si riparte da ×1
    expect(state.score).toBe(5 * 5 + 10 + 5);
    expect(state.errors).toBe(1);
    expect(state.caught).toBe(7);
    expect(state.maxStreak).toBe(6);
  });
});

describe('moltiplicatore a tempo', () => {
  it('×2 dura 6 secondi, poi si torna a ×1', () => {
    // 5° porcino a 400 ms → ×2 fino a 6400 ms
    const { state } = play(goods(5));
    expect(currentMultiplier(state, config)).toBe(2);
    expect(secondsLeft(state, 400)).toBe(6);
    expect(currentMultiplier(expire(state, 6399, config), config)).toBe(2);
    const after = expire(state, 6400, config);
    expect(currentMultiplier(after, config)).toBe(1);
    expect(secondsLeft(after, 6400)).toBe(null);
    expect(play([...goods(5), [6400, 'good']]).points.at(-1)).toBe(5);
  });

  it('×4 dura 4 s, poi ×3 per 5 s, poi ×2 per 6 s, poi ×1', () => {
    const { state } = play(goods(20)); // 20° porcino a 1900 ms → ×4
    expect(currentMultiplier(state, config)).toBe(4);
    const at = (ms) => currentMultiplier(expire(state, ms, config), config);
    expect(at(5899)).toBe(4);
    expect(at(5900)).toBe(3);
    expect(at(10899)).toBe(3);
    expect(at(10900)).toBe(2);
    expect(at(16899)).toBe(2);
    expect(at(16900)).toBe(1);
  });

  it('quando scende, per risalire servono di nuovo i porcini fino alla soglia successiva', () => {
    // ×3 all'10° porcino (900 ms), scade a 5900 → ×2 con serie ripartita da 5
    const base = goods(10);
    const again = goods(5, 6000); // 5 porcini dopo la scadenza: serie 6..10 → al 10 si torna ×3
    const { points, state } = play([...base, ...again]);
    expect(points.slice(10)).toEqual([10, 10, 10, 10, 10]);
    expect(currentMultiplier(state, config)).toBe(3);
    expect(secondsLeft(state, 6400)).toBe(5); // tempo pieno dal nuovo livello
    expect(state.maxStreak).toBe(15); // la serie di porcini di fila non si interrompe
  });

  it('far scadere prima o dopo non cambia il risultato', () => {
    const { state } = play(goods(20));
    const direct = expire(state, 12000, config);
    const stepped = [3000, 6000, 9000, 12000].reduce((s, ms) => expire(s, ms, config), state);
    expect(stepped).toEqual(direct);
  });
});

describe('maxRawScore', () => {
  it('è molto sopra un punteggio realistico ma non infinito', () => {
    const max = maxRawScore(config);
    expect(max).toBeGreaterThan(3000);
    expect(max).toBeLessThan(100000);
  });
});
