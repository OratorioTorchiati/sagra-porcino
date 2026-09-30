// ⚙️ Configurazioni del pannello, solo per l'Admin (D93). Una scheda per ogni sezione dell'app con l'interruttore
// "Visibile nell'app"; se è accesa, sotto ci sono le sue impostazioni (Minigiochi: giochi, tentativi, orari).
// In fondo le sezioni che arriveranno. Un solo bottone Salva per tutto.

import { escapeHtml } from '../lib/dom.js';
import { GAMES } from '../games/registry.js';
import { isoToRomeLocal, romeLocalToIso } from '../lib/staff.js';
import { SECTIONS, FUTURE_SECTIONS, refreshAppConfig } from '../lib/app-config.js';
import { staffCall, askDialog } from './staff-ui.js';

const gameName = (id) => GAMES[id]?.name ?? id;

/** Interruttore acceso/spento (una casella di spunta con l'aspetto di un interruttore) */
const switchMarkup = (name, on, label) => `
  <label class="switch">
    <input type="checkbox" name="${name}" ${on ? 'checked' : ''}>
    <span class="switch__track" aria-hidden="true"></span>
    <span class="switch__label">${label}</span>
  </label>`;

function gamesBody(res) {
  const windowText = { not_yet: 'non ancora aperti', open: 'aperti', closed: 'chiusi (Classifica finale)' }[res.window];
  return `
    <p>Adesso i giochi sono <strong>${windowText}</strong>.</p>
    <div class="config-group" role="group" aria-labelledby="config-games-title">
      <p class="config-group__title" id="config-games-title">Giochi</p>
      ${res.games.map((g) => switchMarkup(`game_${g.id}`, g.enabled, escapeHtml(gameName(g.id)))).join('')}
    </div>
    <div class="config-group">
      <p class="config-group__title">Tentativi</p>
      <label class="form-field"><span class="form-field__label">Tentativi al giorno per gioco</span>
        <input class="form-field__input" name="attempts_per_day" type="number" min="1" max="50" value="${res.attempts_per_day}"></label>
      <label class="form-field"><span class="form-field__label">Ora in cui tornano i tentativi (0–23)</span>
        <input class="form-field__input" name="attempts_reset_hour" type="number" min="0" max="23" value="${res.attempts_reset_hour}"></label>
    </div>
    <div class="config-group">
      <p class="config-group__title">Orari (ora italiana)</p>
      <label class="form-field"><span class="form-field__label">Apertura dei giochi (vuoto = già aperti)</span>
        <input class="form-field__input" name="games_open_from" type="datetime-local" value="${isoToRomeLocal(res.games_open_from)}"></label>
      <label class="form-field"><span class="form-field__label">Chiusura dei giochi e della classifica (vuoto = mai)</span>
        <input class="form-field__input" name="games_open_until" type="datetime-local" value="${isoToRomeLocal(res.games_open_until)}"></label>
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
  const box = root.querySelector('.staff-config');
  box.innerHTML = `
    <form class="config-form" novalidate>
      <p class="staff-muted">Accendi o spegni le sezioni dell'app e configurale. Le sezioni spente spariscono dalla home.</p>
      ${SECTIONS.map(
        (s) => `
        <section class="config-card" data-section="${s.id}">
          <h3 class="config-card__title">${s.icon} ${s.label}</h3>
          ${switchMarkup(`section_${s.id}`, res.sections?.[s.id] !== false, 'Visibile nell\'app')}
          <div class="config-card__body">${BODIES[s.id]?.(res) ?? ''}</div>
        </section>`,
      ).join('')}
      <section class="config-card config-card--future">
        <h3 class="config-card__title">In arrivo</h3>
        <ul class="config-future">${FUTURE_SECTIONS.map((s) => `<li>${s.icon} ${s.label}</li>`).join('')}</ul>
        <p class="staff-muted">Quando saranno pronte compariranno qui, ognuna con le sue impostazioni.</p>
      </section>
      <div class="config-save">
        <button type="submit" class="button">Salva</button>
        <p class="staff-ok" role="status" hidden></p>
      </div>
    </form>`;
  const form = box.querySelector('form');

  // Le impostazioni di una sezione si vedono solo se è accesa
  const syncBodies = () => {
    for (const card of form.querySelectorAll('.config-card[data-section]')) {
      card.querySelector('.config-card__body').hidden = !form[`section_${card.dataset.section}`].checked;
    }
  };
  form.addEventListener('change', syncBodies);
  syncBodies();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = {
      sections: Object.fromEntries(SECTIONS.map((s) => [s.id, form[`section_${s.id}`].checked])),
      attempts_per_day: Number(form.attempts_per_day.value),
      attempts_reset_hour: Number(form.attempts_reset_hour.value),
      games_open_from: romeLocalToIso(form.games_open_from.value),
      games_open_until: romeLocalToIso(form.games_open_until.value),
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
