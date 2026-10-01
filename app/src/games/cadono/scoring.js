// Calcolo dei punti di "Porcini che cadono" (funzioni pure, con test).

export function initialState(config) {
  return { score: 0, porcini: 0, golden: 0, bombs: 0, lives: config.lives };
}

/**
 * Applica un elemento preso col cestino.
 * @param {'porcino'|'golden'|'bomb'} type
 * @returns {{state, points: number}}
 */
export function applyCatch(state, type, config) {
  if (type === 'bomb') {
    return { points: 0, state: { ...state, bombs: state.bombs + 1, lives: Math.max(0, state.lives - 1) } };
  }
  if (type === 'golden') {
    return { points: config.pointsGolden, state: { ...state, score: state.score + config.pointsGolden, golden: state.golden + 1 } };
  }
  return { points: config.pointsPorcino, state: { ...state, score: state.score + config.pointsPorcino, porcini: state.porcini + 1 } };
}

/** Bonus sopravvivenza: solo se si arriva alla fine dei 2 minuti con almeno una vita. */
export function survivalBonus(state, reachedEnd, config) {
  return reachedEnd && state.lives > 0 ? state.lives * config.survivalBonusPerLife : 0;
}

/** Tetto di plausibilità del punteggio (per i controlli del server), con margine del 50%. */
export function maxRawScore(config) {
  const maxSpawns = Math.ceil(config.durationS / (Math.min(...config.spawnInterval) * 0.75));
  const maxGolden = Math.ceil(maxSpawns / config.deckSize) * config.goldenPerDeck;
  const best = (maxSpawns - maxGolden) * config.pointsPorcino + maxGolden * config.pointsGolden;
  return Math.ceil((best + config.lives * config.survivalBonusPerLife) * 1.5);
}
