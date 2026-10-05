// Informativa privacy: TESTO PROVVISORIO (docs/05-DECISIONI.md, Q7). Il testo definitivo, con il nome
// del titolare del trattamento, va verificato dagli organizzatori.

import { html } from '../lib/dom.js';
import { topBarMarkup, bindTopBar } from '../components/top-bar.js';

const CONTROLLER = 'Associazione organizzatrice della Sagra del Porcino'; // da definire (Q7)
const RETENTION_DAYS = 30;

/** Contenuto dell'informativa, usato dalla pagina e dalla finestra nella registrazione. */
export function privacyContentMarkup() {
  return `
    <div class="privacy-text">
      <p><strong>Chi tratta i dati:</strong> ${CONTROLLER}.</p>
      <p><strong>Quali dati:</strong> il nickname che scegli, il personaggio, il PIN (salvato cifrato, nessuno può leggerlo), un codice casuale che identifica il telefono, alcune informazioni tecniche del telefono (modello del browser, dimensioni dello schermo, lingua), i punteggi dei giochi. Se sbagli il PIN, per sicurezza l'indirizzo IP di quel tentativo viene conservato al massimo 2 giorni.</p>
      <p><strong>Recensioni:</strong> se lasci una recensione, il voto e il testo vengono salvati e possono essere mostrati agli altri insieme al tuo nickname e al personaggio (oppure come "Anonimo" se la lasci senza account).</p>
      <p><strong>Posizione:</strong> se tocchi "Mostra la mia posizione" sulla mappa, il telefono usa la tua posizione solo per mostrarla sulla mappa: non viene mai inviata né salvata, e si spegne quando chiudi la pagina.</p>
      <p><strong>Non chiediamo</strong> nome, email o numero di telefono.</p>
      <p><strong>Perché:</strong> per far funzionare i giochi, la classifica e la consegna dei premi, ed evitare che una persona crei tanti account.</p>
      <p><strong>Per quanto tempo:</strong> i dati vengono cancellati entro ${RETENTION_DAYS} giorni dalla fine della sagra.</p>
      <p><strong>I tuoi diritti:</strong> puoi chiedere di vedere o cancellare i tuoi dati allo stand della sagra.</p>
      <p><strong>Età:</strong> per giocare devi avere almeno 14 anni, oppure il permesso di un genitore.</p>
    </div>
  `;
}

export function renderPrivacy() {
  const element = html(`
    <main class="page">
      ${topBarMarkup()}
      <h1 class="page-title">Informativa privacy</h1>
      ${privacyContentMarkup()}
    </main>
  `);
  bindTopBar(element);
  return { title: 'Informativa privacy', element };
}
