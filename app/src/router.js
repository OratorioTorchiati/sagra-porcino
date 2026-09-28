// Router basato su hash (#/menu, #/giochi/acchiappa...): GitHub Pages non gestisce le route SPA.
// Ogni cambio di hash crea una voce nella cronologia, quindi il tasto "indietro" del telefono funziona da solo.
//
// Il bottone "← Indietro" dell'app invece segue la GERARCHIA delle pagine, non la cronologia:
// da un gioco si torna a Minigiochi, da Minigiochi / Menù / Profilo alla Home.

import { EVENT_NAME } from './config.js';

const HISTORY_KEY = 'sagra-cronologia';

let hasNavigated = false;
// Percorsi delle voci di cronologia create dall'app (indice = history.state.sagraIdx), per sapere
// se la pagina "madre" è proprio quella precedente. Salvati in sessionStorage per sopravvivere alle ricariche.
let historyPaths = [];
let historyIdx = 0;
let replacing = false; // location.replace: stessa voce di cronologia, non una nuova

/** Percorso corrente senza il "#", es. "/menu". */
export function currentPath() {
  const path = location.hash.replace(/^#/, '');
  return path.startsWith('/') ? path : '/';
}

// Pagine la cui madre non segue il percorso (registrazione e accesso si aprono dal profilo)
const PARENT_OVERRIDES = {
  '/registrati': '/profilo',
  '/accedi': '/profilo',
};

/** Pagina "madre" nella gerarchia: "/giochi/quiz" → "/giochi", "/menu" → "/", "/" → null. */
export function parentPath(path) {
  if (PARENT_OVERRIDES[path]) return PARENT_OVERRIDES[path];
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  return `/${parts.slice(0, -1).join('/')}`;
}

function saveHistory() {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(historyPaths));
  } catch {
    // Non indispensabile
  }
}

function loadHistory() {
  try {
    return JSON.parse(sessionStorage.getItem(HISTORY_KEY)) ?? [];
  } catch {
    return [];
  }
}

/** Registra la voce di cronologia corrente (nuova, oppure raggiunta con indietro/avanti). */
function trackHistory() {
  const state = history.state;
  if (replacing) {
    replacing = false;
    history.replaceState({ ...(state ?? {}), sagraIdx: historyIdx }, '');
  } else if (state && Number.isInteger(state.sagraIdx)) {
    historyIdx = state.sagraIdx;
  } else {
    // Voce nuova: segue quella da cui si arriva (le voci "avanti" vengono scartate)
    historyIdx = historyPaths.length === 0 ? 0 : historyIdx + 1;
    historyPaths = historyPaths.slice(0, historyIdx);
    history.replaceState({ ...(state ?? {}), sagraIdx: historyIdx }, '');
  }
  historyPaths[historyIdx] = currentPath();
  saveHistory();
}

/** Bottone "← Indietro": va alla pagina madre (con il vero "indietro" se è quella precedente). */
export function goBack() {
  const parent = parentPath(currentPath()) ?? '/';
  if (historyIdx > 0 && historyPaths[historyIdx - 1] === parent) {
    history.back();
  } else {
    replacing = true;
    location.replace(`#${parent}`);
  }
}

/**
 * Cerca la route che corrisponde al percorso. I segmenti ":nome" catturano un parametro,
 * es. "/giochi/:gameId" su "/giochi/quiz" → { gameId: "quiz" }.
 */
function matchRoute(routes, path) {
  const parts = path.split('/').filter(Boolean);
  for (const [pattern, render] of Object.entries(routes)) {
    const patternParts = pattern.split('/').filter(Boolean);
    if (patternParts.length !== parts.length) continue;
    const params = {};
    const ok = patternParts.every((p, i) => {
      if (p.startsWith(':')) {
        params[p.slice(1)] = decodeURIComponent(parts[i]);
        return true;
      }
      return p === parts[i];
    });
    if (ok) return { render, params };
  }
  return null;
}

/**
 * Avvia il router. Ogni pagina è una funzione (params) → { title, element, destroy? }.
 * `destroy` viene chiamata quando si lascia la pagina (es. per fermare una partita).
 */
export function startRouter(root, { routes, notFound }) {
  let currentPage = null;
  historyPaths = history.state && Number.isInteger(history.state.sagraIdx) ? loadHistory() : [];

  function show() {
    currentPage?.destroy?.();
    const match = matchRoute(routes, currentPath());
    const page = match ? match.render(match.params) : notFound();
    currentPage = page;

    root.replaceChildren(page.element);
    document.title = page.title ? `${page.title} · ${EVENT_NAME}` : EVENT_NAME;
    window.scrollTo(0, 0);

    // Per i lettori di schermo: porta il focus sul titolo della nuova pagina
    const heading = root.querySelector('h1');
    if (heading && hasNavigated) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }

  window.addEventListener('hashchange', () => {
    hasNavigated = true;
    trackHistory();
    show();
  });
  trackHistory();
  show();
}
