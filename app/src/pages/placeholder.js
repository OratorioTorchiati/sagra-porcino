// Pagina provvisoria, usata finché la sezione vera non è pronta.

import { html } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';

export function placeholderPage({ icon, title, text, showAccount = true }) {
  const element = html(`
    <main class="page">
      ${topBarMarkup({ showAccount })}
      <h1 class="page-title"><span class="page-title__icon" aria-hidden="true">${icon}</span>${title}</h1>
      <div class="notice">
        <p class="notice__title">In arrivo</p>
        <p>${text}</p>
      </div>
    </main>
  `);
  bindTopBar(element);
  return { title, element };
}
