// Service worker: tiene in cache tutto il sito (funziona offline) e scarica le nuove versioni.
//
// Quando è pronta una versione nuova (es. menù corretto e ripubblicato) la applichiamo:
// - subito, se l'app è stata appena aperta (l'utente non ha ancora iniziato a leggere);
// - altrimenti al prossimo cambio di pagina, così la ricarica non interrompe nessuno;
// - mai mentre è bloccata (es. durante una partita, dalla Tappa 2).

import { registerSW } from 'virtual:pwa-register';

const JUST_OPENED_MS = 5000;
const CHECK_EVERY_MS = 30 * 60 * 1000;

let updatePending = false;
let blocked = false;
let applyUpdate = null;

function tryApply() {
  if (updatePending && !blocked && applyUpdate) applyUpdate(true);
}

/** Da chiamare con true all'inizio di una partita e con false alla fine. */
export function setUpdateBlocked(value) {
  blocked = value;
  if (!blocked && performance.now() < JUST_OPENED_MS) tryApply();
}

export function startAppUpdates() {
  if (!('serviceWorker' in navigator)) return;

  applyUpdate = registerSW({
    onNeedRefresh() {
      updatePending = true;
      if (performance.now() < JUST_OPENED_MS) tryApply();
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
