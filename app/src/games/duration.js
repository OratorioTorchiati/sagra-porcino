// Durata (D99) e step (D104, D107: domande del quiz, coppie del Memory) decisi dall'Admin. Il server li manda
// all'avvio della partita (e nel replay): qui si applicano alla configurazione del gioco, al posto dei valori
// scritti nel suo config.js (che restano solo per la modalità prova).
//
// Giochi a tempo (Acchiappa, Porcini che cadono, Memory): durata della partita in secondi.
// Giochi a domande (Quiz): la durata è domande × secondi per domanda; anche il numero di domande lo decide
// l'Admin (D104).

/** Gioco a domande? (gli altri sono a tempo) */
export const isStepGame = (gameId) => gameId === 'quiz';

/**
 * Configurazione del gioco con durata e step decisi dall'Admin (senza: quelli del config.js).
 * Quiz: step = domande, durata = domande × secondi per domanda. Memory: step = coppie.
 */
export function withDuration(gameDef, gameId, durationS, steps = null) {
  if (!durationS && !steps) return gameDef;
  const config = { ...gameDef.config };
  if (isStepGame(gameId)) {
    config.questionsPerGame = steps || config.questionsPerGame;
    if (durationS) config.timePerQuestionS = durationS / config.questionsPerGame;
  } else {
    if (durationS) config.durationS = durationS;
    if (steps && 'pairs' in config) config.pairs = steps;
  }
  return { ...gameDef, config };
}

/** 60 → "1 minuto", 90 → "1 minuto e 30 secondi", 45 → "45 secondi" */
export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const min = m === 1 ? '1 minuto' : `${m} minuti`;
  const sec = s === 1 ? '1 secondo' : `${s} secondi`;
  if (!m) return sec;
  return s ? `${min} e ${sec}` : min;
}
