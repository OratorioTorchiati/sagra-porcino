// "Memory del paese": griglia 4×4, si girano due carte alla volta, massimo 2 minuti.
// Coppia trovata → resta visibile un attimo, poi sparisce verso lo sfondo.
// Coppia sbagliata → le carte si rigirano e si SCAMBIANO DI POSTO, con uno spostamento ben visibile.
// Interfaccia HTML (niente canvas). Le animazioni seguono il tempo di gioco (in pausa si fermano).

import { html, escapeHtml } from '../../lib/dom.js';
import { CARDS, CARD_BACK } from './cards.js';
import { createMemoryLogic, memoryScore } from './logic.js';

export function createMemory({ rng, config, hud, log, dom, isRunning }) {
  const byId = Object.fromEntries(CARDS.map((c) => [c.id, c]));
  const logic = createMemoryLogic({ rng, cardIds: CARDS.slice(0, config.pairs).map((c) => c.id) });
  let scheduled = []; // [{ at, run }] azioni programmate sul tempo di gioco
  let completedAt = null;
  let now = 0;

  const frontMarkup = (id) => {
    const card = byId[id];
    const image = card.src ? `<img class="memory-card__image" src="${card.src}" alt="">` : `<span class="memory-card__image">${card.svg}</span>`;
    return `${image}<span class="memory-card__caption">${escapeHtml(card.caption)}</span>`;
  };

  const element = html(`
    <div class="memory">
      <div class="memory-grid">
        ${logic.cards
          .map(
            (c) => `
            <button type="button" class="memory-card" data-index="${c.index}" aria-label="Carta coperta">
              <span class="memory-card__inner">
                <span class="memory-card__face memory-card__back">${CARD_BACK}</span>
                <span class="memory-card__face memory-card__front">${frontMarkup(c.id)}</span>
              </span>
            </button>`,
          )
          .join('')}
      </div>
      <p class="memory-found" aria-live="polite">Trova le coppie!</p>
    </div>
  `);
  dom.append(element);
  const buttons = [...element.querySelectorAll('.memory-card')];
  const found = element.querySelector('.memory-found');

  const schedule = (delayS, run) => scheduled.push({ at: now + delayS, run });

  function refreshHud() {
    hud.set('moves', logic.moves);
    hud.set('pairs', `${logic.pairs}/${config.pairs}`);
  }
  refreshHud();

  function setOpen(index, open) {
    buttons[index].classList.toggle('is-open', open);
    buttons[index].setAttribute('aria-label', open ? byId[logic.cards[index].id].caption : 'Carta coperta');
  }

  /** Le due carte (già coperte) scivolano una al posto dell'altra, poi si aggiornano davvero. */
  function animateSwap(a, b) {
    const [btnA, btnB] = [buttons[a], buttons[b]];
    const ra = btnA.getBoundingClientRect();
    const rb = btnB.getBoundingClientRect();
    for (const [btn, dx, dy] of [
      [btnA, rb.left - ra.left, rb.top - ra.top],
      [btnB, ra.left - rb.left, ra.top - rb.top],
    ]) {
      btn.classList.add('is-swapping');
      btn.style.transition = `transform ${config.swapS}s ease-in-out`;
      btn.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    schedule(config.swapS, () => {
      logic.closeMismatch(true);
      log('swap', a, b);
      // Ora le carte hanno cambiato posto: si scambia il contenuto e si tolgono gli spostamenti di colpo
      const frontA = btnA.querySelector('.memory-card__front');
      const frontB = btnB.querySelector('.memory-card__front');
      [frontA.innerHTML, frontB.innerHTML] = [frontB.innerHTML, frontA.innerHTML];
      for (const btn of [btnA, btnB]) {
        btn.style.transition = 'none';
        btn.style.transform = '';
        btn.classList.remove('is-swapping');
        void btn.offsetWidth;
        btn.style.transition = '';
      }
    });
  }

  element.addEventListener('click', (event) => {
    const button = event.target.closest('.memory-card');
    if (!button || !isRunning()) return;
    const index = Number(button.dataset.index);
    const outcome = logic.flip(index);
    if (outcome === 'ignored') return;
    const card = logic.cards[index];
    log('flip', index, card.id, outcome);
    setOpen(index, true);

    if (outcome === 'match') {
      const pair = logic.cards.filter((c) => c.id === card.id).map((c) => c.index);
      pair.forEach((i) => buttons[i].classList.add('is-matched'));
      found.textContent = `✅ Hai trovato: ${byId[card.id].caption}`;
      hud.pulse('pairs');
      schedule(config.matchShowS, () => pair.forEach((i) => buttons[i].classList.add('is-removed')));
      if (logic.isComplete()) completedAt = now;
    } else if (outcome === 'mismatch') {
      const [a, b] = logic.open;
      schedule(config.mismatchDelayS, () => {
        setOpen(a, false);
        setOpen(b, false);
      });
      schedule(config.mismatchDelayS + config.flipBackS, () => animateSwap(a, b));
    }
    refreshHud();
  });

  return {
    update(dt, t) {
      now = t;
      const due = scheduled.filter((s) => s.at <= t);
      scheduled = scheduled.filter((s) => s.at > t);
      due.forEach((s) => s.run());
    },

    isOver(t) {
      return logic.isComplete() || t >= config.durationS;
    },

    endText() {
      return logic.isComplete() ? 'Tutte le coppie!' : 'Tempo scaduto!';
    },

    result() {
      const completed = logic.isComplete();
      const seconds = Math.round((completed ? completedAt : Math.min(now, config.durationS)) * 10) / 10;
      return {
        rawScore: memoryScore({ completed, seconds, moves: logic.moves, pairs: logic.pairs }, config),
        stats: { completed, seconds, moves: logic.moves, pairs: logic.pairs },
      };
    },

    /** Solo per i test automatici */
    logic,
  };
}
