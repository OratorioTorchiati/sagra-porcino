// Modulo del "Quiz del paese", caricato solo quando serve (import dinamico).
// Per ora usa le domande di esempio (modalità prova); dalla Tappa 5 le domande arrivano dal server.

import config from './config.js';
import { createQuiz } from './game.js';
import { SAMPLE_QUESTIONS } from './sample-questions.js';
import { readJson, writeJson } from '../../lib/storage.js';

const RECENT_KEY = 'prova-quiz-ultime-domande';

export default {
  config,
  canvas: false,
  // Niente pausa quando si esce dall'app: si potrebbe cercare la risposta a tempo fermo
  pauseOnHide: false,
  hud: [
    { key: 'question', label: 'Domanda' },
    { key: 'time', label: 'Secondi' },
  ],

  async loadAssets() {
    return { pool: SAMPLE_QUESTIONS };
  },

  create(ctx) {
    const game = createQuiz({ ...ctx, assets: { ...ctx.assets, recentIds: readJson(RECENT_KEY, []) } });
    writeJson(RECENT_KEY, game.questionIds);
    return game;
  },

  summary(stats) {
    return [
      ['Risposte giuste', `${stats.correct}/${stats.total}`],
      ['Tempo medio per risposta', stats.avgMs === null ? '—' : `${(stats.avgMs / 1000).toFixed(1).replace('.', ',')} s`],
    ];
  },
};
