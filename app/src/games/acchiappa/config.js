// Tutti i numeri di "Acchiappa il porcino", da ritoccare dopo le prove senza cambiare la logica.
// "Inizio → fine" = il valore passa gradualmente dal primo al secondo durante la partita.
// 28/09: partenza resa più difficile dopo la prima prova (all'inizio era troppo facile).
// 29/09: punti dimezzati e moltiplicatore a tempo; poi ricarica del tempo a ogni porcino (D80).

export default {
  durationS: 60,

  /** Punti per porcino (moltiplicati per il moltiplicatore). 29/09: da 10 a 5 (medie oltre i 2000) */
  pointsPerPorcino: 5,

  /**
   * Moltiplicatore: con `minStreak` porcini di fila si sale e il tempo parte pieno (`durationS` secondi);
   * ogni porcino preso aggiunge `boostS` secondi (mai oltre il pieno); scaduto, scende di uno
   * (D67, D68, D80). Vedi scoring.js.
   */
  multipliers: [
    { minStreak: 0, multiplier: 1 },
    { minStreak: 5, multiplier: 2, durationS: 7, boostS: 2 },
    { minStreak: 10, multiplier: 3, durationS: 6, boostS: 1.5 },
    { minStreak: 15, multiplier: 4, durationS: 5, boostS: 1 },
  ],
  /** Un oggetto toccato toglie questi secondi al moltiplicatore (un fungo velenoso invece riporta a ×1) */
  objectPenaltyS: 1.5,

  /** Dimensione degli elementi in px (48 = minimo toccabile) */
  sizeMin: 48,
  sizeMax: 110,
  /** Tolleranza del tocco intorno all'elemento, in px */
  touchTolerance: 8,

  /** Elementi a schermo contemporaneamente: inizio → fine */
  maxOnScreen: [5, 10],
  /** Secondi tra una comparsa e l'altra: inizio → fine (con ±30% di variazione) */
  spawnInterval: [0.6, 0.33],
  /** Probabilità che l'elemento sia un porcino: inizio → fine */
  goodChance: [0.62, 0.55],
  /** Tra i cattivi: probabilità che sia un fungo velenoso (altrimenti un oggetto) */
  poisonousChance: 0.5,

  /** Probabilità che un elemento entri da un bordo (altrimenti spunta all'interno) */
  edgeChance: 0.6,
  /** Velocità di chi attraversa, px/s: [min, max] a inizio → [min, max] a fine */
  speedStart: [100, 190],
  speedEnd: [140, 290],
  /** Chi spunta all'interno resta per questi secondi: [min, max] a inizio → a fine */
  lifeStart: [1.8, 2.4],
  lifeEnd: [1.2, 1.7],
  /** Velocità di deriva di chi spunta all'interno, px/s */
  driftSpeed: 30,
  /** Rotazione massima, gradi al secondo */
  maxSpinDeg: 90,
};
