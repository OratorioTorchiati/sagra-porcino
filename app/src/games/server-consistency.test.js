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
const sql014 = migration('014_acchiappa_ricarica_tempo.sql'); // soglie, ricarica del tempo
const sql015 = migration('015_acchiappa_oggetti_tempo.sql'); // oggetti che tolgono tempo alla partita, velenosi
const sql019 = migration('019_acchiappa_livelli_a_timer.sql'); // livelli a timer (D84)

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

  it('Acchiappa: punti e moltiplicatore a timer uguali a quelli del server (006, 015, 019)', () => {
    expect(sql019).toContain(`v_score := v_score + ${acchiappaConfig.pointsPerPorcino} * v_level;`);
    expect(sql019).toContain(`if v_streak >= ${acchiappaConfig.firstLevelStreak} then`);
    const steps = acchiappaConfig.multipliers.filter((s) => s.multiplier > 1);
    const durations = steps.map((s) => `when ${s.multiplier} then ${s.durationS * 1000}`).join(' ');
    const boosts = steps.map((s) => `when ${s.multiplier} then ${s.boostS * 1000}`).join(' ');
    expect(sql006).toContain(`select case p_level ${durations} else 0 end;`);
    expect(sql019).toContain(`select case p_level ${boosts} else 0 end;`);
    // 25% salendo, 50% scendendo
    expect(acchiappaConfig.levelUpStartFraction).toBe(0.25);
    expect(sql019).toContain('_acchiappa_level_ms(v_level) / 4;');
    expect(acchiappaConfig.levelDownStartFraction).toBe(0.5);
    expect(sql019).toContain('v_ends + _acchiappa_level_ms(v_level) / 2');
    expect(sql019).toContain(`v_end := greatest(v_tap_ms, v_end - ${acchiappaConfig.objectPenaltyS * 1000});`);
    // Funghi velenosi: gli stessi di sprites.js
    const poisonous = fs.readFileSync(new URL('./acchiappa/sprites.js', import.meta.url), 'utf8').match(/BAD_POISONOUS = \{ (.*?) \}/)[1].split(', ');
    expect(sql015).toContain(`select p_kind in (${poisonous.map((k) => `'${k}'`).join(', ')});`);
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
