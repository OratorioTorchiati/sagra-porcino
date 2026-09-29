// Pagina Minigiochi (docs/01-SPECIFICHE.md §6.3, con le decisioni della Tappa 5):
// - la prima volta si vede solo "Come funziona", aperto: con "Capito" (o Registrati/Accedi senza account)
//   compare la lista dei giochi;
// - dalla volta dopo "Come funziona" resta in cima, chiuso: si riapre toccandolo, senza bottoni (D63).
// La classifica arriva con la Tappa 6, gli oggetti segreti con la Tappa 7.

import { html } from '../lib/dom.js';
import { readJson, writeJson } from '../lib/storage.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { GAMES, PRACTICE_MODE } from '../games/registry.js';
import { currentPlayer } from '../lib/account.js';
import { cachedGamesState, fetchGamesState, attemptsLeft, blockedReason, gameInfo } from '../lib/games-state.js';
import { setAfterLogin } from './auth-messages.js';
import gamepadSvg from '../assets/gamepad.svg?raw';

const ACK_KEY = 'sagra-come-funziona-letto';
const timeFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', timeZone: 'Europe/Rome' });
const hourFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
/** "domenica 18 alle 23:00" */
const closeText = (date) => `${dayFormat.format(date)} alle ${hourFormat.format(date)}`;

function howItWorksItems(state) {
  const perDay = state?.attempts_per_day ?? 3;
  const resetHour = state?.reset_hour ?? 9;
  const until = state?.open_until ? closeText(new Date(state.open_until)) : null;
  return [
    `🎮 <strong>${perDay} tentativi al giorno</strong> per ogni gioco: alle ${resetHour}:00 si resettano`,
    '🚫 <strong>Non barare!</strong> Il tentativo si conta appena premi <strong>GIOCA</strong> e non ti conta il punteggio se chiudi il gioco in corso.',
    '🏅 Vale <strong>SOLO il punteggio migliore</strong>, per ogni gioco',
    until
      ? `⏰ Termine dei giochi: <strong>${until}</strong> → i <strong>primi 10</strong> vinceranno un premio!`
      : '🎁 I <strong>primi 10</strong> vinceranno un premio!',
    '👤 Serve un <strong>account</strong> per salvare il punteggio',
  ].filter(Boolean);
}

const listMarkup = (state) => `<ul class="how-it-works__list">${howItWorksItems(state).map((item) => `<li>${item}</li>`).join('')}</ul>`;

/** Righe di stato sotto il nome del gioco: tentativi e (a capo) miglior punteggio */
function cardStatus(game, state, player) {
  if (PRACTICE_MODE) return ['Gioca in prova'];
  if (!player) return ['Accedi per giocare'];
  if (!state) return ['Tocca per giocare'];
  const reason = blockedReason(state, game.id);
  const best = gameInfo(state, game.id)?.best;
  const bestLine = best !== null && best !== undefined ? `Il tuo migliore: <strong>${best}</strong>` : null;
  let first;
  if (reason?.code === 'closed') first = 'Gioco concluso';
  else if (reason) first = `🔒 ${reason.text}`;
  else if (state.unlimited) first = 'Staff: tentativi illimitati';
  else first = `Tentativi oggi: <strong>${attemptsLeft(state, game.id)}/${state.attempts_per_day}</strong>`;
  return [first, bestLine].filter(Boolean);
}

function cardsMarkup(state, player) {
  return Object.values(GAMES)
    .map((game) => {
      const reason = state && player ? blockedReason(state, game.id) : null;
      return `
        <a class="home-box game-card${reason ? ' game-card--locked' : ''}" href="#/giochi/${game.id}">
          <span class="home-box__icon" aria-hidden="true">${game.icon}</span>
          <span class="home-box__body">
            <span class="home-box__title home-box__title--game">${game.name}</span>
            ${cardStatus(game, state, player).map((line) => `<span class="home-box__text home-box__text--line">${line}</span>`).join('')}
          </span>
          <span class="home-box__arrow" aria-hidden="true">›</span>
        </a>`;
    })
    .join('');
}

export function renderGames() {
  const element = html(`
    <main class="page">
      ${topBarMarkup()}
      <h1 class="page-title"><span class="page-title__icon" aria-hidden="true">${gamepadSvg}</span>Minigiochi</h1>
      <div class="games-body"></div>
      <p class="games-updated" aria-live="polite"></p>
    </main>
  `);
  bindTopBar(element);
  const body = element.querySelector('.games-body');
  const updated = element.querySelector('.games-updated');
  const cached = cachedGamesState();
  let state = cached?.state ?? null;
  let savedAt = cached?.savedAt ?? null;
  let fromCache = true;

  function render() {
    const player = currentPlayer();
    const acknowledged = readJson(ACK_KEY, false);

    if (PRACTICE_MODE) {
      body.innerHTML = `
        <p class="attempt-notice attempt-notice--practice">🧪 <strong>Modalità prova</strong>: gioca quanto vuoi, i punti non contano.</p>
        <div class="game-cards">${cardsMarkup(null, player)}</div>`;
    } else if (!acknowledged || !player) {
      // Prima volta (o senza account): solo "Come funziona", aperto, con i bottoni per andare avanti
      body.innerHTML = `
        <section class="how-it-works how-it-works--first" aria-labelledby="how-title">
          <h2 class="how-it-works__title" id="how-title">Come funziona</h2>
          ${listMarkup(state)}
          <div class="how-it-works__actions">
            ${
              player
                ? '<button type="button" class="button button--play" data-action="ack">Capito</button>'
                : `<a class="button button--play" href="#/registrati" data-after-login>Registrati</a>
                   <a class="button button--secondary" href="#/accedi" data-after-login>Ho già un account</a>`
            }
          </div>
        </section>`;
    } else {
      // Dalla volta dopo: "Come funziona" chiuso (si riapre toccandolo, senza bottoni) e la lista dei giochi
      body.innerHTML = `
        <details class="how-it-works how-it-works--collapsed">
          <summary class="how-it-works__summary">Come funziona</summary>
          ${listMarkup(state)}
        </details>
        <div class="game-cards">${cardsMarkup(state, player)}</div>`;
    }

    body.querySelector('[data-action="ack"]')?.addEventListener('click', () => {
      writeJson(ACK_KEY, true);
      render();
      window.scrollTo(0, 0);
    });
    body.querySelectorAll('[data-after-login]').forEach((a) => a.addEventListener('click', () => setAfterLogin('/giochi')));
    updated.textContent = fromCache && savedAt && body.querySelector('.game-cards') ? `Senza connessione: dati aggiornati alle ${timeFormat.format(new Date(savedAt))}` : '';
  }

  render();
  if (!PRACTICE_MODE) {
    fetchGamesState()
      .then((fresh) => {
        state = fresh;
        savedAt = Date.now();
        fromCache = false;
        // Non richiudere "Come funziona" se il giocatore lo sta leggendo
        const openDetails = body.querySelector('details[open]');
        render();
        if (openDetails) body.querySelector('details')?.setAttribute('open', '');
      })
      .catch(() => {});
  }

  return { title: 'Minigiochi', element };
}
