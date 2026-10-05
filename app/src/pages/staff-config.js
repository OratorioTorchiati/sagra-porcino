// ⚙️ Configurazioni del pannello, solo per l'Admin (D93, D94, D108). Una scheda per ogni sezione dell'app, nell'ordine
// deciso in Aspetto: a tendina (chiusa; toccando il titolo si apre), interruttore accanto al titolo; spenta, la scheda
// resta chiusa. In fondo Aspetto (ordine delle sezioni, colori in arrivo) e le sezioni che arriveranno.
// Un solo bottone Salva per tutto.

import { escapeHtml } from '../lib/dom.js';
import { GAMES } from '../games/registry.js';
import { isoToRomeLocal, romeLocalToIso, downloadText } from '../lib/staff.js';
import { currentMenu, refreshMenu, countDishes, readMenuFile, menuTemplate } from '../lib/menu-data.js';
import { SECTIONS, SPONSOR_SECTION, FUTURE_SECTIONS, refreshAppConfig } from '../lib/app-config.js';
import { SPONSORS } from '../lib/sponsors.js';
import { cachedMap, refreshMap } from '../lib/map-data.js';
import { prepareMapImage } from '../lib/map-upload.js';

/** Schede aperte (restano aperte anche quando la pagina si ridisegna, es. dopo Salva) */
const openCards = new Set();
import { staffCall, askDialog, formatDate, flashOk } from './staff-ui.js';
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
    </div>
    <div class="config-group">
      <h4 class="config-group__title">Classifica</h4>
      <label class="config-row">
        <span class="config-row__label">Numero vincitori</span>
        <input class="form-field__input config-row__number" name="winners" type="number" min="0" max="99" inputmode="numeric"
          value="${res.winners ?? 10}" aria-label="Numero vincitori (da 0 a 99)">
      </label>
      <div class="config-row">
        <span class="config-row__label">Visibile senza account</span>
        ${switchMarkup('leaderboard_public', res.leaderboard_public !== false, 'Classifica visibile anche senza account')}
      </div>
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
 * `lineLabel` trasforma "Riga N" nei messaggi (nel file o nella tabella). `categoryOrder` (dalla tabella): ordine delle
 * categorie, comprese quelle ancora senza piatti. Restituisce i piatti pubblicati o null.
 */
async function checkAndPublish(text, ctx, error, { errorsIntro, lineLabel = (n) => `Riga ${n}`, categoryOrder } = {}) {
  const { menu, errors } = readMenuFile(text);
  if (menu && categoryOrder) {
    menu.categories = categoryOrder.map(
      (name) => menu.categories.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? { name, dishes: [] },
    );
  }
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
  await refreshMenu({ force: true });
  return saved.dishes;
}

// ---------- ✏️ Modifica del menù (D98, D102) ----------
// Sopra la tabella delle categorie (trascina ⠿ per l'ordine, − per togliere, "Aggiungi categoria" in fondo);
// sotto i piatti divisi per categoria (trascina ⠿ per l'ordine, anche da una categoria all'altra). Le categorie
// senza piatti restano (vuote) ma nel menù dei clienti non si vedono.

const DISH_COLUMNS = [
  ['piatto', 'Piatto'],
  ['prezzo', 'Prezzo'],
  ['descrizione', 'Descrizione'],
  ['simboli', 'Simboli'],
  ['allergeni', 'Allergeni'],
];
const EDIT_COLUMNS = [['categoria', 'Categoria'], ...DISH_COLUMNS];

/** Categorie con i loro piatti, come righe della tabella */
function menuCategories(menu) {
  return menu.categories.map((c) => ({
    name: c.name,
    dishes: c.dishes.map((d) => ({
      piatto: d.name,
      prezzo: d.price.toFixed(2).replace('.', ','),
      descrizione: d.description ?? '',
      simboli: d.symbols.join(', '),
      allergeni: d.allergens.join(', '),
    })),
  }));
}

/** Righe → testo CSV (lo stesso formato del file, così i controlli sono identici) */
function rowsToCsv(rows) {
  const cell = (v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [EDIT_COLUMNS.map(([k]) => k).join(';'), ...rows.map((r) => EDIT_COLUMNS.map(([k]) => cell(r[k] ?? '')).join(';'))].join('\n');
}

const DRAG_HANDLE = '<span class="drag-handle" data-drag aria-hidden="true" title="Trascina per spostare">⠿</span>';
const COLS = DISH_COLUMNS.length + 2; // maniglia + colonne + 🗑️

const catRowMarkup = (c) => `
  <tr data-cat="${c.key}">
    <td class="drag-cell">${DRAG_HANDLE}</td>
    <td><input class="menu-edit__input menu-edit__input--categoria" name="categoria" value="${escapeHtml(c.name)}" aria-label="Nome della categoria" maxlength="60"></td>
    <td><button type="button" class="icon-button icon-button--minus" data-cat-remove="${c.key}" aria-label="Togli la categoria" title="Togli">−</button></td>
  </tr>`;

const dishRowMarkup = (d) => `
  <tr class="menu-edit__dish">
    <td class="drag-cell">${DRAG_HANDLE}</td>
    ${DISH_COLUMNS.map(
      ([k, label]) => `<td><input class="menu-edit__input menu-edit__input--${k}" name="${k}" value="${escapeHtml(d[k] ?? '')}" aria-label="${label}"${k === 'prezzo' ? ' inputmode="decimal"' : ''}></td>`,
    ).join('')}
    <td><button type="button" class="icon-button" data-dish-remove aria-label="Togli il piatto" title="Togli">🗑️</button></td>
  </tr>`;

const dishGroupMarkup = (c) => `
  <tr class="menu-edit__cat" data-cat="${c.key}">
    <th colspan="${COLS}"><span class="menu-edit__cat-name">
      <span data-cat-label>${escapeHtml(c.name) || '<em>Senza nome</em>'}</span>
      <button type="button" class="menu-edit__add" data-dish-add="${c.key}" aria-label="Aggiungi un piatto" title="Aggiungi un piatto">➕</button>
    </span></th>
  </tr>
  ${c.dishes.length ? c.dishes.map(dishRowMarkup).join('') : `<tr class="menu-edit__empty" data-cat="${c.key}"><td colspan="${COLS}">Nessun piatto</td></tr>`}`;

/**
 * Trascinamento delle righe di una tabella con la maniglia ⠿ (dito o mouse). `canDrop(row, before)` dice se la riga
 * può andare prima di `before` (null = in fondo); `onDrop()` quando la si lascia.
 */
function makeSortable(tbody, { canDrop = () => true, onDrop }) {
  tbody.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-drag]');
    if (!handle) return;
    const row = handle.closest('tr');
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    row.classList.add('is-dragging');
    const move = (e) => {
      // Vicino ai bordi dello schermo la pagina scorre
      if (e.clientY < 70) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 12);
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('tr');
      if (!over || over === row || over.parentElement !== tbody) return;
      const box = over.getBoundingClientRect();
      const before = e.clientY < box.top + box.height / 2 ? over : over.nextElementSibling;
      if (before === row || before === row.nextElementSibling) return;
      if (canDrop(row, before)) tbody.insertBefore(row, before);
    };
    const end = () => {
      row.classList.remove('is-dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      onDrop();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
}

function openMenuEditor(root, ctx) {
  let nextKey = 0;
  let cats = menuCategories(currentMenu()).map((c) => ({ ...c, key: String(nextKey++) }));
  root.innerHTML = `
    <div class="menu-edit">
      <button type="button" class="staff-link" data-edit-action="back">← Torna alle Configurazioni</button>
      <h3 class="config-card__title">✏️ Modifica il menù</h3>
      <p class="staff-muted">Trascina ⠿ per cambiare l'ordine. Le categorie senza piatti non si vedono nel menù.</p>
      <div class="form-error" role="alert" hidden></div>
      <div class="config-group">
        <h4 class="config-group__title">Categorie</h4>
        <table class="config-table menu-edit__cats"><tbody data-table="cats"></tbody></table>
        <button type="button" class="button button--secondary" data-edit-action="add-cat">➕ Aggiungi categoria</button>
      </div>
      <div class="config-group">
        <h4 class="config-group__title">Piatti</h4>
        <p class="staff-muted">Prezzo con la virgola (9,00). Simboli: porcini, vegetariano, piccante. La tabella scorre di lato.</p>
        <div class="menu-edit__wrap"><table class="config-table menu-edit__table">
          <thead><tr><th></th>${DISH_COLUMNS.map(([, label]) => `<th>${label}</th>`).join('')}<th></th></tr></thead>
          <tbody data-table="dishes"></tbody>
        </table></div>
      </div>
      <div class="config-save">
        <button type="button" class="button" data-edit-action="save">Salva e pubblica</button>
      </div>
    </div>`;
  const editor = root.querySelector('.menu-edit');
  const catsBody = root.querySelector('[data-table="cats"]');
  const dishesBody = root.querySelector('[data-table="dishes"]');
  const error = root.querySelector('.form-error');

  const draw = () => {
    catsBody.innerHTML = cats.map(catRowMarkup).join('');
    dishesBody.innerHTML = cats.map(dishGroupMarkup).join('');
  };
  // Quello che c'è scritto e l'ordine delle righe tornano nei dati (prima di ridisegnare o salvare)
  const read = () => {
    const names = Object.fromEntries([...catsBody.rows].map((tr) => [tr.dataset.cat, tr.querySelector('[name="categoria"]').value.trim()]));
    const dishes = {};
    let current = null;
    for (const tr of dishesBody.rows) {
      if (tr.classList.contains('menu-edit__cat')) current = tr.dataset.cat;
      else if (tr.classList.contains('menu-edit__dish')) {
        (dishes[current] ??= []).push(Object.fromEntries(DISH_COLUMNS.map(([k]) => [k, tr.querySelector(`[name="${k}"]`).value.trim()])));
      }
    }
    cats = [...catsBody.rows].map((tr) => ({ key: tr.dataset.cat, name: names[tr.dataset.cat], dishes: dishes[tr.dataset.cat] ?? [] }));
  };
  draw();

  // Categorie: l'ordine cambia anche quello dei gruppi di piatti sotto
  makeSortable(catsBody, {
    onDrop: () => {
      read();
      draw();
    },
  });
  // Piatti: mai sopra la prima categoria
  makeSortable(dishesBody, {
    canDrop: (row, before) => before !== dishesBody.rows[0],
    onDrop: () => {
      read();
      draw();
    },
  });

  // Il nome scritto sopra compare subito nel gruppo dei piatti
  catsBody.addEventListener('input', (event) => {
    const key = event.target.closest('tr')?.dataset.cat;
    const label = dishesBody.querySelector(`.menu-edit__cat[data-cat="${key}"] [data-cat-label]`);
    if (label) label.innerHTML = escapeHtml(event.target.value.trim()) || '<em>Senza nome</em>';
  });

  editor.addEventListener('click', async (event) => {
    const removeCat = event.target.closest('[data-cat-remove]')?.dataset.catRemove;
    if (removeCat !== undefined) {
      read();
      const cat = cats.find((c) => c.key === removeCat);
      if (cat.dishes.length) {
        const ok = await askDialog({
          title: 'Togliere la categoria?',
          body: `<p>Con <strong>${escapeHtml(cat.name || 'la categoria')}</strong> si ${cat.dishes.length === 1 ? 'toglie anche il suo piatto' : `tolgono anche i suoi <strong>${cat.dishes.length}</strong> piatti`}.</p>`,
          confirmLabel: 'Togli',
          danger: true,
        });
        if (!ok) return;
        read();
      }
      cats = cats.filter((c) => c.key !== removeCat);
      return draw();
    }
    if (event.target.closest('[data-dish-remove]')) {
      event.target.closest('tr').remove();
      read();
      return draw();
    }
    const addTo = event.target.closest('[data-dish-add]')?.dataset.dishAdd;
    if (addTo !== undefined) {
      read();
      cats.find((c) => c.key === addTo).dishes.push({});
      draw();
      const group = [...dishesBody.rows];
      const start = group.findIndex((tr) => tr.classList.contains('menu-edit__cat') && tr.dataset.cat === addTo);
      const next = group.findIndex((tr, i) => i > start && tr.classList.contains('menu-edit__cat'));
      group[(next < 0 ? group.length : next) - 1]?.querySelector('[name="piatto"]')?.focus();
      return;
    }
    const action = event.target.closest('[data-edit-action]')?.dataset.editAction;
    if (action === 'back') return renderConfigSection(root, ctx);
    if (action === 'add-cat') {
      read();
      cats.push({ key: String(nextKey++), name: '', dishes: [] });
      draw();
      catsBody.querySelector('tr:last-child [name="categoria"]').focus();
      return;
    }
    if (action === 'save') {
      read();
      error.hidden = true;
      const names = cats.map((c) => c.name.toLowerCase());
      const problem = cats.length === 0
        ? 'Aggiungi almeno una categoria.'
        : names.includes('')
          ? 'Una categoria non ha il nome: scrivilo o togli la categoria.'
          : names.find((n, i) => names.indexOf(n) !== i)
            ? `Due categorie si chiamano "${cats[names.findIndex((n, i) => names.indexOf(n) !== i)].name}": cambia un nome.`
            : null;
      if (problem) {
        error.textContent = problem;
        error.hidden = false;
        error.scrollIntoView({ block: 'center' });
        return;
      }
      const rows = cats.flatMap((c) => c.dishes.map((d) => ({ categoria: c.name, ...d })));
      const dishes = await checkAndPublish(rowsToCsv(rows), ctx, error, {
        errorsIntro: 'Correggi questi piatti:',
        // riga 1 del testo = intestazione; negli errori categoria e piatto al posto del numero di riga
        lineLabel: (n) => {
          const row = rows[n - 2];
          return row ? `${row.categoria} → ${row.piatto ? `«${row.piatto}»` : 'piatto senza nome'}` : `Riga ${n - 1}`;
        },
        categoryOrder: cats.map((c) => c.name),
      });
      if (dishes !== null) {
        renderConfigSection(root, ctx).then(() => flashOk(root.querySelector('.staff-ok'), `✅ Menù pubblicato (${dishes} piatti).`));
      }
    }
  });
}

// ---------- Feedback (D108) ----------

const feedbackBody = (res) => `
  <div class="config-group">
    <h4 class="config-group__title">Chi può scrivere</h4>
    <div class="config-row">
      <span class="config-row__label">Feedback anonimi
        <span class="config-row__hint">Anche chi non ha un account può lasciare un feedback</span></span>
      ${switchMarkup('feedback_anonymous', res.feedback_anonymous === true, 'Feedback anche senza account')}
    </div>
  </div>`;

// ---------- Mappa (D136): immagine caricata dall'Admin; i punti si modificano nella pagina Mappa ----------

const mapBody = () => {
  const image = cachedMap()?.image;
  return `
  <div class="config-group">
    <h4 class="config-group__title">Immagine della mappa</h4>
    <p class="config-row__hint">${
      image
        ? `Caricata: ${image.width}×${image.height} px, ${formatDate(image.version)}.`
        : 'Nessuna mappa: finché manca, la pagina Mappa dice "disponibile a breve".'
    }</p>
    <button type="button" class="button button--secondary" data-map="upload">📤 Carica una nuova mappa</button>
    <input type="file" name="map_file" accept="image/png,image/jpeg,image/webp" hidden>
    <p class="config-row__hint">PNG, JPG o WebP.</p>
    <p class="config-row__hint">I punti di interesse si aggiungono e si modificano nella pagina <strong>🗺️ Mappa</strong> → ✏️ Modifica punti.</p>
  </div>`;
};

// ---------- Sponsor (D126): solo il numero di colonne; le immagini sono nell'app ----------

const sponsorBody = (res) => `
  <div class="config-group">
    <h4 class="config-group__title">Tabella nella home</h4>
    <label class="config-row">
      <span class="config-row__label">Colonne
        <span class="config-row__hint">Da 1 a 4. Sempre in fondo alla home, dopo le altre sezioni</span></span>
      <input class="form-field__input config-row__number" name="sponsor_columns" type="number" min="1" max="4" inputmode="numeric"
        value="${res.sponsor_columns ?? 2}" aria-label="Colonne degli sponsor (da 1 a 4)">
    </label>
    <p class="config-row__hint">${SPONSORS.length ? `Immagini nell'app: <strong>${SPONSORS.length}</strong>.` : 'Nessuna immagine ancora: finché mancano, nella home non compare nulla.'}</p>
  </div>`;

// ---------- Aspetto (D108): ordine delle sezioni, colori (in arrivo) ----------

/** Sezioni nell'ordine salvato (quelle mancanti in fondo) */
const sectionsInOrder = (order = []) =>
  [...SECTIONS].sort((a, b) => {
    const rank = (x) => (order.includes(x.id) ? order.indexOf(x.id) : order.length + SECTIONS.indexOf(x));
    return rank(a) - rank(b);
  });

const aspectBody = (res) => `
  <div class="config-group">
    <h4 class="config-group__title">Ordine delle sezioni</h4>
    <p class="config-row__hint">Trascina ⠿ per cambiare l'ordine nella home dei giocatori e in questa pagina.</p>
    <table class="config-table config-order"><tbody data-table="order">${sectionsInOrder(res.sections_order)
      .map((sec) => `<tr data-id="${sec.id}"><td class="drag-cell">${DRAG_HANDLE}</td><td>${sec.icon} ${sec.label}</td></tr>`)
      .join('')}</tbody></table>
  </div>
  <div class="config-group is-todo" aria-disabled="true">
    <h4 class="config-group__title">Colori</h4>
    <div class="config-row">
      <span class="config-row__label">Colori principali
        <span class="config-row__hint">In arrivo</span></span>
      <button type="button" class="icon-button" disabled aria-label="In arrivo">🎨</button>
    </div>
  </div>`;

const BODIES = { giochi: gamesBody, menu: menuBody, feedback: feedbackBody, mappa: mapBody };

/** Scheda a tendina: titolo che apre e chiude, interruttore (se c'è), contenuto */
const cardMarkup = ({ id, icon, label, toggle, body }) => `
  <section class="config-card${openCards.has(id) ? ' is-open' : ''}" data-card="${id}">
    <div class="config-card__head">
      <button type="button" class="config-card__toggle" data-toggle="${id}" aria-expanded="${openCards.has(id)}">
        <span class="config-card__chevron" aria-hidden="true">▸</span>
        <span class="config-card__title">${icon} ${label}</span>
      </button>
      ${toggle ?? ''}
    </div>
    <div class="config-card__fold"><div class="config-card__body">${body}</div></div>
  </section>`;

export async function renderConfigSection(root, ctx) {
  root.innerHTML = '<div class="form-error" role="alert" hidden></div><div class="staff-config"><p class="leaderboard-note">Caricamento…</p></div>';
  const error = root.querySelector('.form-error');
  const res = await staffCall(ctx, 'get_settings', {}, error);
  if (!res) return;
  await refreshMenu({ force: true }); // ✏️ Modifica parte dal menù più recente
  await refreshMap({ force: true }); // dati dell'immagine della mappa
  const schedule = { games_open_from: res.games_open_from, games_open_until: res.games_open_until };

  const box = root.querySelector('.staff-config');
  box.innerHTML = `
    <form class="config-form" novalidate>
      ${sectionsInOrder(res.sections_order)
        .map((s) =>
          cardMarkup({
            ...s,
            toggle: switchMarkup(`section_${s.id}`, res.sections?.[s.id] === true || (res.sections?.[s.id] === undefined && s.defaultOn), `${s.label}: visibile nell'app`),
            body: BODIES[s.id]?.(res) ?? '',
          }),
        )
        .join('')}
      ${cardMarkup({
        ...SPONSOR_SECTION,
        toggle: switchMarkup('section_sponsor', res.sections?.sponsor === true, 'Sponsor: visibili nella home'),
        body: sponsorBody(res),
      })}
      ${cardMarkup({ id: 'aspetto', icon: '🎨', label: 'Aspetto', body: aspectBody(res) })}
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

  // Scheda spenta: resta chiusa (si vede solo il titolo); accesa: si apre e si chiude toccando il titolo
  const syncCards = () => {
    for (const card of form.querySelectorAll('.config-card[data-card]')) {
      const toggle = form[`section_${card.dataset.card}`];
      card.classList.toggle('is-off', Boolean(toggle) && !toggle.checked);
    }
  };
  syncCards();
  const setOpen = (card, open) => {
    card.classList.toggle('is-open', open);
    card.querySelector('[data-toggle]').setAttribute('aria-expanded', String(open));
    if (open) openCards.add(card.dataset.card);
    else openCards.delete(card.dataset.card);
  };

  // Aspetto: ordine delle sezioni trascinando ⠿ (si salva con Salva)
  const orderBody = form.querySelector('[data-table="order"]');
  makeSortable(orderBody, { onDrop: () => {} });

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
    if (name.startsWith('section_')) {
      // accesa: la scheda si apre, così si vede subito cosa configurare
      if (event.target.checked) setOpen(event.target.closest('.config-card'), true);
      return syncCards();
    }
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

  // Mappa: nuova immagine (D136), preparata su questo telefono e inviata in base64
  const mapFile = form.map_file;
  form.querySelector('[data-map="upload"]')?.addEventListener('click', () => mapFile.click());
  mapFile?.addEventListener('change', async () => {
    const file = mapFile.files[0];
    mapFile.value = '';
    if (!file) return;
    let prepared;
    try {
      prepared = await prepareMapImage(file);
    } catch {
      error.textContent = 'Immagine non leggibile: usa un PNG, JPG o WebP.';
      error.hidden = false;
      return;
    }
    const ok = await askDialog({
      title: 'Pubblicare questa mappa?',
      body: `<img class="map-upload-preview" src="data:${prepared.mime};base64,${prepared.data}" alt="Anteprima della mappa">
        <p>${prepared.width}×${prepared.height} px, circa ${Math.round((prepared.data.length * 3) / 4 / 1024)} KB. Prende il posto di quella di adesso.</p>`,
      confirmLabel: 'Pubblica',
    });
    if (!ok) return;
    const saved = await staffCall(ctx, 'set_map_image', { p_mime: prepared.mime, p_data: prepared.data, p_width: prepared.width, p_height: prepared.height }, error);
    if (!saved) return;
    refreshAppConfig({ force: true });
    renderConfigSection(root, ctx).then(() => flashOk(root.querySelector('.staff-ok'), '✅ Mappa pubblicata.'));
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
      renderConfigSection(root, ctx).then(() => flashOk(root.querySelector('.staff-ok'), `✅ Menù pubblicato (${dishes} piatti).`));
    }
  });

  form.addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      const card = toggle.closest('.config-card');
      if (!card.classList.contains('is-off')) setOpen(card, !card.classList.contains('is-open'));
      return;
    }
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
          if (message) flashOk(root.querySelector('.staff-ok'), message);
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
    const winners = Number(form.winners.value);
    if (form.winners.value.trim() === '' || !(Number.isInteger(winners) && winners >= 0 && winners <= 99)) {
      error.textContent = 'Numero vincitori: scrivi un numero da 0 a 99 (0 = nessun premio).';
      error.hidden = false;
      form.winners.focus();
      return;
    }
    const sponsorCols = Number(form.sponsor_columns.value);
    if (!(Number.isInteger(sponsorCols) && sponsorCols >= 1 && sponsorCols <= 4)) {
      error.textContent = 'Sponsor: le colonne vanno da 1 a 4.';
      error.hidden = false;
      form.sponsor_columns.focus();
      return;
    }
    const values = {
      sections: Object.fromEntries([...SECTIONS, SPONSOR_SECTION].map((s) => [s.id, form[`section_${s.id}`].checked])),
      sponsor_columns: sponsorCols,
      winners,
      leaderboard_public: form.leaderboard_public.checked,
      attempts_per_day: perDay, // 0 = illimitati
      attempts_reset_hour: Number(form.attempts_reset_hour.value),
      games_open_from: schedule.games_open_from,
      games_open_until: schedule.games_open_until,
      games: Object.fromEntries(res.games.map((g) => [g.id, form[`game_${g.id}`].checked])),
      feedback_anonymous: form.feedback_anonymous.checked,
      sections_order: [...orderBody.rows].map((tr) => tr.dataset.id),
    };
    const off = [...SECTIONS, SPONSOR_SECTION].filter((s) => !values.sections[s.id]).map((s) => s.label);
    const confirmed = await askDialog({
      title: 'Salvare le configurazioni?',
      body: `<p>Valgono subito per tutti.</p>${off.length ? `<p>Sezioni spente (spariscono dalla home): <strong>${off.join(', ')}</strong>.</p>` : ''}`,
      confirmLabel: 'Salva',
    });
    if (!confirmed) return;
    if (await staffCall(ctx, 'update_settings', { p_values: values }, error)) {
      refreshAppConfig({ force: true }); // anche la home di questo telefono si aggiorna
      renderConfigSection(root, ctx).then(() => flashOk(root.querySelector('.staff-ok'), '✅ Configurazioni salvate.'));
    }
  });
}
