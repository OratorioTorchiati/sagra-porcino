import { describe, expect, it } from 'vitest';
import { withDuration, formatDuration, isStepGame } from './duration.js';

describe('durata decisa dall\'Admin (D99)', () => {
  const acchiappa = { config: { durationS: 60, other: 1 } };
  const quiz = { config: { questionsPerGame: 5, timePerQuestionS: 20 } };

  it('giochi a tempo: la durata della partita', () => {
    expect(withDuration(acchiappa, 'acchiappa', 90).config).toEqual({ durationS: 90, other: 1 });
    expect(acchiappa.config.durationS).toBe(60); // l'originale non cambia
  });

  it('quiz: la durata diventa secondi per domanda', () => {
    expect(isStepGame('quiz')).toBe(true);
    expect(withDuration(quiz, 'quiz', 150).config.timePerQuestionS).toBe(30);
  });

  it('senza durata dal server resta quella del gioco', () => {
    expect(withDuration(acchiappa, 'acchiappa', null)).toBe(acchiappa);
  });

  it('scritta per le regole', () => {
    expect(formatDuration(60)).toBe('1 minuto');
    expect(formatDuration(120)).toBe('2 minuti');
    expect(formatDuration(90)).toBe('1 minuto e 30 secondi');
    expect(formatDuration(45)).toBe('45 secondi');
  });

  it('quiz con 10 domande in 150 secondi: 15 secondi per domanda (D104)', () => {
    expect(withDuration(quiz, 'quiz', 150, 10).config).toMatchObject({ questionsPerGame: 10, timePerQuestionS: 15 });
  });
});
