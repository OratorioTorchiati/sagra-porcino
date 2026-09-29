import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { startRouter } from './router.js';
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

startRouter(document.getElementById('app'), {
  routes: {
    '/': renderHome,
    '/menu': renderMenu,
    '/giochi': renderGames,
    '/giochi/classifica': renderLeaderboard, // prima di :gameId
    '/giochi/:gameId': renderGame,
    '/profilo': renderProfile,
    '/registrati': renderRegister,
    '/accedi': renderLogin,
    '/privacy': renderPrivacy,
    '/staff': renderStaff,
  },
  notFound: renderNotFound,
});

startAppUpdates();
startQueue(); // punteggi rimasti in sospeso (fatti senza rete)
