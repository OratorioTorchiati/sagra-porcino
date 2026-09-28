// "Memory del paese": griglia 4×4, si girano due carte alla volta, massimo 3 minuti.
// Interfaccia HTML (niente canvas). Regole in docs/03-GIOCHI.md.

import { html, escapeHtml } from '../../lib/dom.js';
import { CARDS, CARD_BACK } from './cards.js';
import { createMemoryLogic, memoryScore } from './logic.js';

export function createMemory({ rng, config, hud, log, dom, isRunning }) {
  const byId = Object.fromEntries(CARDS.map((c) => [c.id, c]));
  const logic = createMemoryLogic({ rng, cardIds: CARDS.slice(0, config.pairs).map((c) => c.id) });
  let closeAt = null;
  let completedAt = null;
  let now = 0;

  const faceMarkup = (card) =>
    card.src
      ? `<img class="memory-card__image" src="${card.src}" alt="">`
      : `<span class="memory-card__image">${card.svg}</span>`;

  const element = html(`
    <div class="memory">
      <div class="memory-grid">
        ${logic.cards
          .map((c) => {
            const card = byId[c.id];
            return `
            <button type="button" class="memory-card" data-index="${c.index}" aria-label="Carta coperta">
              <span class="memory-card__inner">
                <span class="memory-card__face memory-card__back">${CARD_BACK}</span>
                <span class="memory-card__face memory-card__front">
                  ${faceMarkup(card)}
                  <span class="memory-card__caption">${escapeHtml(card.caption)}</span>
                </span>
              </span>
            </button>`;
          })
          .join('')}
      </div>
      <p class="memory-found" aria-live="polite">Trova le coppie!</p>
    </div>
  `);
  dom.append(element);
  const buttons = [...element.querySelectorAll('.memory-card')];
  const found = element.querySelector('.memory-found');

  function refreshHud() {
    hud.set('moves', logic.moves);
    hud.set('pairs', `${logic.pairs}/${config.pairs}`);
  }
  refreshHud();

  function setOpen(index, open) {
    const button = buttons[index];
    button.classList.toggle('is-open', open);
    button.setAttribute('aria-label', open ? byId[logic.cards[index].id].caption : 'Carta coperta');
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
      for (const c of logic.cards.filter((c) => c.id === card.id)) buttons[c.index].classList.add('is-matched');
      found.textContent = `✅ Hai trovato: ${byId[card.id].caption}`;
      hud.pulse('pairs');
      if (logic.isComplete()) completedAt = now;
    } else if (outcome === 'mismatch') {
      closeAt = now + config.mismatchDelayS;
    }
    refreshHud();
  });

  return {
    update(dt, t) {
      now = t;
      // Le carte diverse si richiudono col tempo di gioco (in pausa restano aperte)
      if (closeAt !== null && t >= closeAt) {
        for (const index of logic.open) setOpen(index, false);
        logic.closeMismatch();
        closeAt = null;
      }
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
