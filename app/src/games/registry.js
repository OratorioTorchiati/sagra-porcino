// Elenco dei minigiochi. Il codice di ogni gioco si scarica solo quando si apre (import dinamico),
// ma viene comunque messo in cache dal service worker per giocare offline.
// I testi delle regole sono quelli di docs/03-GIOCHI.md.

export const GAMES = {
  acchiappa: {
    id: 'acchiappa',
    name: 'Acchiappa il porcino',
    night: 1,
    rules: [
      { icon: '⏱️', text: '1 minuto' },
      { icon: '👆', text: 'Tocca i porcini' },
      { icon: '❌', text: 'Evita funghi velenosi e altri oggetti' },
      { icon: '🔥', text: 'Tanti porcini di fila = punti moltiplicati!' },
    ],
    load: () => import('./acchiappa/index.js').then((m) => m.default),
  },
};

/** Modalità prova (D25): fino alla Tappa 5 i giochi sono sempre in prova, senza tentativi né account. */
export const PRACTICE_MODE = true;
