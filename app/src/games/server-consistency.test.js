// Le regole ricontrollate dal server (supabase/migrations/003_games_attempts.sql e successive) devono restare allineate
// con la configurazione dei giochi: se si ritocca un config.js, questo test ricorda di aggiornare il database.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import acchiappaConfig from './acchiappa/config.js';
import cadonoConfig from './cadono/config.js';
import memoryConfig from './memory/config.js';
import quizConfig from './quiz/config.js';
import { maxRawScore as acchiappaMax } from './acchiappa/scoring.js';
import { maxRawScore as cadonoMax } from './cadono/scoring.js';

const migration = (name) => fs.readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const sql = migration('003_games_attempts.sql');
const sql005 = migration('005_acchiappa_moltiplicatore_a_tempo.sql');
const sql006 = migration('006_acchiappa_tempi_piu_lunghi.sql'); // durate aggiornate

function gameRow(id) {
  const m = sql.match(new RegExp(`\\('${id}', '[^']+', \\d+, (\\d+), (\\d+)\\)`));
  return { durationS: Number(m[1]), maxRawScore: Number(m[2]) };
}

describe('allineamento con il database', () => {
  it('Acchiappa: durata e tetto del punteggio', () => {
    expect(gameRow('acchiappa').durationS).toBe(acchiappaConfig.durationS);
    expect(sql005).toContain(`set max_raw_score = ${acchiappaMax(acchiappaConfig)} where id = 'acchiappa'`);
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
    expect(serverSteps).toEqual(clientSteps.map(({ minStreak, multiplier }) => ({ minStreak, multiplier })));
  });

  it('Acchiappa: punti per porcino e moltiplicatore a tempo uguali a quelli del server (005)', () => {
    expect(sql005).toContain(`v_score := v_score + ${acchiappaConfig.pointsPerPorcino} * v_level;`);
    const steps = acchiappaConfig.multipliers.filter((s) => s.multiplier > 1);
    const mins = steps.map((s) => `when ${s.multiplier} then ${s.minStreak}`).join(' ');
    const durations = steps.map((s) => `when ${s.multiplier} then ${s.durationS * 1000}`).join(' ');
    expect(sql005).toContain(`select case p_level ${mins} else 0 end;`);
    expect(sql006).toContain(`select case p_level ${durations} else 0 end;`);
    // I livelli devono essere ×1, ×2, ×3, ×4 (il server usa il moltiplicatore come livello)
    expect(acchiappaConfig.multipliers.map((s) => s.multiplier)).toEqual([1, 2, 3, 4]);
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
