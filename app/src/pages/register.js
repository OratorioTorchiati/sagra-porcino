// Registrazione, tutta in una schermata (docs/01-SPECIFICHE.md §5.1):
// personaggio (uno a caso già scelto) → nickname (controllo mentre si scrive) → PIN due volte →
// due caselle obbligatorie → INIZIA A GIOCARE. Il selfie arriverà solo se attivato (Tappa 9).

import { html, escapeHtml, openDialog, closeDialog } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { CHARACTERS } from '../characters/characters.js';
import { NetworkError, serverConfigured } from '../lib/api.js';
import { currentPlayer, register, checkNickname } from '../lib/account.js';
import { authErrorMessage, OFFLINE_MESSAGE, NOT_CONFIGURED_MESSAGE, takeAfterLogin } from './auth-messages.js';
import { privacyContentMarkup } from './privacy.js';

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

  let selected = Math.floor(Math.random() * CHARACTERS.length); // uno a caso, già scelto
  let checkTimer = null;
  let checkSeq = 0;

  const element = html(`
    <main class="page auth-page">
      ${topBarMarkup()}
      <h1 class="page-title">Crea il tuo account</h1>
      <p class="attempt-notice attempt-notice--warning">⚠️ <strong>ATTENZIONE!</strong> Puoi creare un solo account per telefono</p>
      <form class="auth-form" novalidate>
        <div class="form-section" role="group" aria-labelledby="sezione-1">
          <h2 class="form-section__title" id="sezione-1">1. Scegli il tuo personaggio</h2>
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
          </div>
        </div>

        <div class="form-section" role="group" aria-labelledby="sezione-2">
          <h2 class="form-section__title" id="sezione-2">2. Scegli un nickname</h2>
          <label class="form-field">
            <span class="form-field__label">Nickname</span>
            <input class="form-field__input" name="nickname" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="16" required>
            <span class="form-field__hint">Da 3 a 16 caratteri: lettere, numeri e _</span>
            <span class="form-field__status" aria-live="polite"></span>
          </label>
        </div>

        <div class="form-section" role="group" aria-labelledby="sezione-3">
          <h2 class="form-section__title" id="sezione-3">3. Scegli un PIN di 4 cifre</h2>
          <label class="form-field">
            <span class="form-field__label">PIN</span>
            <input class="form-field__input form-field__input--pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" required>
          </label>
          <label class="form-field">
            <span class="form-field__label">Ripeti il PIN</span>
            <input class="form-field__input form-field__input--pin" name="pin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" required>
          </label>
          <p class="form-note">🔑 <strong>Ricordalo:</strong> ti serve per ritirare il premio.</p>
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
  const picker = element.querySelector('.char-picker');
  const gridItems = [...element.querySelectorAll('.char-grid__item')];
  const nickInput = form.elements.nickname;
  const nickStatus = element.querySelector('.form-field__status');
  const errorBox = element.querySelector('.form-error');
  const submit = form.querySelector('[type="submit"]');

  function showCharacter() {
    const c = CHARACTERS[selected];
    picker.querySelector('.char-picker__image').innerHTML = c.svg;
    picker.querySelector('.char-picker__name').textContent = c.name;
    gridItems.forEach((item, i) => {
      item.classList.toggle('is-selected', i === selected);
      item.setAttribute('aria-checked', String(i === selected));
    });
  }
  showCharacter();

  picker.addEventListener('click', (event) => {
    const step = Number(event.target.closest('[data-step]')?.dataset.step);
    if (!step) return;
    selected = (selected + step + CHARACTERS.length) % CHARACTERS.length;
    showCharacter();
  });
  element.querySelector('.char-grid').addEventListener('click', (event) => {
    const item = event.target.closest('.char-grid__item');
    if (!item) return;
    selected = Number(item.dataset.index);
    showCharacter();
  });

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
    if (!/^[0-9]{4}$/.test(pin)) problems.push('Il PIN deve avere 4 cifre.');
    else if (pin !== form.elements.pin2.value) problems.push('I due PIN non sono uguali.');
    if (!form.elements.privacy.checked) problems.push('Spunta la casella dell\'informativa privacy.');
    if (!form.elements.age.checked) problems.push('Spunta la casella dell\'età.');
    if (problems.length) return showError(problems.join(' '));
    if (!serverConfigured) return showError(NOT_CONFIGURED_MESSAGE);

    submit.disabled = true;
    submit.textContent = 'Un attimo…';
    try {
      const result = await register({ nickname, avatar: CHARACTERS[selected].id, pin });
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
