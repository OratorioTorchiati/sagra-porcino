import { describe, expect, it } from 'vitest';
import config from './config.js';
import { answerPoints, quizScore } from './scoring.js';
import { SAMPLE_QUESTIONS } from './sample-questions.js';

describe('answerPoints', () => {
  it('giusta istantanea = 200, giusta a tempo scaduto = 150, sbagliata = 0', () => {
    expect(answerPoints(true, 0, config)).toBe(200);
    expect(answerPoints(true, 20000, config)).toBe(150);
    expect(answerPoints(true, 10000, config)).toBe(175);
    expect(answerPoints(false, 1000, config)).toBe(0);
  });

  it('tempi fuori intervallo vengono limitati', () => {
    expect(answerPoints(true, -500, config)).toBe(200);
    expect(answerPoints(true, 99999, config)).toBe(150);
  });
});

describe('quizScore', () => {
  const correct = new Map([[1, 2], [2, 0], [3, 3], [4, 1], [5, 0]]);

  it('massimo 1000 con 5 risposte giuste immediate', () => {
    const answers = [...correct].map(([questionId, choice]) => ({ questionId, choice, ms: 0 }));
    expect(quizScore(answers, correct, config)).toEqual({ score: 1000, correct: 5 });
  });

  it('scadute (choice null) e sbagliate valgono 0', () => {
    const answers = [
      { questionId: 1, choice: 2, ms: 4000 }, // giusta: 150 + 40
      { questionId: 2, choice: null, ms: 20000 },
      { questionId: 3, choice: 0, ms: 3000 },
    ];
    expect(quizScore(answers, correct, config)).toEqual({ score: 190, correct: 1 });
  });
});

describe('domande di esempio', () => {
  it('ognuna ha id unico, 4 risposte diverse e una giusta valida', () => {
    const ids = new Set();
    for (const q of SAMPLE_QUESTIONS) {
      expect(ids.has(q.id)).toBe(false);
      ids.add(q.id);
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThan(4);
    }
    expect(SAMPLE_QUESTIONS.length).toBeGreaterThanOrEqual(10);
  });
});

describe('numero di domande deciso dall\'Admin (D104)', () => {
  it('il massimo resta 1000 punti con 3, 7 o 10 domande', () => {
    for (const n of [3, 7, 10]) {
      const cfg = { ...config, questionsPerGame: n };
      const answers = Array.from({ length: n }, (_, i) => ({ questionId: i, choice: 0, ms: 0 }));
      const correct = new Map(answers.map((a) => [a.questionId, 0]));
      const { score } = quizScore(answers, correct, cfg);
      expect(score).toBeLessThanOrEqual(1000);
      expect(score).toBeGreaterThanOrEqual(995);
    }
  });

  it('con 10 domande: 75 per risposta giusta + fino a 25 di velocità', () => {
    const cfg = { ...config, questionsPerGame: 10 };
    expect(answerPoints(true, 0, cfg)).toBe(100);
    expect(answerPoints(true, 20000, cfg)).toBe(75);
  });
});
