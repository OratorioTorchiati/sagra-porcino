// Tutti i numeri di "Acchiappa il porcino", da ritoccare dopo le prove senza cambiare la logica.
// "Inizio → fine" = il valore passa gradualmente dal primo al secondo durante la partita.

export default {
  durationS: 60,

  /** Punti per porcino (moltiplicati per il moltiplicatore) */
  pointsPerPorcino: 10,

  /** Moltiplicatore in base alla serie di porcini di fila: da `minStreak` in su */
  multipliers: [
    { minStreak: 0, multiplier: 1 },
    { minStreak: 5, multiplier: 2 },
    { minStreak: 10, multiplier: 3 },
    { minStreak: 20, multiplier: 4 },
  ],

  /** Dimensione degli elementi in px (48 = minimo toccabile) */
  sizeMin: 48,
  sizeMax: 110,
  /** Tolleranza del tocco intorno all'elemento, in px */
  touchTolerance: 8,

  /** Elementi a schermo contemporaneamente: inizio → fine */
  maxOnScreen: [3, 9],
  /** Secondi tra una comparsa e l'altra: inizio → fine (con ±30% di variazione) */
  spawnInterval: [0.9, 0.38],
  /** Probabilità che l'elemento sia un porcino: inizio → fine */
  goodChance: [0.7, 0.58],
  /** Tra i cattivi: probabilità che sia un fungo velenoso (altrimenti un oggetto) */
  poisonousChance: 0.5,

  /** Probabilità che un elemento entri da un bordo (altrimenti spunta all'interno) */
  edgeChance: 0.6,
  /** Velocità di chi attraversa, px/s: [min, max] a inizio → [min, max] a fine */
  speedStart: [60, 140],
  speedEnd: [120, 260],
  /** Chi spunta all'interno resta per questi secondi: [min, max] a inizio → a fine */
  lifeStart: [2.4, 3.2],
  lifeEnd: [1.4, 2.0],
  /** Velocità di deriva di chi spunta all'interno, px/s */
  driftSpeed: 30,
  /** Rotazione massima, gradi al secondo */
  maxSpinDeg: 90,
};
