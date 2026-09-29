// Pannello staff → "Rivedi partita" (D75): la partita registrata rigiocata dal suo seme e dalle sue azioni,
// a schermo intero, con il tempo che scorre in alto e un'"onda" dove il giocatore ha toccato.
// In basso "Approva" oppure "Escludi giocatore" (account e telefono bloccati, D76); in alto "Indietro".

import { escapeHtml } from '../lib/dom.js';
import { GAMES } from '../games/registry.js';
import { GameSession } from '../games/engine/session.js';
import { noteLabel } from '../lib/staff.js';
import { staffCall, askDialog } from './staff-ui.js';

/**
 * Apre il replay di una partita. `onDone(changed)` quando si torna all'elenco (changed = approvata/giocatore escluso).
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
    bottom.innerHTML = `
      <button type="button" class="button" data-decision="approve">✅ Approva</button>
      <button type="button" class="button button--danger" data-decision="exclude">⛔ Escludi giocatore</button>`;
  }

  container.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'back') return close(false);
    if (action === 'again') return start();
    const decision = event.target.closest('[data-decision]')?.dataset.decision;
    if (decision === 'approve') {
      const ok = await askDialog({ title: 'Approvare questa partita?', body: '<p>Resta valida in classifica e sparisce da questo elenco.</p>', confirmLabel: 'Approva' });
      if (ok && (await staffCall(ctx, 'set_attempt_status', { p_attempt_id: attempt.id, p_status: 'valid' }, errorEl))) close(true);
    } else if (decision === 'exclude') {
      const ok = await askDialog({
        title: `Escludere ${escapeHtml(attempt.nickname)}?`,
        body: `<p>L'account viene <strong>bloccato</strong>: non potrà più entrare né giocare e sparisce dalla classifica.
          Anche il suo <strong>telefono resta bloccato</strong>: non potrà creare un altro account.</p>
          <p>Questa partita viene cancellata. Si può riattivare l'account da Giocatori.</p>`,
        confirmLabel: 'Escludi',
        danger: true,
      });
      if (ok && (await staffCall(ctx, 'exclude_player', { p_attempt_id: attempt.id }, errorEl))) close(true);
    }
  });

  start();
}
