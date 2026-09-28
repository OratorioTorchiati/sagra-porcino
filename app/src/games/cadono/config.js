// Tutti i numeri di "Porcini che cadono", da ritoccare dopo le prove senza cambiare la logica.
// "Inizio → fine" = il valore passa gradualmente dal primo al secondo durante la partita.

export default {
  /** Durata massima (la partita finisce prima se si perdono tutte le vite) */
  durationS: 120,
  lives: 3,

  pointsPorcino: 10,
  pointsGolden: 50,
  /** Bonus a chi arriva alla fine dei 2 minuti, per ogni vita rimasta */
  survivalBonusPerLife: 50,

  /** Dimensione degli elementi che cadono, px */
  itemSize: 60,
  /** Larghezza del cestino, px (l'altezza segue le proporzioni del disegno) */
  basketWidth: 116,
  /** Distanza del cestino dal fondo, px */
  basketBottomMargin: 16,
  /** Quanto velocemente il cestino raggiunge il dito (più alto = più scattante) */
  basketFollow: 25,
  /** Tolleranza della presa oltre i bordi del cestino, in frazione della dimensione dell'elemento */
  catchTolerance: 0.3,

  /** Velocità di caduta, px/s: inizio → fine (±15% di variazione) */
  fallSpeed: [230, 480],
  /** Secondi tra un elemento e l'altro: inizio → fine (±25% di variazione) */
  spawnInterval: [0.75, 0.32],

  /** Gli elementi escono da "mazzi" di 30 (partite eque): porcini d'oro e bombe per mazzo */
  deckSize: 30,
  goldenPerDeck: 1,
  /** Quota di bombe nel mazzo: inizio → fine */
  bombShare: [0.2, 0.35],
};
