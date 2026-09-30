import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { startRouter, currentPath } from './router.js';
import { startAppUpdates } from './lib/app-update.js';
import { startQueue } from './lib/queue.js';
import { renderHome } from './pages/home.js';
import { renderMenu } from './pages/menu.js';
import { renderGames } from './pages/games.js';
import { renderGame } from './pages/game.js';
import { renderLeaderboard } from './pages/leaderboard.js';
import { renderStaff } from './pages/staff.js';
import { renderProfile } from './pages/profile.js';
import { renderRegister } from './pages/register.js';
import { renderLogin } from './pages/login.js';
import { renderPrivacy } from './pages/privacy.js';
import { renderNotFound } from './pages/not-found.js';
import { renderSectionOff } from './pages/section-off.js';
import { sectionForPath, sectionOn, onConfigChange, refreshAppConfig } from './lib/app-config.js';
import { currentPlayer, isStaffRole } from './lib/account.js';

// Sezione spenta dall'Admin (D93): al posto della pagina, "non disponibile". Mod e Admin la vedono lo stesso (prove).
const canSeeOff = () => isStaffRole(currentPlayer()?.role);
const section = (render) => (params) => {
  const s = sectionForPath(currentPath());
  return s && !sectionOn(s.id) && !canSeeOff() ? renderSectionOff(s) : render(params);
};

startRouter(document.getElementById('app'), {
  routes: {
    '/': renderHome,
    '/menu': section(renderMenu),
    '/giochi': section(renderGames),
    '/giochi/classifica': section(renderLeaderboard), // prima di :gameId
    '/giochi/:gameId': section(renderGame),
    '/profilo': renderProfile,
    '/registrati': renderRegister,
    '/accedi': renderLogin,
    '/privacy': renderPrivacy,
    '/staff': renderStaff,
  },
  notFound: renderNotFound,
});

// Se l'Admin spegne la sezione che si sta guardando, si torna alla home
onConfigChange(() => {
  const s = sectionForPath(currentPath());
  if (s && !sectionOn(s.id) && !canSeeOff()) location.replace('#/');
});
refreshAppConfig();

startAppUpdates();
startQueue(); // punteggi rimasti in sospeso (fatti senza rete)
