// Le regole ricontrollate dal server (supabase/migrations/003_games_attempts.sql) devono restare allineate
// con la configurazione dei giochi: se si ritocca un config.js, questo test ricorda di aggiornare il database.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import acchiappaConfig from './acchiappa/config.js';
import cadonoConfig from './cadono/config.js';
import memoryConfig from './memory/config.js';
import quizConfig from './quiz/config.js';
import { maxRawScore as acchiappaMax } from './acchiappa/scoring.js';
import { maxRawScore as cadonoMax } from './cadono/scoring.js';

const sql = fs.readFileSync(new URL('../../../supabase/migrations/003_games_attempts.sql', import.meta.url), 'utf8');

function gameRow(id) {
  const m = sql.match(new RegExp(`\\('${id}', '[^']+', \\d+, (\\d+), (\\d+)\\)`));
  return { durationS: Number(m[1]), maxRawScore: Number(m[2]) };
}

describe('allineamento con il database', () => {
  it('Acchiappa: durata e tetto del punteggio', () => {
    expect(gameRow('acchiappa')).toEqual({ durationS: acchiappaConfig.durationS, maxRawScore: acchiappaMax(acchiappaConfig) });
  });

  it('Porcini che cadono: durata e tetto del punteggio', () => {
    expect(gameRow('cadono')).toEqual({ durationS: cadonoConfig.durationS, maxRawScore: cadonoMax(cadonoConfig) });
  });

  it('Memory e Quiz: durata e massimo 1000', () => {
    expect(gameRow('memory')).toEqual({ durationS: memoryConfig.durationS, maxRawScore: memoryConfig.base });
    expect(gameRow('quiz')).toEqual({ durationS: quizConfig.questionsPerGame * quizConfig.timePerQuestionS, maxRawScore: 1000 });
  });

  it('moltiplicatore di Acchiappa uguale a quello del server', () => {
    const fn = sql.match(/_acchiappa_multiplier[\s\S]*?select case (.*?) end;/)[1];
    const serverSteps = [...fn.matchAll(/p_streak >= (\d+) then (\d+)/g)].map((m) => ({ minStreak: Number(m[1]), multiplier: Number(m[2]) }));
    const clientSteps = acchiappaConfig.multipliers.filter((s) => s.minStreak > 0).sort((a, b) => b.minStreak - a.minStreak);
    expect(serverSteps).toEqual(clientSteps);
  });

  it('punti di Porcini che cadono e formula del Memory uguali a quelli del server', () => {
    expect(sql).toContain(`'porcino' then v_score := v_score + ${cadonoConfig.pointsPorcino}`);
    expect(sql).toContain(`'golden' then v_score := v_score + ${cadonoConfig.pointsGolden}`);
    expect(sql).toContain(`v_lives * ${cadonoConfig.survivalBonusPerLife}`);
    expect(sql).toContain(
      `greatest(${memoryConfig.completedMin}, round(${memoryConfig.base} - ${memoryConfig.perSecond} * v_seconds - ${memoryConfig.perExtraMove} * v_extra)`,
    );
    expect(sql).toContain(`v_score := ${memoryConfig.perPairIncomplete} * v_pairs`);
  });
});
