// Pannello → 💬 Feedback (Mod e Admin, D108, D113): moderazione dei feedback. I feedback dei giocatori a pagine da 20,
// i più recenti prima, con filtri
// per nickname, giorno e stelle e la media dei voti. Ogni feedback: nickname con le stelle a destra, data e ora, testo
// con 🗑️ a destra per cancellare un feedback volgare (con conferma; finisce nel registro). In cima Attivi / Rimossi:
// i rimossi restano nel database e si rivedono qui, con chi li ha rimossi e quando (D115).

import { escapeHtml } from '../lib/dom.js';
import { avatarSvg } from '../components/player-card.js';
import { staffCall, askDialog, formatDate, pagerMarkup, flashOk } from './staff-ui.js';

const starsText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

const entryMarkup = (f) => `
  <li class="staff-feedback__item">
    <p class="staff-feedback__who">
      <span class="staff-feedback__avatar" aria-hidden="true">${avatarSvg(f.avatar)}</span>
      <strong>${f.nickname ? escapeHtml(f.nickname) : 'Anonimo'}</strong>
      <span class="staff-feedback__stars" aria-label="${f.stars} stelle su 5">${starsText(f.stars)}</span>
    </p>
    <p class="staff-feedback__date">${formatDate(f.created_at)}</p>
    <div class="staff-feedback__row">
      ${f.text ? `<p class="staff-feedback__text">${escapeHtml(f.text)}</p>` : '<p class="staff-feedback__text staff-muted">(nessun testo)</p>'}
      ${
        f.deleted_at
          ? ''
          : `<button type="button" class="icon-button icon-button--danger" data-delete="${f.id}" data-who="${escapeHtml(f.nickname ?? 'Anonimo')}"
        aria-label="Cancella il feedback" title="Cancella">🗑️</button>`
      }
    </div>
    ${f.deleted_at ? `<p class="staff-feedback__removed">🗑️ Rimosso da <strong>${escapeHtml(f.deleted_by ?? 'staff')}</strong> · ${formatDate(f.deleted_at)}</p>` : ''}
  </li>`;

export function renderFeedbackSection(root, ctx) {
  root.innerHTML = `
    <div class="review-switch" role="tablist" aria-label="Feedback attivi o rimossi">
      <button type="button" role="tab" class="review-switch__option is-active" aria-selected="true" data-removed="false">Attivi</button>
      <button type="button" role="tab" class="review-switch__option" aria-selected="false" data-removed="true">Rimossi</button>
    </div>
    <form class="staff-filters" role="search" novalidate>
      <label class="staff-filters__field staff-filters__field--wide"><span>Nickname</span>
        <input class="form-field__input" name="nickname" autocapitalize="off" spellcheck="false" placeholder="Tutti"></label>
      <label class="staff-filters__field"><span>Giorno</span><input class="form-field__input" type="date" name="day"></label>
      <label class="staff-filters__field"><span>Stelle</span><select class="form-field__input" name="stars">
        <option value="">Tutte</option>
        ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${'★'.repeat(n)}</option>`).join('')}
      </select></label>
      <button type="submit" class="button">Cerca</button>
    </form>
    <div class="form-error" role="alert" hidden></div>
    <p class="staff-ok" role="status" hidden></p>
    <div class="staff-results"><p class="leaderboard-note">Caricamento…</p></div>`;
  const form = root.querySelector('.staff-filters');
  const error = root.querySelector('.form-error');
  const ok = root.querySelector('.staff-ok');
  const list = root.querySelector('.staff-results');
  const switchEl = root.querySelector('.review-switch');
  let page = 0;
  let removed = false; // Attivi (false) o Rimossi (true)

  async function load(p = page) {
    const res = await staffCall(
      ctx,
      'feedback_list',
      { p_page: p, p_nickname: form.nickname.value.trim() || null, p_day: form.day.value || null, p_stars: form.stars.value ? Number(form.stars.value) : null, p_removed: removed },
      error,
    );
    if (!res) return;
    page = res.page;
    list.innerHTML = res.entries.length
      ? `<p class="staff-muted">${res.total} feedback · media <strong>${String(res.average).replace('.', ',')} ★</strong></p>
         <ul class="staff-feedback">${res.entries.map(entryMarkup).join('')}</ul>${pagerMarkup(res.page, res.total, res.page_size)}`
      : `<p class="leaderboard-note">${removed ? 'Nessun feedback rimosso' : 'Nessun feedback'} con questi filtri.</p>`;
  }

  switchEl.addEventListener('click', (event) => {
    const option = event.target.closest('[data-removed]');
    if (!option) return;
    removed = option.dataset.removed === 'true';
    switchEl.querySelectorAll('[data-removed]').forEach((b) => {
      b.classList.toggle('is-active', b === option);
      b.setAttribute('aria-selected', String(b === option));
    });
    load(0);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    load(0);
  });
  list.addEventListener('click', async (event) => {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) {
      await load(Number(pageButton.dataset.page));
      form.scrollIntoView({ block: 'start' });
      return;
    }
    const del = event.target.closest('[data-delete]');
    if (!del) return;
    const confirmed = await askDialog({
      title: 'Cancellare il feedback?',
      body: `<p>Il feedback di <strong>${escapeHtml(del.dataset.who)}</strong> sparisce dalla pagina Feedback e va nei <strong>Rimossi</strong>. Chi l'ha scritto non potrà lasciarne un altro oggi.</p>`,
      confirmLabel: 'Cancella',
      danger: true,
    });
    if (!confirmed) return;
    if (await staffCall(ctx, 'feedback_delete', { p_id: Number(del.dataset.delete) }, error)) {
      await load();
      flashOk(ok, '✅ Feedback rimosso (lo trovi nei Rimossi).');
    }
  });

  load(0);
}
