// Registrazione, tutta in una schermata (docs/01-SPECIFICHE.md §5.1):
// personaggio (uno a caso già scelto) → nickname (controllo mentre si scrive) → PIN due volte →
// due caselle obbligatorie → INIZIA A GIOCARE. Il selfie arriverà solo se attivato (Tappa 9).

import { html, escapeHtml, openDialog, closeDialog } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { charPickerMarkup, bindCharPicker } from '../components/char-picker.js';
import { NetworkError, serverConfigured } from '../lib/api.js';
import { currentPlayer, register, checkNickname } from '../lib/account.js';
import { authErrorMessage, OFFLINE_MESSAGE, NOT_CONFIGURED_MESSAGE, takeAfterLogin } from './auth-messages.js';
import { privacyContentMarkup } from './privacy.js';
import { PIN_LENGTH, pinProblem, PIN_TOO_SIMPLE_MESSAGE } from '../lib/pin.js';

const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;

function alreadyLoggedMarkup(player) {
  return `
    <main class="page">
      ${topBarMarkup()}
      <h1 class="page-title">Sei già dentro</h1>
      <p>Hai già un account: <strong>${escapeHtml(player.nickname)}</strong>.</p>
      <a class="button" href="#/profilo">Vai al tuo profilo</a>
    </main>
  `;
}

export function renderRegister() {
  const player = currentPlayer();
  if (player) {
    const element = html(alreadyLoggedMarkup(player));
    bindTopBar(element);
    return { title: 'Registrati', element };
  }

  let checkTimer = null;
  let checkSeq = 0;

  const element = html(`
    <main class="page auth-page">
      ${topBarMarkup()}
      <h1 class="page-title">Crea il tuo account</h1>
      <form class="auth-form" novalidate>
        <div class="form-section" role="group" aria-labelledby="sezione-1">
          <h2 class="form-section__title" id="sezione-1">1. Scegli il tuo personaggio</h2>
          ${charPickerMarkup()}
        </div>

        <div class="form-section" role="group" aria-labelledby="sezione-2">
          <h2 class="form-section__title" id="sezione-2">2. Scegli un nickname</h2>
          <label class="form-field form-field--nick">
            <span class="form-field__label">Nickname</span>
            <input class="form-field__input" name="nickname" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="16" required>
            <span class="form-field__hint">Da 3 a 16 caratteri: lettere, numeri e _</span>
            <span class="form-field__status" aria-live="polite"></span>
          </label>
        </div>

        <div class="form-section" role="group" aria-labelledby="sezione-3">
          <h2 class="form-section__title" id="sezione-3">3. Scegli un PIN di 5 cifre</h2>
          <label class="form-field form-field--pin">
            <span class="form-field__label">PIN</span>
            <input class="form-field__input form-field__input--pin" name="pin" placeholder="-----" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="new-password" required>
            <span class="form-field__status" data-pin-status aria-live="polite"></span>
          </label>
          <label class="form-field form-field--pin">
            <span class="form-field__label">Ripeti il PIN</span>
            <input class="form-field__input form-field__input--pin" name="pin2" placeholder="-----" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="new-password" required>
          </label>
          <p class="attempt-notice attempt-notice--warning">⚠️ <strong>ATTENZIONE!</strong> Puoi creare un solo account per telefono, tieni bene a mente il tuo PIN</p>
        </div>

        <label class="form-check">
          <input type="checkbox" name="privacy" required>
          <span>Ho letto l'<button type="button" class="link-button" data-action="privacy">informativa privacy</button></span>
        </label>
        <label class="form-check">
          <input type="checkbox" name="age" required>
          <span>Ho almeno 14 anni, oppure ho il permesso di un genitore</span>
        </label>

        <div class="form-error" role="alert" hidden></div>
        <button type="submit" class="button button--play">INIZIA A GIOCARE</button>
        <p class="form-alt">Hai già un account? <a href="#/accedi">Accedi</a></p>
      </form>

      <dialog class="dialog">
        <h2 class="dialog__title">Informativa privacy</h2>
        ${privacyContentMarkup()}
        <button type="button" class="button" data-action="privacy-close">Ho capito</button>
      </dialog>
    </main>
  `);
  bindTopBar(element);

  const form = element.querySelector('.auth-form');
  const charPicker = bindCharPicker(element); // uno a caso, già scelto
  const nickInput = form.elements.nickname;
  const nickStatus = element.querySelector('.form-field__status');
  const errorBox = element.querySelector('.form-error');
  const submit = form.querySelector('[type="submit"]');

  // Controllo del nickname mentre si scrive (solo informativo, non prenota niente)
  function setNickStatus(text, kind) {
    nickStatus.textContent = text;
    nickStatus.dataset.kind = kind ?? '';
  }
  nickInput.addEventListener('input', () => {
    clearTimeout(checkTimer);
    const nick = nickInput.value.trim();
    if (!nick) return setNickStatus('');
    if (!NICK_RE.test(nick)) return setNickStatus(nick.length < 3 ? 'Almeno 3 caratteri' : 'Solo lettere, numeri e _ (niente spazi)', 'bad');
    if (!serverConfigured) return setNickStatus('');
    setNickStatus('Controllo…');
    const seq = ++checkSeq;
    checkTimer = setTimeout(async () => {
      try {
        const result = await checkNickname(nick);
        if (seq !== checkSeq) return;
        if (result.ok) setNickStatus('✅ Disponibile', 'good');
        else setNickStatus(`❌ ${authErrorMessage(result)}`, 'bad');
      } catch {
        if (seq === checkSeq) setNickStatus('');
      }
    }, 400);
  });

  // PIN troppo semplice: lo si dice appena scritte le 5 cifre (D82)
  const pinStatus = element.querySelector('[data-pin-status]');
  form.elements.pin.addEventListener('input', () => {
    const pin = form.elements.pin.value;
    const tooSimple = pin.length === PIN_LENGTH && pinProblem(pin) === 'PIN_TOO_SIMPLE';
    pinStatus.textContent = tooSimple ? `❌ ${PIN_TOO_SIMPLE_MESSAGE}` : '';
    pinStatus.dataset.kind = tooSimple ? 'bad' : '';
  });

  element.querySelector('[data-action="privacy"]').addEventListener('click', () => openDialog(element.querySelector('dialog')));
  element.querySelector('[data-action="privacy-close"]').addEventListener('click', () => closeDialog(element.querySelector('dialog')));

  function showError(message, withLoginLink = false) {
    errorBox.innerHTML = `${escapeHtml(message)}${withLoginLink ? ' <a class="button button--secondary form-error__action" href="#/accedi">Accedi</a>' : ''}`;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const nickname = nickInput.value.trim();
    const pin = form.elements.pin.value;
    const problems = [];
    if (!NICK_RE.test(nickname)) problems.push('Il nickname deve avere da 3 a 16 caratteri: solo lettere, numeri e _.');
    const pinError = pinProblem(pin);
    if (pinError) problems.push(authErrorMessage({ error: pinError }));
    else if (pin !== form.elements.pin2.value) problems.push('I due PIN non sono uguali.');
    if (!form.elements.privacy.checked) problems.push('Spunta la casella dell\'informativa privacy.');
    if (!form.elements.age.checked) problems.push('Spunta la casella dell\'età.');
    if (problems.length) return showError(problems.join(' '));
    if (!serverConfigured) return showError(NOT_CONFIGURED_MESSAGE);

    submit.disabled = true;
    submit.textContent = 'Un attimo…';
    try {
      const result = await register({ nickname, avatar: charPicker.selectedId(), pin });
      if (result.ok) {
        location.replace(`#${takeAfterLogin()}`);
        return;
      }
      showError(authErrorMessage(result), result.error === 'DEVICE_ALREADY_USED');
    } catch (error) {
      showError(error instanceof NetworkError ? OFFLINE_MESSAGE : authErrorMessage({}));
    }
    submit.disabled = false;
    submit.textContent = 'INIZIA A GIOCARE';
  });

  return {
    title: 'Registrati',
    element,
    destroy() {
      clearTimeout(checkTimer);
    },
  };
}
