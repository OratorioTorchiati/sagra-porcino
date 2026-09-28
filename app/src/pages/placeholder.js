// Pagina provvisoria, usata finché la sezione vera non è pronta.

import { html } from '../lib/dom.js';
import { goBack } from '../router.js';
import { accountLinkMarkup } from '../components/account-link.js';

// showAccount: false solo sulla pagina del profilo (il bottone porterebbe alla pagina stessa)
export function placeholderPage({ icon, title, text, showAccount = true }) {
  const element = html(`
    <main class="page">
      <div class="top-bar">
        <button type="button" class="back-button">
          <span aria-hidden="true">←</span> Indietro
        </button>
        ${showAccount ? accountLinkMarkup() : ''}
      </div>
      <h1 class="page-title"><span class="page-title__icon" aria-hidden="true">${icon}</span>${title}</h1>
      <div class="notice">
        <p class="notice__title">In arrivo</p>
        <p>${text}</p>
      </div>
    </main>
  `);
  element.querySelector('.back-button').addEventListener('click', goBack);
  return { title, element };
}
