// Pannello Admin → 📊 Numeri (D146): giocatori registrati, partite e recensioni, in totale e giorno per giorno
// (ora italiana, il più recente in alto). Solo Admin; i dati vengono da staff_stats (migrazione 043).

import { staffCall } from './staff-ui.js';

const DAY_FORMAT = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const number = new Intl.NumberFormat('it-IT');

const dayText = (day, today) => {
  if (day === today) return 'Oggi';
  const text = DAY_FORMAT.format(new Date(`${day}T12:00:00`)).replace(/\./g, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const COLUMNS = [
  ['players', '👤', 'Giocatori'],
  ['attempts', '🎮', 'Partite'],
  ['reviews', '💬', 'Recensioni'],
];

export function renderStatsSection(root, ctx) {
  root.innerHTML = `
    <div class="form-error" role="alert" hidden></div>
    <div class="staff-stats"><p class="leaderboard-note">Caricamento…</p></div>
    <button type="button" class="button button--secondary stats-refresh" data-refresh>🔄 Aggiorna</button>`;
  const error = root.querySelector('.form-error');
  const box = root.querySelector('.staff-stats');

  async function load() {
    const res = await staffCall(ctx, 'stats', {}, error);
    if (!res) return;
    const today = res.days.find((d) => d.day === res.today) ?? { players: 0, attempts: 0, reviews: 0 };
    box.innerHTML = `
      <ul class="stats-totals">${COLUMNS.map(
        ([key, icon, label]) => `
          <li class="stats-total">
            <span class="stats-total__label"><span aria-hidden="true">${icon}</span> ${label}</span>
            <span class="stats-total__value">${number.format(res.totals[key])}</span>
            <span class="stats-total__today">oggi ${number.format(today[key])}</span>
          </li>`,
      ).join('')}</ul>
      <h3 class="stats-title">Giorno per giorno</h3>
      ${
        res.days.length
          ? `<table class="stats-table">
              <thead><tr><th scope="col">Giorno</th>${COLUMNS.map(([, icon, label]) => `<th scope="col" title="${label}"><span aria-hidden="true">${icon}</span><span class="visually-hidden">${label}</span></th>`).join('')}</tr></thead>
              <tbody>${res.days
                .map((d) => `<tr${d.day === res.today ? ' class="is-today"' : ''}><th scope="row">${dayText(d.day, res.today)}</th>${COLUMNS.map(([key]) => `<td>${number.format(d[key])}</td>`).join('')}</tr>`)
                .join('')}</tbody>
            </table>`
          : '<p class="leaderboard-note">Ancora nessun dato.</p>'
      }
      <p class="config-row__hint">Giocatori: solo i giocatori (non Mod e Admin), nel giorno in cui si sono registrati. Partite: tutte quelle iniziate. Recensioni: tutte quelle ricevute, anche quelle poi rimosse.</p>`;
  }

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-refresh]')) load();
  });
  load();
}
