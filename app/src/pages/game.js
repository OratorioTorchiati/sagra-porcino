// Pagina di un gioco (#/giochi/<id>): regole → GIOCA (il server conta il tentativo) → 3-2-1 → partita →
// risultato. Il punteggio va in una coda: se manca la rete parte da solo quando torna (lib/queue.js).
// Senza server configurato (sviluppo in locale) si gioca in modalità prova.

import { html, escapeHtml } from '../lib/dom.js';
import { readJson, writeJson } from '../lib/storage.js';
import { rpc, NetworkError } from '../lib/api.js';
import { currentPlayer, sessionToken, refreshProfile, isStaffRole } from '../lib/account.js';
import { enqueueScore, onSubmitResult, resultFor, isPending } from '../lib/queue.js';
import { cachedGamesState, fetchGamesState, attemptsLeft, blockedReason, gameInfo, NO_ATTEMPTS_TEXT } from '../lib/games-state.js';
import { refreshAppConfig } from '../lib/app-config.js';
import { withDuration } from '../games/duration.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { GAMES, PRACTICE_MODE } from '../games/registry.js';
import { GameSession } from '../games/engine/session.js';
import { randomSeed } from '../games/engine/rng.js';
import { setAfterLogin } from './auth-messages.js';
import { renderNotFound } from './not-found.js';

const OFFLINE_START = 'Serve un attimo di connessione per iniziare. Riprova tra poco.';

// ---------- Modalità prova (solo sviluppo senza server): migliore sul telefono, separato per giocatore ----------

const practiceBestKey = (gameId) => {
  const player = currentPlayer();
  return `prova-migliore-${gameId}-${player ? `giocatore-${player.nickname.toLowerCase()}` : 'ospite'}`;
};

// Vecchi punteggi di prova non separati per giocatore (prima del 28/09): da cancellare
try {
  Object.keys(GAMES).forEach((id) => localStorage.removeItem(`prova-migliore-${id}`));
} catch {
  // storage non disponibile
}

// ---------- Markup ----------

/** Testo di una regola: fisso, oppure calcolato da durata e step decisi dall'Admin (info = stato del gioco) */
const ruleText = (text, info) => (typeof text === 'function' ? text(info) : text);

function rulesMarkup(game, info) {
  return `
    <main class="page game-page">
      ${topBarMarkup()}
      <h1 class="page-title">${game.name}</h1>
      <ul class="rules">
        ${game.rules
          .map(
            (r) => `
          <li class="rules__item">
            <span class="rules__icon" aria-hidden="true">${r.icon}</span>
            <span class="rules__body">
              <span class="rules__text">${ruleText(r.text, info)}</span>
              ${r.gallery ? `<span class="rules__gallery" data-gallery="${r.gallery}" aria-hidden="true"></span>` : ''}
            </span>
          </li>`,
          )
          .join('')}
      </ul>
      <div class="play-area"></div>
    </main>
  `;
}

const notice = (kind, content) => `<p class="attempt-notice attempt-notice--${kind}">${content}</p>`;

function statsMarkup(gameDef, stats) {
  return gameDef
    .summary(stats)
    .map(([label, value]) => `<div class="result-stats__row"><dt>${label}</dt><dd>${value}</dd></div>`)
    .join('');
}

// ---------- Pagina ----------

export function renderGame({ gameId }) {
  const game = GAMES[gameId];
  if (!game) return renderNotFound();

  const container = html('<div class="game-container"></div>');
  let session = null;
  let gameDef = null;
  let assets = null;
  let destroyed = false;
  let gamesState = cachedGamesState()?.state ?? null;
  let unsubscribe = null;
  let busy = false;

  function loadGame() {
    if (gameDef && assets) return Promise.resolve();
    return game.load().then(async (def) => {
      gameDef = def;
      assets = await def.loadAssets();
      // Partita di prova invisibile, subito dopo aver mostrato le regole (vedi warmUp nel modulo del gioco)
      if (def.warmUp) {
        setTimeout(() => {
          try {
            def.warmUp(assets);
          } catch {
            // solo un'ottimizzazione: se non riesce si gioca lo stesso
          }
        }, 50);
      }
    });
  }

  // ---------- Regole e bottone GIOCA ----------

  function showRules() {
    unsubscribe?.();
    busy = false;
    const view = html(rulesMarkup(game, gameInfo(gamesState, game.id)));
    bindTopBar(view);
    container.replaceChildren(view);
    window.scrollTo(0, 0);
    const playArea = view.querySelector('.play-area');
    let loaded = Boolean(gameDef && assets);
    let startError = null;

    function renderPlayArea() {
      if (destroyed) return;
      const player = currentPlayer();
      let markup;
      let canPlay = false;

      if (PRACTICE_MODE) {
        markup = notice('practice', '🧪 <strong>Partita di prova</strong>: non usi tentativi e i punti non contano.');
        canPlay = true;
      } else if (!player) {
        markup = `
          ${notice('info', '🔑 Per giocare serve un account: è gratis e ci vuole un minuto.')}
          <div class="auth-choices">
            <a class="button button--play" href="#/registrati" data-after-login>Registrati</a>
            <a class="button button--secondary" href="#/accedi" data-after-login>Ho già un account</a>
          </div>`;
      } else {
        const reason = blockedReason(gamesState, game.id);
        if (reason?.code === 'no_attempts') {
          // Al posto del bottone GIOCA (D64)
          markup = `<p class="no-attempts">${NO_ATTEMPTS_TEXT}</p>`;
        } else if (reason) {
          markup = notice('blocked', `⏳ ${reason.text}`) + '<a class="button button--secondary" href="#/giochi">Torna ai giochi</a>';
        } else if (gamesState?.unlimited) {
          markup = isStaffRole(player.role)
            ? notice('info', '🛠️ <strong>Staff</strong>: tentativi illimitati. I tuoi punti non vanno in classifica.')
            : notice('info', '♾️ Oggi i tentativi sono <strong>illimitati</strong>: gioca quanto vuoi, vale il punteggio migliore.');
          canPlay = true;
        } else {
          const left = attemptsLeft(gamesState, game.id);
          const perDay = gamesState?.attempts_per_day ?? 3;
          markup = notice(
            'warning',
            left === null
              ? '⚠️ Premendo <strong>GIOCA</strong> usi un tentativo.'
              : `⚠️ Premendo <strong>GIOCA</strong> usi un tentativo (te ne ${left === 1 ? 'resta' : 'restano'} <strong>${left}</strong> su ${perDay} per oggi).`,
          );
          canPlay = true;
        }
      }

      if (startError) markup += `<div class="form-error" role="alert">${escapeHtml(startError)}</div>`;
      if (canPlay) {
        markup += `<button type="button" class="button button--play" data-action="play" ${loaded ? '' : 'disabled'}>${loaded ? 'GIOCA' : 'Caricamento…'}</button>`;
      }
      playArea.innerHTML = markup;
      playArea.querySelectorAll('[data-after-login]').forEach((a) => a.addEventListener('click', () => setAfterLogin(`/giochi/${game.id}`)));
      playArea.querySelector('[data-action="play"]')?.addEventListener('click', onPlay);
    }

    async function onPlay(event) {
      const button = event.currentTarget;
      startError = null;
      if (PRACTICE_MODE) return startSession({ seed: randomSeed() });

      button.disabled = true;
      button.textContent = 'Un attimo…';
      let result;
      try {
        result = await rpc('start_attempt', { p_token: sessionToken(), p_game_id: game.id });
      } catch (error) {
        startError = error instanceof NetworkError ? OFFLINE_START : 'Qualcosa non ha funzionato. Riprova tra poco.';
        return renderPlayArea();
      }
      if (result.ok) {
        return startSession({
          seed: Number(result.seed),
          durationS: result.duration_s,
          attemptId: result.attempt_id,
          questions: result.questions,
          steps: result.steps,
          attemptsLeft: result.attempts_left,
          unlimited: result.unlimited,
        });
      }
      if (result.error === 'NOT_LOGGED_IN') {
        await refreshProfile().catch(() => {});
        startError = 'Devi rientrare nel tuo account.';
      } else if (result.error === 'SECTION_OFF') {
        startError = 'I minigiochi in questo momento non sono disponibili.';
        refreshAppConfig({ force: true }); // la pagina diventa "non disponibile", con Torna alla home
      } else if (result.error === 'QUIZ_EMPTY') {
        startError = 'Il quiz non è ancora pronto. Riprova più tardi.';
      }
      // Stato cambiato (tentativi finiti, giochi chiusi...): lo si rilegge e si mostra il motivo
      gamesState = await fetchGamesState().catch(() => gamesState);
      renderPlayArea();
    }

    renderPlayArea();

    loadGame()
      .then(() => {
        if (destroyed) return;
        for (const slot of view.querySelectorAll('[data-gallery]')) {
          const images = gameDef.rulesGallery?.[slot.dataset.gallery] ?? [];
          slot.innerHTML = images.map((svg) => `<span class="rules__thumb">${svg}</span>`).join('');
        }
        loaded = true;
        renderPlayArea();
      })
      .catch(() => {
        startError = 'Errore di caricamento: ricarica la pagina.';
        renderPlayArea();
      });

    // Tentativi rimasti aggiornati dal server (se c'è rete): se il gioco è stato spento o chiuso, al posto di
    // GIOCA compare il motivo
    if (!PRACTICE_MODE && currentPlayer()) {
      fetchGamesState()
        .then((state) => {
          gamesState = state;
          if (playArea.isConnected && !playArea.querySelector('[data-action="play"]:disabled')) renderPlayArea();
        })
        .catch(() => {});
    }
  }

  // ---------- Partita ----------

  function startSession(start) {
    busy = true; // partita e poi risultato: niente ridisegni della pagina (vedi refreshPage)
    session?.destroy();
    const sessionAssets = start.questions ? { ...assets, pool: start.questions } : assets;
    session = new GameSession({
      root: container,
      gameDef: { ...withDuration(gameDef, game.id, start.durationS, start.steps ?? start.questions?.length), name: game.name },
      assets: sessionAssets,
      seed: start.seed,
      onFinish: (result) => showResult(result, start),
    });
    // Solo in sviluppo (rimosso dalla build): permette ai test automatici di far avanzare i frame
    if (import.meta.env.DEV) window.__gameSession = session;
  }

  // ---------- Risultato ----------

  function showResult(result, start) {
    session?.destroy();
    session = null;
    window.scrollTo(0, 0);

    if (PRACTICE_MODE || !start.attemptId) return showPracticeResult(result);

    // Il punteggio va in coda: parte subito, o appena torna la rete
    const isQuiz = game.id === 'quiz';
    enqueueScore({ attemptId: start.attemptId, gameId: game.id, rawScore: result.rawScore, stats: result.stats, actions: result.actions });

    const canReplay = start.unlimited || (start.attemptsLeft ?? 0) > 0;
    const view = html(`
      <main class="page game-page">
        <h1 class="page-title">Fine partita!</h1>
        <div class="result-card">
          <p class="result-card__label">Punti</p>
          <p class="result-card__score">${isQuiz ? '…' : result.rawScore}</p>
          <p class="result-card__best"></p>
        </div>
        <dl class="result-stats">${isQuiz ? '' : statsMarkup(gameDef, result.stats)}</dl>
        <p class="result-status" aria-live="polite"></p>
        <p class="result-attempts">${
          start.unlimited ? '' : start.attemptsLeft > 0 ? `Tentativi rimasti oggi: <strong>${start.attemptsLeft}</strong>` : NO_ATTEMPTS_TEXT
        }</p>
        <div class="result-actions">
          ${canReplay ? '<button type="button" class="button button--play" data-action="again">Rigioca</button>' : ''}
          <a class="button button--secondary" href="#/giochi">Torna ai giochi</a>
        </div>
      </main>
    `);
    container.replaceChildren(view);
    view.querySelector('[data-action="again"]')?.addEventListener('click', showRules);

    const statusEl = view.querySelector('.result-status');
    const setWaiting = () => {
      statusEl.className = 'result-status result-status--waiting';
      statusEl.textContent = isQuiz
        ? '⏳ Il punteggio del quiz arriverà appena torna la connessione (verrà inviato da solo).'
        : '⏳ Punteggio in attesa di connessione (verrà inviato da solo).';
    };

    const applyServer = (server) => {
      if (server?.offline) return setWaiting();
      if (!server?.ok) {
        statusEl.className = 'result-status result-status--error';
        statusEl.textContent = 'Non è stato possibile salvare questa partita.';
        return;
      }
      if (server.status === 'rejected') {
        statusEl.className = 'result-status result-status--error';
        statusEl.textContent = '⚠️ Questa partita non è stata considerata valida e non conta per la classifica.';
      } else {
        statusEl.className = 'result-status result-status--saved';
        statusEl.textContent = '✅ Punteggio salvato';
      }
      if (isQuiz) {
        view.querySelector('.result-card__score').textContent = server.raw_score ?? 0;
        view.querySelector('.result-stats').innerHTML = statsMarkup(gameDef, { ...result.stats, correct: server.correct ?? 0, total: server.total ?? result.stats.total });
      }
      if (server.best !== null && server.best !== undefined) {
        const bestEl = view.querySelector('.result-card__best');
        bestEl.innerHTML = server.status !== 'rejected' && server.raw_score >= server.best && server.raw_score > 0
          ? '🎉 Nuovo record personale!'
          : `Il tuo record: <strong>${server.best}</strong>`;
      }
    };

    const known = resultFor(start.attemptId);
    if (known) applyServer(known);
    else {
      statusEl.className = 'result-status';
      statusEl.textContent = isPending(start.attemptId) ? 'Salvataggio del punteggio…' : '';
      unsubscribe = onSubmitResult((attemptId, server) => {
        if (attemptId === start.attemptId && !destroyed) applyServer(server);
      });
    }
  }

  function showPracticeResult(result) {
    const previousBest = readJson(practiceBestKey(game.id), 0);
    const isNewBest = result.rawScore > previousBest && result.rawScore > 0;
    const best = Math.max(previousBest, result.rawScore);
    writeJson(practiceBestKey(game.id), best);

    const view = html(`
      <main class="page game-page">
        <h1 class="page-title">Fine partita!</h1>
        <div class="result-card">
          <p class="result-card__label">Punti</p>
          <p class="result-card__score">${result.rawScore}</p>
          <p class="result-card__best">${isNewBest ? '🎉 Nuovo record personale!' : `Il tuo record: <strong>${best}</strong>`}</p>
        </div>
        <dl class="result-stats">${statsMarkup(gameDef, result.stats)}</dl>
        ${notice('practice', '🧪 Partita di prova: il punteggio non viene salvato.')}
        <div class="result-actions">
          <button type="button" class="button button--play" data-action="again">Rigioca</button>
          <a class="button button--secondary" href="#/giochi">Torna ai giochi</a>
        </div>
      </main>
    `);
    container.replaceChildren(view);
    view.querySelector('[data-action="again"]').addEventListener('click', () => startSession({ seed: randomSeed() }));
  }

  showRules();

  return {
    title: game.name,
    element: container,
    busy: () => busy,
    destroy() {
      destroyed = true;
      unsubscribe?.();
      session?.destroy();
    },
  };
}
