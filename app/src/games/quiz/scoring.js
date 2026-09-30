// Punteggio del quiz (docs/03-GIOCHI.md). In produzione lo calcola il SERVER (Tappa 5), perché le
// risposte giuste non sono nel sito; qui serve per la modalità prova e come riferimento per i test.

/**
 * Punti di una risposta giusta (come nel server, D104): (75% + fino al 25% di velocità) di maxScore / domande.
 * Con 5 domande: 150 + bonus velocità 0–50. Sbagliata o scaduta: 0.
 */
export function answerPoints(correct, ms, config) {
  if (!correct) return 0;
  const maxMs = config.timePerQuestionS * 1000;
  const t = Math.min(Math.max(ms, 0), maxMs);
  return Math.round((config.maxScore * 0.75 + config.maxScore * 0.25 * (1 - t / maxMs)) / config.questionsPerGame);
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
  return { score: Math.min(score, config.maxScore), correct };
}
