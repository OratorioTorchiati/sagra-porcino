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

  // Punteggio da 0 a 1000 (D107), non dipende dalla durata né dal numero di coppie:
  //   1000 × (pairs × coppie trovate / coppie + precision × precisione + time × tempo avanzato)
  //   precisione     = coppie / (coppie + errori × errorWeight)   (errori = mosse sbagliate; 0–1)
  //   tempo avanzato = 1 − secondi / durata, solo se si trovano tutte le coppie (0–1)
  // Con 8 coppie: ogni coppia vale 100 (1 coppia = 1xx … 8 coppie = 8xx), poi precisione e tempo fino a 1000.
  // errorWeight 0,5: all'inizio gli errori sono inevitabili (le carte non si sono ancora viste).
  scoreWeights: { pairs: 0.8, precision: 0.1, time: 0.1 },
  errorWeight: 0.5,
};
