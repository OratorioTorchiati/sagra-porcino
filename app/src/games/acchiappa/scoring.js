// Calcolo dei punti di "Acchiappa il porcino" (funzioni pure, con test).
// Il server rifà lo stesso calcolo dalla sequenza dei tocchi (supabase/migrations/005_acchiappa_moltiplicatore_a_tempo.sql).
//
// Moltiplicatore a tempo (D67): con `minStreak` porcini di fila si sale di livello e il nuovo moltiplicatore
// dura `durationS` secondi; scaduto, si scende di un livello (che riparte col suo tempo pieno) e la serie
// riparte dalla soglia di quel livello: per risalire servono di nuovo i porcini che mancano alla soglia successiva.
// Un elemento cattivo riporta subito a ×1. I tempi sono in millisecondi di gioco (gli stessi del registro azioni).

/** Livello (indice in config.multipliers) raggiunto con una serie di `streak` porcini di fila */
function levelFor(streak, config) {
  let level = 0;
  config.multipliers.forEach((step, i) => {
    if (streak >= step.minStreak) level = i;
  });
  return level;
}

export function initialScoreState() {
  return { score: 0, streak: 0, level: 0, levelEndsMs: null, run: 0, maxStreak: 0, caught: 0, errors: 0 };
}

/** Moltiplicatore attuale (vale per il prossimo porcino preso) */
export function currentMultiplier(state, config) {
  return config.multipliers[state.level].multiplier;
}

/** Secondi rimasti al moltiplicatore attuale (null a ×1) */
export function secondsLeft(state, nowMs) {
  return state.levelEndsMs === null ? null : Math.max(0, Math.ceil((state.levelEndsMs - nowMs) / 1000));
}

/** Fa scadere i moltiplicatori fino a `nowMs` (si può chiamare quando si vuole: il risultato non cambia). */
export function expire(state, nowMs, config) {
  let { level, levelEndsMs, streak } = state;
  while (level > 0 && nowMs >= levelEndsMs) {
    level -= 1;
    streak = config.multipliers[level].minStreak;
    levelEndsMs = level > 0 ? levelEndsMs + config.multipliers[level].durationS * 1000 : null;
  }
  return level === state.level ? state : { ...state, level, levelEndsMs, streak };
}

/**
 * Applica un tocco allo stato del punteggio.
 * @param {'good'|'bad'} hit
 * @param {number} nowMs tempo di gioco del tocco, in ms interi
 * @returns {{state, points: number}} nuovo stato e punti guadagnati
 */
export function applyHit(state, hit, nowMs, config) {
  state = expire(state, nowMs, config);
  if (hit === 'good') {
    const points = config.pointsPerPorcino * currentMultiplier(state, config);
    const streak = state.streak + 1;
    const run = state.run + 1;
    let { level, levelEndsMs } = state;
    const reached = levelFor(streak, config);
    if (reached > level) {
      level = reached;
      levelEndsMs = nowMs + config.multipliers[level].durationS * 1000;
    }
    return {
      points,
      state: {
        ...state,
        score: state.score + points,
        streak,
        level,
        levelEndsMs,
        run,
        maxStreak: Math.max(state.maxStreak, run),
        caught: state.caught + 1,
      },
    };
  }
  // Elemento cattivo: serie e moltiplicatore azzerati, nessun punto tolto
  return { points: 0, state: { ...state, streak: 0, level: 0, levelEndsMs: null, run: 0, errors: state.errors + 1 } };
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
