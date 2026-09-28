// Elenco dei minigiochi. Il codice di ogni gioco si scarica solo quando si apre (import dinamico),
// ma viene comunque messo in cache dal service worker per giocare offline.
// I testi delle regole sono quelli di docs/03-GIOCHI.md. `gallery: 'good' | 'bad'` mostra dentro
// quel box le immagini di cosa prendere / evitare (definite dal modulo del gioco in `rulesGallery`).
// L'emoji 🍄 non si usa mai: sui telefoni è un fungo rosso a puntini (velenoso).

import porcinoSvg from '../assets/porcino.svg?raw';

export const GAMES = {
  acchiappa: {
    id: 'acchiappa',
    name: 'Acchiappa il porcino',
    icon: porcinoSvg,
    night: 1,
    rules: [
      { icon: '⏱️', text: '1 minuto' },
      { icon: '👆', text: 'Tocca i porcini', gallery: 'good' },
      { icon: '❌', text: 'Evita funghi velenosi e altri oggetti', gallery: 'bad' },
      { icon: '🔥', text: 'Tanti porcini di fila = punti moltiplicati!' },
    ],
    load: () => import('./acchiappa/index.js').then((m) => m.default),
  },
  quiz: {
    id: 'quiz',
    name: 'Quiz del paese',
    icon: '❓',
    night: 1,
    rules: [
      { icon: '❓', text: '5 domande sul paese' },
      { icon: '✅', text: 'Scegli la risposta giusta tra 4' },
      { icon: '⚡', text: 'Più sei veloce, più punti fai!' },
    ],
    load: () => import('./quiz/index.js').then((m) => m.default),
  },
  cadono: {
    id: 'cadono',
    name: 'Porcini che cadono',
    icon: '🧺',
    night: 2,
    rules: [
      { icon: '🧺', text: 'Muovi il cestino col dito' },
      { icon: porcinoSvg, text: 'Prendi i porcini che cadono', gallery: 'good' },
      { icon: '💣', text: 'Evita le bombe: hai 3 vite ❤️❤️❤️', gallery: 'bad' },
      { icon: '⏱️', text: 'Massimo 2 minuti' },
    ],
    load: () => import('./cadono/index.js').then((m) => m.default),
  },
  memory: {
    id: 'memory',
    name: 'Memory del paese',
    icon: '🃏',
    night: 2,
    rules: [
      { icon: '🃏', text: 'Gira due carte alla volta' },
      { icon: '🔍', text: 'Trova tutte le 8 coppie' },
      { icon: '⚡', text: 'Più sei veloce e preciso, più punti fai!' },
    ],
    load: () => import('./memory/index.js').then((m) => m.default),
  },
};

/** Modalità prova (D25): fino alla Tappa 5 i giochi sono sempre in prova, senza tentativi né account. */
export const PRACTICE_MODE = true;
