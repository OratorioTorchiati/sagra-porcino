/** Crea un elemento a partire da una stringa HTML (solo testi nostri, mai dati inseriti dagli utenti). */
export function html(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}
