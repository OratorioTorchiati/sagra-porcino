import { describe, expect, it } from 'vitest';
import config from './config.js';
import { createMemoryLogic, memoryScore } from './logic.js';
import { createRng } from '../engine/rng.js';

const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

describe('createMemoryLogic', () => {
  it('16 carte, ogni id esattamente due volte, mescolate dal seme', () => {
    const logic = createMemoryLogic({ rng: createRng(1), cardIds: IDS });
    expect(logic.cards).toHaveLength(16);
    for (const id of IDS) expect(logic.cards.filter((c) => c.id === id)).toHaveLength(2);
    const again = createMemoryLogic({ rng: createRng(1), cardIds: IDS });
    const other = createMemoryLogic({ rng: createRng(2), cardIds: IDS });
    expect(again.cards.map((c) => c.id)).toEqual(logic.cards.map((c) => c.id));
    expect(other.cards.map((c) => c.id)).not.toEqual(logic.cards.map((c) => c.id));
  });

  it('coppia uguale → resta scoperta; diversa → si blocca finché non si richiude', () => {
    const logic = createMemoryLogic({ rng: createRng(3), cardIds: IDS });
    const [a1, a2] = logic.cards.filter((c) => c.id === 'a').map((c) => c.index);
    const b1 = logic.cards.find((c) => c.id === 'b').index;

    expect(logic.flip(a1)).toBe('first');
    expect(logic.flip(a1)).toBe('ignored'); // stessa carta due volte
    expect(logic.flip(b1)).toBe('mismatch');
    expect(logic.flip(a2)).toBe('ignored'); // bloccato finché le due carte non si richiudono
    logic.closeMismatch();
    expect(logic.flip(a1)).toBe('first');
    expect(logic.flip(a2)).toBe('match');
    expect(logic.flip(a1)).toBe('ignored'); // già trovata
    expect(logic.moves).toBe(2);
    expect(logic.pairs).toBe(1);
  });

  it('dopo un errore le due carte si scambiano di posto', () => {
    const logic = createMemoryLogic({ rng: createRng(5), cardIds: IDS });
    const a = logic.cards[0];
    const b = logic.cards.find((c) => c.id !== a.id);
    const [idA, idB] = [a.id, b.id];
    logic.flip(a.index);
    logic.flip(b.index);
    logic.closeMismatch(true);
    expect(logic.cards[a.index].id).toBe(idB);
    expect(logic.cards[b.index].id).toBe(idA);
    for (const id of IDS) expect(logic.cards.filter((c) => c.id === id)).toHaveLength(2);
  });

  it('partita perfetta: 8 mosse e completata', () => {
    const logic = createMemoryLogic({ rng: createRng(4), cardIds: IDS });
    for (const id of IDS) {
      const [x, y] = logic.cards.filter((c) => c.id === id).map((c) => c.index);
      logic.flip(x);
      expect(logic.flip(y)).toBe('match');
    }
    expect(logic.isComplete()).toBe(true);
    expect(logic.moves).toBe(8);
  });
});

describe('memoryScore (D106): 100 × coppie + 100 × precisione + 100 × tempo avanzato', () => {
  const cfg = { ...config, durationS: 120 };

  it('ogni coppia vale una "centinaia": 1 coppia = 1xx, 4 coppie = 4xx', () => {
    // 1 coppia al primo colpo: precisione piena → 200; dopo 99 errori → poco più di 100
    expect(memoryScore({ completed: false, seconds: 120, moves: 1, pairs: 1 }, cfg)).toBe(200);
    expect(memoryScore({ completed: false, seconds: 120, moves: 100, pairs: 1 }, cfg)).toBe(102);
    // 4 coppie con 20 errori: 400 + 100 × 4 / (4 + 10)
    expect(memoryScore({ completed: false, seconds: 120, moves: 24, pairs: 4 }, cfg)).toBe(429);
    expect(memoryScore({ completed: false, seconds: 120, moves: 10, pairs: 0 }, cfg)).toBe(0);
  });

  it('completato: conta anche il tempo avanzato', () => {
    // 8 coppie in 15 mosse (7 errori) e 70 secondi su 120: 800 + 70 + 42
    expect(memoryScore({ completed: true, seconds: 70, moves: 15, pairs: 8 }, cfg)).toBe(911);
    // perfetto e istantaneo = 1000
    expect(memoryScore({ completed: true, seconds: 0, moves: 8, pairs: 8 }, cfg)).toBe(1000);
  });

  it('completare vale sempre più che non completare', () => {
    const worstCompleted = memoryScore({ completed: true, seconds: config.durationS, moves: 999, pairs: 8 }, config);
    const bestIncomplete = memoryScore({ completed: false, seconds: config.durationS, moves: 7, pairs: config.pairs - 1 }, config);
    expect(worstCompleted).toBeGreaterThan(bestIncomplete);
  });
});
