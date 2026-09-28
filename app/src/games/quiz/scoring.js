// Punteggio del quiz (docs/03-GIOCHI.md). In produzione lo calcola il SERVER (Tappa 5), perché le
// risposte giuste non sono nel sito; qui serve per la modalità prova e come riferimento per i test.

/** Punti di una risposta: 150 + bonus velocità (0–50) se giusta, 0 se sbagliata o scaduta. */
export function answerPoints(correct, ms, config) {
  if (!correct) return 0;
  const maxMs = config.timePerQuestionS * 1000;
  const t = Math.min(Math.max(ms, 0), maxMs);
  return config.perCorrect + Math.round(config.speedBonusMax * (1 - t / maxMs));
}

/**
 * @param {{questionId: number, choice: number|null, ms: number}[]} answers  choice = indice originale scelto
 * @param {Map<number, number>} correctIndex  id domanda → indice della risposta giusta
 */
export function quizScore(answers, correctIndex, config) {
  let score = 0;
  let correct = 0;
  for (const a of answers) {
    const ok = a.choice !== null && correctIndex.get(a.questionId) === a.choice;
    if (ok) correct++;
    score += answerPoints(ok, a.ms, config);
  }
  return { score, correct };
}
