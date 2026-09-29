// Pannello staff → Giocatori: ricerca per nickname (niente elenco senza ricerca, risultati a pagine da 20, D74)
// e scheda con le azioni
// (reset PIN col codice del telefono, disattiva/riattiva, punti extra, cancella).

import { escapeHtml } from '../lib/dom.js';
import { deviceCode } from '../lib/device.js';
import { formatPoints } from '../lib/leaderboard.js';
import { avatarSvg, playerStatsMarkup } from '../components/player-card.js';
import { staffCall, formatDate, askDialog, pagerMarkup } from './staff-ui.js';

function resultsMarkup({ players, total, page, page_size: size }) {
  if (!players.length) return '<p class="leaderboard-note">Nessun giocatore trovato.</p>';
  return `<p class="staff-muted">${total === 1 ? '1 giocatore trovato' : `${total} giocatori trovati`}</p>
    <ul class="rank-list">${players
    .map(
      (p) => `
      <li>
        <button type="button" class="rank-row staff-player-row${p.disabled ? ' is-disabled' : ''}" data-nickname="${escapeHtml(p.nickname)}">
          <span class="rank-row__avatar" aria-hidden="true">${avatarSvg(p.avatar)}</span>
          <span class="rank-row__name">${escapeHtml(p.nickname)}${p.role === 'staff' ? ' <span class="me-tag">staff</span>' : ''}${p.disabled ? ' <span class="staff-tag staff-tag--off">disattivato</span>' : ''}</span>
          <span class="rank-row__points">${formatPoints(p.total)}</span>
        </button>
      </li>`,
    )
    .join('')}</ul>${pagerMarkup(page, total, size)}`;
}

function detailMarkup(p) {
  const codes = p.devices.map((d) => deviceCode(d.device_id));
  const devices = p.devices.length
    ? p.devices
        .map(
          (d) => `<li><strong class="device-code">${deviceCode(d.device_id)}</strong> · registrato ${formatDate(d.created_at)}${
            d.same_fingerprint ? ` · <span class="staff-warn">stessa impronta di altri ${d.same_fingerprint} account</span>` : ''
          }</li>`,
        )
        .join('')
    : '<li>Nessuno (account creato a mano)</li>';
  const sessions = p.sessions.length
    ? p.sessions.map((s) => `<li>${s.device_id ? `<strong class="device-code">${deviceCode(s.device_id)}</strong>` : 'telefono sconosciuto'} · ultimo uso ${formatDate(s.last_seen_at)}</li>`).join('')
    : '<li>Nessun accesso attivo</li>';
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
        p.disabled ? ' · <span class="staff-tag staff-tag--off">disattivato</span>' : ''
      }</p>
    </div>
    ${playerStatsMarkup(p.card)}

    <h3 class="staff-h3">📱 Codice del telefono</h3>
    <p class="staff-muted">Per il reset del PIN il codice mostrato dal giocatore deve essere uno di questi.</p>
    <ul class="staff-list">${devices}</ul>
    <h3 class="staff-h3">Accessi attivi</h3>
    <ul class="staff-list">${sessions}</ul>
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
            <button type="button" class="button button--secondary" data-action="toggle">${p.disabled ? '✅ Riattiva account' : '⛔ Disattiva account'}</button>
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
    const codes = current.devices.map((d) => deviceCode(d.device_id));

    if (action === 'back') {
      showList();
      search(lastQuery, lastPage);
    } else if (action === 'pin') {
      const values = await askDialog({
        title: `Nuovo PIN per ${escapeHtml(nick)}`,
        body: `
          <p>Prima controlla il <strong>codice del telefono</strong> che il giocatore ti mostra (Accedi → "Ho dimenticato il PIN"). Deve essere:</p>
          <p class="device-code device-code--big">${codes.length ? codes.join('<br>') : 'nessun telefono registrato'}</p>
          <label class="form-field"><span class="form-field__label">Nuovo PIN (4 cifre)</span>
            <input class="form-field__input form-field__input--pin" name="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off"></label>
          <p class="staff-muted">Dillo al giocatore a voce: potrà entrare subito con il nuovo PIN.</p>`,
        confirmLabel: 'Imposta PIN',
        validate: (v) => (/^[0-9]{4}$/.test(v.pin) ? null : 'Il PIN deve avere 4 cifre.'),
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
        title: disable ? `Disattivare ${escapeHtml(nick)}?` : `Riattivare ${escapeHtml(nick)}?`,
        body: disable
          ? '<p>Non potrà più entrare né giocare e sparirà dalla classifica. Il telefono resta legato: non potrà creare un altro account. Si può riattivare.</p>'
          : '<p>Potrà di nuovo entrare e tornerà in classifica.</p>',
        confirmLabel: disable ? 'Disattiva' : 'Riattiva',
        danger: disable,
      });
      if (ok && (await staffCall(ctx, 'set_disabled', { p_nickname: nick, p_disabled: disable }, detailError))) {
        showDetail(nick, disable ? '✅ Account disattivato.' : '✅ Account riattivato.');
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
