// Scelta del personaggio: personaggio grande con le frecce + griglia di tutti.
// Usata nella registrazione e nel profilo ("cambia personaggio", D85).

import { escapeHtml } from '../lib/dom.js';
import { CHARACTERS } from '../characters/characters.js';

export function charPickerMarkup() {
  return `
    <div class="char-picker">
      <button type="button" class="char-picker__arrow" data-step="-1" aria-label="Personaggio precedente">‹</button>
      <div class="char-picker__current">
        <span class="char-picker__image" aria-hidden="true"></span>
        <span class="char-picker__name" aria-live="polite"></span>
      </div>
      <button type="button" class="char-picker__arrow" data-step="1" aria-label="Personaggio successivo">›</button>
    </div>
    <div class="char-grid" role="radiogroup" aria-label="Personaggi">
      ${CHARACTERS.map((c, i) => `<button type="button" class="char-grid__item" role="radio" data-index="${i}" aria-label="${escapeHtml(c.name)}">${c.svg}</button>`).join('')}
    </div>`;
}

/**
 * Collega frecce e griglia dentro `root`. `initialId` = personaggio già scelto (se manca, uno a caso).
 * Da chiamare una volta sola per ogni `root`.
 * @returns {{ selectedId: () => string, select: (id: string) => void }}
 */
export function bindCharPicker(root, initialId = null) {
  const found = CHARACTERS.findIndex((c) => c.id === initialId);
  let selected = found >= 0 ? found : Math.floor(Math.random() * CHARACTERS.length);
  const picker = root.querySelector('.char-picker');
  const gridItems = [...root.querySelectorAll('.char-grid__item')];

  function show() {
    const c = CHARACTERS[selected];
    picker.querySelector('.char-picker__image').innerHTML = c.svg;
    picker.querySelector('.char-picker__name').textContent = c.name;
    gridItems.forEach((item, i) => {
      item.classList.toggle('is-selected', i === selected);
      item.setAttribute('aria-checked', String(i === selected));
    });
  }
  show();

  picker.addEventListener('click', (event) => {
    const step = Number(event.target.closest('[data-step]')?.dataset.step);
    if (!step) return;
    selected = (selected + step + CHARACTERS.length) % CHARACTERS.length;
    show();
  });
  root.querySelector('.char-grid').addEventListener('click', (event) => {
    const item = event.target.closest('.char-grid__item');
    if (!item) return;
    selected = Number(item.dataset.index);
    show();
  });

  return {
    selectedId: () => CHARACTERS[selected].id,
    /** Torna a mostrare il personaggio `id` (es. riaprendo la finestra del profilo) */
    select(id) {
      const index = CHARACTERS.findIndex((c) => c.id === id);
      if (index >= 0) selected = index;
      show();
    },
  };
}
