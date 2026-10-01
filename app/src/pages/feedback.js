// Pagina Feedback (#/feedback, D108): voto da 1 a 5 stelle e testo facoltativo. Con l'account, oppure anche senza se
// l'Admin ha abilitato i feedback anonimi. Sotto (o sotto l'avviso di accedere) le 3 recensioni migliori, come
// nuvolette di una chat.

import { html, escapeHtml } from '../lib/dom.js';
import { rpc, NetworkError } from '../lib/api.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { currentPlayer, sessionToken } from '../lib/account.js';
import { feedbackAnonymous, refreshAppConfig } from '../lib/app-config.js';
import { avatarSvg } from '../components/player-card.js';
import { setAfterLogin } from './auth-messages.js';

const MAX_TEXT = 1000;

const ERRORS = {
  LOGIN_REQUIRED: 'Per lasciare un feedback serve un account.',
  STARS_INVALID: 'Scegli da 1 a 5 stelle.',
  TEXT_TOO_LONG: `Il testo è troppo lungo (al massimo ${MAX_TEXT} caratteri).`,
  TOO_MANY: 'Hai già lasciato 3 feedback oggi: grazie! Puoi scriverne altri domani.',
  SECTION_OFF: 'I feedback in questo momento non sono disponibili.',
};

const starsText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

const authChoices = `
  <div class="auth-choices">
    <a class="button button--play" href="#/registrati" data-after-login>Registrati</a>
    <a class="button button--secondary" href="#/accedi" data-after-login>Ho già un account</a>
  </div>`;

function formMarkup(anonymous) {
  return `
    ${
      anonymous
        ? `<p class="attempt-notice attempt-notice--info">👤 Stai lasciando un feedback <strong>anonimo</strong>.
            <a href="#/accedi" data-after-login>Accedi</a> se vuoi che si veda il tuo nickname.</p>`
        : ''
    }
    <form class="feedback-form" novalidate>
      <p class="feedback-form__intro">Com'è andata la sagra? Raccontaci cosa ti è piaciuto di più e cosa possiamo fare meglio.</p>
      <fieldset class="feedback-stars">
        <legend class="feedback-stars__legend">Il tuo voto</legend>
        ${[5, 4, 3, 2, 1] // al contrario: sullo schermo (row-reverse) da 1 a 5, e "~" accende quelle prima
          .map(
            (n) => `<label class="feedback-stars__star"><input type="radio" name="stars" value="${n}">
              <span aria-hidden="true">★</span><span class="visually-hidden">${n} ${n === 1 ? 'stella' : 'stelle'}</span></label>`,
          )
          .join('')}
      </fieldset>
      <label class="form-field">
        <span class="form-field__label">Il tuo commento <span class="feedback-form__optional">(facoltativo)</span></span>
        <textarea class="form-field__input feedback-form__text" name="text" rows="5" maxlength="${MAX_TEXT}"
          placeholder="Il piatto più buono, il gioco più divertente, cosa cambieresti…"></textarea>
      </label>
      <div class="form-error" role="alert" hidden></div>
      <button type="submit" class="button">Invia</button>
    </form>`;
}

/** Le 3 recensioni migliori, come nuvolette di una chat */
function bubblesMarkup(reviews) {
  if (!reviews.length) return '';
  return `
    <h2 class="feedback-chat__title">Cosa dicono gli altri</h2>
    <ul class="feedback-chat">
      ${reviews
        .map(
          (r) => `
        <li class="feedback-bubble">
          <span class="feedback-bubble__avatar" aria-hidden="true">${avatarSvg(r.avatar)}</span>
          <div class="feedback-bubble__body">
            <p class="feedback-bubble__head">
              <span class="feedback-bubble__name">${r.nickname ? escapeHtml(r.nickname) : 'Anonimo'}</span>
              <span class="feedback-bubble__stars" aria-label="${r.stars} stelle su 5">${starsText(r.stars)}</span>
            </p>
            <p class="feedback-bubble__text">${escapeHtml(r.text)}</p>
          </div>
        </li>`,
        )
        .join('')}
    </ul>`;
}

export function renderFeedback() {
  const element = html(`
    <main class="page feedback-page">
      ${topBarMarkup()}
      <h1 class="page-title">💬 Feedback</h1>
      <div class="feedback-body"></div>
      <div class="feedback-highlights"></div>
    </main>
  `);
  bindTopBar(element);
  const body = element.querySelector('.feedback-body');
  const highlights = element.querySelector('.feedback-highlights');

  function render() {
    const player = currentPlayer();
    if (!player && !feedbackAnonymous()) {
      // Solo con l'account: avviso, e le nuvolette sotto
      body.innerHTML = `
        <div class="notice">
          <p class="notice__title">Serve un account</p>
          <p>Puoi lasciare una recensione solo dopo aver fatto l'accesso. Ci vuole un minuto!</p>
        </div>
        ${authChoices}`;
    } else {
      body.innerHTML = formMarkup(!player);
      bindForm();
    }
    body.querySelectorAll('[data-after-login]').forEach((a) => a.addEventListener('click', () => setAfterLogin('/feedback')));
  }

  function bindForm() {
    const form = body.querySelector('.feedback-form');
    const error = form.querySelector('.form-error');
    const showError = (text) => {
      error.textContent = text;
      error.hidden = false;
    };
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.hidden = true;
      const stars = Number(form.querySelector('[name="stars"]:checked')?.value ?? 0);
      if (!stars) return showError('Scegli quante stelle dare, da 1 a 5.');
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const res = await rpc('submit_feedback', { p_token: sessionToken(), p_stars: stars, p_text: form.text.value });
        if (!res.ok) {
          if (res.error === 'LOGIN_REQUIRED') refreshAppConfig(); // l'Admin ha appena tolto i feedback anonimi
          return showError(ERRORS[res.error] ?? 'Qualcosa non ha funzionato. Riprova tra poco.');
        }
        body.innerHTML = `
          <div class="notice feedback-thanks">
            <p class="notice__title">Grazie! 🙏</p>
            <p>Il tuo feedback è arrivato agli organizzatori.</p>
          </div>`;
        window.scrollTo(0, 0);
        loadHighlights();
      } catch (err) {
        showError(err instanceof NetworkError ? 'Serve la connessione per inviare il feedback.' : 'Qualcosa non ha funzionato. Riprova tra poco.');
      } finally {
        button.disabled = false;
      }
    });
  }

  async function loadHighlights() {
    try {
      const res = await rpc('get_feedback_highlights', {});
      if (res.ok) highlights.innerHTML = bubblesMarkup(res.reviews);
    } catch {
      // senza rete niente nuvolette: non è indispensabile
    }
  }

  render();
  loadHighlights();
  return { title: 'Feedback', element };
}
