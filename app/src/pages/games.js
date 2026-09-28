// Pagina Minigiochi (docs/01-SPECIFICHE.md §6.3, con le decisioni della Tappa 5):
// "Come funziona", poi le card dei 4 giochi con stato, tentativi rimasti oggi e miglior punteggio.
// La classifica arriva con la Tappa 6, gli oggetti segreti con la Tappa 7.

import { html } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { GAMES, PRACTICE_MODE } from '../games/registry.js';
import { currentPlayer } from '../lib/account.js';
import { cachedGamesState, fetchGamesState, attemptsLeft, blockedReason, gameInfo } from '../lib/games-state.js';
import gamepadSvg from '../assets/gamepad.svg?raw';

const timeFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });

function howItWorksMarkup(perDay) {
  return `
    <section class="how-it-works" aria-labelledby="how-title">
      <h2 class="how-it-works__title" id="how-title">Come funziona</h2>
      <ul class="how-it-works__list">
        <li>🎮 <strong>${perDay} tentativi al giorno</strong> per ogni gioco</li>
        <li>👆 Il tentativo si conta appena premi <strong>GIOCA</strong></li>
        <li>🏅 Vale il tuo <strong>punteggio migliore</strong></li>
        <li>🎁 I primi 10 in classifica vincono un premio!</li>
      </ul>
    </section>
  `;
}

/** Riga di stato sotto il nome del gioco */
function cardStatus(game, state, player) {
  if (PRACTICE_MODE) return 'Gioca in prova';
  if (!player) return 'Accedi per giocare';
  if (!state) return 'Tocca per giocare';
  const reason = blockedReason(state, game.id);
  const best = gameInfo(state, game.id)?.best;
  const bestText = best !== null && best !== undefined ? ` · Il tuo migliore: ${best}` : '';
  if (reason?.code === 'closed') return `Gioco concluso${bestText}`;
  if (reason) return `🔒 ${reason.code === 'no_attempts' ? 'Tentativi finiti per oggi' : reason.text}${bestText}`;
  if (state.unlimited) return `Staff: tentativi illimitati${bestText}`;
  const left = attemptsLeft(state, game.id);
  return `Tentativi oggi: ${left}/${state.attempts_per_day}${bestText}`;
}

export function renderGames() {
  const element = html(`
    <main class="page">
      ${topBarMarkup()}
      <h1 class="page-title"><span class="page-title__icon" aria-hidden="true">${gamepadSvg}</span>Minigiochi</h1>
      <div class="games-intro"></div>
      <div class="game-cards"></div>
      <p class="games-updated" aria-live="polite"></p>
    </main>
  `);
  bindTopBar(element);
  const intro = element.querySelector('.games-intro');
  const cards = element.querySelector('.game-cards');
  const updated = element.querySelector('.games-updated');
  const cached = cachedGamesState();

  function render(state, savedAt, fromCache) {
    const player = currentPlayer();
    intro.innerHTML = PRACTICE_MODE
      ? '<p class="attempt-notice attempt-notice--practice">🧪 <strong>Modalità prova</strong>: gioca quanto vuoi, i punti non contano.</p>'
      : howItWorksMarkup(state?.attempts_per_day ?? 3);
    cards.innerHTML = Object.values(GAMES)
      .map((game) => {
        const reason = state && player ? blockedReason(state, game.id) : null;
        return `
          <a class="home-box game-card${reason ? ' game-card--locked' : ''}" href="#/giochi/${game.id}">
            <span class="home-box__icon" aria-hidden="true">${game.icon}</span>
            <span class="home-box__body">
              <span class="home-box__title home-box__title--game">${game.name}</span>
              <span class="home-box__text">${cardStatus(game, state, player)}</span>
            </span>
            <span class="home-box__arrow" aria-hidden="true">›</span>
          </a>`;
      })
      .join('');
    updated.textContent = fromCache && savedAt ? `Senza connessione: dati aggiornati alle ${timeFormat.format(new Date(savedAt))}` : '';
  }

  render(cached?.state ?? null, cached?.savedAt, true);
  if (!PRACTICE_MODE) {
    fetchGamesState()
      .then((state) => render(state, Date.now(), false))
      .catch(() => {});
  }

  return { title: 'Minigiochi', element };
}
