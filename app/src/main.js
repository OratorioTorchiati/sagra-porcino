import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { startRouter } from './router.js';
import { startAppUpdates } from './lib/app-update.js';
import { renderHome } from './pages/home.js';
import { renderMenu } from './pages/menu.js';
import { renderGames } from './pages/games.js';
import { renderProfile } from './pages/profile.js';
import { renderNotFound } from './pages/not-found.js';

startRouter(document.getElementById('app'), {
  routes: {
    '/': renderHome,
    '/menu': renderMenu,
    '/giochi': renderGames,
    '/profilo': renderProfile,
  },
  notFound: renderNotFound,
});

startAppUpdates();
