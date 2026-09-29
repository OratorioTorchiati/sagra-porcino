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

import { html } from '../../lib/dom.js';
import { setUpdateBlocked } from '../../lib/app-update.js';
import { createRng } from './rng.js';

const COUNTDOWN_STEP_MS = 800;
const MAX_FRAME_S = 0.05; // un frame lento (o una pausa del browser) non fa saltare il gioco

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
   */
  constructor({ root, gameDef, assets, seed, onFinish }) {
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
      <div class="game-screen" role="application" aria-label="${gameDef.name}">
        <div class="game-hud">
          ${gameDef.hud.map((item) => `<div class="game-hud__item game-hud__item--${item.key}" data-hud="${item.key}"><span class="game-hud__label">${item.label}</span>${item.ring ? RING_MARKUP : '<span class="game-hud__value"></span>'}</div>`).join('')}
        </div>
        <div class="game-stage">
          ${this.usesCanvas ? '<canvas class="game-canvas"></canvas>' : '<div class="game-dom"></div>'}
          <div class="game-overlay" hidden></div>
        </div>
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
      isRunning: () => this.state === 'running',
    });

    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage);

    if (this.usesCanvas) {
      this.onPointer = this.onPointer.bind(this);
      this.canvas.addEventListener('pointerdown', this.onPointer);
      this.canvas.addEventListener('pointermove', this.onPointer);
      this.canvas.addEventListener('pointerup', this.onPointer);
      this.canvas.addEventListener('pointercancel', this.onPointer);
    }
    this.onVisibility = () => {
      if (this.state !== 'running' && this.state !== 'paused') return;
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
    this.countdown();
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
      this.gameTime += dt;
      this.game.update(dt, this.gameTime);
      this.updateTimeHud();
      if (this.game.isOver(this.gameTime)) this.finish();
    }
    if (this.usesCanvas) {
      const shaking = this.shakeUntil && performance.now() < this.shakeUntil;
      if (shaking) {
        this.ctx.save();
        this.ctx.translate((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      }
      this.game.draw(this.ctx);
      if (shaking) this.ctx.restore();
    }
  }

  resize() {
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    if (!width || !height) return;
    if (this.usesCanvas) {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.game.resize?.(width, height);
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
    const left = Math.max(0, Math.ceil(duration - this.gameTime));
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
