// Pannello staff → Giocatori: ricerca per nickname (niente elenco senza ricerca, risultati a pagine da 20, D74)
// e scheda con le azioni
// (reset PIN col codice del telefono, disattiva/riattiva, punti extra, cancella).

import { escapeHtml } from '../lib/dom.js';
import { deviceCode } from '../lib/device.js';
import { formatPoints } from '../lib/leaderboard.js';
import { avatarSvg, playerStatsMarkup } from '../components/player-card.js';
import { staffCall, formatDate, askDialog, pagerMarkup } from './staff-ui.js';
import { pinProblem } from '../lib/pin.js';
import { authErrorMessage } from './auth-messages.js';
import { deviceKind, deviceName, browserName, DEVICE_ICONS } from '../lib/staff.js';

function resultsMarkup({ players, total, page, page_size: size }) {
  if (!players.length) return '<p class="leaderboard-note">Nessun giocatore trovato.</p>';
  return `<p class="staff-muted">${total === 1 ? '1 giocatore trovato' : `${total} giocatori trovati`}</p>
    <ul class="rank-list">${players
    .map(
      (p) => `
      <li>
        <button type="button" class="rank-row staff-player-row${p.disabled ? ' is-disabled' : ''}" data-nickname="${escapeHtml(p.nickname)}">
          <span class="rank-row__avatar" aria-hidden="true">${avatarSvg(p.avatar)}</span>
          <span class="rank-row__name">${escapeHtml(p.nickname)}${p.role === 'staff' ? ' <span class="me-tag">staff</span>' : ''}${p.disabled ? ' <span class="staff-tag staff-tag--off">bannato</span>' : ''}</span>
          <span class="rank-row__points">${formatPoints(p.total)}</span>
        </button>
      </li>`,
    )
    .join('')}</ul>${pagerMarkup(page, total, size)}`;
}

/** "📱 iPhone", "💻 Windows"... sotto il codice */
function kindLabel(ua) {
  const kind = deviceKind(ua);
  const name = deviceName(ua);
  if (!kind && !name) return 'Dispositivo sconosciuto';
  return `${kind ? `${DEVICE_ICONS[kind]} ` : ''}${name ?? (kind === 'mobile' ? 'Telefono' : 'Computer')}`;
}

/** Telefoni del giocatore senza ripetizioni: quello della registrazione e quelli con un accesso attivo */
export function playerPhones(p) {
  const byId = new Map();
  const get = (id) => {
    if (!byId.has(id)) byId.set(id, { id, registration: false, active: false, banned: false, sameFingerprint: 0, userAgent: null });
    return byId.get(id);
  };
  for (const d of p.devices) Object.assign(get(d.device_id), { registration: true, banned: d.banned, sameFingerprint: d.same_fingerprint, userAgent: d.user_agent ?? null });
  for (const s of p.sessions) {
    if (!s.device_id) continue;
    const phone = get(s.device_id);
    phone.active = true;
    phone.banned = phone.banned || s.banned;
    phone.userAgent = phone.userAgent ?? s.user_agent ?? null;
  }
  return [...byId.values()];
}

function detailMarkup(p) {
  const codes = p.devices.map((d) => deviceCode(d.device_id));
  // Telefoni del giocatore, ognuno una volta sola (D79): 📝 = registrazione, 🟢 = accesso attivo ora;
  // accanto il bottone per bloccarlo / sbloccarlo (D78)
  const phones = playerPhones(p);
  const devices = phones.length
    ? phones
        .map(
          (d) => `<li class="phone-row">
            <div class="phone-row__info">
              <span class="phone-row__code">
                <strong class="device-code">${deviceCode(d.id)}</strong>
                ${d.registration ? '<span class="phone-icon" title="Telefono della registrazione" aria-label="Telefono della registrazione">📝</span>' : ''}
                ${d.active ? '<span class="phone-icon" title="Accesso attivo" aria-label="Accesso attivo">🟢</span>' : ''}
              </span>
              <span class="phone-row__kind">${kindLabel(d.userAgent)}${d.banned ? ' · <span class="staff-tag staff-tag--off">📵 bloccato</span>' : ''}</span>
              ${d.sameFingerprint ? `<span class="staff-warn">stessa impronta di altri ${d.sameFingerprint} account</span>` : ''}
            </div>
            <div class="phone-row__actions">
              <button type="button" class="icon-button${d.banned ? '' : ' icon-button--danger'}" data-action="${d.banned ? 'device-unban' : 'device-ban'}" data-device="${d.id}"
                title="${d.banned ? 'Sblocca device' : 'Ban device'}" aria-label="${d.banned ? 'Sblocca device' : 'Ban device'} ${deviceCode(d.id)}">${d.banned ? '🔓' : '📵'}</button>
              <button type="button" class="icon-button" data-action="accesses" data-device="${d.id}"
                title="Ultimi accessi da questo telefono" aria-label="Ultimi accessi dal telefono ${deviceCode(d.id)}">🕒</button>
            </div>
          </li>`,
        )
        .join('')
    : '<li>Nessuno (account creato a mano)</li>';
  const games = p.games
    .map(
      (g) => `<tr><td>${escapeHtml(g.name)}</td><td>${g.best ?? '—'}</td><td>${g.valid}</td><td>${g.flagged ? `<span class="staff-warn">${g.flagged}</span>` : 0}</td><td>${g.rejected}</td></tr>`,
    )
    .join('');
  const extra = p.extra_points.length
    ? `<ul class="staff-list">${p.extra_points
        .map(
          (e) => `<li>${e.points > 0 ? '+' : ''}${formatPoints(e.points)} · ${escapeHtml(e.reason)} · ${formatDate(e.created_at)}
                 <button type="button" class="staff-link" data-action="extra-remove" data-id="${e.id}">togli</button></li>`,
        )
        .join('')}</ul>`
    : '<p class="staff-muted">Nessuno.</p>';
  const isPlayer = p.role === 'player';
  return `
    <button type="button" class="staff-link" data-action="back">← Torna ai risultati</button>
    <div class="profile-card profile-card--compact">
      <span class="profile-card__avatar" aria-hidden="true">${avatarSvg(p.avatar)}</span>
      <p class="profile-card__nickname">${escapeHtml(p.nickname)}</p>
      <p class="profile-card__character">${p.role === 'staff' ? 'Staff' : 'Giocatore'} · registrato ${formatDate(p.created_at)}${
        p.disabled ? ' · <span class="staff-tag staff-tag--off">bannato</span>' : ''
      }</p>
    </div>
    ${playerStatsMarkup(p.card)}

    <h3 class="staff-h3">📱 Codici dei devices</h3>
    <p class="staff-muted phone-legend">📝 Registrazione · 🟢 Attivo · 📵 Ban device · 🕒 Ultimi accessi</p>
    <ul class="phone-list">${devices}</ul>
    ${p.login_failures ? `<p class="staff-warn">PIN sbagliato ${p.login_failures} volte negli ultimi 15 minuti.</p>` : ''}

    <h3 class="staff-h3">Partite</h3>
    <div class="staff-table-wrap"><table class="staff-table">
      <thead><tr><th>Gioco</th><th>Migliore</th><th>Valide</th><th>Segnalate</th><th>Escluse</th></tr></thead>
      <tbody>${games}</tbody>
    </table></div>

    <h3 class="staff-h3">⭐ Punti extra</h3>
    ${extra}

    ${
      isPlayer
        ? `<div class="staff-actions">
            <button type="button" class="button" data-action="pin">🔑 Reimposta PIN</button>
            <button type="button" class="button button--secondary" data-action="extra">⭐ Dai punti extra</button>
            <button type="button" class="button button--secondary" data-action="toggle">${p.disabled ? '✅ Togli ban' : '⛔ Ban account'}</button>
            <button type="button" class="button button--danger" data-action="delete">🗑️ Cancella account</button>
          </div>`
        : '<p class="staff-muted">Gli account staff si gestiscono dal database.</p>'
    }
    <div class="form-error" role="alert" hidden></div>
    <p class="staff-ok" role="status" hidden></p>`;
}

export function renderPlayersSection(root, ctx) {
  root.innerHTML = `
    <form class="staff-search" role="search" novalidate>
      <label class="visually-hidden" for="staff-q">Cerca nickname</label>
      <input class="form-field__input" id="staff-q" type="search" name="q" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Cerca nickname (anche una parte)">
      <button type="submit" class="button">Cerca</button>
    </form>
    <div class="form-error" role="alert" hidden></div>
    <div class="staff-results"><p class="leaderboard-note">Scrivi un nickname, o una parte, e premi Cerca.</p></div>
    <div class="staff-detail" hidden></div>`;
  const form = root.querySelector('.staff-search');
  const input = root.querySelector('input');
  const error = root.querySelector('.form-error');
  const results = root.querySelector('.staff-results');
  const detail = root.querySelector('.staff-detail');
  let request = 0;
  let current = null;
  let lastQuery = '';
  let lastPage = 0;

  async function search(query = lastQuery, page = 0) {
    lastQuery = query.trim();
    lastPage = page;
    if (!lastQuery) {
      results.innerHTML = '<p class="leaderboard-note">Scrivi un nickname, o una parte, e premi Cerca.</p>';
      return;
    }
    const mine = ++request;
    results.innerHTML = '<p class="leaderboard-note">Ricerca…</p>';
    const res = await staffCall(ctx, 'search_players', { p_query: lastQuery, p_page: page }, error);
    if (res && mine === request) results.innerHTML = resultsMarkup(res);
  }

  // Appena si inizia a scrivere, la barra di ricerca va in cima allo schermo (e lì resta, fissa)
  const pinSearch = () => form.scrollIntoView({ block: 'start', behavior: 'smooth' });

  function showList() {
    detail.hidden = true;
    results.hidden = false;
    form.style.display = '';
    current = null;
  }

  async function showDetail(nickname, okMessage) {
    const res = await staffCall(ctx, 'player_detail', { p_nickname: nickname }, error);
    if (!res) return;
    current = res.player;
    detail.innerHTML = detailMarkup(current);
    detail.hidden = false;
    results.hidden = true;
    form.style.display = 'none';
    if (okMessage) {
      const ok = detail.querySelector('.staff-ok');
      ok.textContent = okMessage;
      ok.hidden = false;
    }
    window.scrollTo(0, 0);
  }

  input.addEventListener('focus', pinSearch);
  input.addEventListener('input', pinSearch, { once: true });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    input.blur(); // chiude la tastiera per vedere i risultati
    search(input.value, 0);
  });
  results.addEventListener('click', (event) => {
    const page = event.target.closest('[data-page]');
    if (page) {
      search(lastQuery, Number(page.dataset.page));
      pinSearch();
      return;
    }
    const nickname = event.target.closest('[data-nickname]')?.dataset.nickname;
    if (nickname) showDetail(nickname);
  });

  detail.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || !current) return;
    const nick = current.nickname;
    const detailError = detail.querySelector('.form-error');
    const codes = playerPhones(current).map((d) => deviceCode(d.id));

    if (action === 'back') {
      showList();
      search(lastQuery, lastPage);
    } else if (action === 'pin') {
      const values = await askDialog({
        title: `Nuovo PIN per ${escapeHtml(nick)}`,
        body: `
          <p>Prima controlla il <strong>codice del telefono</strong> che il giocatore ti mostra (Accedi → "Ho dimenticato il PIN"). Deve essere:</p>
          <p class="device-code device-code--big">${codes.length ? codes.join('<br>') : 'nessun telefono registrato'}</p>
          <label class="form-field"><span class="form-field__label">Nuovo PIN (5 cifre)</span>
            <input class="form-field__input form-field__input--pin" name="pin" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off"></label>
          <p class="staff-muted">Dillo al giocatore a voce: potrà entrare subito con il nuovo PIN.</p>`,
        confirmLabel: 'Imposta PIN',
        validate: (v) => (pinProblem(v.pin) ? authErrorMessage({ error: pinProblem(v.pin) }) : null),
      });
      if (values && (await staffCall(ctx, 'reset_pin', { p_nickname: nick, p_new_pin: values.pin }, detailError))) {
        showDetail(nick, `✅ Nuovo PIN impostato: ${values.pin}`);
      }
    } else if (action === 'extra') {
      const values = await askDialog({
        title: `Punti extra a ${escapeHtml(nick)}`,
        body: `
          <label class="form-field"><span class="form-field__label">Punti (usa il meno per toglierli, es. -50)</span>
            <input class="form-field__input" name="points" inputmode="numeric" autocomplete="off"></label>
          <label class="form-field"><span class="form-field__label">Motivo</span>
            <input class="form-field__input" name="reason" maxlength="200" autocomplete="off"></label>`,
        confirmLabel: 'Assegna',
        validate: (v) => {
          const n = Number(v.points);
          if (!Number.isInteger(n) || n === 0) return 'Scrivi un numero intero diverso da zero.';
          if (v.reason.trim().length < 2) return 'Scrivi il motivo.';
          return null;
        },
      });
      if (values && (await staffCall(ctx, 'add_extra_points', { p_nickname: nick, p_points: Number(values.points), p_reason: values.reason }, detailError))) {
        showDetail(nick, '✅ Punti extra assegnati: la classifica è già aggiornata.');
      }
    } else if (action === 'extra-remove') {
      const id = Number(event.target.closest('[data-id]').dataset.id);
      const ok = await askDialog({ title: 'Togliere questi punti extra?', confirmLabel: 'Togli' });
      if (ok && (await staffCall(ctx, 'delete_extra_points', { p_id: id }, detailError))) showDetail(nick, '✅ Punti extra tolti.');
    } else if (action === 'toggle') {
      const disable = !current.disabled;
      const ok = await askDialog({
        title: disable ? `Ban dell'account ${escapeHtml(nick)}?` : `Togliere il ban a ${escapeHtml(nick)}?`,
        body: disable
          ? '<p>Non potrà più entrare né giocare e sparirà dalla classifica (i punteggi restano salvati). Il suo telefono resta legato a questo account: non potrà crearne un altro. Si può togliere il ban.</p>'
          : '<p>Potrà di nuovo entrare e tornerà in classifica con i suoi punteggi.</p>',
        confirmLabel: disable ? 'Ban' : 'Togli ban',
        danger: disable,
      });
      if (ok && (await staffCall(ctx, 'set_disabled', { p_nickname: nick, p_disabled: disable }, detailError))) {
        showDetail(nick, disable ? '✅ Account bannato.' : '✅ Ban tolto.');
      }
    } else if (action === 'accesses') {
      const deviceId = event.target.closest('[data-device]').dataset.device;
      const res = await staffCall(ctx, 'player_accesses', { p_nickname: nick, p_device_id: deviceId }, detailError);
      if (!res) return;
      const rows = res.accesses.length
        ? `<table class="access-table">
            <thead><tr><th>Data e ora</th><th>Browser</th></tr></thead>
            <tbody>${res.accesses
              .map((a) => `<tr><td>${formatDate(a.created_at)}</td><td>${escapeHtml(browserName(a.user_agent))}</td></tr>`)
              .join('')}</tbody>
          </table>`
        : '<p>Nessun accesso.</p>';
      await askDialog({
        title: 'Ultimi 20 accessi',
        body: rows,
        confirmLabel: 'Chiudi',
        infoOnly: true,
      });
    } else if (action === 'device-ban' || action === 'device-unban') {
      const ban = action === 'device-ban';
      const deviceId = event.target.closest('[data-device]').dataset.device;
      const ok = await askDialog({
        title: ban ? `Bloccare il telefono ${deviceCode(deviceId)}?` : `Sbloccare il telefono ${deviceCode(deviceId)}?`,
        body: ban
          ? '<p>Da questo telefono <strong>non si potrà più entrare con nessun account</strong> (nemmeno quello di un amico) né registrarsene uno nuovo. Chi è dentro da lì viene fatto uscire. Si può sbloccare.</p>'
          : '<p>Da questo telefono si potrà di nuovo entrare e giocare.</p>',
        confirmLabel: ban ? 'Blocca telefono' : 'Sblocca',
        danger: ban,
      });
      if (ok && (await staffCall(ctx, 'ban_device', { p_device_id: deviceId, p_ban: ban }, detailError))) {
        showDetail(nick, ban ? '✅ Telefono bloccato.' : '✅ Telefono sbloccato.');
      }
    } else if (action === 'delete') {
      const values = await askDialog({
        title: `Cancellare ${escapeHtml(nick)} per sempre?`,
        body: `
          <p>Spariscono <strong>account, punteggi e punti extra</strong>. Il telefono torna libero: la persona potrà registrarsi di nuovo. <strong>Non si può annullare.</strong></p>
          <label class="form-field"><span class="form-field__label">Per confermare, scrivi il nickname: ${escapeHtml(nick)}</span>
            <input class="form-field__input" name="confirm" autocomplete="off" autocapitalize="off" spellcheck="false"></label>`,
        confirmLabel: 'Cancella per sempre',
        danger: true,
        validate: (v) => (v.confirm.trim().toLowerCase() === nick.toLowerCase() ? null : 'Il nickname scritto non corrisponde.'),
      });
      if (values && (await staffCall(ctx, 'delete_player', { p_nickname: nick, p_confirm: values.confirm }, detailError))) {
        showList();
        await search(lastQuery, lastPage);
        const ok = root.querySelector('.staff-results');
        ok.insertAdjacentHTML('afterbegin', `<p class="staff-ok">✅ ${escapeHtml(nick)} cancellato.</p>`);
      }
    }
  });

}
