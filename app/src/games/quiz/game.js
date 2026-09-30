// "Quiz": N domande (di solito 5, le decide l'Admin, D104), 4 risposte, secondi per domanda decisi dall'Admin, bonus velocità.
// Nessun giusto/sbagliato durante il quiz: le risposte giuste non stanno nel sito (in produzione).
// Il tempo delle domande è quello reale (orologio), non si ferma se si esce dall'app.

import { html, escapeHtml } from '../../lib/dom.js';
import { quizScore } from './scoring.js';

const nowMs = () => performance.now();

/** Sceglie `count` domande dal pool evitando, se possibile, quelle della partita precedente. */
export function pickQuestions(pool, count, rng, avoidIds = []) {
  const fresh = pool.filter((q) => !avoidIds.includes(q.id));
  const source = fresh.length >= count ? fresh : pool;
  const shuffled = [...source];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/**
 * @param {object} ctx
 * @param {{pool: object[], recentIds?: number[]}} ctx.assets  domande (in prova: esempi con la risposta giusta)
 */
export function createQuiz({ rng, config, assets, hud, log, dom, isRunning, clock = nowMs, replay = false }) {
  const questions = pickQuestions(assets.pool, config.questionsPerGame, rng, assets.recentIds).map((q) => {
    // Ordine delle risposte mescolato; si ricorda l'indice originale di ciascuna
    const order = [0, 1, 2, 3];
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { ...q, order };
  });
  const answers = [];
  let current = -1;
  let questionStart = 0;
  let waitingUntil = null;
  let done = false;
  const maxMs = config.timePerQuestionS * 1000;

  const element = html(`
    <div class="quiz">
      <div class="quiz-timer" aria-hidden="true"><div class="quiz-timer__bar"></div></div>
      <p class="quiz-question">Pronti?</p>
      <div class="quiz-options"></div>
    </div>
  `);
  dom.append(element);
  const questionEl = element.querySelector('.quiz-question');
  const optionsEl = element.querySelector('.quiz-options');
  const barEl = element.querySelector('.quiz-timer__bar');

  function show(index) {
    current = index;
    const q = questions[index];
    questionEl.textContent = q.text;
    optionsEl.innerHTML = q.order
      .map((original) => `<button type="button" class="quiz-option" data-choice="${original}">${escapeHtml(q.options[original])}</button>`)
      .join('');
    // Replay (pannello staff): la risposta giusta è evidenziata
    if (replay && q.correct !== undefined) optionsEl.querySelector(`[data-choice="${q.correct}"]`)?.classList.add('is-correct');
    hud.set('question', `${index + 1}/${questions.length}`);
    questionStart = clock();
    waitingUntil = null;
  }

  function answer(choice) {
    const q = questions[current];
    const ms = choice === null ? maxMs : Math.min(Math.round(clock() - questionStart), maxMs);
    answers.push({ questionId: q.id, choice, ms });
    log('answer', q.id, choice, ms);
    waitingUntil = clock() + (choice === null ? 0 : config.answerPauseMs);
  }

  optionsEl.addEventListener('click', (event) => {
    const button = event.target.closest('.quiz-option');
    if (!button || !isRunning() || waitingUntil !== null || current < 0) return;
    button.classList.add('is-chosen');
    optionsEl.classList.add('is-locked');
    answer(Number(button.dataset.choice));
  });

  return {
    start() {
      show(0);
    },

    /** Replay (pannello staff): la stessa risposta alla stessa domanda */
    replayAction(type, data) {
      if (type !== 'answer' || data[1] === null || current < 0 || questions[current]?.id !== data[0]) return null;
      const button = optionsEl.querySelector(`[data-choice="${data[1]}"]`);
      button?.click();
      return button ?? null;
    },


    update() {
      if (current < 0 || done) return;
      const t = clock();
      if (waitingUntil === null) {
        const left = Math.max(0, maxMs - (t - questionStart));
        barEl.style.transform = `scaleX(${left / maxMs})`;
        barEl.classList.toggle('is-ending', left < 5000);
        hud.set('time', Math.ceil(left / 1000));
        if (left <= 0) answer(null); // tempo scaduto = sbagliata
      } else if (t >= waitingUntil) {
        optionsEl.classList.remove('is-locked');
        if (current + 1 < questions.length) show(current + 1);
        else done = true;
      }
    },

    isOver() {
      return done;
    },

    endText() {
      return 'Quiz finito!';
    },

    /** Id delle domande di questa partita (per non ripeterle nella prossima) */
    questionIds: questions.map((q) => q.id),

    /** Risposte date: in produzione vanno al server, che calcola il punteggio */
    answers,

    result() {
      // In modalità prova le risposte giuste sono note (domande di esempio): punteggio calcolato qui
      const correctIndex = new Map(questions.filter((q) => q.correct !== undefined).map((q) => [q.id, q.correct]));
      const { score, correct } = quizScore(answers, correctIndex, config);
      const answered = answers.filter((a) => a.choice !== null);
      const avgMs = answered.length ? answered.reduce((s, a) => s + a.ms, 0) / answered.length : null;
      return {
        rawScore: score,
        stats: { correct, total: questions.length, avgMs: avgMs === null ? null : Math.round(avgMs), answers: [...answers] },
      };
    },
  };
}
