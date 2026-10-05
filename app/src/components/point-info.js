// Informazioni di un punto della mappa, condivise tra la Mappa (riquadro sopra la mappa) e il Calendario (finestra
// che si apre toccando la location di un evento, D145): "Apri con…" (D142) e gli eventi in quel posto.

import { html, escapeHtml, openDialog, closeDialog } from '../lib/dom.js';
import { mapType, directionsLinks } from '../lib/map-data.js';
import { eventsAt, eventStatus, shortDayLabel, timeLabel } from '../lib/events-data.js';

/** Bollino della tipologia con il numero (come sulla mappa) */
export const pointBadgeMarkup = (p) => {
  const t = mapType(p.type);
  return `<span class="point-badge" style="--marker-color: ${t.color}"><span aria-hidden="true">${t.icon}</span><span class="point-badge__number">${p.number}</span></span>`;
};

/** Menu "Apri con…" (nascosto finché non si tocca un pulsante con data-open-with) */
export function openWithMarkup(links) {
  return `<div class="map-openwith" hidden>
      <a class="map-openwith__item" href="${links.google}" target="_blank" rel="noopener">Google Maps</a>
      <a class="map-openwith__item" href="${links.apple}" target="_blank" rel="noopener">Mappe (iPhone)</a>
      <a class="map-openwith__item" href="${links.waze}" target="_blank" rel="noopener">Waze</a>
      ${/Android/i.test(navigator.userAgent) ? `<a class="map-openwith__item" href="${links.geo}">Altre app…</a>` : ''}
      <button type="button" class="map-openwith__item" data-copy-coords="${links.coords}">📋 Copia coordinate GPS</button>
    </div>`;
}

/** Tocchi su "Apri con…" e "Copia coordinate" dentro `root`: true se gestiti */
export function handleOpenWithClick(event, root) {
  const openWith = event.target.closest('[data-open-with]');
  if (openWith) {
    const menu = root.querySelector('.map-openwith');
    if (!menu) return true;
    menu.hidden = !menu.hidden;
    openWith.setAttribute('aria-expanded', String(!menu.hidden));
    return true;
  }
  const copy = event.target.closest('[data-copy-coords]');
  if (copy) {
    navigator.clipboard?.writeText(copy.dataset.copyCoords).then(
      () => (copy.textContent = `✅ Copiate: ${copy.dataset.copyCoords}`),
      () => (copy.textContent = copy.dataset.copyCoords),
    );
    return true;
  }
  return false;
}

/** Eventi in quel posto, in ordine cronologico ('' se non ce ne sono) */
export function pointEventsMarkup(pointId, { highlight = null } = {}) {
  const events = eventsAt(pointId);
  if (!events.length) return '';
  return `<div class="point-events">
      <h3 class="point-events__title">📅 Eventi qui</h3>
      <ul class="point-events__list">${events
        .map((e) => {
          const status = eventStatus(e);
          return `<li class="point-events__item is-${status}${e.id === highlight ? ' is-current' : ''}">
              <span class="point-events__when">${shortDayLabel(e.day)} · ${timeLabel(e)}</span>
              <span class="point-events__name">${escapeHtml(e.title)}${status === 'live' ? ' <span class="event-live">In corso</span>' : ''}</span>
            </li>`;
        })
        .join('')}</ul>
    </div>`;
}

/** Finestra con le informazioni di un punto (senza andare alla mappa) */
export function showPointDialog(p, { events = true, highlight = null } = {}) {
  const t = mapType(p.type);
  const links = p.lat != null ? directionsLinks(p) : null;
  const dialog = html(`
    <dialog class="dialog point-dialog">
      <p class="map-info__type" style="--marker-color: ${t.color}"><span class="map-item__number">${p.number}</span> ${t.icon} ${t.label}</p>
      <h2 class="dialog__title">${escapeHtml(p.title)}</h2>
      ${p.description ? `<p class="map-info__text">${escapeHtml(p.description)}</p>` : ''}
      ${links ? `<div class="map-info__actions"><button type="button" class="button" data-open-with aria-expanded="false">🚶 Apri con…</button></div>${openWithMarkup(links)}` : ''}
      ${events ? pointEventsMarkup(p.id, { highlight }) : ''}
      <div class="dialog__actions"><button type="button" class="button button--secondary" data-close>Chiudi</button></div>
    </dialog>`);
  document.body.append(dialog);
  const close = () => {
    closeDialog(dialog);
    dialog.remove();
  };
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) return close();
    handleOpenWithClick(event, dialog);
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  openDialog(dialog);
}
