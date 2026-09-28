// "Porcini che cadono": cestino in basso che segue il dito (trascinando ovunque sullo schermo),
// si prendono i porcini e si evitano le bombe. 3 vite, massimo 2 minuti. Regole in docs/03-GIOCHI.md.

import { PORCINI } from '../shared/porcini.js';
import { BASKET_ASPECT, BASKET_RIM } from './sprites.js';
import { applyCatch, initialState, survivalBonus } from './scoring.js';
import { softBackground } from '../engine/background.js';

const PORCINO_KINDS = Object.keys(PORCINI);
const EFFECT_S = 0.8;
const POS_LOG_EVERY_S = 0.25;
const TEXT_FONT = '"Atkinson Hyperlegible Next", system-ui, sans-serif';
const WARM = {
  top: '#f6eedc',
  bottom: '#e6d6b3',
  blobs: ['222, 190, 140', '205, 172, 124', '232, 208, 164', '196, 208, 156', '214, 180, 128'],
};

const lerp = (a, b, p) => a + (b - a) * p;

export function createCadono({ rng, config, assets, hud, log, flash, shake }) {
  let width = 0;
  let height = 0;
  let background = null;
  let items = [];
  let effects = [];
  let deck = [];
  let nextId = 1;
  let spawnTimer = 0.5;
  let state = initialState(config);
  let reachedEnd = false;
  const basket = { x: 0, targetX: null, width: config.basketWidth, height: config.basketWidth / BASKET_ASPECT };
  let lastPosLog = -1;
  let lastLoggedX = null;

  const basketTop = () => height - config.basketBottomMargin - basket.height;
  const rimY = () => basketTop() + basket.height * BASKET_RIM;

  function refreshHud() {
    hud.set('score', state.score);
    hud.set('lives', '❤️'.repeat(state.lives) + '🤍'.repeat(config.lives - state.lives));
  }
  refreshHud();

  // Mazzo di 30 con numero fisso di porcini d'oro e bombe, poi mescolato: partite eque tra semi diversi
  function nextType(p) {
    if (deck.length === 0) {
      const bombs = Math.round(lerp(config.bombShare[0], config.bombShare[1], p) * config.deckSize);
      deck = Array.from({ length: config.deckSize }, (_, i) =>
        i < config.goldenPerDeck ? 'golden' : i < config.goldenPerDeck + bombs ? 'bomb' : 'porcino',
      );
      for (let i = deck.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
    }
    return deck.pop();
  }

  function spawn(t) {
    const p = Math.min(1, t / config.durationS);
    const type = nextType(p);
    const kind = type === 'porcino' ? rng.pick(PORCINO_KINDS) : type;
    const r = config.itemSize / 2;
    items.push({
      id: nextId++,
      type,
      kind,
      x: rng.range(r, Math.max(r, width - r)),
      y: -r,
      speed: lerp(config.fallSpeed[0], config.fallSpeed[1], p) * rng.range(0.85, 1.15),
      wobble: rng.range(0, Math.PI * 2),
    });
  }

  function addText(x, y, text, color) {
    effects.push({ type: 'text', x, y, text, color, age: 0 });
  }

  return {
    resize(w, h) {
      width = w;
      height = h;
      background = null;
      if (basket.targetX === null) basket.x = w / 2;
      basket.x = Math.min(Math.max(basket.x, basket.width / 2), w - basket.width / 2);
    },

    update(dt, t) {
      const p = Math.min(1, t / config.durationS);

      // Cestino: raggiunge la posizione del dito in modo morbido ma rapido
      if (basket.targetX !== null) {
        const target = Math.min(Math.max(basket.targetX, basket.width / 2), width - basket.width / 2);
        basket.x += (target - basket.x) * Math.min(1, dt * config.basketFollow);
      }
      if (t - lastPosLog >= POS_LOG_EVERY_S) {
        const x = Math.round(basket.x);
        if (x !== lastLoggedX) {
          log('pos', x);
          lastLoggedX = x;
        }
        lastPosLog = t;
      }

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawn(t);
        spawnTimer = lerp(config.spawnInterval[0], config.spawnInterval[1], p) * rng.range(0.75, 1.25);
      }

      const rim = rimY();
      const reach = basket.width / 2 + config.itemSize * config.catchTolerance;
      for (const item of items) {
        const before = item.y;
        item.y += item.speed * dt;
        item.wobble += dt * 3;
        // Preso: il centro attraversa il bordo del cestino mentre è sopra il cestino
        if (before < rim && item.y >= rim && Math.abs(item.x - basket.x) <= reach) {
          item.gone = true;
          const { state: next, points } = applyCatch(state, item.type, config);
          state = next;
          log('catch', item.type, Math.round(item.x), Math.round(basket.x));
          if (item.type === 'bomb') {
            effects.push({ type: 'boom', x: item.x, y: rim, age: 0 });
            flash('bad');
            shake();
            navigator.vibrate?.(150);
            hud.pulse('lives');
          } else {
            addText(item.x, rim - 30, `+${points}`, item.type === 'golden' ? '#b07800' : '#2f6b33');
            if (item.type === 'golden') hud.pulse('score');
          }
          refreshHud();
        } else if (item.y - config.itemSize / 2 > height) {
          item.gone = true;
          if (item.type !== 'bomb') log('miss', item.type, Math.round(item.x));
        }
      }
      items = items.filter((i) => !i.gone);

      for (const fx of effects) fx.age += dt;
      effects = effects.filter((fx) => fx.age < EFFECT_S);

      if (t >= config.durationS && state.lives > 0) reachedEnd = true;
    },

    draw(ctx) {
      if (!background) background = softBackground(width, height, WARM);
      ctx.drawImage(background, 0, 0, width, height);

      const s = config.itemSize;
      for (const item of items) {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(Math.sin(item.wobble) * 0.15);
        ctx.drawImage(assets.sprites[item.kind], -s / 2, -s / 2, s, s);
        ctx.restore();
      }

      ctx.drawImage(assets.basket, basket.x - basket.width / 2, basketTop(), basket.width, basket.height);

      for (const fx of effects) {
        const k = fx.age / EFFECT_S;
        ctx.save();
        ctx.globalAlpha = 1 - k;
        if (fx.type === 'boom') {
          const r = 20 + k * 70;
          const grad = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r);
          grad.addColorStop(0, 'rgba(255, 245, 157, 0.95)');
          grad.addColorStop(0.4, 'rgba(255, 152, 0, 0.8)');
          grad.addColorStop(1, 'rgba(211, 47, 47, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.font = `800 34px ${TEXT_FONT}`;
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

    // Trascinamento ovunque sullo schermo: il cestino segue la posizione orizzontale del dito
    onPointerDown(x) {
      basket.targetX = x;
    },
    onPointerMove(x) {
      basket.targetX = x;
    },

    isOver(t) {
      return state.lives === 0 || t >= config.durationS;
    },

    endText() {
      return state.lives === 0 ? 'Hai finito le vite!' : 'Tempo scaduto!';
    },

    snapshot() {
      return { items: items.map((i) => ({ ...i })), basket: { ...basket }, rimY: rimY(), state: { ...state } };
    },

    result() {
      const bonus = survivalBonus(state, reachedEnd, config);
      return {
        rawScore: state.score + bonus,
        stats: { porcini: state.porcini, golden: state.golden, bombs: state.bombs, lives: state.lives, bonus },
      };
    },
  };
}
