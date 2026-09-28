/** Crea un elemento a partire da una stringa HTML. I dati esterni vanno passati da escapeHtml(). */
export function html(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

/**
 * Apre una finestra <dialog> davanti a tutto. Sui browser vecchi senza showModal() la mostra comunque
 * (lo stile .dialog[open] la tiene al centro); da chiudere con dialog.close() o togliendo "open".
 */
export function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

/** Chiude una finestra aperta con openDialog, anche sui browser vecchi. */
export function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Rende sicuro un testo (menù, nickname...) da inserire in html(). */
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}
