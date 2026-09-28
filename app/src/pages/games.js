// Pagina Minigiochi PROVVISORIA (Tappe 2–3): i 4 giochi in modalità prova, senza stati reali.
// La versione definitiva (Come funziona, stati, tentativi, classifica) arriva alla Tappa 5.

import { html } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { GAMES } from '../games/registry.js';
import gamepadSvg from '../assets/gamepad.svg?raw';

export function renderGames() {
  const element = html(`
    <main class="page">
      ${topBarMarkup()}
      <h1 class="page-title"><span class="page-title__icon" aria-hidden="true">${gamepadSvg}</span>Minigiochi</h1>
      <p class="attempt-notice attempt-notice--practice">🧪 <strong>Modalità prova</strong>: gioca quanto vuoi, i punti non contano ancora.</p>
      <div class="game-cards">
        ${Object.values(GAMES)
          .map(
            (game) => `
          <a class="home-box" href="#/giochi/${game.id}">
            <span class="home-box__icon" aria-hidden="true">${game.icon}</span>
            <span class="home-box__body">
              <span class="home-box__title home-box__title--game">${game.name}</span>
              <span class="home-box__text">Gioca in prova</span>
            </span>
            <span class="home-box__arrow" aria-hidden="true">›</span>
          </a>`,
          )
          .join('')}
      </div>
    </main>
  `);
  bindTopBar(element);
  return { title: 'Minigiochi', element };
}
