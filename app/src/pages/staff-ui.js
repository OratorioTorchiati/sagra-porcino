// Aiuti comuni alle sezioni del pannello staff: chiamata con gestione errori, date, finestra di conferma.

import { html, openDialog, closeDialog } from '../lib/dom.js';
import { staffRpc } from '../lib/staff.js';
import { NetworkError } from '../lib/api.js';

const dateTime = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

/** "dom 18/10, 21:14" */
export const formatDate = (iso) => (iso ? dateTime.format(new Date(iso)) : '—');

/**
 * Chiama staff_<name>. Restituisce il risultato se ok, altrimenti null dopo aver mostrato l'errore in `errorEl`
 * (o, se la sessione non è più staff, dopo aver riportato al login).
 */
export async function staffCall(ctx, name, params, errorEl) {
  const show = (text) => {
    if (errorEl) {
      errorEl.textContent = text;
      errorEl.hidden = false;
    }
  };
  if (errorEl) errorEl.hidden = true;
  try {
    const result = await staffRpc(name, params);
    if (result.ok) return result;
    if (result.error === 'NOT_STAFF') {
      ctx.onNotStaff();
      return null;
    }
    show(ERRORS[result.error] ?? `Errore: ${result.error}`);
    return null;
  } catch (error) {
    show(error instanceof NetworkError ? 'Serve la connessione.' : 'Qualcosa è andato storto. Riprova.');
    return null;
  }
}

const ERRORS = {
  NOT_FOUND: 'Non trovato.',
  PIN_INVALID: 'Il PIN deve avere 4 cifre.',
  CONFIRM_MISMATCH: 'Il nickname scritto non corrisponde.',
  POINTS_INVALID: 'Scrivi un numero di punti diverso da zero (es. 50 o -50).',
  REASON_REQUIRED: 'Scrivi il motivo.',
  ATTEMPTS_INVALID: 'Tentativi al giorno: da 1 a 50.',
  HOUR_INVALID: "Ora del reset: da 0 a 23.",
  DATE_INVALID: 'Data non valida.',
  VALUES_INVALID: 'Valori non validi.',
  STATUS_INVALID: 'Operazione non valida.',
};

/**
 * Finestra di conferma con eventuali campi. Restituisce i valori del form (oggetto) o null se annullata.
 * `validate(values)` può restituire un messaggio d'errore per non chiudere.
 */
export function askDialog({ title, body = '', confirmLabel = 'Conferma', danger = false, validate, infoOnly = false }) {
  return new Promise((resolve) => {
    const dialog = html(`
      <dialog class="dialog staff-dialog">
        <form method="dialog" novalidate>
          <h2 class="dialog__title">${title}</h2>
          ${body}
          <div class="form-error" role="alert" hidden></div>
          <div class="dialog__actions">
            <button type="submit" class="button${danger ? ' button--danger' : ''}" value="ok">${confirmLabel}</button>
            ${infoOnly ? '' : '<button type="button" class="button button--secondary" data-action="cancel">Annulla</button>'}
          </div>
        </form>
      </dialog>`);
    document.body.append(dialog);
    const form = dialog.querySelector('form');
    const error = dialog.querySelector('.form-error');
    const finish = (value) => {
      closeDialog(dialog);
      dialog.remove();
      resolve(value);
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const message = validate?.(values);
      if (message) {
        error.textContent = message;
        error.hidden = false;
        return;
      }
      finish(values);
    });
    dialog.querySelector('[data-action="cancel"]')?.addEventListener('click', () => finish(null));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(null);
    });
    openDialog(dialog);
    dialog.querySelector('input')?.focus();
  });
}

/** "iPhone · Safari", "Android · Chrome"... dal user agent (solo indicativo) */
export function browserName(ua = '') {
  const device = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'altro';
  const browser = /SamsungBrowser/.test(ua)
    ? 'Samsung Internet'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Firefox|FxiOS/.test(ua)
        ? 'Firefox'
        : /Chrome|CriOS/.test(ua)
          ? 'Chrome'
          : /Safari/.test(ua)
            ? 'Safari'
            : 'browser';
  return ua ? `${device} · ${browser}` : 'browser sconosciuto';
}

/** "← Prima · Pagina 2 di 5 · Dopo →" (bottoni con data-page); niente se c'è una pagina sola */
export function pagerMarkup(page, total, size) {
  const pages = Math.ceil(total / size);
  if (pages <= 1) return '';
  return `<div class="staff-pager">
      <button type="button" class="button button--secondary" data-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>← Prima</button>
      <span>Pagina ${page + 1} di ${pages}</span>
      <button type="button" class="button button--secondary" data-page="${page + 1}" ${page + 1 >= pages ? 'disabled' : ''}>Dopo →</button>
    </div>`;
}
