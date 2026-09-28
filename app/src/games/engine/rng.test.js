import { describe, expect, it } from 'vitest';
import { createRng } from './rng.js';

describe('createRng', () => {
  it('stesso seme → stessa sequenza', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('semi diversi → sequenze diverse', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('rispetta gli intervalli', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const n = rng.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      const k = rng.int(3, 5);
      expect([3, 4, 5]).toContain(k);
      const r = rng.range(10, 20);
      expect(r).toBeGreaterThanOrEqual(10);
      expect(r).toBeLessThan(20);
    }
  });
});
