// Pagina Feedback (#/feedback, D108): voto da 1 a 5 stelle e testo facoltativo. Con l'account, oppure anche senza se
// l'Admin ha abilitato i feedback anonimi. Sotto il modulo (o sotto l'avviso di accedere) le 3 recensioni migliori,
// come nuvolette di una chat. Uno al giorno: dopo l'invio la propria recensione scende tra le nuvolette; rientrando
// si vedono solo le 3 migliori e il grazie al posto del modulo (D111). Mod e Admin non ne lasciano: qui vedono un
// avviso e le 3 migliori; la moderazione è nel Pannello Admin → 💬 Feedback (D110, D113).

import { html, escapeHtml } from '../lib/dom.js';
import { rpc, NetworkError } from '../lib/api.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { currentPlayer, sessionToken, isStaffRole, roleLabel } from '../lib/account.js';
import { feedbackAnonymous, refreshAppConfig } from '../lib/app-config.js';
import { avatarSvg } from '../components/player-card.js';
import { setAfterLogin } from './auth-messages.js';

/** Lunghezza massima del commento (D109): 4–5 frasi bastano; il server accetta fino a 1000 */
const MAX_TEXT = 500;

const ERRORS = {
  LOGIN_REQUIRED: 'Per lasciare un feedback serve un account.',
  STARS_INVALID: 'Scegli da 1 a 5 stelle.',
  TEXT_TOO_LONG: `Il testo è troppo lungo (al massimo ${MAX_TEXT} caratteri).`,
  TOO_MANY: 'Oggi hai già lasciato il tuo feedback: potrai scriverne un altro domani.',
  SECTION_OFF: 'I feedback in questo momento non sono disponibili.',
  STAFF_NOT_ALLOWED: 'Mod e Admin non possono lasciare recensioni.',
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
      <fieldset class="feedback-stars">
        <legend class="visually-hidden">Il tuo voto, da 1 a 5 stelle</legend>
        ${[5, 4, 3, 2, 1] // al contrario: sullo schermo (row-reverse) da 1 a 5, e "~" accende quelle prima
          .map(
            (n) => `<label class="feedback-stars__star"><input type="radio" name="stars" value="${n}">
              <span aria-hidden="true">★</span><span class="visually-hidden">${n} ${n === 1 ? 'stella' : 'stelle'}</span></label>`,
          )
          .join('')}
      </fieldset>
      <label class="form-field">
        <span class="form-field__label">Commento <span class="feedback-form__optional">(facoltativo)</span>
          <span class="feedback-form__count" id="feedback-count" aria-live="polite">0/${MAX_TEXT}</span></span>
        <textarea class="form-field__input feedback-form__text" name="text" rows="5" maxlength="${MAX_TEXT}"
          placeholder="Il piatto più buono, cosa ti ha stupito, cosa cambieresti…" aria-describedby="feedback-count"></textarea>
      </label>
      <div class="form-error" role="alert" hidden></div>
      <button type="submit" class="button">Invia</button>
    </form>`;
}

/** Una nuvoletta: avatar in basso a sinistra, nickname e stelle in alto, testo sotto. `mine` = la propria appena scritta */
const bubbleMarkup = (r, mine = false) => `
  <li class="feedback-bubble${mine ? ' feedback-bubble--mine' : ''}">
    <span class="feedback-bubble__avatar" aria-hidden="true">${avatarSvg(r.avatar)}</span>
    <div class="feedback-bubble__body">
      <p class="feedback-bubble__head">
        <span class="feedback-bubble__name">${r.nickname ? escapeHtml(r.nickname) : 'Anonimo'}${mine ? ' <span class="me-tag">Tu</span>' : ''}</span>
        <span class="feedback-bubble__stars" aria-label="${r.stars} stelle su 5">${starsText(r.stars)}</span>
      </p>
      ${r.text ? `<p class="feedback-bubble__text">${escapeHtml(r.text)}</p>` : ''}
    </div>
  </li>`;

/** Le 3 recensioni migliori, come nuvolette di una chat */
const bubblesMarkup = (reviews) => `
  <h2 class="feedback-chat__title">Cosa dicono gli altri</h2>
  <ul class="feedback-chat">${reviews.map((r) => bubbleMarkup(r)).join('')}</ul>`;

const doneTodayMarkup = `
  <div class="notice feedback-thanks">
    <p class="notice__title">Grazie del tuo feedback! 🙏</p>
    <p>Oggi l'hai già lasciato: potrai scriverne un altro domani.</p>
  </div>`;

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
  let destroyed = false;

  function render() {
    const player = currentPlayer();
    if (isStaffRole(player?.role)) {
      // Mod e Admin non lasciano recensioni (D110): l'avviso e, sotto, le nuvolette come le vede un giocatore
      body.innerHTML = `
        <div class="notice">
          <p class="notice__title">Sei dentro come ${roleLabel(player.role)}</p>
          <p>Lo staff non può lasciare recensioni. I feedback dei giocatori sono nel Pannello Admin → 💬 Feedback.</p>
        </div>`;
    } else if (!player && !feedbackAnonymous()) {
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

  /** La propria recensione scende tra le altre nuvolette (D111): il modulo si chiude, la nuvoletta arriva con un rimbalzo */
  async function showMine(review) {
    const form = body.querySelector('.feedback-form');
    await form
      ?.animate(
        [
          { opacity: 1, transform: 'translateY(0) scale(1)' },
          { opacity: 0, transform: 'translateY(60px) scale(0.92)' },
        ],
        { duration: 320, easing: 'ease-in' },
      )
      .finished.catch(() => {});
    if (destroyed) return;
    body.innerHTML = doneTodayMarkup;
    let list = highlights.querySelector('.feedback-chat');
    if (!list) {
      highlights.innerHTML = bubblesMarkup([]);
      list = highlights.querySelector('.feedback-chat');
    }
    list.insertAdjacentHTML('beforeend', bubbleMarkup(review, true));
    const mine = list.lastElementChild;
    mine.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function bindForm() {
    const form = body.querySelector('.feedback-form');
    const error = form.querySelector('.form-error');
    // Caratteri scritti / massimo, accanto all'etichetta
    const count = form.querySelector('.feedback-form__count');
    form.text.addEventListener('input', () => {
      count.textContent = `${form.text.value.length}/${MAX_TEXT}`;
      count.classList.toggle('is-full', form.text.value.length >= MAX_TEXT);
    });
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
        const text = form.text.value.trim();
        const res = await rpc('submit_feedback', { p_token: sessionToken(), p_stars: stars, p_text: text });
        if (!res.ok) {
          if (res.error === 'LOGIN_REQUIRED') refreshAppConfig(); // l'Admin ha appena tolto i feedback anonimi
          if (res.error === 'TOO_MANY') return (body.innerHTML = doneTodayMarkup);
          return showError(ERRORS[res.error] ?? 'Qualcosa non ha funzionato. Riprova tra poco.');
        }
        const player = currentPlayer();
        showMine({ nickname: player?.nickname ?? null, avatar: player?.avatar ?? null, stars, text });
      } catch (err) {
        showError(err instanceof NetworkError ? 'Serve la connessione per inviare il feedback.' : 'Qualcosa non ha funzionato. Riprova tra poco.');
      } finally {
        button.disabled = false;
      }
    });
  }

  /** Le 3 migliori e se oggi si può ancora scrivere (se no, al posto del modulo il grazie) */
  async function loadPage() {
    try {
      const res = await rpc('get_feedback_page', { p_token: sessionToken() });
      if (destroyed || !res.ok) return;
      highlights.innerHTML = res.reviews.length ? bubblesMarkup(res.reviews) : '';
      if (res.can_submit === false && body.querySelector('.feedback-form')) body.innerHTML = doneTodayMarkup;
    } catch {
      // senza rete niente nuvolette: non è indispensabile
    }
  }

  render();
  loadPage();
  return { title: 'Feedback', element, destroy: () => (destroyed = true) };
}
