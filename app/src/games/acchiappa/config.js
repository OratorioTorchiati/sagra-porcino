// Tutti i numeri di "Acchiappa il porcino", da ritoccare dopo le prove senza cambiare la logica.
// "Inizio → fine" = il valore passa gradualmente dal primo al secondo durante la partita.
// 28/09: partenza resa più difficile dopo la prima prova (all'inizio era troppo facile).
// 29/09: punti dimezzati e moltiplicatore a tempo.

export default {
  durationS: 60,

  /** Punti per porcino (moltiplicati per il moltiplicatore). 29/09: da 10 a 5 (medie oltre i 2000) */
  pointsPerPorcino: 5,

  /**
   * Moltiplicatore: con `minStreak` porcini di fila si sale; dura `durationS` secondi, poi scende di uno
   * (29/09, D67; +1 s a tutti i livelli il 29/09, D68). Vedi scoring.js.
   */
  multipliers: [
    { minStreak: 0, multiplier: 1 },
    { minStreak: 5, multiplier: 2, durationS: 7 },
    { minStreak: 10, multiplier: 3, durationS: 6 },
    { minStreak: 20, multiplier: 4, durationS: 5 },
  ],

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
