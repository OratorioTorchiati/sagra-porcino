// Icona del profilo in alto a destra, presente in tutte le pagine (tranne il profilo stesso):
// cerchietto con il personaggio e, a sinistra, la scritta.
// Senza account: sagoma anonima e "Accedi". Dopo l'accesso: personaggio scelto e nickname.

import avatarAnonimoSvg from '../assets/avatar-anonimo.svg?raw';
import { currentPlayer } from '../lib/account.js';
import { characterById } from '../characters/characters.js';
import { escapeHtml } from '../lib/dom.js';

export function accountLinkMarkup() {
  const player = currentPlayer();
  if (!player) {
    return `
      <a class="account-link" href="#/profilo" aria-label="Accedi al tuo profilo">
        <span class="account-link__label" aria-hidden="true">Accedi</span>
        <span class="account-link__avatar">${avatarAnonimoSvg}</span>
      </a>
    `;
  }
  const character = characterById(player.avatar);
  return `
    <a class="account-link account-link--logged" href="#/profilo" aria-label="Il mio profilo: ${escapeHtml(player.nickname)}">
      <span class="account-link__label" aria-hidden="true">${escapeHtml(player.nickname)}</span>
      <span class="account-link__avatar">${character ? character.svg : avatarAnonimoSvg}</span>
    </a>
  `;
}
