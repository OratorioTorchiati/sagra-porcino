// Tutti i numeri del "Quiz del paese", da ritoccare dopo le prove senza cambiare la logica.

export default {
  questionsPerGame: 5,
  /** Secondi per domanda: a tempo scaduto conta come sbagliata */
  timePerQuestionS: 20,
  /** Punti al massimo in tutto (D104): per risposta giusta 75% di maxScore/domande + fino al 25% di velocità
   *  (con 5 domande: 150 + fino a 50). Uguale qualunque sia il numero di domande. */
  maxScore: 1000,
  /** Pausa dopo il tocco, prima della domanda successiva (nessun giusto/sbagliato mostrato) */
  answerPauseMs: 350,
};
