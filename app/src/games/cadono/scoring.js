// Calcolo dei punti di "Porcini che cadono" (funzioni pure, con test). Il server rifà lo stesso calcolo (D107).

export function initialState(config) {
  return { caught: 0, fallen: 0, porcini: 0, golden: 0, bombs: 0, lives: config.lives };
}

/** Peso di un elemento nella percentuale: il porcino d'oro vale `goldenWeight` porcini */
const weight = (type, config) => (type === 'golden' ? config.goldenWeight : 1);

/**
 * Applica un elemento preso col cestino.
 * @param {'porcino'|'golden'|'bomb'} type
 * @returns {{state, points: number}} points = quanto conta nei porcini presi (0 per la bomba)
 */
export function applyCatch(state, type, config) {
  if (type === 'bomb') {
    return { points: 0, state: { ...state, bombs: state.bombs + 1, lives: Math.max(0, state.lives - 1) } };
  }
  const points = weight(type, config);
  const counter = type === 'golden' ? 'golden' : 'porcini';
  return { points, state: { ...state, caught: state.caught + points, [counter]: state[counter] + 1 } };
}

/** Un porcino caduto per terra (le bombe cadute non contano) */
export function applyMiss(state, type, config) {
  if (type === 'bomb') return state;
  return { ...state, fallen: state.fallen + weight(type, config) };
}

/**
 * Punteggio finale da 0 a 1000 (D107): percentuale di porcini presi, tempo resistito sulla durata, vite rimaste.
 * @param {number} durationMs tempo di gioco della partita (lo stesso che riceve il server)
 */
export function cadonoScore(state, durationMs, config) {
  const w = config.scoreWeights;
  const all = state.caught + state.fallen;
  const catchPart = all > 0 ? state.caught / all : 0;
  const timePart = Math.min(1, durationMs / (config.durationS * 1000));
  return Math.round(1000 * (w.catch * catchPart + w.time * timePart + w.lives * (state.lives / config.lives)));
}
