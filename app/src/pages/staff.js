// Pannello Admin (#/admin, prima #/staff; Tappa 8, D73, D94). Si entra con nickname + password di un account staff.
// Ruoli (D93): Mod (ruolo "staff") = Giocatori, Da controllare, Telefoni, Classifica, Feedback (D108); Admin = in più Registro e
// ⚙️ Configurazioni. Tutto passa dalle funzioni staff_* del server, che controllano il ruolo a ogni chiamata.

import { html, escapeHtml } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';
import { currentPlayer, login, logout, isStaffRole, isAdminRole, roleLabel } from '../lib/account.js';
import { NetworkError } from '../lib/api.js';
import { renderPlayersSection } from './staff-players.js';
import { renderReviewSection, renderSuspiciousSection, renderLeaderboardSection, renderLogSection } from './staff-sections.js';
import { renderConfigSection } from './staff-config.js';
import { renderFeedbackSection } from './staff-feedback.js';

// admin: true = solo per l'Admin
const SECTIONS = [
  { id: 'giocatori', label: '👤 Giocatori', render: renderPlayersSection },
  { id: 'controlli', label: '🚩 Da controllare', render: renderReviewSection },
  { id: 'sospetti', label: '📱 Telefoni', render: renderSuspiciousSection },
  { id: 'classifica', label: '🏆 Classifica', render: renderLeaderboardSection },
  { id: 'feedback', label: '💬 Feedback', render: renderFeedbackSection },
  { id: 'registro', label: '📜 Registro', render: renderLogSection, admin: true },
];
const CONFIG = { id: 'configurazioni', label: '⚙️ Configurazioni', render: renderConfigSection, admin: true };

const LOGIN_ERRORS = {
  WRONG_CREDENTIALS: 'Nickname o password sbagliati.',
  LOCKED: 'Troppi tentativi sbagliati: riprova tra qualche minuto.',
  DISABLED: 'Questo account è bloccato.',
  DEVICE_BANNED: 'Questo telefono è bloccato.',
};

function loginMarkup(message = '') {
  const player = currentPlayer();
  return `
    <form class="auth-form staff-login" novalidate>
      <p>Accesso riservato agli organizzatori.</p>
      ${player ? `<p class="notice">Ora sei dentro come <strong>${escapeHtml(player.nickname)}</strong>: entrando come staff uscirai da questo account (poi potrai rientrare col suo PIN).</p>` : ''}
      <label class="form-field">
        <span class="form-field__label">Nickname</span>
        <input class="form-field__input" name="nickname" autocomplete="username" autocapitalize="off" spellcheck="false" required>
      </label>
      <label class="form-field">
        <span class="form-field__label">Password</span>
        <input class="form-field__input" name="password" type="password" autocomplete="current-password" required>
      </label>
      <div class="form-error" role="alert" ${message ? '' : 'hidden'}>${escapeHtml(message)}</div>
      <button type="submit" class="button">Entra</button>
    </form>`;
}

export function renderStaff() {
  const element = html(`
    <main class="page staff-page">
      ${topBarMarkup({ showAccount: false })}
      <h1 class="page-title">🛠️ Pannello Admin</h1>
      <div class="staff-body"></div>
    </main>
  `);
  bindTopBar(element);
  const body = element.querySelector('.staff-body');
  let cleanup = null;

  function showLogin(message) {
    body.innerHTML = loginMarkup(message);
    const form = body.querySelector('form');
    const error = form.querySelector('.form-error');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const nickname = form.nickname.value.trim();
      const password = form.password.value;
      if (!nickname || !password) return;
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        const result = await login({ nickname, pin: password });
        if (!result.ok) {
          error.textContent = LOGIN_ERRORS[result.error] ?? 'Accesso non riuscito.';
          error.hidden = false;
        } else if (!isStaffRole(result.player.role)) {
          await logout();
          error.textContent = 'Questo non è un account dello staff.';
          error.hidden = false;
        } else {
          showPanel();
        }
      } catch (err) {
        error.textContent = err instanceof NetworkError ? 'Serve la connessione per entrare.' : 'Accesso non riuscito.';
        error.hidden = false;
      } finally {
        button.disabled = false;
      }
    });
  }

  function showPanel(sectionId = SECTIONS[0].id) {
    const me = currentPlayer();
    const admin = isAdminRole(me.role);
    const visible = [...SECTIONS, CONFIG].filter((s) => admin || !s.admin);
    body.innerHTML = `
      <p class="staff-who">Sei dentro come <strong>${roleLabel(me.role)}</strong>.</p>
      <nav class="staff-tabs" aria-label="Sezioni del pannello">
        ${visible.map((s) => `<button type="button" class="staff-tab" data-section="${s.id}">${s.label}</button>`).join('')}
      </nav>
      <section class="staff-section" aria-live="polite"></section>`;
    const section = body.querySelector('.staff-section');
    const open = (id) => {
      cleanup?.();
      body.querySelectorAll('.staff-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.section === id));
      section.innerHTML = '';
      const result = visible.find((s) => s.id === id).render(section, { onNotStaff: () => showLogin('La sessione staff non è più valida: entra di nuovo.') });
      cleanup = typeof result === 'function' ? result : null; // le sezioni che caricano e basta non hanno niente da chiudere
    };
    body.querySelector('.staff-tabs').addEventListener('click', (event) => {
      const id = event.target.closest('.staff-tab')?.dataset.section;
      if (id) open(id);
    });
    open(sectionId);
  }

  if (isStaffRole(currentPlayer()?.role)) showPanel();
  else showLogin();

  return { title: 'Pannello Admin', element, destroy: () => cleanup?.() };
}
