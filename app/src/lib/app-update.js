// Service worker: tiene in cache tutto il sito (funziona offline) e scarica le nuove versioni.
//
// Quando è pronta una versione nuova (es. menù corretto e ripubblicato) la applichiamo:
// - subito, se l'utente non ha ancora toccato né fatto scorrere niente (anche se la versione nuova
//   arriva tardi, con la rete lenta della piazza);
// - altrimenti al prossimo cambio di pagina, così la ricarica non interrompe nessuno;
// - mai mentre è bloccata (durante una partita).

import { registerSW } from 'virtual:pwa-register';

const CHECK_EVERY_MS = 30 * 60 * 1000;
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'scroll', 'wheel'];

let updatePending = false;
let blocked = false;
let interacted = false;
let applyUpdate = null;

function tryApply() {
  if (updatePending && !blocked && applyUpdate) applyUpdate(true);
}

/** Da chiamare con true all'inizio di una partita e con false alla fine. */
export function setUpdateBlocked(value) {
  blocked = value;
}

export function startAppUpdates() {
  if (!('serviceWorker' in navigator)) return;

  const markInteracted = () => {
    interacted = true;
    INTERACTION_EVENTS.forEach((type) => window.removeEventListener(type, markInteracted, true));
  };
  INTERACTION_EVENTS.forEach((type) => window.addEventListener(type, markInteracted, { capture: true, passive: true }));

  applyUpdate = registerSW({
    onNeedRefresh() {
      updatePending = true;
      if (!interacted) tryApply();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {});
      };
      // Controlla se c'è una versione nuova quando si torna sull'app e ogni mezz'ora
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, CHECK_EVERY_MS);
    },
  });

  window.addEventListener('hashchange', tryApply);
}
