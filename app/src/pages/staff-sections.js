// Pannello staff → Da controllare, Telefoni sospetti, Impostazioni, Classifica completa (CSV), Registro.

import { escapeHtml } from '../lib/dom.js';
import { formatPoints } from '../lib/leaderboard.js';
import { GAMES } from '../games/registry.js';
import { deviceCode } from '../lib/device.js';
import { noteLabel, toCsv, downloadText } from '../lib/staff.js';
import { staffCall, formatDate, askDialog, pagerMarkup } from './staff-ui.js';
import { openReplay } from './staff-replay.js';

const gameName = (id) => GAMES[id]?.name ?? id;

// ---------- Da controllare ----------

const REVIEW_KINDS = {
  flagged: { label: '🚩 Segnalate', help: 'Partite strane (possibili bot): <strong>contano già</strong> in classifica finché non decidete.', empty: 'Nessuna partita segnalata. 👍' },
  rejected: { label: '⛔ Escluse', help: 'Partite scartate dal server (dati impossibili): <strong>non contano</strong> finché non decidete.', empty: 'Nessuna partita esclusa. 👍' },
};

export function renderReviewSection(root, ctx) {
  let kind = 'flagged';
  let attempts = [];
  root.innerHTML = `
    <div class="review-switch" role="tablist" aria-label="Tipo di partite"></div>
    <p class="staff-muted review-help"></p>
    <div class="form-error" role="alert" hidden></div>
    <div class="staff-review-list"><p class="leaderboard-note">Caricamento…</p></div>`;
  const switchEl = root.querySelector('.review-switch');
  const help = root.querySelector('.review-help');
  const error = root.querySelector('.form-error');
  const list = root.querySelector('.staff-review-list');

  function render() {
    const count = (k) => attempts.filter((x) => x.status === k).length;
    switchEl.innerHTML = Object.entries(REVIEW_KINDS)
      .map(
        ([k, v]) => `<button type="button" role="tab" class="review-switch__option review-switch__option--${k}${k === kind ? ' is-active' : ''}"
          aria-selected="${k === kind}" data-kind="${k}">${v.label}<span class="review-switch__count">${count(k)}</span></button>`,
      )
      .join('');
    help.innerHTML = `${REVIEW_KINDS[kind].help} Rivedile e scegli: Approva, Conferma esclusione oppure Ban del giocatore.`;
    const shown = attempts.filter((x) => x.status === kind);
    list.innerHTML = shown.length
      ? `<ul class="review-items">${shown
          .map(
            (a) => `
          <li class="review-item">
            <dl class="review-card">
              <dt>Giocatore</dt><dd><strong>${escapeHtml(a.nickname)}</strong></dd>
              <dt>Gioco</dt><dd>${escapeHtml(gameName(a.game_id))}</dd>
              <dt>Quando</dt><dd>${formatDate(a.submitted_at)}</dd>
              <dt>Punti</dt><dd><strong>${a.raw_score ?? '—'}</strong>${a.client_score !== null && a.client_score !== a.raw_score && a.game_id !== 'quiz' ? ` (il telefono diceva ${a.client_score})` : ''}</dd>
              <dt>Motivo</dt><dd class="staff-warn">${a.notes.map((n) => escapeHtml(noteLabel(n))).join('<br>') || '—'}</dd>
            </dl>
            <button type="button" class="button" data-replay="${a.id}">▶ Rivedi partita</button>
          </li>`,
          )
          .join('')}</ul>`
      : `<p class="leaderboard-note">${REVIEW_KINDS[kind].empty}</p>`;
  }

  async function load() {
    const res = await staffCall(ctx, 'review_list', {}, error);
    if (!res) return;
    attempts = res.attempts;
    render();
  }

  root.addEventListener('click', (event) => {
    const option = event.target.closest('[data-kind]');
    if (option) {
      kind = option.dataset.kind;
      render();
      return;
    }
    const replay = event.target.closest('[data-replay]');
    if (replay) openReplay(replay.dataset.replay, ctx, error, (changed) => changed && load());
  });

  load();
}

// ---------- Telefoni sospetti ----------

export async function renderSuspiciousSection(root, ctx) {
  root.innerHTML = `
    <h3 class="staff-h3">📵 Telefoni bloccati</h3>
    <div class="staff-banned"><p class="leaderboard-note">Caricamento…</p></div>
    <h3 class="staff-h3">🔎 Telefoni sospetti</h3>
    <p class="staff-muted">Account registrati da telefoni con la <strong>stessa impronta tecnica</strong>. È solo un indizio: telefoni dello stesso modello
      con lo stesso browser possono avere la stessa impronta anche se sono di persone diverse.</p>
    <div class="form-error" role="alert" hidden></div>
    <div class="staff-suspicious"><p class="leaderboard-note">Caricamento…</p></div>`;
  const banned = root.querySelector('.staff-banned');
  async function loadBanned() {
    const list = await staffCall(ctx, 'banned_devices', {}, root.querySelector('.form-error'));
    if (!list) return;
    banned.innerHTML = list.devices.length
      ? `<ul class="staff-list">${list.devices
          .map(
            (d) => `<li><strong class="device-code">${deviceCode(d.device_id)}</strong>${d.nickname ? ` (di ${escapeHtml(d.nickname)})` : ''} · bloccato da ${escapeHtml(d.staff)} ${formatDate(d.banned_at)}
              <button type="button" class="staff-link" data-unban="${d.device_id}">🔓 Sblocca</button></li>`,
          )
          .join('')}</ul>`
      : '<p class="staff-muted">Nessun telefono bloccato. Si bloccano dalla scheda di un giocatore (Giocatori).</p>';
  }
  banned.addEventListener('click', async (event) => {
    const id = event.target.closest('[data-unban]')?.dataset.unban;
    if (!id) return;
    const ok = await askDialog({ title: `Sbloccare il telefono ${deviceCode(id)}?`, body: '<p>Da questo telefono si potrà di nuovo entrare e giocare.</p>', confirmLabel: 'Sblocca' });
    if (ok && (await staffCall(ctx, 'ban_device', { p_device_id: id, p_ban: false }, root.querySelector('.form-error')))) loadBanned();
  });
  loadBanned();

  const res = await staffCall(ctx, 'suspicious_devices', {}, root.querySelector('.form-error'));
  if (!res) return;
  root.querySelector('.staff-suspicious').innerHTML = res.groups.length
    ? `<ul class="review-items">${res.groups
        .map((g) => `<li class="review-item"><p><strong>${g.count} account</strong> · impronta ${escapeHtml(g.fingerprint)}</p><p>${g.nicknames.map(escapeHtml).join(', ')}</p></li>`)
        .join('')}</ul>`
    : '<p class="leaderboard-note">Nessun gruppo sospetto. 👍</p>';
}

// ---------- Classifica completa (50 per pagina; il CSV scarica tutta la classifica) ----------

export function renderLeaderboardSection(root, ctx) {
  root.innerHTML = '<div class="form-error" role="alert" hidden></div><div class="staff-board"><p class="leaderboard-note">Caricamento…</p></div>';
  const error = root.querySelector('.form-error');
  const board = root.querySelector('.staff-board');
  const games = Object.values(GAMES);

  async function load(page) {
    const res = await staffCall(ctx, 'leaderboard', { p_page: page }, error);
    if (!res) return;
    board.innerHTML = `
      <p>${res.total} giocatori in classifica${res.window === 'closed' ? ' · <strong>Classifica finale</strong>' : ''}.</p>
      <button type="button" class="button" data-action="csv">⬇️ Scarica CSV (tutta la classifica)</button>
      <div class="staff-table-wrap"><table class="staff-table">
        <thead><tr><th>Pos.</th><th>Nickname</th><th>Totale</th>${games.map((g) => `<th>${escapeHtml(g.name)}</th>`).join('')}<th>Extra</th></tr></thead>
        <tbody>${res.rows
          .map(
            (r) => `<tr${r.position <= 10 ? ' class="is-prize"' : ''}><td>${r.position}°</td><td>${escapeHtml(r.nickname)}</td><td><strong>${formatPoints(r.total)}</strong></td>${games
              .map((g) => `<td>${r.best[g.id] ?? '—'}</td>`)
              .join('')}<td>${r.extra_total || ''}</td></tr>`,
          )
          .join('')}</tbody>
      </table></div>
      ${pagerMarkup(res.page, res.total, res.page_size)}`;
  }

  root.addEventListener('click', async (event) => {
    const page = event.target.closest('[data-page]');
    if (page) {
      await load(Number(page.dataset.page));
      root.scrollIntoView({ block: 'start' });
      return;
    }
    if (!event.target.closest('[data-action="csv"]')) return;
    const all = await staffCall(ctx, 'leaderboard', { p_all: true }, error);
    if (!all) return;
    const rows = [
      ['Posizione', 'Nickname', 'Totale', ...games.map((g) => g.name), 'Punti extra'],
      ...all.rows.map((r) => [r.position, r.nickname, r.total, ...games.map((g) => r.best[g.id] ?? ''), r.extra_total]),
    ];
    downloadText(`classifica-sagra-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  });

  load(0);
}

// ---------- Registro delle azioni ----------

const ACTIONS = {
  reset_pin: 'ha reimpostato il PIN di',
  disable: 'ha bannato l\'account di',
  enable: 'ha tolto il ban a',
  device_ban: 'ha bloccato il telefono di',
  device_unban: 'ha sbloccato il telefono di',
  delete: 'ha cancellato',
  extra_points: 'ha dato punti extra a',
  extra_points_removed: 'ha tolto punti extra a',
  attempt_valid: 'ha approvato una partita di',
  attempt_rejected: 'ha scartato una partita di',
  ban: 'ha bannato',
  exclusion: 'ha confermato l\'esclusione di una partita di',
  settings: 'ha cambiato le impostazioni',
  role: 'ha cambiato il ruolo di',
  menu: 'ha caricato un nuovo menù',
  game: 'ha cambiato la durata di',
  quiz: 'ha modificato le domande del quiz',
};

// Filtro "tipo di azione" → valore passato al server
const ACTION_FILTERS = [
  ['', 'Tutte le azioni'],
  ['reset_pin', 'Reset PIN'],
  ['ban', 'Ban di giocatori'],
  ['exclusion', 'Esclusioni confermate'],
  ['account', 'Account (ban, togli ban, cancella)'],
  ['device_ban', 'Telefoni bloccati'],
  ['extra', 'Punti extra'],
  ['attempt', 'Partite approvate'],
  ['settings', 'Impostazioni'],
  ['role', 'Ruoli'],
  ['menu', 'Menù'],
  ['game', 'Durata dei giochi'],
  ['quiz', 'Domande del quiz'],
];

export function renderLogSection(root, ctx) {
  root.innerHTML = `
    <form class="staff-filters" role="search" novalidate>
      <label class="staff-filters__field"><span>Giorno</span><input class="form-field__input" type="date" name="day"></label>
      <label class="staff-filters__field"><span>Operatore</span><select class="form-field__input" name="staff"><option value="">Tutti</option></select></label>
      <label class="staff-filters__field staff-filters__field--wide"><span>Azione</span><select class="form-field__input" name="kind">
        ${ACTION_FILTERS.map(([v, label]) => `<option value="${v}">${label}</option>`).join('')}
      </select></label>
      <button type="submit" class="button">Cerca</button>
    </form>
    <div class="form-error" role="alert" hidden></div>
    <div class="staff-log staff-results"><p class="leaderboard-note">Caricamento…</p></div>`;
  const form = root.querySelector('.staff-filters');
  const error = root.querySelector('.form-error');
  const list = root.querySelector('.staff-log');
  let operatorsLoaded = false;

  async function load(page) {
    const res = await staffCall(
      ctx,
      'log_list',
      { p_page: page, p_day: form.day.value || null, p_staff: form.staff.value || null, p_action: form.kind.value || null },
      error,
    );
    if (!res) return;
    if (!operatorsLoaded) {
      operatorsLoaded = true;
      form.staff.insertAdjacentHTML('beforeend', res.operators.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join(''));
    }
    list.innerHTML = res.entries.length
      ? `<p class="staff-muted">${res.total} azioni</p><ul class="staff-list">${res.entries
          .map((e) => {
            const roleName = (r) => ({ player: 'giocatore', staff: 'Mod', admin: 'Admin' })[r] ?? escapeHtml(String(r));
            const extra = e.details?.points
              ? ` (${e.details.points > 0 ? '+' : ''}${e.details.points}: ${escapeHtml(e.details.reason ?? '')})`
              : e.action === 'role' && e.details
                ? ` (${roleName(e.details.from)} → ${roleName(e.details.to)})`
                : '';
            return `<li>${formatDate(e.created_at)} · <strong>${escapeHtml(e.staff)}</strong> ${ACTIONS[e.action] ?? escapeHtml(e.action)} ${e.target ? `<strong>${escapeHtml(e.target)}</strong>` : ''}${extra}</li>`;
          })
          .join('')}</ul>${pagerMarkup(res.page, res.total, res.page_size)}`
      : '<p class="leaderboard-note">Nessuna azione con questi filtri.</p>';
  }

  // Appena si tocca un filtro, la barra va in cima allo schermo e lì resta (come nella ricerca giocatori)
  form.addEventListener('focusin', () => form.scrollIntoView({ block: 'start', behavior: 'smooth' }), { once: true });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    load(0);
  });
  list.addEventListener('click', async (event) => {
    const page = event.target.closest('[data-page]');
    if (!page) return;
    await load(Number(page.dataset.page));
    form.scrollIntoView({ block: 'start' });
  });

  load(0);
}
