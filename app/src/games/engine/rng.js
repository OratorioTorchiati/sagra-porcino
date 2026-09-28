// Generatore di numeri casuali con seme (mulberry32): stesso seme → stessa partita.
// Il seme lo darà il server (Tappa 5); in modalità prova è casuale.

export function createRng(seed) {
  let state = seed >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    /** Numero in [0, 1) */
    next,
    /** Numero decimale in [min, max) */
    range: (min, max) => min + (max - min) * next(),
    /** Intero in [min, max] */
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    /** Elemento a caso di un array */
    pick: (items) => items[Math.floor(next() * items.length)],
    /** true con probabilità p */
    chance: (p) => next() < p,
  };
}

export function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}
