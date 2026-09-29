// Classifica (#/giochi/classifica, Tappa 6, D71): podio per i primi 3, poi le righe fino al 20°,
// primi 10 in "zona premi", la mia riga sempre evidenziata (a parte se sono oltre il 20°).
// Live: si aggiorna da sola finché la pagina è aperta (lib/leaderboard.js). Toccando un giocatore
// si apre la sua scheda punti (la stessa del profilo).

import { html, escapeHtml, openDialog, closeDialog } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { cachedLeaderboard, watchLeaderboard, fetchPlayerCard, formatPoints } from '../lib/leaderboard.js';
import { leaderboardView, PRIZE_POSITIONS } from '../lib/leaderboard-view.js';
import { avatarSvg, playerCardMarkup } from '../components/player-card.js';
import { currentPlayer } from '../lib/account.js';

const title = (closed) => (closed ? '🏆 Classifica finale' : '🏆 Classifica');

function podiumStep(entries, place) {
  const players = entries
    .map(
      (e) => `
        <button type="button" class="podium__player${e.isMe ? ' is-me' : ''}" data-nickname="${escapeHtml(e.nickname)}">
          <span class="podium__avatar" aria-hidden="true">${avatarSvg(e.avatar)}</span>
          <span class="podium__name">${escapeHtml(e.nickname)}${e.isMe ? ' <span class="me-tag">Tu</span>' : ''}</span>
        </button>`,
    )
    .join('');
  const points = entries.length ? `<span class="podium__points">${formatPoints(entries[0].total)}</span>` : '';
  return `
    <div class="podium__step podium__step--${place}${entries.length > 1 ? ' podium__step--shared' : ''}">
      <div class="podium__players">${players}</div>
      <div class="podium__block"><span class="podium__place">${place}°</span>${points}</div>
    </div>`;
}

function rowMarkup(e) {
  return `
    <li>
      <button type="button" class="rank-row${e.prize ? ' rank-row--prize' : ''}${e.isMe ? ' is-me' : ''}" data-nickname="${escapeHtml(e.nickname)}">
        <span class="rank-row__pos">${e.position}°</span>
        <span class="rank-row__avatar" aria-hidden="true">${avatarSvg(e.avatar)}</span>
        <span class="rank-row__name">${escapeHtml(e.nickname)}${e.isMe ? ' <span class="me-tag">Tu</span>' : ''}</span>
        <span class="rank-row__points">${formatPoints(e.total)}</span>
      </button>
    </li>`;
}

function boardMarkup(data) {
  if (!data.top.length) {
    return '<p class="leaderboard-empty">Nessuno ha ancora fatto punti: gioca e sarai il primo! 🍄</p>';
  }
  const { podium, rows, meOutside } = leaderboardView(data.top, data.me);
  let mine = '';
  if (meOutside) {
    mine = `<ul class="rank-list rank-list--me"><li class="rank-gap" aria-hidden="true">⋯</li>${rowMarkup(meOutside)}</ul>`;
  } else if (data.me && !data.me.position) {
    mine = '<p class="leaderboard-note">Non sei ancora in classifica: gioca per entrarci!</p>';
  } else if (!data.me && !currentPlayer()) {
    mine = '<p class="leaderboard-note"><a href="#/accedi">Accedi</a> per vedere la tua posizione.</p>';
  }
  return `
    <p class="leaderboard-prize">🎁 I primi ${PRIZE_POSITIONS} vincono un premio!</p>
    <div class="podium">${podiumStep(podium[2], 2)}${podiumStep(podium[1], 1)}${podiumStep(podium[3], 3)}</div>
    <ul class="rank-list">${rows.map(rowMarkup).join('')}</ul>
    ${mine}`;
}

export function renderLeaderboard() {
  const element = html(`
    <main class="page leaderboard-page">
      ${topBarMarkup()}
      <h1 class="page-title">${title(false)}</h1>
      <p class="leaderboard-offline" hidden>📡 Senza connessione</p>
      <div class="leaderboard-body"><p class="leaderboard-note">Caricamento…</p></div>
      <dialog class="dialog player-dialog" aria-labelledby="player-dialog-title">
        <h2 class="visually-hidden" id="player-dialog-title">Punti del giocatore</h2>
        <div class="player-dialog__body"></div>
        <div class="dialog__actions">
          <button type="button" class="button button--secondary" data-action="close">Chiudi</button>
        </div>
      </dialog>
    </main>
  `);
  bindTopBar(element);
  const heading = element.querySelector('.page-title');
  const body = element.querySelector('.leaderboard-body');
  const offline = element.querySelector('.leaderboard-offline');
  const dialog = element.querySelector('.player-dialog');
  const dialogBody = element.querySelector('.player-dialog__body');

  const cached = cachedLeaderboard();
  if (cached) {
    body.innerHTML = boardMarkup(cached);
    heading.textContent = title(cached.window === 'closed');
  }

  const stop = watchLeaderboard({
    onData: (data) => {
      body.innerHTML = boardMarkup(data);
    },
    onWindow: (state) => {
      heading.textContent = title(state === 'closed');
    },
    onOnline: (online) => {
      offline.hidden = online;
      if (!online && !cachedLeaderboard()) body.innerHTML = '<p class="leaderboard-note">Serve la connessione per vedere la classifica.</p>';
    },
  });

  // Tocco su un giocatore: la sua scheda punti
  let request = 0;
  body.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-nickname]');
    if (!target) return;
    const nickname = target.dataset.nickname;
    const mine = ++request;
    dialogBody.innerHTML = `<p class="leaderboard-note">Caricamento…</p>`;
    openDialog(dialog);
    try {
      const card = await fetchPlayerCard(nickname);
      if (mine !== request) return;
      dialogBody.innerHTML = card ? playerCardMarkup(card) : '<p>Giocatore non trovato.</p>';
    } catch {
      if (mine === request) dialogBody.innerHTML = '<p>Serve la connessione per vedere i punti del giocatore.</p>';
    }
  });
  dialog.querySelector('[data-action="close"]').addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog(dialog); // tocco fuori dalla finestra
  });

  return { title: 'Classifica', element, destroy: stop };
}
