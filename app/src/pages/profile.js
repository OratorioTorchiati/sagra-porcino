// Il mio profilo (docs/01-SPECIFICHE.md §10): personaggio, nickname, punti (Tappa 6: totale, posizione,
// migliori per gioco, punti extra; la stessa scheda che si apre toccando un giocatore in classifica), Esci.
// Il QR per il premio arriva con la Tappa 8.

import { html, escapeHtml, openDialog, closeDialog } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { currentPlayer, logout, refreshProfile } from '../lib/account.js';
import { characterById } from '../characters/characters.js';
import avatarAnonimoSvg from '../assets/avatar-anonimo.svg?raw';
import { playerStatsMarkup } from '../components/player-card.js';
import { cachedMyCard, fetchPlayerCard } from '../lib/leaderboard.js';

function statsMarkup(player, card) {
  if (player.role === 'staff') return '<p class="notice">🛠️ Sei dello <strong>staff</strong>: i tuoi punti non vanno in classifica.</p>';
  if (!card) return '<p class="leaderboard-note">Caricamento dei punti…</p>';
  return `${playerStatsMarkup(card)}<a class="button button--leaderboard" href="#/giochi/classifica">🏆 Vai alla classifica</a>`;
}

function loggedMarkup(player, card) {
  const character = characterById(player.avatar);
  return `
    <div class="profile-card">
      <span class="profile-card__avatar" aria-hidden="true">${character ? character.svg : avatarAnonimoSvg}</span>
      <p class="profile-card__nickname">${escapeHtml(player.nickname)}</p>
      ${character ? `<p class="profile-card__character">${escapeHtml(character.name)}</p>` : ''}
    </div>
    <div class="profile-stats">${statsMarkup(player, card)}</div>
    <div class="logout">
      <button type="button" class="button button--secondary" data-action="logout">Esci</button>
    </div>
    <!-- Conferma in una finestra davanti a tutto: visibile su qualsiasi telefono, senza scorrere -->
    <dialog class="dialog dialog--confirm" aria-labelledby="logout-title">
      <h2 class="dialog__title" id="logout-title">Vuoi davvero uscire?</h2>
      <p>Per rientrare ti serviranno <strong>nickname e PIN</strong>.</p>
      <div class="logout__actions">
        <button type="button" class="button" data-action="logout-confirm">Sì, esci</button>
        <button type="button" class="button button--secondary" data-action="logout-cancel">Annulla</button>
      </div>
    </dialog>
  `;
}

const guestMarkup = `
  <div class="profile-card">
    <span class="profile-card__avatar" aria-hidden="true">${avatarAnonimoSvg}</span>
    <p>Crea un account per giocare, fare punti e vincere un premio!</p>
  </div>
  <div class="auth-choices">
    <a class="button button--play" href="#/registrati">Registrati</a>
    <a class="button button--secondary" href="#/accedi">Ho già un account</a>
  </div>
`;

export function renderProfile() {
  const element = html(`
    <main class="page">
      ${topBarMarkup({ showAccount: false })}
      <h1 class="page-title">Il mio profilo</h1>
      <div class="profile-body"></div>
    </main>
  `);
  bindTopBar(element);
  const body = element.querySelector('.profile-body');

  function render() {
    const player = currentPlayer();
    body.innerHTML = player ? loggedMarkup(player, cachedMyCard()) : guestMarkup;
  }
  render();

  body.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const dialog = body.querySelector('.dialog--confirm');
    if (action === 'logout') {
      openDialog(dialog);
    } else if (action === 'logout-cancel') {
      closeDialog(dialog);
    } else if (action === 'logout-confirm') {
      closeDialog(dialog);
      await logout();
      location.replace('#/');
    }
  });

  // Aggiorna dal server (se la sessione non vale più, si esce); senza rete resta la copia sul telefono
  if (currentPlayer()) refreshProfile().then(render).catch(() => {});
  // Punti aggiornati (senza rete resta l'ultima scheda salvata)
  const me = currentPlayer();
  if (me && me.role !== 'staff') {
    fetchPlayerCard(me.nickname)
      .then((card) => {
        const box = body.querySelector('.profile-stats');
        if (card && box) box.innerHTML = statsMarkup(me, card);
      })
      .catch(() => {});
  }

  return { title: 'Il mio profilo', element };
}
