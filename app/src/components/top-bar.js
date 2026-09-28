// Barra in alto delle pagine interne: "← Indietro" a sinistra, profilo a destra.

import { goBack } from '../router.js';
import { accountLinkMarkup } from './account-link.js';

// showAccount: false solo sulla pagina del profilo (il bottone porterebbe alla pagina stessa)
export function topBarMarkup({ showAccount = true } = {}) {
  return `
    <div class="top-bar">
      <button type="button" class="back-button">
        <span aria-hidden="true">←</span> Indietro
      </button>
      ${showAccount ? accountLinkMarkup() : ''}
    </div>
  `;
}

/** Collega il bottone "Indietro" dopo aver creato la pagina. */
export function bindTopBar(element) {
  element.querySelector('.back-button')?.addEventListener('click', goBack);
}
