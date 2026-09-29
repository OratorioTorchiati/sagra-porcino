// Pannello staff → "Rivedi partita" (D75): la partita registrata rigiocata dal suo seme e dalle sue azioni,
// a schermo intero, con il tempo che scorre in alto e un'"onda" dove il giocatore ha toccato.
// In basso "Approva" / "Scarta" (partite segnalate) oppure "Rimetti" (partite escluse); in alto "Indietro".

import { escapeHtml } from '../lib/dom.js';
import { GAMES } from '../games/registry.js';
import { GameSession } from '../games/engine/session.js';
import { noteLabel } from '../lib/staff.js';
import { staffCall, askDialog } from './staff-ui.js';

/**
 * Apre il replay di una partita. `onDone(changed)` quando si torna all'elenco (changed = approvata/scartata).
 */
export async function openReplay(attemptId, ctx, errorEl, onDone) {
  const res = await staffCall(ctx, 'attempt_replay', { p_attempt_id: attemptId }, errorEl);
  if (!res) return;
  const attempt = res.attempt;
  const game = GAMES[attempt.game_id];
  if (!game || !Array.isArray(attempt.actions)) {
    if (errorEl) {
      errorEl.textContent = 'Questa partita non ha azioni registrate da rivedere.';
      errorEl.hidden = false;
    }
    return;
  }
  const gameDef = await game.load();
  const baseAssets = (await gameDef.loadAssets?.()) ?? {};
  const assets = attempt.questions ? { ...baseAssets, pool: attempt.questions } : baseAssets;
  const actions = attempt.actions;
  const durationMs = attempt.stats?.durationMs ?? actions.at(-1)?.[0] ?? 0;
  // Partite registrate prima del replay (senza grandezza dell'area e a passi variabili): solo indicativo
  const approximate = gameDef.canvas !== false && !actions.some((a) => a[1] === 'size');

  let session = null;
  const container = document.createElement('div');
  document.body.append(container);

  function close(changed) {
    session?.destroy();
    container.remove();
    onDone?.(changed);
  }

  function start() {
    session?.destroy();
    session = new GameSession({
      root: container,
      gameDef: { ...gameDef, name: game.name },
      assets,
      seed: Number(attempt.seed),
      replay: { actions, durationMs },
      onFinish: () => {
        const again = session.element.querySelector('[data-action="again"]');
        if (again) again.hidden = false;
      },
    });
    fillBars();
    // Solo in sviluppo (rimosso dalla build): permette ai test automatici di far avanzare il replay
    if (import.meta.env.DEV) window.__replaySession = session;
  }

  function fillBars() {
    const top = session.element.querySelector('.replay-top');
    const bottom = session.element.querySelector('.replay-bottom');
    const notes = (attempt.notes ?? []).map((n) => escapeHtml(noteLabel(n))).join(' · ');
    top.innerHTML = `
      <div class="replay-top__row">
        <button type="button" class="replay-button" data-action="back">← Indietro</button>
        <button type="button" class="replay-button" data-action="again" hidden>↻ Rivedi</button>
      </div>
      <p class="replay-top__info"><strong>${escapeHtml(attempt.nickname)}</strong> · ${escapeHtml(game.name)} · ${attempt.raw_score ?? '—'} punti</p>
      ${notes ? `<p class="replay-top__notes">🚩 ${notes}</p>` : ''}
      ${approximate ? '<p class="replay-top__notes">⚠️ Partita registrata prima del replay: quello che vedi è solo indicativo.</p>' : ''}`;
    bottom.innerHTML =
      attempt.status === 'rejected'
        ? `<button type="button" class="button" data-set="valid">↩️ Rimetti</button>`
        : `<button type="button" class="button" data-set="valid">✅ Approva</button>
           <button type="button" class="button button--danger" data-set="rejected">❌ Scarta</button>`;
    bottom.classList.toggle('replay-bottom--single', attempt.status === 'rejected');
  }

  container.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'back') return close(false);
    if (action === 'again') return start();
    const button = event.target.closest('[data-set]');
    if (!button) return;
    const target = button.dataset.set;
    const ok = await askDialog({
      title: target === 'rejected' ? 'Scartare questa partita?' : attempt.status === 'rejected' ? 'Rimettere questa partita?' : 'Approvare questa partita?',
      body: target === 'rejected' ? '<p>Non conterà più in classifica.</p>' : '<p>Conterà in classifica.</p>',
      confirmLabel: target === 'rejected' ? 'Scarta' : 'Conferma',
      danger: target === 'rejected',
    });
    if (ok && (await staffCall(ctx, 'set_attempt_status', { p_attempt_id: attempt.id, p_status: target }, errorEl))) close(true);
  });

  start();
}
