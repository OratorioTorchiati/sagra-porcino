// Tutti i numeri del "Memory del paese", da ritoccare dopo le prove senza cambiare la logica.

export default {
  pairs: 8,
  /** Tempo massimo, poi la partita finisce con le coppie trovate */
  durationS: 180,
  /** Secondi prima che due carte diverse si richiudano */
  mismatchDelayS: 0.8,

  // Punteggio (proposta per Q13): completare vale SEMPRE più che non completare
  //   completato:     max(completedMin, base − perSecond × secondi − perExtraMove × (mosse − coppie))
  //   non completato: perPairIncomplete × coppie trovate   (al massimo 7 × 30 = 210 < 300)
  base: 1000,
  perSecond: 3,
  perExtraMove: 20,
  completedMin: 300,
  perPairIncomplete: 30,
};
