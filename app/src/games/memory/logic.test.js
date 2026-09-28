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

describe('memoryScore (proposta Q13)', () => {
  it('completato: 1000 − 3 × secondi − 20 × mosse in più', () => {
    expect(memoryScore({ completed: true, seconds: 40, moves: 8, pairs: 8 }, config)).toBe(880);
    expect(memoryScore({ completed: true, seconds: 60, moves: 14, pairs: 8 }, config)).toBe(1000 - 180 - 120);
  });

  it('completato lento: mai sotto 300', () => {
    expect(memoryScore({ completed: true, seconds: 179, moves: 40, pairs: 8 }, config)).toBe(300);
  });

  it('non completato: 30 per coppia', () => {
    expect(memoryScore({ completed: false, seconds: 180, moves: 30, pairs: 5 }, config)).toBe(150);
  });

  it('completare vale sempre più che non completare', () => {
    const worstCompleted = memoryScore({ completed: true, seconds: config.durationS, moves: 999, pairs: 8 }, config);
    const bestIncomplete = memoryScore({ completed: false, seconds: config.durationS, moves: 7, pairs: config.pairs - 1 }, config);
    expect(worstCompleted).toBeGreaterThan(bestIncomplete);
  });
});
