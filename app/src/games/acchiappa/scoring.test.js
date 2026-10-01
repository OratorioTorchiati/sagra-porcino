import { describe, expect, it } from 'vitest';
import config from './config.js';
import { applyHit, currentMultiplier, expire, gameEndMs, initialScoreState, maxRawScore, ringFraction, secondsLeft, timeLeftFraction } from './scoring.js';

/** Gioca una sequenza di [ms, 'good'|'poison'|'object'] */
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

  it('serie veloce: ×2 dal 6° porcino, ×3 dal 10°, ×4 dal 16° (il timer sfora il tempo pieno)', () => {
    const { points, state } = play(goods(17));
    expect(points.slice(0, 5)).toEqual([5, 5, 5, 5, 5]);
    expect(points.slice(5, 9)).toEqual([10, 10, 10, 10]);
    expect(points.slice(9, 15)).toEqual([15, 15, 15, 15, 15, 15]);
    expect(points.slice(15)).toEqual([20, 20]);
    expect(state.score).toBe(5 * 5 + 4 * 10 + 6 * 15 + 2 * 20);
    expect(state.maxStreak).toBe(17);
  });

  it('un fungo velenoso azzera serie e moltiplicatore ma non toglie punti', () => {
    const { state, points } = play([...goods(6), [700, 'poison'], [800, 'good']]);
    expect(points.at(-2)).toBe(0);
    expect(points.at(-1)).toBe(5); // si riparte da ×1
    expect(state.score).toBe(5 * 5 + 10 + 5);
    expect(state.errors).toBe(1);
    expect(state.caught).toBe(7);
    expect(state.maxStreak).toBe(6);
  });
});

describe('moltiplicatore a timer (D84)', () => {
  it('×2 con 5 porcini di fila, timer al 25% (1,75 s); a zero si torna a ×1', () => {
    const { state } = play(goods(5)); // 5° porcino a 400 ms
    expect(currentMultiplier(state, config)).toBe(2);
    expect(state.levelEndsMs).toBe(2150);
    expect(timeLeftFraction(state, 400, config)).toBe(0.25);
    expect(secondsLeft(state, 400)).toBe(2);
    expect(currentMultiplier(expire(state, 2149, config), config)).toBe(2);
    const after = expire(state, 2150, config);
    expect(currentMultiplier(after, config)).toBe(1);
    expect(after.streak).toBe(0);
    expect(timeLeftFraction(after, 2150, config)).toBe(null);
  });

  it('anello: a ×1 si riempie con la serie (20% a porcino), dal ×2 è il timer', () => {
    expect(ringFraction(initialScoreState(), 0, config)).toBe(0);
    expect(ringFraction(play(goods(1)).state, 0, config)).toBe(0.2);
    expect(ringFraction(play(goods(4)).state, 300, config)).toBe(0.8);
    expect(ringFraction(play(goods(5)).state, 400, config)).toBe(0.25); // ×2, timer al 25%
    expect(ringFraction(play([...goods(3), [300, 'poison']]).state, 300, config)).toBe(0);
  });

  it('tornati a ×1 servono di nuovo 5 porcini di fila', () => {
    const { points, state } = play([...goods(5), ...goods(5, 3000)]);
    expect(points.slice(5)).toEqual([5, 5, 5, 5, 5]);
    expect(currentMultiplier(state, config)).toBe(2);
  });

  it('ogni porcino ricarica il timer: +1,5 s a ×2, +1 s a ×3, +0,5 s a ×4', () => {
    expect(play([...goods(5), [1000, 'good']]).state.levelEndsMs).toBe(2150 + 1500);
    // ×3 dal 9° porcino (800 ms, timer al 25% di 6 s → 2300); il 10° a 1000 ms: +1 s
    expect(play([...goods(9), [1000, 'good']]).state.levelEndsMs).toBe(2300 + 1000);
    // ×4 dal 15° porcino (1400 ms, timer al 25% di 5 s → 2650); il 16° a 1600 ms: +0,5 s
    expect(play([...goods(15), [1600, 'good']]).state.levelEndsMs).toBe(2650 + 500);
  });

  it('quando il timer sfora il tempo pieno si sale, col timer al 25%', () => {
    // a ×2 il 9° porcino (800 ms) porta il timer a 7,35 s > 7 s → ×3 con 1,5 s
    const { state } = play(goods(9));
    expect(currentMultiplier(state, config)).toBe(3);
    expect(state.levelEndsMs).toBe(800 + 1500);
    expect(timeLeftFraction(state, 800, config)).toBe(0.25);
    expect(currentMultiplier(play(goods(8)).state, config)).toBe(2); // all'8° non ancora
  });

  it('a ×4 il timer si ferma al pieno', () => {
    const { state } = play([...goods(15), ...goods(20, 1500)]);
    expect(currentMultiplier(state, config)).toBe(4);
    expect(state.levelEndsMs - 3400).toBe(5000);
  });

  it('timer a zero: giù di un livello col timer al 50%', () => {
    const { state } = play(goods(15)); // ×4 a 1400 ms, timer fino a 2650
    const at = (ms) => expire(state, ms, config);
    expect(currentMultiplier(at(2649), config)).toBe(4);
    expect(currentMultiplier(at(2650), config)).toBe(3);
    expect(timeLeftFraction(at(2650), 2650, config)).toBe(0.5);
    expect(currentMultiplier(at(5649), config)).toBe(3);
    expect(currentMultiplier(at(5650), config)).toBe(2); // +3 s (50% di 6)
    expect(currentMultiplier(at(9149), config)).toBe(2);
    expect(currentMultiplier(at(9150), config)).toBe(1); // +3,5 s (50% di 7)
  });

  it('a ×2 un porcino ogni 1,4 s tiene il moltiplicatore (ne ricarica 1,5)', () => {
    const slow = Array.from({ length: 4 }, (_, i) => [400 + (i + 1) * 1400, 'good']);
    const { state } = play([...goods(5), ...slow]);
    expect(currentMultiplier(expire(state, 8000, config), config)).toBe(2);
  });

  it('un oggetto non tocca il moltiplicatore né la serie: conta solo come errore', () => {
    const { state } = play([...goods(5), [1000, 'object']]);
    expect(currentMultiplier(state, config)).toBe(2);
    expect(state.levelEndsMs).toBe(2150);
    expect(state.errors).toBe(1);
    expect(state.run).toBe(5);
  });

  it('un oggetto toglie 2 s alla partita, mai prima del tocco', () => {
    expect(gameEndMs(60000, 1000, config)).toBe(58000);
    expect(gameEndMs(58000, 30000, config)).toBe(56000);
    expect(gameEndMs(59000, 58500, config)).toBe(58500); // finisce subito, non nel passato
  });

  it('a ×1 un oggetto conta solo come errore', () => {
    const { state } = play([...goods(2), [300, 'object'], [400, 'good']]);
    expect(state.score).toBe(15);
    expect(state.streak).toBe(3);
    expect(state.errors).toBe(1);
  });

  it('far scadere prima o dopo non cambia il risultato', () => {
    const { state } = play(goods(15));
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
