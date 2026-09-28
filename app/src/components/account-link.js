// Icona del profilo in alto a destra: cerchietto con il personaggio e, a sinistra, la scritta.
// Per ora sempre anonimo con "Accedi"; dalla Tappa 4 mostrerà personaggio e nickname del giocatore.

import avatarAnonimoSvg from '../assets/avatar-anonimo.svg?raw';

export function accountLinkMarkup() {
  return `
    <a class="account-link" href="#/profilo" aria-label="Accedi al tuo profilo">
      <span class="account-link__label" aria-hidden="true">Accedi</span>
      <span class="account-link__avatar">${avatarAnonimoSvg}</span>
    </a>
  `;
}
