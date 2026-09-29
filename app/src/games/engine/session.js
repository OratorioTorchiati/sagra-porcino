// Sessione di gioco: schermo intero con HUD e canvas, conto alla rovescia, ciclo di gioco,
// pausa automatica quando la pagina va in background, registro delle azioni.
//
// Un gioco è un oggetto creato da `gameDef.create(ctx)` con:
//   update(dt, t)          avanza di dt secondi (t = tempo di gioco trascorso)
//   draw(ctx2d)            disegna il frame
//   onPointerDown(x, y, t) tocco sul canvas (coordinate in px CSS)
//   onPointerMove?(x, y, t), onPointerUp?(x, y, t)
//   resize(width, height)  dimensioni dell'area di gioco
//   isOver(t)              true quando la partita è finita
//   timeLeft?(t)           secondi rimasti per il tempo nell'HUD (default: config.durationS - t)
//   result()               { rawScore, stats }
//   endText?()             scritta di fine partita (default "Fine partita!")
//   start?()               chiamata al "VIA!" (es. il quiz mostra la prima domanda)
//   destroy?()             pulizia (timer del gioco) quando la sessione viene chiusa
//
// Giochi senza canvas (quiz, memory): `gameDef.canvas = false`; il gioco riceve `dom`,
// un elemento in cui disegnare la sua interfaccia HTML, e gestisce da sé i tocchi.
//
// Il tempo di gioco avanza solo mentre si gioca: in pausa il timer si ferma
// (ma, dalla Tappa 5, il tentativo resta consumato). Con `gameDef.pauseOnHide = false`
// (quiz) la partita NON va in pausa quando si cambia app, per non dare tempo di cercare le risposte.
//
// Passi fissi (D75): il gioco avanza sempre a scatti di 1/60 di secondo, qualunque sia la velocità del telefono.
// Così la stessa partita (seme + azioni registrate con il loro tempo) si può rigiocare IDENTICA:
// è il "Rivedi partita" del pannello staff (opzione `replay`). Ogni gioco può avere
//   replayAction(tipo, dati, t)  rifà un'azione registrata; restituisce dove mostrare l'"onda" del tocco
//                                ({ x, y } in coordinate di gioco, un elemento HTML, oppure niente).
// Nelle partite vere si registra anche la grandezza dell'area di gioco ('size', larghezza, altezza).

import { html } from '../../lib/dom.js';
import { setUpdateBlocked } from '../../lib/app-update.js';
import { createRng } from './rng.js';
import { STEP_S } from './step.js';
import { canvasDpr } from './dpr.js';

const COUNTDOWN_STEP_MS = 800;
const MAX_FRAME_S = 0.05; // un frame lento (o una pausa del browser) non fa saltare il gioco
const DEFAULT_SIZE = [390, 640]; // partite registrate prima che si salvasse la grandezza dell'area
const REPLAY_EVENTS = new Set(['start', 'pause', 'resume', 'hidden', 'visible', 'size']);

// Anello del HUD (es. moltiplicatore a tempo): circonferenza del cerchio di raggio 20
const RING_LENGTH = 2 * Math.PI * 20;
const RING_MARKUP = `<span class="game-hud__ring"><svg class="game-hud__ring-svg" viewBox="0 0 48 48" aria-hidden="true"><circle class="game-hud__ring-track" cx="24" cy="24" r="20" /><circle class="game-hud__ring-bar" cx="24" cy="24" r="20" stroke-dasharray="${RING_LENGTH.toFixed(1)}" stroke-dashoffset="${RING_LENGTH.toFixed(1)}" /></svg><span class="game-hud__value"></span></span>`;

export class GameSession {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root     dove montare lo schermo di gioco
   * @param {object} options.gameDef       modulo del gioco (create, hud, config)
   * @param {object} options.assets        risorse già caricate (sprite...)
   * @param {number} options.seed          seme della partita
   * @param {(result) => void} options.onFinish
   * @param {{actions: any[], durationMs: number}} [options.replay] rivede una partita registrata (pannello staff)
   */
  constructor({ root, gameDef, assets, seed, onFinish, replay = null }) {
    this.replay = replay;
    this.replayIndex = 0;
    this.applyingReplay = false;
    this.steps = 0;
    this.accumulator = 0;
    this.loggedSize = null;
    this.view = { scale: 1, x: 0, y: 0 };
    if (replay) {
      const size = replay.actions.find((a) => a[1] === 'size');
      this.virtualSize = size ? [size[2], size[3]] : DEFAULT_SIZE;
    }
    this.gameDef = gameDef;
    this.config = gameDef.config;
    this.seed = seed;
    this.onFinish = onFinish;
    this.state = 'countdown'; // countdown | running | paused | over
    this.gameTime = 0;
    this.lastFrame = null;
    this.actions = [];
    this.pauses = 0;
    this.timers = [];
    this.usesCanvas = gameDef.canvas !== false;
    this.pauseOnHide = gameDef.pauseOnHide !== false;

    this.element = html(`
      <div class="game-screen${replay ? ' game-screen--replay' : ''}" role="application" aria-label="${gameDef.name}">
        ${replay ? '<div class="replay-top"></div><div class="replay-progress"><div class="replay-progress__bar"></div><span class="replay-progress__time"></span></div>' : ''}
        <div class="game-hud">
          ${gameDef.hud.map((item) => `<div class="game-hud__item game-hud__item--${item.key}" data-hud="${item.key}"><span class="game-hud__label">${item.label}</span>${item.ring ? RING_MARKUP : '<span class="game-hud__value"></span>'}</div>`).join('')}
        </div>
        <div class="game-stage">
          ${this.usesCanvas ? '<canvas class="game-canvas"></canvas>' : '<div class="game-dom"></div>'}
          <div class="game-overlay" hidden></div>
          ${replay ? '<div class="replay-ripples" aria-hidden="true"></div>' : ''}
        </div>
        ${replay ? '<div class="replay-bottom"></div>' : ''}
      </div>
    `);
    root.append(this.element);
    document.documentElement.classList.add('is-playing');
    setUpdateBlocked(true);

    this.stage = this.element.querySelector('.game-stage');
    this.canvas = this.element.querySelector('.game-canvas');
    this.ctx = this.canvas?.getContext('2d') ?? null;
    this.dom = this.element.querySelector('.game-dom');
    this.overlay = this.element.querySelector('.game-overlay');
    this.ripples = this.element.querySelector('.replay-ripples');
    this.progressBar = this.element.querySelector('.replay-progress__bar');
    this.progressTime = this.element.querySelector('.replay-progress__time');
    this.hudValues = Object.fromEntries(
      gameDef.hud.map((item) => [item.key, this.element.querySelector(`[data-hud="${item.key}"]`)]),
    );

    this.game = gameDef.create({
      rng: createRng(seed),
      config: this.config,
      assets,
      hud: { set: (key, value) => this.setHud(key, value), pulse: (key) => this.pulseHud(key), ring: (key, fraction) => this.setHudRing(key, fraction) },
      log: (...data) => this.actions.push([Math.round(this.gameTime * 1000), ...data]),
      flash: (kind) => this.flash(kind),
      shake: () => this.shake(),
      dom: this.dom,
      // Nel replay i tocchi veri non contano: si muove solo ciò che era registrato
      isRunning: () => this.state === 'running' && (!this.replay || this.applyingReplay),
      replay: Boolean(replay),
      // Il quiz misura i tempi con l'orologio; nel replay usa il tempo di gioco
      ...(replay ? { clock: () => this.gameTime * 1000 } : {}),
    });

    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage);

    if (this.usesCanvas && !replay) {
      this.onPointer = this.onPointer.bind(this);
      this.canvas.addEventListener('pointerdown', this.onPointer);
      this.canvas.addEventListener('pointermove', this.onPointer);
      this.canvas.addEventListener('pointerup', this.onPointer);
      this.canvas.addEventListener('pointercancel', this.onPointer);
    }
    this.onVisibility = () => {
      if (this.replay || (this.state !== 'running' && this.state !== 'paused')) return;
      if (this.pauseOnHide) {
        if (document.hidden && this.state === 'running') this.pause();
      } else {
        // Niente pausa (quiz): resta traccia per lo staff di quando si è usciti dall'app
        this.actions.push([Math.round(this.gameTime * 1000), document.hidden ? 'hidden' : 'visible']);
      }
    };
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onVisibility);

    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
    this.updateTimeHud();
    if (replay) this.startReplay();
    else this.countdown();
  }

  startReplay() {
    this.game.start?.();
    this.state = 'running';
    this.updateReplayProgress();
  }

  // ---------- Stati ----------

  countdown() {
    const steps = ['3', '2', '1', 'VIA!'];
    steps.forEach((text, i) => {
      this.timers.push(
        setTimeout(() => this.showOverlay(`<div class="game-countdown${text === 'VIA!' ? ' game-countdown--go' : ''}">${text}</div>`, false), i * COUNTDOWN_STEP_MS),
      );
    });
    this.timers.push(
      setTimeout(() => {
        this.hideOverlay();
        this.actions.push([0, 'start']);
        this.logSize();
        this.game.start?.();
        if (document.hidden && this.pauseOnHide) this.pause();
        else this.state = 'running';
      }, steps.length * COUNTDOWN_STEP_MS),
    );
  }

  pause() {
    this.state = 'paused';
    this.pauses++;
    this.actions.push([Math.round(this.gameTime * 1000), 'pause']);
    this.showOverlay(
      `<div class="game-pause">
        <p class="game-pause__title">Pausa</p>
        <p class="game-pause__text">Tocca per continuare</p>
      </div>`,
      true,
    );
    this.overlay.addEventListener('pointerup', () => this.resume(), { once: true });
  }

  resume() {
    this.hideOverlay();
    this.lastFrame = null;
    this.actions.push([Math.round(this.gameTime * 1000), 'resume']);
    this.state = 'running';
  }

  finish() {
    this.state = 'over';
    if (this.replay) {
      this.updateReplayProgress();
      this.showOverlay('<div class="game-countdown game-countdown--end">Fine replay</div>', false);
      this.timers.push(setTimeout(() => this.onFinish?.(null), 400));
      return;
    }
    const { rawScore, stats } = this.game.result();
    const result = {
      rawScore,
      stats: { ...stats, durationMs: Math.round(this.gameTime * 1000), pauses: this.pauses },
      actions: this.actions,
      seed: this.seed,
    };
    // Breve pausa sull'ultimo frame prima della schermata finale
    this.timers.push(setTimeout(() => this.onFinish(result), 700));
    const endText = this.game.endText?.() ?? 'Fine partita!';
    this.showOverlay(`<div class="game-countdown game-countdown--end">${endText}</div>`, false);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.timers.forEach(clearTimeout);
    this.game.destroy?.();
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onVisibility);
    document.documentElement.classList.remove('is-playing');
    setUpdateBlocked(false);
    this.element.remove();
  }

  // ---------- Ciclo di gioco ----------

  frame(now) {
    this.raf = requestAnimationFrame(this.frame);
    if (this.state === 'running') {
      // Mai negativo (un timestamp fuori ordine non deve far tornare indietro il tempo), mai troppo grande
      const dt = this.lastFrame === null ? 0 : Math.min(Math.max((now - this.lastFrame) / 1000, 0), MAX_FRAME_S);
      this.lastFrame = now;
      this.accumulator += dt;
      while (this.accumulator >= STEP_S && this.state === 'running') {
        this.accumulator -= STEP_S;
        this.step();
      }
      this.updateTimeHud();
      if (this.replay) this.updateReplayProgress();
    }
    if (this.usesCanvas) {
      const shaking = this.shakeUntil && performance.now() < this.shakeUntil;
      if (shaking) {
        this.ctx.save();
        this.ctx.translate((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      }
      if (this.replay) {
        // Nel replay si vede solo l'area del telefono del giocatore (niente elementi disegnati fuori)
        const [w, h] = this.virtualSize;
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(0, 0, w, h);
        this.ctx.clip();
      }
      this.game.draw(this.ctx);
      if (this.replay) this.ctx.restore();
      if (shaking) this.ctx.restore();
    }
  }

  /** Un passo fisso del gioco (e, nel replay, le azioni registrate in quel momento) */
  step() {
    this.steps += 1;
    this.gameTime = this.steps * STEP_S;
    this.game.update(STEP_S, this.gameTime);
    if (this.replay) this.applyReplayActions();
    if (this.game.isOver(this.gameTime) || (this.replay && this.gameTime * 1000 >= this.replay.durationMs)) this.finish();
  }

  /** Rifà le azioni registrate fino al tempo attuale, nello stesso ordine */
  applyReplayActions() {
    const nowMs = Math.round(this.gameTime * 1000);
    const { actions } = this.replay;
    while (this.replayIndex < actions.length && actions[this.replayIndex][0] <= nowMs) {
      const [, type, ...data] = actions[this.replayIndex++];
      if (type === 'size') {
        this.virtualSize = [data[0], data[1]];
        this.resize();
        continue;
      }
      if (REPLAY_EVENTS.has(type)) continue;
      this.applyingReplay = true;
      try {
        const where = this.game.replayAction?.(type, data, this.gameTime);
        if (where) this.showRipple(where);
      } finally {
        this.applyingReplay = false;
      }
    }
  }

  /** "Onda" dove il giocatore ha toccato: punto di gioco { x, y } o elemento HTML */
  showRipple(where) {
    if (!this.ripples) return;
    let x;
    let y;
    if (where instanceof Element) {
      const box = where.getBoundingClientRect();
      const stage = this.stage.getBoundingClientRect();
      x = box.left + box.width / 2 - stage.left;
      y = box.top + box.height / 2 - stage.top;
    } else {
      x = this.view.x + where.x * this.view.scale;
      y = this.view.y + where.y * this.view.scale;
    }
    const ripple = document.createElement('span');
    ripple.className = 'replay-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    this.ripples.append(ripple);
    setTimeout(() => ripple.remove(), 700);
  }

  updateReplayProgress() {
    const total = this.replay.durationMs;
    const now = Math.min(this.gameTime * 1000, total);
    const fmt = (ms) => {
      const sec = Math.floor(ms / 1000);
      return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };
    this.progressBar.style.transform = `scaleX(${total ? now / total : 0})`;
    const text = `▶ ${fmt(now)} / ${fmt(total)}`;
    if (this.progressTime.textContent !== text) this.progressTime.textContent = text;
  }

  /** Nelle partite vere si registra la grandezza dell'area di gioco (per rivederla uguale) */
  logSize() {
    if (this.replay || !this.usesCanvas || this.state === 'over') return;
    const size = [this.stage.clientWidth, this.stage.clientHeight];
    if (!size[0] || !size[1] || (this.loggedSize && this.loggedSize[0] === size[0] && this.loggedSize[1] === size[1])) return;
    this.loggedSize = size;
    this.actions.push([Math.round(this.gameTime * 1000), 'size', ...size]);
  }

  resize() {
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    if (!width || !height) return;
    // Nel replay il gioco ha la grandezza del telefono del giocatore, ridotta per stare nello schermo
    let [gameW, gameH] = [width, height];
    this.view = { scale: 1, x: 0, y: 0 };
    if (this.replay && this.usesCanvas) {
      [gameW, gameH] = this.virtualSize;
      const scale = Math.min(width / gameW, height / gameH);
      this.view = { scale, x: (width - gameW * scale) / 2, y: (height - gameH * scale) / 2 };
    }
    // Stessa misura di prima (succede spesso sul telefono quando si apre il gioco): niente da rifare.
    // Ridimensionare il canvas lo ricrea da zero e il gioco ridisegna lo sfondo: nei primi secondi erano scatti.
    const key = `${width}x${height}x${gameW}x${gameH}`;
    if (key === this.sizeKey) return;
    this.sizeKey = key;
    if (this.usesCanvas) {
      const dpr = canvasDpr();
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      const k = dpr * this.view.scale;
      this.ctx.setTransform(k, 0, 0, k, dpr * this.view.x, dpr * this.view.y);
    }
    this.game.resize?.(gameW, gameH);
    if (this.state === 'running' || this.state === 'paused') this.logSize();
  }

  /** Breve scossa dello schermo (es. bomba presa) */
  shake(durationMs = 350) {
    this.shakeUntil = performance.now() + durationMs;
  }

  onPointer(event) {
    event.preventDefault();
    if (this.state !== 'running') return;
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (event.type === 'pointerdown') this.game.onPointerDown(x, y, this.gameTime);
    else if (event.type === 'pointermove') this.game.onPointerMove?.(x, y, this.gameTime);
    else this.game.onPointerUp?.(x, y, this.gameTime);
  }

  // ---------- HUD e overlay ----------

  setHud(key, value) {
    const valueEl = this.hudValues[key]?.querySelector('.game-hud__value');
    const text = String(value);
    if (valueEl && valueEl.textContent !== text) valueEl.textContent = text;
  }

  /** Anello intorno al valore (voci con `ring: true`): frazione 1 → 0 che si consuma, null = nascosto */
  setHudRing(key, fraction) {
    const bar = this.hudValues[key]?.querySelector('.game-hud__ring-bar');
    if (!bar) return;
    const offset = fraction === null ? RING_LENGTH : RING_LENGTH * (1 - Math.min(1, Math.max(0, fraction)));
    const value = offset.toFixed(1);
    if (bar.getAttribute('stroke-dashoffset') !== value) bar.setAttribute('stroke-dashoffset', value);
  }

  pulseHud(key) {
    const item = this.hudValues[key];
    if (!item) return;
    item.classList.remove('is-pulsing');
    void item.offsetWidth; // riavvia l'animazione
    item.classList.add('is-pulsing');
  }

  updateTimeHud() {
    const duration = this.config.durationS;
    if (!duration || !this.hudValues.time) return;
    const left = Math.max(0, Math.ceil(this.game.timeLeft?.(this.gameTime) ?? duration - this.gameTime));
    this.setHud('time', `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    this.hudValues.time.classList.toggle('is-ending', left <= 10);
  }

  flash(kind) {
    this.stage.classList.remove('flash-bad');
    void this.stage.offsetWidth;
    this.stage.classList.add(`flash-${kind}`);
  }

  showOverlay(markup, interactive) {
    this.overlay.innerHTML = markup;
    this.overlay.hidden = false;
    this.overlay.classList.toggle('game-overlay--interactive', interactive);
  }

  hideOverlay() {
    this.overlay.hidden = true;
    this.overlay.innerHTML = '';
  }
}
