// Calcolo dei punti di "Acchiappa il porcino" (funzioni pure, con test).
// Il server rifà lo stesso calcolo dalla sequenza dei tocchi (supabase/migrations/005_acchiappa_moltiplicatore_a_tempo.sql).
//
// Moltiplicatore a timer (D84):
// - da ×1 a ×2 con `firstLevelStreak` porcini di fila; il timer del ×2 parte al 25% del tempo pieno;
// - da ×2 in su ogni porcino aggiunge `boostS` secondi al timer; quando il timer supera il tempo pieno del livello
//   (`durationS`) si sale al livello successivo, col timer al 25%. A ×4 il timer si ferma al pieno;
// - timer a zero: si scende di un livello col timer al 50%; tornati a ×1 servono di nuovo 5 porcini di fila.
// Un oggetto non tocca il moltiplicatore ma toglie `objectPenaltyS` secondi alla partita (gameEndMs, D81);
// un fungo velenoso riporta subito a ×1. I tempi sono in millisecondi di gioco (gli stessi del registro azioni).

/** Tempo pieno del livello, in ms */
const fullMs = (level, config) => config.multipliers[level].durationS * 1000;

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

/** Parte di tempo rimasta al moltiplicatore attuale, da 1 a 0 (null a ×1) */
export function timeLeftFraction(state, nowMs, config) {
  if (state.levelEndsMs === null) return null;
  return Math.max(0, (state.levelEndsMs - nowMs) / (config.multipliers[state.level].durationS * 1000));
}

/**
 * Anello del moltiplicatore nell'HUD, da 0 a 1: a ×1 (fisso, non scende) la serie verso il ×2
 * (20% a porcino con 5 di fila), dal ×2 in su il timer che si consuma.
 */
export function ringFraction(state, nowMs, config) {
  if (state.level === 0) return Math.min(1, state.streak / config.firstLevelStreak);
  return timeLeftFraction(state, nowMs, config);
}

/** Fa scadere i moltiplicatori fino a `nowMs` (si può chiamare quando si vuole: il risultato non cambia). */
export function expire(state, nowMs, config) {
  let { level, levelEndsMs, streak } = state;
  while (level > 0 && nowMs >= levelEndsMs) {
    level -= 1;
    levelEndsMs = level > 0 ? levelEndsMs + fullMs(level, config) * config.levelDownStartFraction : null;
    if (level === 0) streak = 0;
  }
  return level === state.level ? state : { ...state, level, levelEndsMs, streak };
}

/**
 * Applica un tocco allo stato del punteggio.
 * @param {'good'|'poison'|'object'} hit porcino, fungo velenoso o oggetto ('bad' = velenoso)
 * @param {number} nowMs tempo di gioco del tocco, in ms interi
 * @returns {{state, points: number}} nuovo stato e punti guadagnati
 */
export function applyHit(state, hit, nowMs, config) {
  state = expire(state, nowMs, config);
  if (hit === 'good') {
    const points = config.pointsPerPorcino * currentMultiplier(state, config);
    const run = state.run + 1;
    let { level, levelEndsMs, streak } = state;
    const top = config.multipliers.length - 1;
    if (level === 0) {
      streak += 1;
      if (streak >= config.firstLevelStreak) {
        level = 1;
        levelEndsMs = nowMs + fullMs(1, config) * config.levelUpStartFraction;
      }
    } else {
      levelEndsMs += config.multipliers[level].boostS * 1000;
      if (levelEndsMs - nowMs > fullMs(level, config)) {
        // il timer sfora il tempo pieno: livello successivo col timer al 25% (a ×4 si ferma al pieno)
        if (level < top) {
          level += 1;
          levelEndsMs = nowMs + fullMs(level, config) * config.levelUpStartFraction;
        } else {
          levelEndsMs = nowMs + fullMs(level, config);
        }
      }
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
  // Oggetto: solo un errore (il tempo tolto alla partita lo calcola gameEndMs)
  if (hit === 'object') return { points: 0, state: { ...state, errors: state.errors + 1 } };
  // Fungo velenoso: serie e moltiplicatore azzerati, nessun punto tolto
  return { points: 0, state: { ...state, streak: 0, level: 0, levelEndsMs: null, run: 0, errors: state.errors + 1 } };
}

/**
 * Fine della partita dopo un oggetto toccato a `nowMs`: `objectPenaltyS` secondi in meno (mai prima del tocco).
 * @param {number} endMs fine prevista finora (all'inizio config.durationS * 1000)
 */
export function gameEndMs(endMs, nowMs, config) {
  return Math.max(nowMs, endMs - config.objectPenaltyS * 1000);
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
