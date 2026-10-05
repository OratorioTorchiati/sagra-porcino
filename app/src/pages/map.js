// Mappa della sagra (#/mappa, D136): in alto la legenda (che fa anche da filtro), la mappa grande con zoom e
// spostamento, i punti con icona colorata e numero (da 1 dentro ogni tipologia), sotto l'elenco per tipologia.
// Toccando un punto (sulla mappa o nell'elenco) l'icona si ingrandisce e compare il riquadro con le informazioni e, se la
// mappa ha le coordinate (D139), "🚶 Google Maps / Mappe" a piedi. All'apertura inquadra i punti, con un margine.
// Mod e Admin (D143): sempre in modifica, senza pulsante: tocco su un posto libero = nuovo punto (se c'è un punto aperto,
// il primo tocco lo chiude); tocco su un punto = accanto al nome 🚶 Apri con…, ✏️ modifica, ↔️ sposta, 🗑️ elimina.

import { html, escapeHtml } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { createZoomView } from '../components/zoom-view.js';
import { MAP_TYPES, mapType, cachedMap, refreshMap, mapImage, numberedPoints, setPoints, directionsLinks, latLngToXY, distanceM } from '../lib/map-data.js';
import { currentPlayer, isStaffRole, sessionToken } from '../lib/account.js';
import { rpc } from '../lib/api.js';
import { askDialog } from './staff-ui.js';
import { mapFromOsm, sectionOn } from '../lib/app-config.js';
import { openWithMarkup, handleOpenWithClick, pointEventsMarkup } from '../components/point-info.js';
import { refreshEvents, eventsAt, setEvents, cachedEvents } from '../lib/events-data.js';

const markerMarkup = (p, selected) => {
  const t = mapType(p.type);
  return `<button type="button" class="map-marker zoom-keep${selected ? ' is-selected' : ''}" data-point="${p.id}"
      style="left: ${p.x * 100}%; top: ${p.y * 100}%; --marker-color: ${t.color}" aria-label="${escapeHtml(`${t.label} ${p.number}: ${p.title}`)}">
      <span class="map-marker__icon" aria-hidden="true">${t.icon}</span><span class="map-marker__number">${p.number}</span>
    </button>`;
};

const pointForm = (p = {}) => `
  <label class="form-field"><span class="form-field__label">Tipologia</span>
    <select class="form-field__input" name="type">${MAP_TYPES.map((t) => `<option value="${t.id}"${t.id === p.type ? ' selected' : ''}>${t.icon} ${t.label}</option>`).join('')}</select>
  </label>
  <label class="form-field"><span class="form-field__label">Titolo</span>
    <input class="form-field__input" name="title" maxlength="60" required value="${escapeHtml(p.title ?? '')}" placeholder="Es. Bar Da Mario">
  </label>
  <label class="form-field"><span class="form-field__label">Descrizione (facoltativa)</span>
    <textarea class="form-field__input" name="description" maxlength="300" rows="2" placeholder="Es. Solo contanti · aperto fino alle 23">${escapeHtml(p.description ?? '')}</textarea>
  </label>`;

export function renderMap() {
  const staff = isStaffRole(currentPlayer()?.role);
  const element = html(`
    <main class="page map-page">
      ${topBarMarkup()}
      <h1 class="page-title"><span class="page-title__icon" aria-hidden="true">🗺️</span>Mappa</h1>
      <div class="map-legend" role="group" aria-label="Legenda: tocca una tipologia per vedere solo quella"></div>
      <div class="form-error" role="alert" hidden></div>
      <div class="map-view" hidden>
        <div class="map-stage"><img class="map-image" alt="Mappa della sagra" draggable="false"></div>
        <div class="map-info" hidden></div>
      </div>
      <div class="map-me" hidden>
        <button type="button" class="button button--secondary" data-locate>📍 Mostra la mia posizione</button>
        <p class="map-me__status" role="status"></p>
      </div>
      <p class="map-edit-hint" hidden></p>
      <div class="map-list"></div>
      <p class="leaderboard-note map-empty" hidden></p>
      <p class="map-credit" hidden></p>
    </main>
  `);
  bindTopBar(element);

  const legend = element.querySelector('.map-legend');
  const view = element.querySelector('.map-view');
  const stage = element.querySelector('.map-stage');
  const img = element.querySelector('.map-image');
  const info = element.querySelector('.map-info');
  const list = element.querySelector('.map-list');
  const empty = element.querySelector('.map-empty');
  const error = element.querySelector('.form-error');
  const hint = element.querySelector('.map-edit-hint');

  let filter = null; // tipologia scelta nella legenda (null = tutte)
  let selected = null; // id del punto evidenziato
  const editing = staff; // Mod e Admin modificano sempre (D143)
  let moving = null; // punto da spostare: il prossimo tocco sulla mappa è la nuova posizione
  let zoom = null;
  let destroyed = false;
  // "Mostra la mia posizione" (D142): resta solo sul telefono, mai inviata al server; si spegne chiudendo la pagina
  let me = null; // { x, y, lat, lng, accuracy }
  let watchId = null;
  let meTimer = null; // nessuna risposta dal telefono (né permesso né errore): dopo un po' si spiega cosa fare
  const meBox = element.querySelector('.map-me');
  const meBtn = element.querySelector('[data-locate]');
  const meStatus = element.querySelector('.map-me__status');

  const points = () => numberedPoints();
  // eventi del calendario nel riquadro di un punto (D145): se il Calendario è acceso (lo staff li vede sempre)
  const showEvents = () => staff || sectionOn('calendario');
  const visible = () => points().filter((p) => !filter || p.type === filter);
  const showError = (text) => {
    error.textContent = text;
    error.hidden = !text;
  };

  function renderLegend() {
    const used = new Set(points().map((p) => p.type));
    const types = MAP_TYPES.filter((t) => used.has(t.id));
    legend.innerHTML = types.length
      ? `<button type="button" class="map-chip${filter ? '' : ' is-active'}" data-filter="">Tutti</button>${types
          .map((t) => `<button type="button" class="map-chip${filter === t.id ? ' is-active' : ''}" data-filter="${t.id}" style="--marker-color: ${t.color}">
              <span class="map-chip__dot" aria-hidden="true">${t.icon}</span>${t.label}</button>`)
          .join('')}${
          me ? '<button type="button" class="map-chip map-chip--me" data-me style="--marker-color: #d62828"><span class="map-chip__dot" aria-hidden="true">🧍</span>Tu sei qui</button>' : ''
        }`
      : me
        ? '<button type="button" class="map-chip map-chip--me" data-me style="--marker-color: #d62828"><span class="map-chip__dot" aria-hidden="true">🧍</span>Tu sei qui</button>'
        : '';
  }

  /** Omino rosso sulla mappa (solo se la posizione cade dentro la mappa) */
  function renderMe() {
    stage.querySelector('.map-me-marker')?.remove();
    if (!me || me.x < 0 || me.x > 1 || me.y < 0 || me.y > 1) return;
    stage.insertAdjacentHTML('beforeend', `<div class="map-me-marker zoom-keep" style="left: ${me.x * 100}%; top: ${me.y * 100}%" aria-label="Tu sei qui" role="img">🧍</div>`);
  }

  function renderMarkers() {
    stage.querySelectorAll('.map-marker').forEach((m) => m.remove());
    stage.insertAdjacentHTML('beforeend', visible().map((p) => markerMarkup(p, p.id === selected)).join(''));
  }

  function renderList() {
    const all = points();
    const groups = MAP_TYPES.map((t) => ({ t, items: all.filter((p) => p.type === t.id) })).filter((g) => g.items.length && (!filter || g.t.id === filter));
    list.innerHTML = groups
      .map(
        ({ t, items }) => `
        <section class="map-group">
          <h2 class="map-group__title" style="--marker-color: ${t.color}"><span aria-hidden="true">${t.icon}</span> ${t.label}</h2>
          <ul class="map-group__list">${items
            .map((p) => `<li><button type="button" class="map-item${p.id === selected ? ' is-selected' : ''}" data-point="${p.id}" style="--marker-color: ${t.color}">
                <span class="map-item__number">${p.number}</span><span class="map-item__title">${escapeHtml(p.title)}</span></button></li>`)
            .join('')}</ul>
        </section>`,
      )
      .join('');
    empty.hidden = all.length > 0;
    empty.textContent = editing ? 'Non ci sono ancora punti: tocca un posto della mappa per aggiungerne uno.' : 'Non ci sono ancora punti sulla mappa.';
  }

  function renderInfo() {
    const p = points().find((x) => x.id === selected);
    info.hidden = !p;
    if (!p) return (info.innerHTML = '');
    const t = mapType(p.type);
    const links = p.lat != null ? directionsLinks(p) : null; // senza coordinate della mappa: niente "Apri con…"
    info.innerHTML = `
      <button type="button" class="map-info__close" data-close aria-label="Chiudi">✕</button>
      <p class="map-info__type" style="--marker-color: ${t.color}"><span class="map-item__number">${p.number}</span> ${t.icon} ${t.label}</p>
      <div class="map-info__head">
        <h2 class="map-info__title">${escapeHtml(p.title)}</h2>
        ${
          editing
            ? `<div class="map-info__tools">
                ${links ? '<button type="button" class="icon-button" data-open-with aria-expanded="false" aria-label="Apri con…" title="Apri con…">🚶</button>' : ''}
                <button type="button" class="icon-button" data-action="edit" aria-label="Modifica il punto" title="Modifica">✏️</button>
                <button type="button" class="icon-button" data-action="move" aria-label="Sposta il punto" title="Sposta">↔️</button>
                <button type="button" class="icon-button icon-button--danger" data-action="delete" aria-label="Elimina il punto" title="Elimina">🗑️</button>
              </div>`
            : ''
        }
      </div>
      ${p.description ? `<p class="map-info__text">${escapeHtml(p.description)}</p>` : ''}
      ${
        links
          ? `${editing ? '' : '<div class="map-info__actions"><button type="button" class="button" data-open-with aria-expanded="false">🚶 Apri con…</button></div>'}
            ${openWithMarkup(links)}`
          : ''
      }
      ${showEvents() ? pointEventsMarkup(p.id) : ''}`;
  }

  function renderAll() {
    renderLegend();
    renderMarkers();
    renderMe();
    renderList();
    renderInfo();
  }

  function select(id, { focus = false } = {}) {
    selected = id;
    renderMarkers();
    renderList();
    renderInfo();
    const p = points().find((x) => x.id === id);
    if (p && focus) {
      zoom?.focus(p.x, p.y);
      view.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ---------- Modifica (Mod e Admin) ----------

  async function savePoint(values, existing, x, y) {
    const res = await rpc('staff_map_save_point', {
      p_token: sessionToken(),
      p_id: existing?.id ?? null,
      p_type: values.type,
      p_title: values.title,
      p_description: values.description,
      p_x: x,
      p_y: y,
    });
    if (!res.ok) return showError(res.error === 'POINT_INVALID' ? 'Controlla il titolo.' : `Non salvato (${res.error}).`);
    showError('');
    const raw = cachedMap()?.points ?? [];
    setPoints(existing ? raw.map((p) => (p.id === res.point.id ? res.point : p)) : [...raw, res.point]);
    selected = res.point.id;
    renderAll();
  }

  // Finestra con i campi del punto
  async function editPoint(existing, x, y) {
    const values = await askDialog({
      title: existing ? 'Modifica il punto' : 'Nuovo punto',
      body: pointForm(existing ?? { type: filter ?? 'ristorazione' }),
      confirmLabel: 'Salva',
      validate: (v) => (!v.title?.trim() ? 'Scrivi il titolo.' : null),
    });
    if (values) await savePoint(values, existing, x ?? existing.x, y ?? existing.y);
  }

  async function deletePoint(p) {
    // eventi in quel posto (D145): restano nel calendario, senza location
    const n = eventsAt(p.id).length;
    const warning = n ? `<p>⚠️ Il punto ha <strong>${n === 1 ? '1 evento' : `${n} eventi`}</strong> nel calendario: ${n === 1 ? 'resterà' : 'resteranno'} senza location.</p>` : '';
    const ok = await askDialog({ title: 'Eliminare il punto?', body: `<p><strong>${escapeHtml(p.title)}</strong> sparisce dalla mappa.</p>${warning}`, confirmLabel: 'Elimina', danger: true });
    if (!ok) return;
    const res = await rpc('staff_map_delete_point', { p_token: sessionToken(), p_id: p.id });
    if (!res.ok) return showError(`Non eliminato (${res.error}).`);
    if (n) setEvents(cachedEvents().map((e) => (e.point === p.id ? { ...e, point: null } : e)));
    setPoints((cachedMap()?.points ?? []).filter((x) => x.id !== p.id));
    selected = null;
    renderAll();
  }

  // ---------- Eventi ----------

  function onTap({ x, y, target }) {
    const marker = target.closest?.('.map-marker');
    if (moving && x !== null && y !== null) {
      const p = moving;
      moving = null;
      hint.hidden = true;
      savePoint({ type: p.type, title: p.title, description: p.description ?? '' }, p, x, y);
      return;
    }
    if (marker) return select(Number(marker.dataset.point));
    if (target.closest?.('.map-info')) return;
    if (selected) return select(null); // con un punto aperto il tocco lo chiude soltanto
    if (editing && x !== null && y !== null) editPoint(null, x, y);
  }

  element.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-filter]');
    if (chip) {
      filter = chip.dataset.filter || null;
      if (selected && filter && points().find((p) => p.id === selected)?.type !== filter) selected = null;
      return renderAll();
    }
    const item = event.target.closest('.map-item');
    if (item) return select(Number(item.dataset.point), { focus: true });
    if (event.target.closest('[data-close]')) return select(null);
    if (handleOpenWithClick(event, info)) return;
    if (event.target.closest('[data-locate]')) return toggleMe();
    if (event.target.closest('[data-me]')) {
      if (me && me.x >= 0 && me.x <= 1 && me.y >= 0 && me.y <= 1) zoom?.focus(me.x, me.y, 1.5);
      return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    const p = points().find((x) => x.id === selected);
    if (!action || !p) return;
    if (action === 'edit') editPoint(p);
    if (action === 'delete') deletePoint(p);
    if (action === 'move') {
      moving = p;
      hint.hidden = false;
      hint.textContent = `Tocca sulla mappa la nuova posizione di "${p.title}".`;
    }
  });
  // il riquadro delle informazioni sta sopra la mappa: i suoi tocchi non devono spostarla
  info.addEventListener('pointerdown', (event) => event.stopPropagation());

  // ---------- La mia posizione (D142) ----------

  function stopMe() {
    clearTimeout(meTimer);
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    me = null;
    meBtn.textContent = '📍 Mostra la mia posizione';
    meStatus.textContent = '';
    renderAll();
  }

  // Posizione non ottenuta (D144): si dice solo il motivo probabile, senza i passi per le impostazioni
  function locationProblem(kind) {
    const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|Telegram/.test(navigator.userAgent);
    let cause;
    if (inApp) cause = "Sembra che hai aperto l'app dentro un'altra app (WhatsApp, Instagram, Facebook…), che non dà la posizione.";
    else if (kind === 'unsupported') cause = 'Sembra che hai un browser che non dà la posizione.';
    else if (kind === 'denied') cause = 'Sembra che hai bloccato la posizione per questo sito nelle impostazioni.';
    else cause = 'Sembra che hai la posizione del telefono spenta nelle impostazioni, oppure il segnale è troppo debole.';
    meStatus.textContent = 'Non riesco ad ottenere le tue coordinate.';
    askDialog({
      title: '📍 Posizione non disponibile',
      body: `<p>Non riesco ad ottenere le tue coordinate. ${cause}</p>`,
      confirmLabel: 'Ho capito',
      infoOnly: true,
    });
  }

  function toggleMe() {
    if (watchId !== null) return stopMe();
    const bounds = cachedMap()?.bounds;
    if (!bounds) return;
    if (!navigator.geolocation) return locationProblem('unsupported');
    meStatus.textContent = 'Cerco la tua posizione…';
    meBtn.textContent = '🙈 Nascondi la mia posizione';
    let first = true;
    // il "timeout" del browser non conta l'attesa del permesso: se il telefono non mostra la richiesta si resterebbe fermi
    meTimer = setTimeout(() => {
      if (destroyed || !first || watchId === null) return;
      stopMe();
      locationProblem('unavailable');
    }, 25000);
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (destroyed) return;
        clearTimeout(meTimer);
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        me = { ...latLngToXY(bounds, lat, lng), lat, lng, accuracy };
        const inside = me.x >= 0 && me.x <= 1 && me.y >= 0 && me.y <= 1;
        if (inside) {
          meStatus.textContent = `Tu sei qui (precisione ±${Math.round(accuracy)} m).`;
          if (first) zoom?.focus(me.x, me.y, 1.5);
        } else {
          const center = { lat: (bounds.north + bounds.south) / 2, lng: (bounds.west + bounds.east) / 2 };
          const km = distanceM({ lat, lng }, center) / 1000;
          meStatus.textContent = `Sei fuori dalla mappa, a circa ${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km.`;
        }
        first = false;
        renderLegend();
        renderMe();
      },
      (err) => {
        if (destroyed) return;
        stopMe();
        locationProblem(err.code === 1 ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }

  // ---------- Caricamento ----------

  async function load() {
    const [map] = await Promise.all([refreshMap(), showEvents() ? refreshEvents() : null]);
    if (destroyed) return;
    if (!map?.image) {
      view.hidden = true;
      legend.innerHTML = '';
      empty.hidden = false;
      empty.textContent = 'La mappa sarà disponibile a breve.';
      return;
    }
    const url = await mapImage().catch(() => null);
    if (destroyed) return;
    if (!url) return showError('Non riesco a scaricare la mappa. Riprova tra poco.');
    img.src = url;
    view.hidden = false;
    // licenze (D138, D139): OpenStreetMap; con la mappa disegnata dal paese anche OpenFreeMap e OpenMapTiles
    const credit = element.querySelector('.map-credit');
    const osm = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
    credit.innerHTML = map.bounds?.source === 'openfreemap' ? `${osm} · OpenFreeMap © OpenMapTiles` : osm;
    credit.hidden = !(map.bounds?.source === 'openfreemap' || mapFromOsm());
    view.classList.toggle('is-editing', editing);
    meBox.hidden = !map.bounds; // la posizione si può mostrare solo se la mappa ha le coordinate
    zoom?.destroy();
    zoom = createZoomView(view, stage, { width: map.image.width, height: map.image.height, onTap });
    // apertura sui punti (il rettangolo che li contiene tutti, con un margine); senza punti: la vista di apertura
    const pts = points();
    if (pts.length) {
      zoom.fitArea(Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y)));
    }
    renderAll();
  }

  renderAll();
  load();
  return {
    title: 'Mappa',
    element,
    destroy: () => {
      destroyed = true;
      clearTimeout(meTimer);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      zoom?.destroy();
    },
  };
}
