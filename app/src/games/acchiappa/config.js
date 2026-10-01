// Tutti i numeri di "Acchiappa il porcino", da ritoccare dopo le prove senza cambiare la logica.
// "Inizio → fine" = il valore passa gradualmente dal primo al secondo durante la partita.
// 28/09: partenza resa più difficile dopo la prima prova (all'inizio era troppo facile).
// 29/09: punti dimezzati e moltiplicatore a tempo; poi ricarica del tempo a ogni porcino (D80).

export default {
  durationS: 60,
  /**
   * La partita parte già "avanti": all'inizio velocità, comparse e porcini sono quelli che prima c'erano
   * dopo 15 secondi (0.25 = 15 s su 60), e in un minuto si arriva comunque al massimo (D86).
   */
  startProgress: 0.25,

  /** Punti per porcino (moltiplicati per il moltiplicatore): servono a misurare il moltiplicatore medio */
  pointsPerPorcino: 5,

  /**
   * Punteggio da 0 a 1000 (D107), non dipende dalla durata:
   *   1000 × (catch × porcini presi / (presi + persi + tocchi sbagliati) + multiplier × moltiplicatore medio)
   * moltiplicatore medio: da ×1 (0) al massimo (1). Persi = porcini spariti senza essere toccati.
   */
  scoreWeights: { catch: 0.8, multiplier: 0.2 },

  /**
   * Moltiplicatore a timer (D84, vedi scoring.js): da ×1 a ×2 con `firstLevelStreak` porcini di fila; poi ogni
   * porcino aggiunge `boostS` secondi al timer e quando il timer supera il tempo pieno (`durationS`) si sale di un
   * livello. Timer a zero: si scende di uno.
   */
  multipliers: [
    { multiplier: 1 },
    { multiplier: 2, durationS: 7, boostS: 1.5 },
    { multiplier: 3, durationS: 6, boostS: 1 },
    { multiplier: 4, durationS: 5, boostS: 0.5 },
  ],
  firstLevelStreak: 5,
  /** Salendo di livello il timer parte da questa parte del tempo pieno (25%) */
  levelUpStartFraction: 0.25,
  /** Scendendo di livello il timer riparte da questa parte del tempo pieno (50%) */
  levelDownStartFraction: 0.5,
  /** Un oggetto toccato toglie questi secondi al tempo della partita (un fungo velenoso invece riporta a ×1) (D81) */
  objectPenaltyS: 2,

  /** Dimensione degli elementi in px (48 = minimo toccabile) */
  sizeMin: 48,
  sizeMax: 110,
  /** Tolleranza del tocco intorno all'elemento, in px */
  touchTolerance: 8,

  /** Elementi a schermo contemporaneamente: inizio → fine */
  maxOnScreen: [5, 10],
  /** Secondi tra una comparsa e l'altra: inizio → fine (con ±30% di variazione) */
  spawnInterval: [0.6, 0.33],
  /** Probabilità che l'elemento sia un porcino: inizio → fine. 29/09: più porcini (0.62 → 0.55, poi 0.70 → 0.64, D86) */
  goodChance: [0.78, 0.72],
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
