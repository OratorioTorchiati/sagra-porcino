// Icona del profilo in alto a destra, presente in tutte le pagine (tranne il profilo stesso):
// cerchietto con il personaggio e, a sinistra, la scritta.
// Per ora sempre anonimo con "Accedi"; dalla Tappa 4, dopo il login, mostrerà il personaggio scelto
// e il nickname del giocatore.

import avatarAnonimoSvg from '../assets/avatar-anonimo.svg?raw';

export function accountLinkMarkup() {
  return `
    <a class="account-link" href="#/profilo" aria-label="Accedi al tuo profilo">
      <span class="account-link__label" aria-hidden="true">Accedi</span>
      <span class="account-link__avatar">${avatarAnonimoSvg}</span>
    </a>
  `;
}
