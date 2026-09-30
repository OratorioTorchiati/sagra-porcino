// ⚙️ Configurazioni del pannello, solo per l'Admin (D93, D94). Una scheda per ogni sezione dell'app: interruttore
// accanto al titolo; spenta, la scheda si chiude e resta solo il titolo; accesa, si riapre con le sue impostazioni
// (Minigiochi: giochi con ⚙️ e interruttore, tentativi, reset, apertura e chiusura). In fondo le sezioni che
// arriveranno. Un solo bottone Salva per tutto.

import { escapeHtml } from '../lib/dom.js';
import { GAMES } from '../games/registry.js';
import { isoToRomeLocal, romeLocalToIso } from '../lib/staff.js';
import { SECTIONS, FUTURE_SECTIONS, refreshAppConfig } from '../lib/app-config.js';
import { staffCall, askDialog, formatDate } from './staff-ui.js';

const gameName = (id) => GAMES[id]?.name ?? id;

/** Interruttore acceso/spento: casella di spunta vera con l'aspetto di un interruttore (senza scritta accanto) */
const switchMarkup = (name, on, ariaLabel) => `
  <label class="switch" aria-label="${ariaLabel}">
    <input type="checkbox" name="${name}" ${on ? 'checked' : ''}>
    <span class="switch__track" aria-hidden="true"></span>
  </label>`;

// ---------- Apertura e chiusura dei giochi ----------
// Interruttore verde = APERTO (nessuna data). Toccandolo si sceglie giorno e ora in una finestra e diventa CHIUSO;
// toccandolo di nuovo si toglie la data e torna APERTO.

const SCHEDULES = {
  games_open_from: {
    title: 'Apertura giochi',
    ask: 'Da quando si può giocare?',
    info: (iso) => (new Date(iso) <= new Date() ? `Aperti dal ${formatDate(iso)}` : `Aprono ${formatDate(iso)}`),
  },
  games_open_until: {
    title: 'Chiusura giochi',
    ask: 'Quando chiudono i giochi e la classifica?',
    info: (iso) => (new Date(iso) <= new Date() ? `Chiusi dal ${formatDate(iso)} (Classifica finale)` : `Chiudono ${formatDate(iso)}`),
  },
};

const scheduleMarkup = (key, iso) => `
  <div class="config-row" data-schedule="${key}">
    <span class="config-row__label">${SCHEDULES[key].title}</span>
    <span class="config-row__state">${iso ? 'CHIUSO' : 'APERTO'}</span>
    ${switchMarkup(`schedule_${key}`, !iso, SCHEDULES[key].title)}
  </div>
  ${iso ? `<button type="button" class="config-row__info" data-edit="${key}">${SCHEDULES[key].info(iso)} ✏️</button>` : ''}`;

function gamesBody(res) {
  return `
    <div class="config-group" role="group" aria-labelledby="config-games-title">
      <p class="config-group__title" id="config-games-title">Giochi</p>
      ${res.games
        .map(
          (g) => `
          <div class="config-row">
            <span class="config-row__label">${escapeHtml(gameName(g.id))}</span>
            <button type="button" class="icon-button" data-game-settings="${g.id}" aria-label="Impostazioni di ${escapeHtml(gameName(g.id))}" title="Impostazioni">⚙️</button>
            ${switchMarkup(`game_${g.id}`, g.enabled, escapeHtml(gameName(g.id)))}
          </div>`,
        )
        .join('')}
    </div>
    <div class="config-group">
      <label class="config-row">
        <span class="config-row__label">Tentativi</span>
        <input class="form-field__input config-row__number" name="attempts_per_day" type="number" min="1" max="50" value="${res.attempts_per_day}" aria-label="Tentativi al giorno per gioco">
      </label>
      <label class="config-row">
        <span class="config-row__label">Reset tentativi</span>
        <input class="form-field__input config-row__number" name="attempts_reset_hour" type="number" min="0" max="23" value="${res.attempts_reset_hour}" aria-label="Ora in cui tornano i tentativi (0–23)">
      </label>
    </div>
    <div class="config-group">
      <p class="config-group__title">Orari</p>
      <div class="config-schedules"></div>
    </div>`;
}

const menuBody = () => `
  <p class="staff-muted">📤 Caricamento di un nuovo menù (file Excel/CSV, con anteprima): in arrivo.</p>`;

const BODIES = { giochi: gamesBody, menu: menuBody };

export async function renderConfigSection(root, ctx) {
  root.innerHTML = '<div class="form-error" role="alert" hidden></div><div class="staff-config"><p class="leaderboard-note">Caricamento…</p></div>';
  const error = root.querySelector('.form-error');
  const res = await staffCall(ctx, 'get_settings', {}, error);
  if (!res) return;
  const schedule = { games_open_from: res.games_open_from, games_open_until: res.games_open_until };

  const box = root.querySelector('.staff-config');
  box.innerHTML = `
    <form class="config-form" novalidate>
      ${SECTIONS.map(
        (s) => `
        <section class="config-card" data-card="${s.id}">
          <div class="config-card__head">
            <h3 class="config-card__title">${s.icon} ${s.label}</h3>
            ${switchMarkup(`section_${s.id}`, res.sections?.[s.id] !== false, `${s.label}: visibile nell'app`)}
          </div>
          <div class="config-card__fold"><div class="config-card__body">${BODIES[s.id]?.(res) ?? ''}</div></div>
        </section>`,
      ).join('')}
      <section class="config-card config-card--future">
        <h3 class="config-card__title">In arrivo</h3>
        <ul class="config-future">${FUTURE_SECTIONS.map((s) => `<li>${s.icon} ${s.label}</li>`).join('')}</ul>
      </section>
      <div class="config-save">
        <button type="submit" class="button">Salva</button>
        <p class="staff-ok" role="status" hidden></p>
      </div>
    </form>`;
  const form = box.querySelector('form');
  const schedulesBox = form.querySelector('.config-schedules');
  const renderSchedules = () => {
    schedulesBox.innerHTML = Object.keys(SCHEDULES).map((key) => scheduleMarkup(key, schedule[key])).join('');
  };
  renderSchedules();

  // Scheda spenta: si chiude (resta il titolo); accesa: si riapre
  const syncCards = () => {
    for (const card of form.querySelectorAll('.config-card[data-card]')) {
      card.classList.toggle('is-off', !form[`section_${card.dataset.card}`].checked);
    }
  };
  syncCards();

  async function askDate(key) {
    const values = await askDialog({
      title: SCHEDULES[key].title,
      body: `<label class="form-field"><span class="form-field__label">${SCHEDULES[key].ask}</span>
        <input class="form-field__input" name="when" type="datetime-local" value="${isoToRomeLocal(schedule[key])}"></label>`,
      confirmLabel: 'Conferma',
      validate: (v) => (v.when ? null : 'Scegli giorno e ora.'),
    });
    if (values) schedule[key] = romeLocalToIso(values.when);
    renderSchedules();
  }

  form.addEventListener('change', (event) => {
    const name = event.target.name ?? '';
    if (name.startsWith('section_')) return syncCards();
    if (name.startsWith('schedule_')) {
      const key = name.slice('schedule_'.length);
      if (event.target.checked) {
        schedule[key] = null; // di nuovo APERTO: nessuna data
        renderSchedules();
      } else {
        askDate(key); // CHIUSO: si sceglie quando (Annulla = resta com'era)
      }
    }
  });

  form.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit]')?.dataset.edit;
    if (edit) return askDate(edit);
    const game = event.target.closest('[data-game-settings]')?.dataset.gameSettings;
    if (game) {
      await askDialog({
        title: `⚙️ ${escapeHtml(gameName(game))}`,
        body: '<p>Le impostazioni di questo gioco arriveranno presto.</p>',
        confirmLabel: 'Chiudi',
        infoOnly: true,
      });
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = {
      sections: Object.fromEntries(SECTIONS.map((s) => [s.id, form[`section_${s.id}`].checked])),
      attempts_per_day: Number(form.attempts_per_day.value),
      attempts_reset_hour: Number(form.attempts_reset_hour.value),
      games_open_from: schedule.games_open_from,
      games_open_until: schedule.games_open_until,
      games: Object.fromEntries(res.games.map((g) => [g.id, form[`game_${g.id}`].checked])),
    };
    const off = SECTIONS.filter((s) => !values.sections[s.id]).map((s) => s.label);
    const confirmed = await askDialog({
      title: 'Salvare le configurazioni?',
      body: `<p>Valgono subito per tutti.</p>${off.length ? `<p>Sezioni spente (spariscono dalla home): <strong>${off.join(', ')}</strong>.</p>` : ''}`,
      confirmLabel: 'Salva',
    });
    if (!confirmed) return;
    if (await staffCall(ctx, 'update_settings', { p_values: values }, error)) {
      refreshAppConfig(); // anche la home di questo telefono si aggiorna
      renderConfigSection(root, ctx).then(() => {
        const saved = root.querySelector('.staff-ok');
        if (saved) {
          saved.textContent = '✅ Configurazioni salvate.';
          saved.hidden = false;
        }
      });
    }
  });
}
