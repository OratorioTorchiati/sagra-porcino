// Il mio profilo (docs/01-SPECIFICHE.md §10). Tappa 4: personaggio, nickname, Esci.
// Punti, posizione e oggetti trovati arrivano con le Tappe 6–7; il QR per il premio con la Tappa 8.

import { html, escapeHtml } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { currentPlayer, logout, refreshProfile } from '../lib/account.js';
import { characterById } from '../characters/characters.js';
import avatarAnonimoSvg from '../assets/avatar-anonimo.svg?raw';

function loggedMarkup(player) {
  const character = characterById(player.avatar);
  return `
    <div class="profile-card">
      <span class="profile-card__avatar" aria-hidden="true">${character ? character.svg : avatarAnonimoSvg}</span>
      <p class="profile-card__nickname">${escapeHtml(player.nickname)}</p>
      ${character ? `<p class="profile-card__character">${escapeHtml(character.name)}</p>` : ''}
    </div>
    <div class="notice">
      <p class="notice__title">Punti e classifica</p>
      <p>Qui vedrai i tuoi punti, la tua posizione e il codice per ritirare il premio.</p>
    </div>
    <div class="logout">
      <button type="button" class="button button--secondary" data-action="logout">Esci</button>
      <div class="logout__confirm" hidden>
        <p><strong>Vuoi davvero uscire?</strong> Per rientrare ti serviranno nickname e PIN.</p>
        <div class="logout__actions">
          <button type="button" class="button" data-action="logout-confirm">Sì, esci</button>
          <button type="button" class="button button--secondary" data-action="logout-cancel">Annulla</button>
        </div>
      </div>
    </div>
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
    body.innerHTML = player ? loggedMarkup(player) : guestMarkup;
  }
  render();

  body.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const confirmBox = body.querySelector('.logout__confirm');
    if (action === 'logout') {
      confirmBox.hidden = false;
      event.target.closest('[data-action]').hidden = true;
    } else if (action === 'logout-cancel') {
      confirmBox.hidden = true;
      body.querySelector('[data-action="logout"]').hidden = false;
    } else if (action === 'logout-confirm') {
      await logout();
      location.replace('#/');
    }
  });

  // Aggiorna dal server (se la sessione non vale più, si esce); senza rete resta la copia sul telefono
  if (currentPlayer()) refreshProfile().then(render).catch(() => {});

  return { title: 'Il mio profilo', element };
}
