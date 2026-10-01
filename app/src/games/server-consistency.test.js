// Le regole ricontrollate dal server (supabase/migrations/003_games_attempts.sql e successive) devono restare allineate
// con la configurazione dei giochi: se si ritocca un config.js, questo test ricorda di aggiornare il database.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import acchiappaConfig from './acchiappa/config.js';
import cadonoConfig from './cadono/config.js';
import memoryConfig from './memory/config.js';
import quizConfig from './quiz/config.js';

const migration = (name) => fs.readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const sql = migration('003_games_attempts.sql');
const sql005 = migration('005_acchiappa_moltiplicatore_a_tempo.sql');
const sql006 = migration('006_acchiappa_tempi_piu_lunghi.sql'); // durate aggiornate
const sql014 = migration('014_acchiappa_ricarica_tempo.sql'); // soglie, ricarica del tempo
const sql015 = migration('015_acchiappa_oggetti_tempo.sql'); // oggetti che tolgono tempo alla partita, velenosi
const sql019 = migration('019_acchiappa_livelli_a_timer.sql'); // livelli a timer (D84)
const sql028 = migration('028_punteggi_in_percentuale.sql'); // punteggi in percentuale, step (D107)

function gameRow(id) {
  const m = sql.match(new RegExp(`\\('${id}', '[^']+', \\d+, (\\d+), (\\d+)\\)`));
  return { durationS: Number(m[1]), maxRawScore: Number(m[2]) };
}

describe('allineamento con il database', () => {
  it('durate iniziali uguali a quelle dei config.js (poi le cambia l\'Admin), massimo 1000 per tutti (D107)', () => {
    expect(gameRow('acchiappa').durationS).toBe(acchiappaConfig.durationS);
    expect(gameRow('cadono').durationS).toBe(cadonoConfig.durationS);
    expect(gameRow('memory').durationS).toBe(memoryConfig.durationS);
    expect(gameRow('quiz').durationS).toBe(quizConfig.questionsPerGame * quizConfig.timePerQuestionS);
    expect(sql028).toContain('update public.games set max_raw_score = 1000;');
  });

  it('step iniziali uguali a quelli dei config.js: domande del quiz, coppie del Memory', () => {
    expect(sql028).toContain(`update public.games set steps = coalesce(steps, ${quizConfig.questionsPerGame}) where id = 'quiz';`);
    expect(sql028).toContain(`update public.games set steps = coalesce(steps, ${memoryConfig.pairs}) where id = 'memory';`);
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

  it('punteggi in percentuale uguali a quelli del server (D107)', () => {
    // Acchiappa: pesi, punti per porcino e moltiplicatore massimo
    const aw = acchiappaConfig.scoreWeights;
    const maxMultiplier = Math.max(...acchiappaConfig.multipliers.map((s) => s.multiplier));
    expect(sql028).toContain(`(v_points::numeric / (v_good * ${acchiappaConfig.pointsPerPorcino}) - 1) / (${maxMultiplier} - 1)`);
    expect(sql028).toContain(`v_score := round(1000 * (${aw.catch} * v_catch_part + ${aw.multiplier} * v_mult_part))::int;`);
    // Porcini che cadono: pesi, valore del porcino d'oro, vite
    const cw = cadonoConfig.scoreWeights;
    expect(sql028).toContain(`v_fallen := v_fallen + case when v_row ->> 2 = 'golden' then ${cadonoConfig.goldenWeight} else 1 end;`);
    expect(sql028).toContain(`v_caught := v_caught + ${cadonoConfig.goldenWeight}; v_items`);
    expect(sql028).toContain(`v_lives int := ${cadonoConfig.lives};`);
    expect(sql028).toContain(`${cw.catch} * case when v_caught + v_fallen > 0`);
    expect(sql028).toContain(`+ ${cw.time} * least(1, v_dur::numeric / (p_game.duration_s * 1000))`);
    expect(sql028).toContain(`+ ${cw.lives} * v_lives / ${cadonoConfig.lives}.0))::int;`);
    // Memory
    const mw = memoryConfig.scoreWeights;
    expect(sql028).toContain(`then v_pairs / (v_pairs + v_errors * ${memoryConfig.errorWeight}) else 0 end`);
    expect(sql028).toContain(`v_score := round(1000 * (${mw.pairs} * v_pairs / v_steps + ${mw.precision} * v_precision + ${mw.time} * v_time_left))::int;`);
  });
});
