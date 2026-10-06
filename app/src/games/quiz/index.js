// Modulo del "Quiz del paese", caricato solo quando serve (import dinamico).
// Le domande arrivano dal server; quelle di sample-questions.js servono solo alla modalità senza server.

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
    // Nel replay (pannello staff) le domande sono esattamente quelle della partita: niente "domande recenti"
    if (ctx.replay) return createQuiz(ctx);
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
