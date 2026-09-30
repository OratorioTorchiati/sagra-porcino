// ⚙️ Impostazioni di un singolo gioco (Configurazioni → Minigiochi → ⚙️, solo Admin, D99). Stesso schema delle
// altre schede: scheda con titolo, gruppi marcati, righe "nome a sinistra, controllo a destra", un solo Salva.
// - Giochi a tempo (Acchiappa, Porcini che cadono, Memory): durata della partita; difficoltà (in arrivo).
// - Giochi a domande (Quiz): secondi per domanda; ✏️ domande in tabella (testo, 4 risposte, giusta, attiva).

import { escapeHtml } from '../lib/dom.js';
import { GAMES } from '../games/registry.js';
import { isStepGame, formatDuration } from '../games/duration.js';
import { staffCall, askDialog, flashOk } from './staff-ui.js';

const QUESTIONS_PER_GAME = 5;

/** Messaggio di conferma sopra la schermata a cui si torna */
function showOk(root, text) {
  flashOk(root.querySelector('.staff-ok'), text);
}

/**
 * @param game  { id, duration_s } dal server
 * @param back  (message?) => torna alle Configurazioni (con un messaggio facoltativo)
 */
export async function openGameSettings(root, ctx, game, back) {
  const steps = isStepGame(game.id);
  const name = GAMES[game.id]?.name ?? game.id;
  const seconds = steps ? game.duration_s / QUESTIONS_PER_GAME : game.duration_s;
  root.innerHTML = `
    <div class="menu-edit">
      <button type="button" class="staff-link" data-gs="back">← Torna alle Configurazioni</button>
      <div class="form-error" role="alert" hidden></div>
      <form class="config-form" novalidate>
        <section class="config-card">
          <div class="config-card__head">
            <h3 class="config-card__title">⚙️ ${escapeHtml(name)}</h3>
            <span class="config-badge">${steps ? 'A domande' : 'A tempo'}</span>
          </div>
          <div class="config-card__body">
            <div class="config-group">
              <h4 class="config-group__title">Durata</h4>
              <label class="config-row">
                <span class="config-row__label">${steps ? 'Secondi per domanda' : 'Durata della partita'}
                  <span class="config-row__hint" data-gs="total"></span></span>
                <input class="form-field__input config-row__number" name="seconds" type="number" inputmode="numeric"
                  min="${steps ? 5 : 20}" max="${steps ? 60 : 600}" value="${seconds}" aria-label="${steps ? 'Secondi per domanda (5–60)' : 'Durata in secondi (20–600)'}">
                <span class="config-row__unit">s</span>
              </label>
            </div>
            ${
              steps
                ? `<div class="config-group">
                    <h4 class="config-group__title">Contenuto</h4>
                    <div class="config-row">
                      <span class="config-row__label">Domande
                        <span class="config-row__hint" data-gs="count">…</span></span>
                      <button type="button" class="icon-button" data-gs="questions" aria-label="Guarda e modifica le domande" title="Guarda e modifica">✏️</button>
                    </div>
                  </div>`
                : `<div class="config-group is-todo" aria-disabled="true">
                    <h4 class="config-group__title">Difficoltà</h4>
                    <div class="config-row">
                      <span class="config-row__label">Livello di difficoltà
                        <span class="config-row__hint">In arrivo</span></span>
                      <select class="form-field__input config-row__time" disabled><option>Normale</option></select>
                    </div>
                  </div>
                  <div class="config-group is-todo" aria-disabled="true">
                    <h4 class="config-group__title">Contenuto</h4>
                    <div class="config-row">
                      <span class="config-row__label">${game.id === 'memory' ? 'Immagini' : 'Personaggi e oggetti'}
                        <span class="config-row__hint">In arrivo</span></span>
                      <button type="button" class="icon-button" disabled aria-label="In arrivo">✏️</button>
                    </div>
                  </div>`
            }
          </div>
        </section>
        <div class="config-save">
          <button type="submit" class="button">Salva</button>
          <p class="staff-ok" role="status" hidden></p>
        </div>
      </form>
    </div>`;
  const view = root.querySelector('.menu-edit');
  const form = view.querySelector('form');
  const error = view.querySelector('.form-error');
  const total = view.querySelector('[data-gs="total"]');
  const range = steps ? [5, 60] : [20, 600];

  // "In tutto 1 minuto e 40 secondi" (quiz) / "1 minuto" (giochi a tempo)
  const showTotal = () => {
    const s = Number(form.seconds.value);
    total.textContent = Number.isInteger(s) && s >= range[0] && s <= range[1]
      ? steps ? `${QUESTIONS_PER_GAME} domande: in tutto ${formatDuration(s * QUESTIONS_PER_GAME)}` : formatDuration(s)
      : `Da ${range[0]} a ${range[1]} secondi`;
  };
  showTotal();
  form.seconds.addEventListener('input', showTotal);

  if (steps) {
    staffCall(ctx, 'quiz_list', {}, error).then((res) => {
      const count = view.querySelector('[data-gs="count"]');
      if (res && count) count.textContent = `${res.questions.filter((q) => q.active).length} attive su ${res.questions.length}`;
    });
  }

  view.addEventListener('click', (event) => {
    const action = event.target.closest('[data-gs]')?.dataset.gs;
    if (action === 'back') back();
    if (action === 'questions') openQuizEditor(root, ctx, () => openGameSettings(root, ctx, game, back));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const s = Number(form.seconds.value);
    if (!(Number.isInteger(s) && s >= range[0] && s <= range[1])) {
      error.textContent = `Scrivi un numero di secondi da ${range[0]} a ${range[1]}.`;
      error.hidden = false;
      return;
    }
    const saved = await staffCall(ctx, 'set_game', { p_game_id: game.id, p_seconds: s }, error);
    if (saved) back(`✅ ${name}: durata salvata (${formatDuration(saved.duration_s)}).`);
  });
}

// ---------- ✏️ Domande del quiz in tabella ----------

const questionRow = (q, i) => `
  <tr data-row="${i}" data-id="${q.id ?? ''}">
    <td class="menu-edit__n">${i + 1}</td>
    <td><input class="menu-edit__input menu-edit__input--domanda" name="text" value="${escapeHtml(q.text ?? '')}" aria-label="Domanda ${i + 1}"></td>
    ${[0, 1, 2, 3]
      .map((k) => `<td><input class="menu-edit__input" name="option${k}" value="${escapeHtml(q.options?.[k] ?? '')}" aria-label="Risposta ${k + 1} della domanda ${i + 1}"></td>`)
      .join('')}
    <td><select class="menu-edit__input menu-edit__input--giusta" name="correct" aria-label="Risposta giusta della domanda ${i + 1}">
      ${[0, 1, 2, 3].map((k) => `<option value="${k}" ${q.correct === k ? 'selected' : ''}>${k + 1}</option>`).join('')}
    </select></td>
    <td><input type="checkbox" class="menu-edit__check" name="active" ${q.active !== false ? 'checked' : ''} aria-label="Domanda ${i + 1} attiva"></td>
  </tr>`;

async function openQuizEditor(root, ctx, back) {
  root.innerHTML = `
    <div class="menu-edit">
      <button type="button" class="staff-link" data-qe="back">← Torna al Quiz</button>
      <h3 class="config-card__title">✏️ Domande del quiz</h3>
      <p class="staff-muted">Una riga per domanda, 4 risposte, e il numero di quella giusta. Le domande non si cancellano (le partite passate le ricordano): togli la spunta "Attiva" per non farle più uscire. Servono almeno ${QUESTIONS_PER_GAME} domande attive.</p>
      <div class="form-error" role="alert" hidden></div>
      <div class="menu-edit__wrap"><table class="config-table menu-edit__table">
        <thead><tr><th>#</th><th>Domanda</th><th>Risposta 1</th><th>Risposta 2</th><th>Risposta 3</th><th>Risposta 4</th><th>Giusta</th><th>Attiva</th></tr></thead>
        <tbody><tr><td colspan="8">Caricamento…</td></tr></tbody>
      </table></div>
      <button type="button" class="button button--secondary" data-qe="add">➕ Aggiungi domanda</button>
      <div class="config-save"><button type="button" class="button" data-qe="save">Salva</button></div>
    </div>`;
  const view = root.querySelector('.menu-edit');
  const error = view.querySelector('.form-error');
  const tbody = view.querySelector('tbody');
  const res = await staffCall(ctx, 'quiz_list', {}, error);
  if (!res) return;
  let rows = res.questions;
  const draw = () => (tbody.innerHTML = rows.map(questionRow).join(''));
  const read = () => {
    rows = [...tbody.querySelectorAll('tr')].map((tr) => ({
      id: tr.dataset.id ? Number(tr.dataset.id) : undefined,
      text: tr.querySelector('[name="text"]').value.trim(),
      options: [0, 1, 2, 3].map((k) => tr.querySelector(`[name="option${k}"]`).value.trim()),
      correct: Number(tr.querySelector('[name="correct"]').value),
      active: tr.querySelector('[name="active"]').checked,
    }));
  };
  draw();

  view.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-qe]')?.dataset.qe;
    if (action === 'back') return back();
    if (action === 'add') {
      read();
      rows.push({ text: '', options: ['', '', '', ''], correct: 0, active: true });
      draw();
      tbody.querySelector('tr:last-child [name="text"]')?.focus();
      return;
    }
    if (action !== 'save') return;
    read();
    // Righe nuove lasciate del tutto vuote: si ignorano
    const toSave = rows.filter((q) => q.id || q.text || q.options.some(Boolean));
    const problems = toSave.flatMap((q, i) => {
      const n = rows.indexOf(q) + 1;
      const list = [];
      if (q.text.length < 3) list.push(`Riga ${n}: manca la domanda`);
      if (q.options.some((o) => !o)) list.push(`Riga ${n}: servono 4 risposte`);
      return list;
    });
    if (problems.length) {
      await askDialog({
        title: 'Ci sono degli errori',
        body: `<p>Correggi queste righe della tabella:</p><ul class="menu-errors">${problems.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`,
        confirmLabel: 'Ho capito',
        infoOnly: true,
      });
      return;
    }
    const active = toSave.filter((q) => q.active).length;
    const ok = await askDialog({
      title: 'Salvare le domande?',
      body: `<p><strong>${active}</strong> domande attive su ${toSave.length}. Valgono dalla prossima partita.</p>${
        active < QUESTIONS_PER_GAME ? `<p class="staff-warn">⚠️ Con meno di ${QUESTIONS_PER_GAME} domande attive il quiz non si può giocare bene.</p>` : ''
      }`,
      confirmLabel: 'Salva',
    });
    if (!ok) return;
    const saved = await staffCall(ctx, 'quiz_save', { p_questions: toSave.map(({ id, ...q }) => (id ? { id, ...q } : q)) }, error);
    if (saved) {
      await back();
      showOk(root, `✅ Domande salvate (${saved.active} attive).`);
    }
  });
}
