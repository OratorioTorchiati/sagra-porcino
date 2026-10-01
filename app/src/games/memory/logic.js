// Logica del Memory (senza grafica, con test): carte mescolate col seme, girate a coppie.

/**
 * @param {{ rng, cardIds: string[] }} options  un id per ogni coppia
 */
export function createMemoryLogic({ rng, cardIds }) {
  const deck = [...cardIds, ...cardIds];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const cards = deck.map((id, index) => ({ index, id, matched: false }));
  let open = [];
  let locked = false;
  let moves = 0;
  let pairs = 0;

  return {
    cards,

    /**
     * Gira una carta. Esiti: 'ignored' (carta non girabile ora), 'first' (prima della coppia),
     * 'match' (coppia trovata), 'mismatch' (diverse: restano aperte finché non si chiama closeMismatch).
     */
    flip(index) {
      const card = cards[index];
      if (!card || locked || card.matched || open.includes(index)) return 'ignored';
      if (open.length === 0) {
        open = [index];
        return 'first';
      }
      moves++;
      const first = cards[open[0]];
      if (first.id === card.id) {
        first.matched = true;
        card.matched = true;
        pairs++;
        open = [];
        return 'match';
      }
      open = [open[0], index];
      locked = true;
      return 'mismatch';
    },

    /** Richiude le due carte sbagliate e, se `swap`, le scambia di posto. Sblocca il gioco. */
    closeMismatch(swap = false) {
      if (swap && open.length === 2) {
        const [a, b] = open;
        [cards[a].id, cards[b].id] = [cards[b].id, cards[a].id];
      }
      open = [];
      locked = false;
    },

    get open() {
      return [...open];
    },
    get moves() {
      return moves;
    },
    get pairs() {
      return pairs;
    },
    isComplete() {
      return pairs === cardIds.length;
    },
  };
}

/** Punteggio grezzo del Memory, da 0 a 1000 (formula in config.js, D106; uguale nel server). */
export function memoryScore({ completed, seconds, moves, pairs }, config) {
  const errors = Math.max(0, moves - pairs);
  const precision = pairs > 0 ? pairs / (pairs + errors * config.errorWeight) : 0;
  const timeLeft = completed ? Math.max(0, 1 - seconds / config.durationS) : 0;
  return Math.round(config.pairPoints * (pairs + precision + timeLeft));
}
