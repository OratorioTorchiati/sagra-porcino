// Elenco dei minigiochi. Il codice di ogni gioco si scarica solo quando si apre (import dinamico),
// ma viene comunque messo in cache dal service worker per giocare offline.
// I testi delle regole sono quelli di docs/03-GIOCHI.md. `gallery` mostra dentro
// quel box le immagini di cosa prendere / evitare (definite dal modulo del gioco in `rulesGallery`).
// L'emoji 🍄 non si usa mai: sui telefoni è un fungo rosso a puntini (velenoso).

import porcinoSvg from '../assets/porcino.svg?raw';
import { serverConfigured } from '../lib/api.js';
import { formatDuration } from './duration.js';

// Testi delle regole che dipendono da durata e step decisi dall'Admin (info = stato del gioco dal server)
const durationRule = (prefix) => (info) => (info?.duration_s ? `${prefix}${formatDuration(info.duration_s)}` : 'Partita a tempo');

export const GAMES = {
  acchiappa: {
    id: 'acchiappa',
    name: 'Acchiappa il porcino',
    icon: porcinoSvg,
    night: 1,
    rules: [
      { icon: '⏱️', text: durationRule('') }, // durata decisa dall'Admin (D99)
      { icon: '👆', text: 'Tocca i porcini per far crescere il moltiplicatore', gallery: 'good' },
      { icon: '☠️', text: 'Funghi velenosi: si riparte da ×1', gallery: 'poison' },
      { icon: '⏳', text: 'Evita anche questi: fanno perdere tempo', gallery: 'objects' },
    ],
    load: () => import('./acchiappa/index.js').then((m) => m.default),
  },
  quiz: {
    id: 'quiz',
    name: 'Quiz',
    icon: '❓',
    night: 1,
    rules: [
      { icon: '❓', text: (info) => (info?.steps ? `${info.steps} domande sui funghi` : 'Domande sui funghi') },
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
      { icon: '💣', text: 'Evita le bombe: hai 3 vite ❤️❤️❤️' },
      { icon: '⏱️', text: durationRule('Massimo ') },
    ],
    load: () => import('./cadono/index.js').then((m) => m.default),
  },
  memory: {
    id: 'memory',
    name: 'Memory Torchiati',
    icon: '🃏',
    night: 2,
    rules: [
      { icon: '🃏', text: 'Gira due carte alla volta' },
      { icon: '🔍', text: (info) => (info?.steps ? `Trova tutte le ${info.steps} coppie` : 'Trova tutte le coppie') },
      { icon: '⚡', text: 'Più sei veloce e preciso, più punti fai!' },
    ],
    load: () => import('./memory/index.js').then((m) => m.default),
  },
};

/**
 * Modalità prova (niente account né tentativi, punteggio solo sul telefono): dalla Tappa 5 solo se il sito
 * è costruito senza server (sviluppo in locale senza app/.env.local). Lo staff gioca "sul serio" ma senza limiti.
 */
export const PRACTICE_MODE = !serverConfigured;
