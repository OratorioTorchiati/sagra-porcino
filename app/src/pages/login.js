// Accesso con nickname + PIN (docs/01-SPECIFICHE.md §5.2): serve se si cambia telefono o browser,
// se si sono cancellati i dati, o se la sessione è scaduta. PIN dimenticato: lo reimposta lo staff.

import { html, escapeHtml } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { NetworkError, serverConfigured } from '../lib/api.js';
import { currentPlayer, login } from '../lib/account.js';
import { authErrorMessage, OFFLINE_MESSAGE, NOT_CONFIGURED_MESSAGE, takeAfterLogin } from './auth-messages.js';

export function renderLogin() {
  const player = currentPlayer();
  const element = html(`
    <main class="page auth-page">
      ${topBarMarkup()}
      <h1 class="page-title">Accedi</h1>
      ${
        player
          ? `<p>Sei già dentro come <strong>${escapeHtml(player.nickname)}</strong>.</p><a class="button" href="#/profilo">Vai al tuo profilo</a>`
          : `
      <form class="auth-form" novalidate>
        <label class="form-field">
          <span class="form-field__label">Nickname</span>
          <input class="form-field__input" name="nickname" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="16" required>
        </label>
        <label class="form-field">
          <span class="form-field__label">PIN (4 cifre)</span>
          <input class="form-field__input form-field__input--pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="current-password" required>
        </label>
        <div class="form-error" role="alert" hidden></div>
        <button type="submit" class="button button--play">ENTRA</button>
        <p class="form-note">🔑 <strong>PIN dimenticato?</strong> Vai allo stand della sagra: lo staff te lo reimposta.</p>
        <p class="form-alt">Non hai un account? <a href="#/registrati">Registrati</a></p>
      </form>`
      }
    </main>
  `);
  bindTopBar(element);

  const form = element.querySelector('.auth-form');
  if (form) {
    const errorBox = element.querySelector('.form-error');
    const submit = form.querySelector('[type="submit"]');
    const showError = (message) => {
      errorBox.textContent = message;
      errorBox.hidden = false;
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.hidden = true;
      const nickname = form.elements.nickname.value.trim();
      const pin = form.elements.pin.value;
      if (!nickname || !/^[0-9]{4}$/.test(pin)) return showError('Scrivi il tuo nickname e il PIN di 4 cifre.');
      if (!serverConfigured) return showError(NOT_CONFIGURED_MESSAGE);

      submit.disabled = true;
      submit.textContent = 'Un attimo…';
      try {
        const result = await login({ nickname, pin });
        if (result.ok) {
          location.replace(`#${takeAfterLogin()}`);
          return;
        }
        showError(authErrorMessage(result));
        form.elements.pin.value = '';
      } catch (error) {
        showError(error instanceof NetworkError ? OFFLINE_MESSAGE : authErrorMessage({}));
      }
      submit.disabled = false;
      submit.textContent = 'ENTRA';
    });
  }

  return { title: 'Accedi', element };
}
