import { html } from '../lib/dom.js';
import { accountLinkMarkup } from '../components/account-link.js';

export function renderNotFound() {
  const element = html(`
    <main class="page">
      <div class="top-bar">${accountLinkMarkup()}</div>
      <h1 class="page-title">Pagina non trovata</h1>
      <p>Questa pagina non esiste.</p>
      <a class="button" href="#/">Torna alla home</a>
    </main>
  `);
  return { title: 'Pagina non trovata', element };
}
