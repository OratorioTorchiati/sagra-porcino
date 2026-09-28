// Tutti i numeri del "Quiz del paese", da ritoccare dopo le prove senza cambiare la logica.

export default {
  questionsPerGame: 5,
  /** Secondi per domanda: a tempo scaduto conta come sbagliata */
  timePerQuestionS: 20,
  /** Punti per risposta giusta, più un bonus velocità da 0 a speedBonusMax (massimo 5 × 200 = 1000) */
  perCorrect: 150,
  speedBonusMax: 50,
  /** Pausa dopo il tocco, prima della domanda successiva (nessun giusto/sbagliato mostrato) */
  answerPauseMs: 350,
};
