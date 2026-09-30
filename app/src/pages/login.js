// Accesso con nickname + PIN (docs/01-SPECIFICHE.md §5.2): serve se si cambia telefono o browser,
// se si sono cancellati i dati, o se la sessione è scaduta. PIN dimenticato: lo reimposta lo staff,
// dopo aver controllato il codice del telefono (deve essere quello con cui è stato creato l'account, D56).

import { html, escapeHtml, openDialog, closeDialog } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { NetworkError, serverConfigured } from '../lib/api.js';
import { currentPlayer, login } from '../lib/account.js';
import { authErrorMessage, OFFLINE_MESSAGE, NOT_CONFIGURED_MESSAGE, takeAfterLogin } from './auth-messages.js';
import { LOGIN_PIN_RE } from '../lib/pin.js';
import { fillDeviceCode } from '../components/device-code.js';

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
        <label class="form-field form-field--nick">
          <span class="form-field__label">Nickname</span>
          <input class="form-field__input" name="nickname" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="16" required>
        </label>
        <label class="form-field form-field--pin">
          <span class="form-field__label">PIN</span>
          <input class="form-field__input form-field__input--pin" name="pin" placeholder="–––––" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="current-password" required>
        </label>
        <div class="form-error" role="alert" hidden></div>
        <button type="submit" class="button button--play">ENTRA</button>
        <button type="button" class="button button--secondary" data-action="forgot">🔑 Ho dimenticato il PIN</button>
        <p class="form-alt">Non hai un account? <a href="#/registrati">Registrati</a></p>
      </form>

      <!-- PIN dimenticato: nickname → riquadro da mostrare allo staff (D56) -->
      <dialog class="dialog forgot-dialog" aria-labelledby="forgot-title">
        <div data-step="nickname">
          <h2 class="dialog__title" id="forgot-title">PIN dimenticato</h2>
          <label class="form-field form-field--nick">
            <span class="form-field__label">Scrivi il tuo nickname</span>
            <input class="form-field__input" name="forgot-nickname" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="16">
          </label>
          <div class="form-error" role="alert" hidden></div>
          <div class="dialog__actions">
            <button type="button" class="button" data-action="forgot-show">Avanti</button>
            <button type="button" class="button button--secondary" data-action="forgot-close">Annulla</button>
          </div>
        </div>
        <div data-step="card" hidden>
          <div class="staff-card">
            <p class="staff-card__title">Mostra questo allo staff</p>
            <p class="staff-card__nickname"></p>
            <p class="staff-card__label">Codice del telefono</p>
            <p class="device-code" data-device-code>…</p>
          </div>
          <p class="forgot-dialog__hint">Vai allo stand della sagra <strong>con questo telefono</strong> (quello con cui hai creato l'account): lo staff controllerà il codice e ti darà un nuovo PIN.</p>
          <button type="button" class="button" data-action="forgot-close">Chiudi</button>
        </div>
      </dialog>`
      }
    </main>
  `);
  bindTopBar(element);
  fillDeviceCode(element);

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
      if (!nickname || !LOGIN_PIN_RE.test(pin)) return showError('Scrivi il tuo nickname e il tuo PIN.');
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

    // PIN dimenticato: si scrive il nickname e compare il riquadro "Mostra questo allo staff"
    const dialog = element.querySelector('.forgot-dialog');
    const stepNickname = dialog.querySelector('[data-step="nickname"]');
    const stepCard = dialog.querySelector('[data-step="card"]');
    const forgotInput = dialog.querySelector('[name="forgot-nickname"]');
    const forgotError = dialog.querySelector('.form-error');

    element.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'forgot') {
        forgotInput.value = form.elements.nickname.value.trim();
        forgotError.hidden = true;
        stepNickname.hidden = false;
        stepCard.hidden = true;
        openDialog(dialog);
      } else if (action === 'forgot-show') {
        const nickname = forgotInput.value.trim();
        if (!/^[A-Za-z0-9_]{3,16}$/.test(nickname)) {
          forgotError.textContent = 'Scrivi il tuo nickname (da 3 a 16 caratteri: lettere, numeri e _).';
          forgotError.hidden = false;
          return;
        }
        dialog.querySelector('.staff-card__nickname').textContent = nickname;
        stepNickname.hidden = true;
        stepCard.hidden = false;
      } else if (action === 'forgot-close') {
        closeDialog(dialog);
      }
    });
    forgotInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') dialog.querySelector('[data-action="forgot-show"]').click();
    });
  }

  return { title: 'Accedi', element };
}
