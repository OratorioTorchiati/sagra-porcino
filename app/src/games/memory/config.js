// Tutti i numeri del "Memory del paese", da ritoccare dopo le prove senza cambiare la logica.

export default {
  pairs: 8,
  /** Tempo massimo, poi la partita finisce con le coppie trovate (28/09: ridotto da 3 a 2 minuti) */
  durationS: 120,
  /** Secondi prima che due carte diverse si richiudano */
  mismatchDelayS: 0.8,
  /** Dopo un errore le due carte si rigirano e intanto si scambiano di posto: durata dello scambio
   *  (più lunga della rigirata, 0,3 s, così il contenuto cambia quando sono già coperte) */
  swapS: 0.6,
  /** Una coppia trovata resta visibile per questo tempo, poi sparisce verso lo sfondo */
  matchShowS: 0.5,

  // Punteggio (proposta per Q13): completare vale SEMPRE più che non completare
  //   completato:     max(completedMin, base − perSecond × secondi − perExtraMove × (mosse − coppie))
  //   non completato: perPairIncomplete × coppie trovate   (al massimo 7 × 30 = 210 < 300)
  base: 1000,
  perSecond: 3,
  perExtraMove: 20,
  completedMin: 300,
  perPairIncomplete: 30,
};
