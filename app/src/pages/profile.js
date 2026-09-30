// Il mio profilo (docs/01-SPECIFICHE.md §10): personaggio, nickname, punti (Tappa 6: totale, posizione,
// migliori per gioco, punti extra; la stessa scheda che si apre toccando un giocatore in classifica), Esci.
// Il QR per il premio arriva con la Tappa 8.

import { html, escapeHtml, openDialog, closeDialog } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { currentPlayer, logout, refreshProfile, changeAvatar, isStaffRole, roleLabel } from '../lib/account.js';
import { NetworkError } from '../lib/api.js';
import { charPickerMarkup, bindCharPicker } from '../components/char-picker.js';
import { authErrorMessage, OFFLINE_MESSAGE } from './auth-messages.js';
import { characterById } from '../characters/characters.js';
import avatarAnonimoSvg from '../assets/avatar-anonimo.svg?raw';
import { playerStatsMarkup } from '../components/player-card.js';
import { cachedMyCard, fetchPlayerCard } from '../lib/leaderboard.js';

// Matita cicciotta, senza sfondo (bottone "cambia personaggio")
const PENCIL_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true">
  <g transform="rotate(45 20 20)" stroke="#2b1d12" stroke-width="2.5" stroke-linejoin="round">
    <rect x="13" y="2" width="14" height="7" rx="3" fill="#ef8a8a"/>
    <rect x="13" y="9" width="14" height="4" fill="#c9c2b4"/>
    <rect x="13" y="13" width="14" height="15" fill="#f2b632"/>
    <path d="M13 28 L27 28 L20 38 Z" fill="#f4dcb0"/>
    <path d="M17.5 34.5 L22.5 34.5 L20 38 Z" fill="#2b1d12"/>
  </g>
</svg>`;

function statsMarkup(player, card) {
  if (isStaffRole(player.role)) {
    return `<p class="notice">🛠️ Sei <strong>${roleLabel(player.role)}</strong>: i tuoi punti non vanno in classifica.</p><a class="button button--leaderboard" href="#/staff">🛠️ Pannello staff</a>`;
  }
  if (!card) return '<p class="leaderboard-note">Caricamento dei punti…</p>';
  return `${playerStatsMarkup(card)}<a class="button button--leaderboard" href="#/giochi/classifica">🏆 Vai alla classifica</a>`;
}

function loggedMarkup(player, card) {
  const character = characterById(player.avatar);
  return `
    <div class="profile-card">
      <span class="profile-card__avatar-wrap">
        <span class="profile-card__avatar" aria-hidden="true">${character ? character.svg : avatarAnonimoSvg}</span>
        <button type="button" class="avatar-edit" data-action="avatar" aria-label="Cambia personaggio" title="Cambia personaggio">${PENCIL_SVG}</button>
      </span>
      <p class="profile-card__nickname">${escapeHtml(player.nickname)}</p>
      ${character ? `<p class="profile-card__character">${escapeHtml(character.name)}</p>` : ''}
    </div>
    <div class="profile-stats">${statsMarkup(player, card)}</div>
    <div class="logout">
      <button type="button" class="button button--secondary" data-action="logout">Esci</button>
    </div>
    <!-- Cambio del personaggio: la stessa scelta della registrazione (D85) -->
    <dialog class="dialog dialog--avatar" aria-labelledby="avatar-title">
      <h2 class="dialog__title" id="avatar-title">Scegli il tuo personaggio</h2>
      ${charPickerMarkup()}
      <div class="form-error" role="alert" hidden></div>
      <div class="logout__actions">
        <button type="button" class="button" data-action="avatar-save">Salva</button>
        <button type="button" class="button button--secondary" data-action="avatar-cancel">Annulla</button>
      </div>
    </dialog>
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

  let charPicker = null;
  body.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const dialog = body.querySelector('.dialog--confirm');
    const avatarDialog = body.querySelector('.dialog--avatar');
    const avatarError = avatarDialog?.querySelector('.form-error');
    if (action === 'avatar') {
      // la finestra si ridisegna con il profilo: si collega una volta per ogni nuova finestra
      if (charPicker?.dialog !== avatarDialog) charPicker = { dialog: avatarDialog, ...bindCharPicker(avatarDialog) };
      charPicker.select(currentPlayer()?.avatar);
      avatarError.hidden = true;
      openDialog(avatarDialog);
    } else if (action === 'avatar-cancel') {
      closeDialog(avatarDialog);
    } else if (action === 'avatar-save') {
      const button = event.target.closest('button');
      button.disabled = true;
      try {
        const result = await changeAvatar(charPicker.selectedId());
        if (result.ok) {
          closeDialog(avatarDialog);
          render();
          return;
        }
        avatarError.textContent = authErrorMessage(result);
      } catch (error) {
        avatarError.textContent = error instanceof NetworkError ? OFFLINE_MESSAGE : authErrorMessage({});
      }
      avatarError.hidden = false;
      button.disabled = false;
    } else if (action === 'logout') {
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
  if (me && !isStaffRole(me.role)) {
    fetchPlayerCard(me.nickname)
      .then((card) => {
        const box = body.querySelector('.profile-stats');
        if (card && box) box.innerHTML = statsMarkup(me, card);
      })
      .catch(() => {});
  }

  return { title: 'Il mio profilo', element };
}
