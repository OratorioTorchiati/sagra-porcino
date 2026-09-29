import { describe, expect, it } from 'vitest';
import config from './config.js';
import { applyHit, currentMultiplier, expire, gameEndMs, initialScoreState, maxRawScore, secondsLeft, timeLeftFraction } from './scoring.js';

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

  it('serie veloce: ×3 dall\'11° porcino e ×4 dal 16°', () => {
    const { points, state } = play(goods(17));
    expect(points[10]).toBe(15);
    expect(points[15]).toBe(20);
    expect(state.score).toBe(5 * 5 + 5 * 10 + 5 * 15 + 2 * 20);
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

describe('moltiplicatore a tempo', () => {
  it('×2 dura 7 secondi senza porcini, poi si torna a ×1', () => {
    // 5° porcino a 400 ms → ×2 fino a 7400 ms
    const { state } = play(goods(5));
    expect(currentMultiplier(state, config)).toBe(2);
    expect(secondsLeft(state, 400)).toBe(7);
    expect(timeLeftFraction(state, 400, config)).toBe(1);
    expect(timeLeftFraction(state, 3900, config)).toBe(0.5); // anello a metà
    expect(currentMultiplier(expire(state, 7399, config), config)).toBe(2);
    const after = expire(state, 7400, config);
    expect(currentMultiplier(after, config)).toBe(1);
    expect(secondsLeft(after, 7400)).toBe(null);
    expect(timeLeftFraction(after, 7400, config)).toBe(null);
    expect(play([...goods(5), [7400, 'good']]).points.at(-1)).toBe(5);
  });

  it('×4 dura 5 s, poi ×3 per 6 s, poi ×2 per 7 s, poi ×1', () => {
    const { state } = play(goods(15)); // 15° porcino a 1400 ms → ×4
    expect(currentMultiplier(state, config)).toBe(4);
    const at = (ms) => currentMultiplier(expire(state, ms, config), config);
    expect(at(6399)).toBe(4);
    expect(at(6400)).toBe(3);
    expect(at(12399)).toBe(3);
    expect(at(12400)).toBe(2);
    expect(at(19399)).toBe(2);
    expect(at(19400)).toBe(1);
    expect(timeLeftFraction(expire(state, 6400, config), 6400, config)).toBe(1); // l'anello torna pieno
  });

  it('ogni porcino ricarica il tempo: +2 s a ×2, +1,5 s a ×3, +1 s a ×4, mai oltre il pieno', () => {
    // ×2 al 5° porcino (400 ms, scade a 7400); il 6° a 5400 ms ricarica di 2 s → scade a 9400
    let { state } = play([...goods(5), [5400, 'good']]);
    expect(state.levelEndsMs).toBe(9400);
    state = applyHit(state, 'good', 5500, config).state; // +2 s → 11400
    expect(state.levelEndsMs).toBe(11400);
    // porcino subito dopo la salita: +2 s supererebbe il pieno (7 s da 500 ms) → si ferma a 7500
    ({ state } = play([...goods(5), [500, 'good']]));
    expect(state.levelEndsMs).toBe(7500);
    expect(timeLeftFraction(state, 500, config)).toBe(1);
    // ×3 (dal 10° porcino): +1,5 s
    ({ state } = play([...goods(10), [4900, 'good']])); // ×3 a 900 ms, scade a 6900
    expect(state.levelEndsMs).toBe(8400);
    // ×4 (dal 15° porcino): +1 s
    ({ state } = play([...goods(15), [4400, 'good']])); // ×4 a 1400 ms, scade a 6400
    expect(state.levelEndsMs).toBe(7400);
  });

  it('prendendo porcini con calma il moltiplicatore non scade mai', () => {
    // un porcino ogni 1,9 s: a ×2 ogni porcino dà 2 s, quindi il tempo non finisce
    const slow = Array.from({ length: 4 }, (_, i) => [400 + (i + 1) * 1900, 'good']);
    const { state } = play([...goods(5), ...slow]);
    expect(currentMultiplier(expire(state, 8000, config), config)).toBe(2);
  });

  it('un oggetto non tocca il moltiplicatore né la serie: conta solo come errore', () => {
    // ×2 al 5° porcino (400 ms, scade a 7400)
    const { state } = play([...goods(5), [1000, 'object']]);
    expect(currentMultiplier(state, config)).toBe(2);
    expect(state.levelEndsMs).toBe(7400);
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

  it('quando scende, per risalire servono di nuovo i porcini fino alla soglia successiva', () => {
    // ×3 al 10° porcino (900 ms), scade a 6900 → ×2 con serie ripartita da 5
    const base = goods(10);
    const again = goods(5, 7000); // 5 porcini dopo la scadenza: serie 6..10 → al 10 si torna ×3
    const { points, state } = play([...base, ...again]);
    expect(points.slice(10)).toEqual([10, 10, 10, 10, 10]);
    expect(currentMultiplier(state, config)).toBe(3);
    expect(secondsLeft(state, 7400)).toBe(6); // tempo pieno dal nuovo livello
    expect(state.maxStreak).toBe(15); // la serie di porcini di fila non si interrompe
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
