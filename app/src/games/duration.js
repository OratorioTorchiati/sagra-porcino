// Durata dei giochi decisa dall'Admin (D99). Il server la manda all'avvio della partita (e nel replay):
// qui la si applica alla configurazione del gioco, al posto del numero scritto nel suo config.js.
//
// Giochi a tempo (Acchiappa, Porcini che cadono, Memory): durata della partita in secondi.
// Giochi a domande (Quiz): la durata è domande × secondi per domanda.

/** Gioco a domande? (gli altri sono a tempo) */
export const isStepGame = (gameId) => gameId === 'quiz';

/** Configurazione del gioco con la durata decisa dall'Admin (senza durata: quella del config.js) */
export function withDuration(gameDef, gameId, durationS) {
  if (!durationS) return gameDef;
  const config = isStepGame(gameId)
    ? { ...gameDef.config, timePerQuestionS: durationS / gameDef.config.questionsPerGame }
    : { ...gameDef.config, durationS };
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
