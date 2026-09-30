// ⚙️ Configurazioni del pannello, solo per l'Admin (D93, D94). Una scheda per ogni sezione dell'app: interruttore
// accanto al titolo; spenta, la scheda si chiude e resta solo il titolo; accesa, si riapre con le sue impostazioni
// (Minigiochi: giochi con ⚙️ e interruttore, tentativi, reset, apertura e chiusura). In fondo le sezioni che
// arriveranno. Un solo bottone Salva per tutto.

import { escapeHtml } from '../lib/dom.js';
import { GAMES } from '../games/registry.js';
import { isoToRomeLocal, romeLocalToIso, downloadText } from '../lib/staff.js';
import { currentMenu, refreshMenu, countDishes, readMenuFile, menuTemplate } from '../lib/menu-data.js';
import { SECTIONS, FUTURE_SECTIONS, refreshAppConfig } from '../lib/app-config.js';
import { staffCall, askDialog, formatDate } from './staff-ui.js';
import { openGameSettings } from './staff-game-settings.js';

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

// La data sta subito sotto il titolo della riga (toccandola si modifica)
const scheduleMarkup = (key, iso) => `
  <div class="config-row" data-schedule="${key}">
    <span class="config-row__label">${SCHEDULES[key].title}
      ${iso ? `<button type="button" class="config-row__info" data-edit="${key}">${SCHEDULES[key].info(iso)} ✏️</button>` : ''}</span>
    <span class="config-row__state">${iso ? 'CHIUSO' : 'APERTO'}</span>
    ${switchMarkup(`schedule_${key}`, !iso, SCHEDULES[key].title)}
  </div>`;

/** "09:00": l'ora in cui tornano i tentativi, come orario */
const hourOptions = (selected) =>
  Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === selected ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');

function gamesBody(res) {
  return `
    <div class="config-group">
      <h4 class="config-group__title" id="config-games-title">Giochi</h4>
      <table class="config-table" aria-labelledby="config-games-title">
        <thead><tr><th>Gioco</th><th>Impostazioni</th><th>Attivo</th></tr></thead>
        <tbody>${res.games
          .map(
            (g) => `
            <tr>
              <td>${escapeHtml(gameName(g.id))}</td>
              <td><button type="button" class="icon-button" data-game-settings="${g.id}" aria-label="Impostazioni di ${escapeHtml(gameName(g.id))}" title="Impostazioni">⚙️</button></td>
              <td>${switchMarkup(`game_${g.id}`, g.enabled, escapeHtml(gameName(g.id)))}</td>
            </tr>`,
          )
          .join('')}</tbody>
      </table>
    </div>
    <div class="config-group">
      <div class="config-row">
        <span class="config-row__label">Tentativi</span>
        <label class="config-chip"><input type="checkbox" name="attempts_unlimited" ${res.attempts_per_day === 0 ? 'checked' : ''}> ∞ Illimitati</label>
        <input class="form-field__input config-row__number" name="attempts_per_day" type="number" min="1" max="99" inputmode="numeric"
          value="${res.attempts_per_day || 3}" aria-label="Tentativi al giorno per gioco (da 1 a 99)">
      </div>
      <label class="config-row">
        <span class="config-row__label">Reset tentativi</span>
        <select class="form-field__input config-row__time" name="attempts_reset_hour" aria-label="Ora in cui tornano i tentativi">${hourOptions(res.attempts_reset_hour)}</select>
      </label>
    </div>
    <div class="config-group">
      <h4 class="config-group__title">Orari</h4>
      <div class="config-schedules"></div>
    </div>`;
}

// ---------- Menù (D96): modello da scaricare, file da caricare con controllo e anteprima ----------

function menuBody() {
  return `
    <div class="config-group">
      <h4 class="config-group__title">Aggiorna il menù</h4>
      <div class="config-row">
        <span class="config-row__label">Modifica
          <span class="config-row__hint">Il menù attuale in tabella, da cambiare qui</span></span>
        <button type="button" class="icon-button" data-menu="edit" aria-label="Modifica il menù" title="Modifica">✏️</button>
      </div>
      <div class="config-row">
        <span class="config-row__label">Template
          <span class="config-row__hint">Il file da compilare con Excel</span></span>
        <button type="button" class="icon-button" data-menu="template" aria-label="Scarica il template" title="Scarica">⬇️</button>
      </div>
      <div class="config-row">
        <span class="config-row__label">Carica file
          <span class="config-row__hint">Il template compilato, salvato come CSV</span></span>
        <button type="button" class="icon-button" data-menu="upload" aria-label="Carica il file del menù" title="Carica">📤</button>
        <input type="file" name="menu_file" accept=".csv,text/csv" hidden>
      </div>
    </div>`;
}

const priceFormat = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/** Anteprima del menù letto dal file, prima di pubblicarlo */
const menuPreview = (menu) => `
  <p><strong>${menu.categories.length}</strong> categorie, <strong>${countDishes(menu)}</strong> piatti. Sostituisce il menù attuale per tutti.</p>
  <div class="menu-preview">${menu.categories
    .map(
      (c) => `<p class="menu-preview__category">${escapeHtml(c.name)}</p>
        <ul>${c.dishes.map((d) => `<li><span>${escapeHtml(d.name)}</span><span>${priceFormat.format(d.price)}</span></li>`).join('')}</ul>`,
    )
    .join('')}</div>`;

/**
 * Controlla il testo CSV del menù (errori → elenco), mostra l'anteprima e pubblica.
 * `lineLabel` trasforma "Riga N" nei messaggi (nel file o nella tabella). Restituisce i piatti pubblicati o null.
 */
async function checkAndPublish(text, ctx, error, { errorsIntro, lineLabel = (n) => `Riga ${n}` } = {}) {
  const { menu, errors } = readMenuFile(text);
  if (errors) {
    await askDialog({
      title: 'Ci sono degli errori',
      body: `<p>${errorsIntro}</p><ul class="menu-errors">${errors
        .map((e) => `<li>${escapeHtml(e.replace(/^Riga (\d+)/, (_, n) => lineLabel(Number(n))))}</li>`)
        .join('')}</ul>`,
      confirmLabel: 'Ho capito',
      infoOnly: true,
    });
    return null;
  }
  const ok = await askDialog({ title: 'Pubblicare questo menù?', body: menuPreview(menu), confirmLabel: 'Pubblica' });
  if (!ok) return null;
  const saved = await staffCall(ctx, 'set_menu', { p_menu: { categories: menu.categories } }, error);
  if (!saved) return null;
  await refreshMenu();
  return saved.dishes;
}

// ---------- ✏️ Modifica del menù in tabella (D98): una riga per piatto, come il file ----------

const EDIT_COLUMNS = [
  ['categoria', 'Categoria'],
  ['piatto', 'Piatto'],
  ['prezzo', 'Prezzo'],
  ['descrizione', 'Descrizione'],
  ['simboli', 'Simboli'],
  ['allergeni', 'Allergeni'],
];

/** Righe della tabella dal menù attuale */
function menuRows(menu) {
  return menu.categories.flatMap((c) =>
    c.dishes.map((d) => ({
      categoria: c.name,
      piatto: d.name,
      prezzo: d.price.toFixed(2).replace('.', ','),
      descrizione: d.description ?? '',
      simboli: d.symbols.join(', '),
      allergeni: d.allergens.join(', '),
    })),
  );
}

/** Righe → testo CSV (lo stesso formato del file, così i controlli sono identici) */
function rowsToCsv(rows) {
  const cell = (v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [EDIT_COLUMNS.map(([k]) => k).join(';'), ...rows.map((r) => EDIT_COLUMNS.map(([k]) => cell(r[k] ?? '')).join(';'))].join('\n');
}

const editRowMarkup = (row, i) => `
  <tr data-row="${i}">
    <td class="menu-edit__n">${i + 1}</td>
    ${EDIT_COLUMNS.map(
      ([k, label]) => `<td><input class="menu-edit__input menu-edit__input--${k}" name="${k}" value="${escapeHtml(row[k] ?? '')}" aria-label="${label}, riga ${i + 1}"${k === 'prezzo' ? ' inputmode="decimal"' : ''}></td>`,
    ).join('')}
    <td><button type="button" class="icon-button" data-remove="${i}" aria-label="Togli la riga ${i + 1}" title="Togli">🗑️</button></td>
  </tr>`;

function openMenuEditor(root, ctx) {
  let rows = menuRows(currentMenu());
  root.innerHTML = `
    <div class="menu-edit">
      <button type="button" class="staff-link" data-edit-action="back">← Torna alle Configurazioni</button>
      <h3 class="config-card__title">✏️ Modifica il menù</h3>
      <p class="staff-muted">Una riga per piatto. Prezzo con la virgola (9,00). Simboli: porcini, vegetariano, piccante. La tabella scorre di lato.</p>
      <div class="form-error" role="alert" hidden></div>
      <div class="menu-edit__wrap"><table class="config-table menu-edit__table">
        <thead><tr><th>#</th>${EDIT_COLUMNS.map(([, label]) => `<th>${label}</th>`).join('')}<th></th></tr></thead>
        <tbody></tbody>
      </table></div>
      <button type="button" class="button button--secondary" data-edit-action="add">➕ Aggiungi piatto</button>
      <div class="config-save">
        <button type="button" class="button" data-edit-action="save">Salva e pubblica</button>
      </div>
    </div>`;
  const tbody = root.querySelector('tbody');
  const error = root.querySelector('.form-error');
  const draw = () => (tbody.innerHTML = rows.map(editRowMarkup).join(''));
  // I valori scritti restano nelle righe (anche aggiungendo o togliendo righe)
  const read = () => {
    rows = [...tbody.querySelectorAll('tr')].map((tr) => Object.fromEntries(EDIT_COLUMNS.map(([k]) => [k, tr.querySelector(`[name="${k}"]`).value.trim()])));
  };
  draw();

  root.querySelector('.menu-edit').addEventListener('click', async (event) => {
    const remove = event.target.closest('[data-remove]')?.dataset.remove;
    if (remove !== undefined) {
      read();
      rows.splice(Number(remove), 1);
      return draw();
    }
    const action = event.target.closest('[data-edit-action]')?.dataset.editAction;
    if (action === 'back') return renderConfigSection(root, ctx);
    if (action === 'add') {
      read();
      rows.push({ categoria: rows.at(-1)?.categoria ?? '' });
      draw();
      tbody.querySelector('tr:last-child [name="piatto"]')?.focus();
      return;
    }
    if (action === 'save') {
      read();
      const dishes = await checkAndPublish(rowsToCsv(rows), ctx, error, {
        errorsIntro: 'Correggi queste righe della tabella:',
        lineLabel: (n) => `Riga ${n - 1}`, // riga 1 del testo = intestazione
      });
      if (dishes !== null) {
        renderConfigSection(root, ctx).then(() => {
          const msg = root.querySelector('.staff-ok');
          if (msg) {
            msg.textContent = `✅ Menù pubblicato (${dishes} piatti).`;
            msg.hidden = false;
          }
        });
      }
    }
  });
}

const BODIES = { giochi: gamesBody, menu: menuBody };

export async function renderConfigSection(root, ctx) {
  root.innerHTML = '<div class="form-error" role="alert" hidden></div><div class="staff-config"><p class="leaderboard-note">Caricamento…</p></div>';
  const error = root.querySelector('.form-error');
  const res = await staffCall(ctx, 'get_settings', {}, error);
  if (!res) return;
  await refreshMenu(); // ✏️ Modifica parte dal menù più recente
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

  // Tentativi illimitati: il numero non serve (D97)
  const syncAttempts = () => (form.attempts_per_day.hidden = form.attempts_unlimited.checked);
  syncAttempts();

  form.addEventListener('change', (event) => {
    const name = event.target.name ?? '';
    if (name === 'attempts_unlimited') return syncAttempts();
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

  // Menù: modello e caricamento del file
  const menuFile = form.menu_file;
  menuFile?.addEventListener('change', async () => {
    const file = menuFile.files[0];
    menuFile.value = '';
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      await askDialog({
        title: 'Serve il file CSV',
        body: '<p>In Excel: <strong>File → Salva con nome → "CSV UTF-8 (delimitato da virgole)"</strong>, poi carica quel file.</p>',
        confirmLabel: 'Ho capito',
        infoOnly: true,
      });
      return;
    }
    const dishes = await checkAndPublish(await file.text(), ctx, error, { errorsIntro: 'Correggili nel file e caricalo di nuovo:' });
    if (dishes !== null) {
      renderConfigSection(root, ctx).then(() => {
        const msg = root.querySelector('.staff-ok');
        if (msg) {
          msg.textContent = `✅ Menù pubblicato (${dishes} piatti).`;
          msg.hidden = false;
        }
      });
    }
  });

  form.addEventListener('click', async (event) => {
    const menuAction = event.target.closest('[data-menu]')?.dataset.menu;
    if (menuAction === 'template') return downloadText('menu-sagra-template.csv', menuTemplate());
    if (menuAction === 'upload') return menuFile.click();
    if (menuAction === 'edit') return openMenuEditor(root, ctx);
    const edit = event.target.closest('[data-edit]')?.dataset.edit;
    if (edit) return askDate(edit);
    const game = event.target.closest('[data-game-settings]')?.dataset.gameSettings;
    if (game) {
      // ⚙️ Impostazioni del gioco (D99): schermata a parte, poi si torna qui (le modifiche non salvate qui restano da salvare)
      openGameSettings(root, ctx, res.games.find((g) => g.id === game), (message) =>
        renderConfigSection(root, ctx).then(() => {
          const msg = message && root.querySelector('.staff-ok');
          if (msg) {
            msg.textContent = message;
            msg.hidden = false;
          }
        }),
      );
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const perDay = form.attempts_unlimited.checked ? 0 : Number(form.attempts_per_day.value);
    if (!form.attempts_unlimited.checked && !(Number.isInteger(perDay) && perDay >= 1 && perDay <= 99)) {
      error.textContent = 'Tentativi: scrivi un numero da 1 a 99, oppure scegli "Illimitati".';
      error.hidden = false;
      form.attempts_per_day.focus();
      return;
    }
    const values = {
      sections: Object.fromEntries(SECTIONS.map((s) => [s.id, form[`section_${s.id}`].checked])),
      attempts_per_day: perDay, // 0 = illimitati
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
