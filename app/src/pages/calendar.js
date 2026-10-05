// Pagina Calendario eventi (#/calendario, D145): eventi raggruppati per giorno, in ordine cronologico. Ogni evento:
// titolo con l'orario a destra, descrizione, sotto la location (bollino del punto della mappa con il numero): toccandola
// si aprono solo le informazioni del posto, senza andare alla mappa. Oggi in evidenza, "In corso" sull'evento che si sta
// svolgendo, eventi finiti in grigio e giorni passati chiusi in fondo.
// Mod e Admin: sempre in modifica, come sulla mappa (D143): "➕ Nuovo evento" e ✏️ 🗑️ su ogni evento.

import { html, escapeHtml } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { pointBadgeMarkup, showPointDialog } from '../components/point-info.js';
import { MAP_TYPES, mapType, refreshMap, numberedPoints } from '../lib/map-data.js';
import { refreshEvents, cachedEvents, setEvents, groupByDay, eventStatus, dayKey, dayLabel, timeLabel } from '../lib/events-data.js';
import { currentPlayer, isStaffRole, sessionToken } from '../lib/account.js';
import { rpc } from '../lib/api.js';
import { askDialog } from './staff-ui.js';

const ERRORS = {
  EVENT_INVALID: 'Controlla giorno, orari e titolo.',
  POINT_NOT_FOUND: 'Il posto scelto non è più sulla mappa.',
  NOT_FOUND: "L'evento non esiste più.",
};

/** Campi dell'evento; il posto si sceglie tra i punti della mappa (per tipologia, con il numero) */
const eventForm = (e, points) => {
  const options = MAP_TYPES.map((t) => {
    const items = points.filter((p) => p.type === t.id);
    if (!items.length) return '';
    return `<optgroup label="${t.icon} ${t.label}">${items
      .map((p) => `<option value="${p.id}"${p.id === e.point ? ' selected' : ''}>${t.icon} ${p.number} · ${escapeHtml(p.title)}</option>`)
      .join('')}</optgroup>`;
  }).join('');
  return `
    <label class="form-field"><span class="form-field__label">Giorno</span>
      <input class="form-field__input" type="date" name="day" required value="${e.day ?? ''}">
    </label>
    <div class="event-form__times">
      <label class="form-field"><span class="form-field__label">Inizio</span>
        <input class="form-field__input" type="time" name="start" required value="${e.start ?? ''}">
      </label>
      <label class="form-field"><span class="form-field__label">Fine (facoltativa)</span>
        <input class="form-field__input" type="time" name="end" value="${e.end ?? ''}">
      </label>
    </div>
    <label class="form-field"><span class="form-field__label">Titolo</span>
      <input class="form-field__input" name="title" maxlength="60" required value="${escapeHtml(e.title ?? '')}" placeholder="Es. Musica dal vivo">
    </label>
    <label class="form-field"><span class="form-field__label">Descrizione (facoltativa)</span>
      <textarea class="form-field__input" name="description" maxlength="300" rows="2" placeholder="Es. Con la band del paese">${escapeHtml(e.description ?? '')}</textarea>
    </label>
    <label class="form-field"><span class="form-field__label">Location (facoltativa)</span>
      <select class="form-field__input" name="point"><option value="">Nessuna</option>${options}</select>
      ${points.length ? '' : '<span class="config-row__hint">Per scegliere un posto, prima aggiungilo sulla mappa.</span>'}
    </label>`;
};

export function renderCalendar() {
  const staff = isStaffRole(currentPlayer()?.role);
  const element = html(`
    <main class="page calendar-page">
      ${topBarMarkup()}
      <h1 class="page-title"><span class="page-title__icon" aria-hidden="true">📅</span>Calendario</h1>
      <div class="form-error" role="alert" hidden></div>
      ${staff ? '<button type="button" class="button calendar-new" data-new>➕ Nuovo evento</button>' : ''}
      <div class="calendar"></div>
      <p class="leaderboard-note calendar-empty" hidden></p>
    </main>
  `);
  bindTopBar(element);

  const error = element.querySelector('.form-error');
  const box = element.querySelector('.calendar');
  const empty = element.querySelector('.calendar-empty');
  let lastDay = null; // giorno dell'ultimo evento salvato: proposto per il prossimo
  let timer = null;
  let destroyed = false;

  const points = () => numberedPoints();
  const showError = (text) => {
    error.textContent = text;
    error.hidden = !text;
  };

  function eventMarkup(e) {
    const status = eventStatus(e);
    const point = e.point != null ? points().find((p) => p.id === e.point) : null;
    return `
      <li class="cal-event is-${status}">
        <div class="cal-event__head">
          <h3 class="cal-event__title">${escapeHtml(e.title)}${status === 'live' ? ' <span class="event-live">In corso</span>' : ''}</h3>
          <span class="cal-event__time">${timeLabel(e)}</span>
        </div>
        ${e.description ? `<p class="cal-event__text">${escapeHtml(e.description)}</p>` : ''}
        ${
          point || staff
            ? `<div class="cal-event__foot">
                ${point ? `<button type="button" class="cal-event__place" data-point="${point.id}" aria-label="${escapeHtml(`Location: ${mapType(point.type).label} ${point.number}, ${point.title}`)}">${pointBadgeMarkup(point)}<span class="cal-event__place-name">${escapeHtml(point.title)}</span></button>` : '<span></span>'}
                ${
                  staff
                    ? `<span class="cal-event__tools">
                        <button type="button" class="icon-button" data-edit="${e.id}" aria-label="Modifica l'evento" title="Modifica">✏️</button>
                        <button type="button" class="icon-button icon-button--danger" data-delete="${e.id}" aria-label="Elimina l'evento" title="Elimina">🗑️</button>
                      </span>`
                    : ''
                }
              </div>`
            : ''
        }
      </li>`;
  }

  const dayMarkup = ({ day, events }, today) => `
    <section class="cal-day${day === today ? ' is-today' : ''}">
      <h2 class="cal-day__title">${day === today ? '<span class="cal-day__today">Oggi</span> ' : ''}${dayLabel(day)}</h2>
      <ul class="cal-day__list">${events.map(eventMarkup).join('')}</ul>
    </section>`;

  function render() {
    const today = dayKey();
    const groups = groupByDay(cachedEvents());
    // un giorno è passato quando tutti i suoi eventi sono finiti (così le serate oltre mezzanotte restano su)
    const past = groups.filter((g) => g.events.every((e) => eventStatus(e) === 'past'));
    const next = groups.filter((g) => !past.includes(g));
    const wasOpen = box.querySelector('.cal-past')?.open ?? false;
    box.innerHTML = `${next.map((g) => dayMarkup(g, today)).join('')}${
      past.length
        ? `<details class="cal-past"${wasOpen || !next.length ? ' open' : ''}>
            <summary>Giorni passati (${past.length})</summary>
            ${past.map((g) => dayMarkup(g, today)).join('')}
          </details>`
        : ''
    }`;
    empty.hidden = groups.length > 0;
    empty.textContent = staff ? 'Non ci sono ancora eventi: tocca "➕ Nuovo evento" per aggiungerne uno.' : 'Gli eventi saranno pubblicati a breve.';
  }

  // ---------- Modifica (Mod e Admin) ----------

  async function editEvent(existing) {
    const values = await askDialog({
      title: existing ? "Modifica l'evento" : 'Nuovo evento',
      body: eventForm(existing ?? { day: lastDay ?? dayKey() }, points()),
      confirmLabel: 'Salva',
      validate: (v) => {
        if (!v.day) return 'Scegli il giorno.';
        if (!v.start) return "Scrivi l'ora di inizio.";
        if (v.end && v.end === v.start) return "L'ora di fine deve essere diversa dall'inizio.";
        if (!v.title?.trim()) return 'Scrivi il titolo.';
        return null;
      },
    });
    if (!values) return;
    const res = await rpc('staff_event_save', {
      p_token: sessionToken(),
      p_id: existing?.id ?? null,
      p_day: values.day,
      p_start: values.start,
      p_end: values.end || null,
      p_title: values.title,
      p_description: values.description,
      p_point_id: values.point ? Number(values.point) : null,
    });
    if (!res.ok) return showError(ERRORS[res.error] ?? `Non salvato (${res.error}).`);
    showError('');
    lastDay = res.event.day;
    const others = cachedEvents().filter((e) => e.id !== res.event.id);
    setEvents([...others, res.event], res.version);
    render();
  }

  async function deleteEvent(e) {
    const ok = await askDialog({
      title: "Eliminare l'evento?",
      body: `<p><strong>${escapeHtml(e.title)}</strong> (${dayLabel(e.day)}, ${timeLabel(e)}) sparisce dal calendario.</p>`,
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    const res = await rpc('staff_event_delete', { p_token: sessionToken(), p_id: e.id });
    if (!res.ok) return showError(ERRORS[res.error] ?? `Non eliminato (${res.error}).`);
    showError('');
    setEvents(cachedEvents().filter((x) => x.id !== e.id), res.version);
    render();
  }

  element.addEventListener('click', (event) => {
    const place = event.target.closest('[data-point]');
    if (place) {
      const p = points().find((x) => x.id === Number(place.dataset.point));
      if (p) showPointDialog(p);
      return;
    }
    if (event.target.closest('[data-new]')) return editEvent(null);
    const find = (id) => cachedEvents().find((e) => e.id === Number(id));
    const edit = event.target.closest('[data-edit]');
    if (edit) return find(edit.dataset.edit) && editEvent(find(edit.dataset.edit));
    const del = event.target.closest('[data-delete]');
    if (del) return find(del.dataset.delete) && deleteEvent(find(del.dataset.delete));
  });

  async function load() {
    render(); // subito la copia sul telefono
    await Promise.all([refreshEvents(), refreshMap()]);
    if (destroyed) return;
    render();
  }

  load();
  // "In corso" e eventi finiti si aggiornano da soli
  timer = setInterval(render, 60 * 1000);

  return {
    title: 'Calendario',
    element,
    destroy: () => {
      destroyed = true;
      clearInterval(timer);
    },
  };
}
