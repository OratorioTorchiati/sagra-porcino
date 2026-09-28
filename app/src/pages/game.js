// Pagina di un gioco (#/giochi/<id>): regole → conto alla rovescia → partita → risultato.
// Per ora solo in modalità prova (D25): nessun tentativo consumato, punteggio non salvato sul server.

import { html } from '../lib/dom.js';
import { readJson, writeJson } from '../lib/storage.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { GAMES, PRACTICE_MODE } from '../games/registry.js';
import { GameSession } from '../games/engine/session.js';
import { randomSeed } from '../games/engine/rng.js';
import { renderNotFound } from './not-found.js';

const bestKey = (gameId) => `prova-migliore-${gameId}`;

function rulesMarkup(game) {
  return `
    <main class="page game-page">
      ${topBarMarkup()}
      <h1 class="page-title">${game.name}</h1>
      <ul class="rules">
        ${game.rules.map((r) => `<li class="rules__item"><span class="rules__icon" aria-hidden="true">${r.icon}</span>${r.text}</li>`).join('')}
      </ul>
      <div class="rules-gallery" hidden>
        <p class="rules-gallery__label rules-gallery__label--good">✅ Prendi questi</p>
        <div class="rules-gallery__row" data-gallery="good"></div>
        <p class="rules-gallery__label rules-gallery__label--bad">❌ Evita questi</p>
        <div class="rules-gallery__row" data-gallery="bad"></div>
      </div>
      ${
        PRACTICE_MODE
          ? '<p class="attempt-notice attempt-notice--practice">🧪 <strong>Partita di prova</strong>: non usi tentativi e i punti non contano.</p>'
          : ''
      }
      <button type="button" class="button button--play" disabled>Caricamento…</button>
    </main>
  `;
}

function resultMarkup(game, gameDef, result, best, isNewBest) {
  return `
    <main class="page game-page">
      <h1 class="page-title">Fine partita!</h1>
      <div class="result-card">
        <p class="result-card__label">Punti</p>
        <p class="result-card__score">${result.rawScore}</p>
        <p class="result-card__best">${isNewBest ? '🎉 Nuovo record personale!' : `Il tuo migliore: <strong>${best}</strong>`}</p>
      </div>
      <dl class="result-stats">
        ${gameDef
          .summary(result.stats)
          .map(([label, value]) => `<div class="result-stats__row"><dt>${label}</dt><dd>${value}</dd></div>`)
          .join('')}
      </dl>
      ${PRACTICE_MODE ? '<p class="attempt-notice attempt-notice--practice">🧪 Partita di prova: il punteggio non viene salvato.</p>' : ''}
      <div class="result-actions">
        <button type="button" class="button button--play" data-action="again">Rigioca</button>
        <a class="button button--secondary" href="#/giochi">Torna ai giochi</a>
      </div>
    </main>
  `;
}

export function renderGame({ gameId }) {
  const game = GAMES[gameId];
  if (!game) return renderNotFound();

  const container = html('<div class="game-container"></div>');
  let session = null;
  let gameDef = null;
  let assets = null;
  let destroyed = false;

  function showRules() {
    const view = html(rulesMarkup(game));
    bindTopBar(view);
    container.replaceChildren(view);
    const playButton = view.querySelector('.button--play');

    const ready = () => {
      const gallery = view.querySelector('.rules-gallery');
      if (gameDef.rulesGallery) {
        gallery.querySelector('[data-gallery="good"]').innerHTML = gameDef.rulesGallery.good.map((s) => `<span class="rules-gallery__item">${s}</span>`).join('');
        gallery.querySelector('[data-gallery="bad"]').innerHTML = gameDef.rulesGallery.bad.map((s) => `<span class="rules-gallery__item">${s}</span>`).join('');
        gallery.hidden = false;
      }
      playButton.disabled = false;
      playButton.textContent = 'GIOCA';
    };

    if (gameDef && assets) {
      ready();
    } else {
      game
        .load()
        .then(async (def) => {
          gameDef = def;
          assets = await def.loadAssets();
          if (!destroyed) ready();
        })
        .catch(() => {
          playButton.textContent = 'Errore di caricamento: riprova';
        });
    }

    playButton.addEventListener('click', startSession);
  }

  function startSession() {
    session?.destroy();
    session = new GameSession({
      root: container,
      gameDef: { ...gameDef, name: game.name },
      assets,
      seed: randomSeed(),
      onFinish: showResult,
    });
    // Solo in sviluppo (rimosso dalla build): permette ai test automatici di far avanzare i frame
    if (import.meta.env.DEV) window.__gameSession = session;
  }

  function showResult(result) {
    session?.destroy();
    session = null;
    const previousBest = readJson(bestKey(game.id), 0);
    const isNewBest = result.rawScore > previousBest && result.rawScore > 0;
    const best = Math.max(previousBest, result.rawScore);
    writeJson(bestKey(game.id), best);

    const view = html(resultMarkup(game, gameDef, result, best, isNewBest));
    container.replaceChildren(view);
    view.querySelector('[data-action="again"]').addEventListener('click', startSession);
    window.scrollTo(0, 0);
  }

  showRules();

  return {
    title: game.name,
    element: container,
    destroy() {
      destroyed = true;
      session?.destroy();
    },
  };
}
