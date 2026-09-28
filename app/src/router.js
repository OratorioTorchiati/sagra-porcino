// Router basato su hash (#/menu, #/giochi/acchiappa...): GitHub Pages non gestisce le route SPA.
// Ogni cambio di hash crea una voce nella cronologia, quindi il tasto "indietro" del telefono funziona da solo.

import { EVENT_NAME } from './config.js';

let hasNavigated = false;

/** Percorso corrente senza il "#", es. "/menu". */
export function currentPath() {
  const path = location.hash.replace(/^#/, '');
  return path.startsWith('/') ? path : '/';
}

/**
 * Torna alla pagina precedente dell'app; se si è entrati direttamente su questa pagina
 * (es. da un link), va alla home senza uscire dall'app.
 */
export function goBack() {
  if (hasNavigated) {
    history.back();
  } else {
    location.replace('#/');
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
    show();
  });
  show();
}
