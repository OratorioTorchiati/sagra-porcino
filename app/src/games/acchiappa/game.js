// "Acchiappa il porcino": elementi che attraversano lo schermo o spuntano all'interno,
// si toccano i porcini e si evitano funghi velenosi e oggetti. Regole in docs/03-GIOCHI.md.

import { GOOD, BAD_POISONOUS, BAD_OBJECTS } from './sprites.js';
import { applyHit, currentMultiplier, expire, gameEndMs, initialScoreState, ringFraction } from './scoring.js';
import { softBackground } from '../engine/background.js';
import { warmUpSprites } from '../engine/sprites.js';

const GOOD_KINDS = Object.keys(GOOD);
const POISONOUS_KINDS = Object.keys(BAD_POISONOUS);
const OBJECT_KINDS = Object.keys(BAD_OBJECTS);

const POP_IN_S = 0.22;
const FADE_OUT_S = 0.3;
const FLOAT_TEXT_S = 0.8;
const TEXT_FONT = '"Atkinson Hyperlegible Next", system-ui, sans-serif';

const lerp = (a, b, p) => a + (b - a) * p;
const lerpRange = (start, end, p) => [lerp(start[0], end[0], p), lerp(start[1], end[1], p)];

export function createAcchiappa({ rng, config, assets, hud, log, flash }) {
  let width = 0;
  let height = 0;
  let background = null;
  let warmedUp = false;
  let entities = [];
  let effects = [];
  let nextId = 1;
  let spawnTimer = 0.4;
  let score = initialScoreState();
  let nowMs = 0;
  let endMs = config.durationS * 1000; // gli oggetti toccati la anticipano (D81)

  function progress(t) {
    return Math.min(1, t / config.durationS);
  }

  function refreshHud() {
    hud.set('score', score.score);
    hud.set('multiplier', `×${currentMultiplier(score, config)}`);
    // a ×1 l'anello si riempie con la serie, dal ×2 si consuma come un orologio
    hud.ring?.('multiplier', ringFraction(score, nowMs, config));
  }
  refreshHud();

  // ---------- Comparsa degli elementi ----------

  // Buoni e cattivi escono da un "mazzo" di 10 con un numero fisso di porcini (poi mescolato):
  // così ogni partita ha quasi lo stesso numero di porcini e il punteggio non dipende dalla fortuna del seme.
  let deck = [];
  function nextIsGood(p) {
    if (deck.length === 0) {
      const goods = Math.round(lerp(config.goodChance[0], config.goodChance[1], p) * 10);
      deck = Array.from({ length: 10 }, (_, i) => i < goods);
      for (let i = deck.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
    }
    return deck.pop();
  }

  function pickKind(p) {
    if (nextIsGood(p)) return { kind: rng.pick(GOOD_KINDS), good: true };
    const pool = rng.chance(config.poisonousChance) ? POISONOUS_KINDS : OBJECT_KINDS;
    return { kind: rng.pick(pool), good: false };
  }

  function spawn(t) {
    const p = progress(t);
    const { kind, good } = pickKind(p);
    const size = rng.range(config.sizeMin, config.sizeMax);
    const spin = ((rng.range(-1, 1) * config.maxSpinDeg) * Math.PI) / 180;
    const base = { id: nextId++, kind, good, size, rot: rng.range(-0.4, 0.4), spin, born: t };

    if (rng.chance(config.edgeChance)) {
      // Entra da un bordo e attraversa l'area verso un punto della zona centrale
      const edge = rng.int(0, 3);
      const r = size / 2;
      const along = rng.next();
      const start = [
        [along * width, -r],
        [width + r, along * height],
        [along * width, height + r],
        [-r, along * height],
      ][edge];
      const target = [rng.range(width * 0.2, width * 0.8), rng.range(height * 0.2, height * 0.8)];
      const [minSpeed, maxSpeed] = lerpRange(config.speedStart, config.speedEnd, p);
      const speed = rng.range(minSpeed, maxSpeed);
      const dx = target[0] - start[0];
      const dy = target[1] - start[1];
      const len = Math.hypot(dx, dy) || 1;
      entities.push({ ...base, mode: 'edge', x: start[0], y: start[1], vx: (dx / len) * speed, vy: (dy / len) * speed, life: null });
    } else {
      // Spunta all'interno, in un punto libero, e sparisce dopo qualche secondo
      const margin = size / 2 + 6;
      let x = width / 2;
      let y = height / 2;
      for (let attempt = 0; attempt < 10; attempt++) {
        x = rng.range(margin, Math.max(margin, width - margin));
        y = rng.range(margin, Math.max(margin, height - margin));
        if (entities.every((e) => Math.hypot(e.x - x, e.y - y) > (e.size + size) / 2)) break;
      }
      const angle = rng.range(0, Math.PI * 2);
      const drift = rng.range(0, config.driftSpeed);
      const [minLife, maxLife] = lerpRange(config.lifeStart, config.lifeEnd, p);
      entities.push({
        ...base,
        mode: 'pop',
        x,
        y,
        vx: Math.cos(angle) * drift,
        vy: Math.sin(angle) * drift,
        spin: base.spin * 0.3,
        life: rng.range(minLife, maxLife),
      });
    }
  }

  // ---------- Effetti ----------

  function addText(x, y, text, color) {
    effects.push({ type: 'text', x, y, text, color, age: 0 });
  }

  function addBurst(x, y, size, good) {
    effects.push({ type: 'burst', x, y, size, good, age: 0 });
  }


  // ---------- Interfaccia verso il motore ----------

  return {
    resize(w, h) {
      width = w;
      height = h;
      background = null; // ridisegnato al prossimo frame
    },

    update(dt, t) {
      const p = progress(t);
      // Moltiplicatore a tempo: quando scade scende di un livello
      nowMs = Math.round(t * 1000);
      const levelBefore = score.level;
      score = expire(score, nowMs, config);
      if (score.level < levelBefore) {
        hud.pulse('multiplier');
        addText(width / 2, height * 0.4, `×${currentMultiplier(score, config)}`, '#7a6a55');
      }
      refreshHud();
      spawnTimer -= dt;
      const maxOnScreen = Math.round(lerp(config.maxOnScreen[0], config.maxOnScreen[1], p));
      if (spawnTimer <= 0) {
        if (entities.length < maxOnScreen) spawn(t);
        spawnTimer = lerp(config.spawnInterval[0], config.spawnInterval[1], p) * rng.range(0.7, 1.3);
      }

      for (const e of entities) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.rot += e.spin * dt;
        e.age = t - e.born;
        if (e.mode === 'pop') {
          if (e.age > e.life) e.gone = true;
          // Rimbalza sui bordi, così resta sempre toccabile
          const r = e.size / 2;
          if ((e.x < r && e.vx < 0) || (e.x > width - r && e.vx > 0)) e.vx = -e.vx;
          if ((e.y < r && e.vy < 0) || (e.y > height - r && e.vy > 0)) e.vy = -e.vy;
        } else {
          const r = e.size;
          if (e.x < -r || e.x > width + r || e.y < -r || e.y > height + r) e.gone = true;
        }
      }
      entities = entities.filter((e) => !e.gone);

      for (const fx of effects) fx.age += dt;
      effects = effects.filter((fx) => fx.age < FLOAT_TEXT_S);
    },

    draw(ctx) {
      if (!background) background = softBackground(width, height);
      if (!warmedUp) {
        warmUpSprites(ctx, assets.sprites); // primo frame, durante il conto alla rovescia
        warmedUp = true;
      }
      ctx.drawImage(background, 0, 0, width, height);

      for (const e of entities) {
        let scale = 1;
        let alpha = 1;
        const age = e.age ?? 0;
        if (e.mode === 'pop') {
          if (age < POP_IN_S) scale = 0.3 + 0.7 * (age / POP_IN_S);
          const left = e.life - age;
          if (left < FADE_OUT_S) alpha = Math.max(0, left / FADE_OUT_S);
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot);
        const s = e.size * scale;
        ctx.drawImage(assets.sprites[e.kind], -s / 2, -s / 2, s, s);
        ctx.restore();
      }

      for (const fx of effects) {
        const k = fx.age / FLOAT_TEXT_S;
        ctx.save();
        ctx.globalAlpha = 1 - k;
        if (fx.type === 'burst') {
          ctx.strokeStyle = fx.good ? '#2f8f3a' : '#c8231b';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, (fx.size / 2) * (0.8 + k * 0.8), 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.font = `800 ${fx.text.length > 3 ? 30 : 34}px ${TEXT_FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 6;
          ctx.strokeStyle = '#ffffff';
          const y = fx.y - 50 * k;
          ctx.strokeText(fx.text, fx.x, y);
          ctx.fillStyle = fx.color;
          ctx.fillText(fx.text, fx.x, y);
        }
        ctx.restore();
      }
    },

    /** Replay (pannello staff): rifà un tocco registrato */
    replayAction(type, data, t) {
      if (type !== 'tap') return null;
      this.onPointerDown(data[0], data[1], t);
      return { x: data[0], y: data[1] };
    },

    onPointerDown(x, y, t) {
      // Tra gli elementi sotto il dito, quello col centro più vicino
      let best = null;
      let bestDist = Infinity;
      for (const e of entities) {
        const d = Math.hypot(e.x - x, e.y - y);
        if (d <= e.size / 2 + config.touchTolerance && d < bestDist) {
          best = e;
          bestDist = d;
        }
      }
      const tapX = Math.round(x);
      const tapY = Math.round(y);
      if (!best) {
        log('tap', tapX, tapY, 'none');
        return;
      }

      best.gone = true;
      entities = entities.filter((e) => e !== best);
      const ageMs = Math.round((t - best.born) * 1000);
      nowMs = Math.round(t * 1000);
      score = expire(score, nowMs, config);
      const before = currentMultiplier(score, config);
      const hit = best.good ? 'good' : POISONOUS_KINDS.includes(best.kind) ? 'poison' : 'object';
      const { state, points } = applyHit(score, hit, nowMs, config);
      score = state;
      log('tap', tapX, tapY, best.good ? 'good' : 'bad', best.kind, ageMs, Math.round(best.size), Math.round(bestDist));

      if (best.good) {
        addBurst(best.x, best.y, best.size, true);
        addText(best.x, best.y, `+${points}`, '#2f6b33');
        const after = currentMultiplier(score, config);
        if (after > before) {
          hud.pulse('multiplier');
          addText(width / 2, height * 0.4, `×${after} 🔥`, '#c0561b');
        }
      } else {
        addBurst(best.x, best.y, best.size, false);
        if (hit === 'object') {
          endMs = gameEndMs(endMs, nowMs, config);
          addText(best.x, best.y, `-${config.objectPenaltyS} s`, '#c8231b');
          hud.pulse('time');
        } else {
          addText(best.x, best.y, '✕', '#c8231b');
        }
        flash('bad');
        navigator.vibrate?.(80);
        if (currentMultiplier(score, config) < before) hud.pulse('multiplier');
      }
      refreshHud();
    },

    isOver(t) {
      return t * 1000 >= endMs;
    },

    /** Secondi rimasti per il tempo nell'HUD (gli oggetti ne tolgono) */
    timeLeft(t) {
      return endMs / 1000 - t;
    },

    endText() {
      return 'Tempo scaduto!';
    },

    /** Copia degli elementi a schermo (solo per i test automatici) */
    snapshot() {
      return entities.map((e) => ({ ...e }));
    },

    result() {
      return {
        rawScore: score.score,
        stats: { caught: score.caught, errors: score.errors, maxStreak: score.maxStreak },
      };
    },
  };
}
