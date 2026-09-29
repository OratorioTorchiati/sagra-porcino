// Scheda punti di un giocatore: la stessa nel profilo e toccando un giocatore in classifica.

import { escapeHtml } from '../lib/dom.js';
import { formatPoints } from '../lib/leaderboard.js';
import { GAMES } from '../games/registry.js';
import { characterById } from '../characters/characters.js';
import avatarAnonimoSvg from '../assets/avatar-anonimo.svg?raw';

export const avatarSvg = (avatarId) => characterById(avatarId)?.svg ?? avatarAnonimoSvg;

/** Righe punti: totale, posizione, migliori per gioco, punti extra */
export function playerStatsMarkup(card) {
  const position = card.position
    ? `<strong>${card.position}°</strong> su ${formatPoints(card.players)}`
    : 'Non ancora in classifica';
  const games = Object.values(GAMES)
    .map((game) => {
      const best = card.best?.[game.id];
      return `<li class="player-stats__game"><span>${escapeHtml(game.name)}</span><strong>${best === undefined ? '—' : formatPoints(best)}</strong></li>`;
    })
    .join('');
  return `
    <div class="player-stats">
      <div class="player-stats__summary">
        <p class="player-stats__total"><span class="player-stats__label">Punti</span><strong>${formatPoints(card.total)}</strong></p>
        <p class="player-stats__position"><span class="player-stats__label">Posizione</span><span>${position}</span></p>
      </div>
      <ul class="player-stats__games">
        ${games}
        ${card.extra_total ? `<li class="player-stats__game player-stats__game--extra"><span>⭐ Punti extra</span><strong>${formatPoints(card.extra_total)}</strong></li>` : ''}
      </ul>
    </div>`;
}

/** Scheda completa (per la finestra della classifica): personaggio, nickname e punti */
export function playerCardMarkup(card) {
  return `
    <div class="profile-card profile-card--compact">
      <span class="profile-card__avatar" aria-hidden="true">${avatarSvg(card.avatar)}</span>
      <p class="profile-card__nickname">${escapeHtml(card.nickname)}</p>
    </div>
    ${playerStatsMarkup(card)}`;
}
