// Calcolo dei punti di "Acchiappa il porcino" (funzioni pure, con test).

/** Moltiplicatore per una serie di `streak` porcini di fila (vale per il prossimo porcino preso). */
export function multiplierFor(streak, config) {
  let multiplier = 1;
  for (const step of config.multipliers) {
    if (streak >= step.minStreak) multiplier = step.multiplier;
  }
  return multiplier;
}

/**
 * Applica un tocco allo stato del punteggio.
 * @param {{score: number, streak: number, maxStreak: number, caught: number, errors: number}} state
 * @param {'good'|'bad'} hit
 * @returns {{state, points: number}} nuovo stato e punti guadagnati
 */
export function applyHit(state, hit, config) {
  if (hit === 'good') {
    const points = config.pointsPerPorcino * multiplierFor(state.streak, config);
    const streak = state.streak + 1;
    return {
      points,
      state: {
        ...state,
        score: state.score + points,
        streak,
        maxStreak: Math.max(state.maxStreak, streak),
        caught: state.caught + 1,
      },
    };
  }
  // Elemento cattivo: la serie si azzera, nessun punto tolto
  return { points: 0, state: { ...state, streak: 0, errors: state.errors + 1 } };
}

export function initialScoreState() {
  return { score: 0, streak: 0, maxStreak: 0, caught: 0, errors: 0 };
}

/**
 * Tetto di plausibilità del punteggio (per i controlli del server): tutte le comparse possibili
 * fossero porcini presi al moltiplicatore massimo, con un margine del 50%.
 */
export function maxRawScore(config) {
  const minInterval = Math.min(...config.spawnInterval) * 0.7;
  const maxSpawns = Math.ceil(config.durationS / minInterval) + Math.max(...config.maxOnScreen);
  const maxMultiplier = Math.max(...config.multipliers.map((m) => m.multiplier));
  return Math.ceil(maxSpawns * config.pointsPerPorcino * maxMultiplier * 1.5);
}
