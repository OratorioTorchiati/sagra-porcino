// Sezione spenta dall'Admin (D93): chi apre un vecchio link o un segnalibro vede questo, e anche chi era già
// sulla pagina quando è stata spenta.

import { html } from '../lib/dom.js';
import { accountLinkMarkup } from '../components/account-link.js';

export function renderSectionOff(section) {
  const element = html(`
    <main class="page section-off">
      <div class="top-bar">${accountLinkMarkup()}</div>
      <h1 class="page-title">${section.icon} ${section.label}</h1>
      <p>Questa sezione non è disponibile.</p>
      <a class="button" href="#/">Torna alla home</a>
    </main>
  `);
  return { title: section.label, element };
}
