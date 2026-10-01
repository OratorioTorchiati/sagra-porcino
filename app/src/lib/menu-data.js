// Menù da mostrare (D96): quello caricato dall'Admin dal pannello (get_menu, con copia sul telefono per l'uso
// offline) oppure, se non ne è mai stato caricato uno, quello incluso nell'app (contenuti/menu.csv, in build).

import bundledMenu from 'virtual:menu';
import { rpc, serverConfigured } from './api.js';
import { readJson, writeJson } from './storage.js';
import { menuVersion, onConfigChange } from './app-config.js';
import { parseMenuCsv, SYMBOLS } from '../../scripts/menu-csv.js';

const KEY = 'sagra-menu';
// Il menù cambia di rado: per 1 ora dall'ultima richiesta si usa la copia sul telefono senza chiedere al server (D118).
// La configurazione dell'app (chiesta a ogni cambio pagina) porta la data dell'ultimo menù pubblicato: se non è
// quella della copia sul telefono, il menù si richiede subito, senza aspettare l'ora.
const CHECKED_KEY = 'sagra-menu-controllato';
const FRESH_MS = 60 * 60 * 1000;
const listeners = new Set();
let uploaded = readJson(KEY, null); // { categories, updated_at, by } oppure null

/** Menù attuale: { categories } */
export function currentMenu() {
  return uploaded?.categories ? uploaded : bundledMenu;
}

/** Il menù caricato dal pannello (con data e autore), o null se si usa quello incluso nell'app */
export function uploadedMenu() {
  return uploaded;
}

export function onMenuChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** La configurazione dice che sul server c'è un menù diverso da quello sul telefono */
function outdated() {
  const version = menuVersion();
  return version !== undefined && (version ?? null) !== (uploaded?.updated_at ?? null);
}

// Menù ripubblicato dal pannello: si scarica appena la configurazione lo segnala (la pagina Menù si ridisegna)
onConfigChange(() => {
  if (outdated()) refreshMenu();
});

/**
 * Aggiorna dal server (senza rete resta l'ultima copia). Se l'ultima richiesta è di meno di un'ora fa non chiede
 * nulla, a meno che la configurazione segnali un menù nuovo; `force` (pannello staff: prima di modificare e dopo
 * aver pubblicato) chiede sempre.
 */
export async function refreshMenu({ force = false } = {}) {
  if (!serverConfigured) return currentMenu();
  const checkedAt = readJson(CHECKED_KEY, 0);
  if (!force && !outdated() && Date.now() - checkedAt < FRESH_MS && Date.now() >= checkedAt) return currentMenu();
  try {
    const result = await rpc('get_menu');
    if (!result.ok) return currentMenu();
    const next = result.menu?.categories ? result.menu : null;
    const changed = JSON.stringify(next) !== JSON.stringify(uploaded);
    uploaded = next;
    writeJson(KEY, next);
    writeJson(CHECKED_KEY, Date.now());
    if (changed) listeners.forEach((fn) => fn(currentMenu()));
  } catch {
    // senza rete: va bene l'ultima copia
  }
  return currentMenu();
}

export const countDishes = (menu) => menu.categories.reduce((n, c) => n + c.dishes.length, 0);

// ---------- Per il pannello Admin: file del menù ----------

/** Legge il file (testo CSV di Excel): { menu } oppure { errors: [...] } */
export function readMenuFile(text) {
  try {
    return { menu: parseMenuCsv(text) };
  } catch (error) {
    return { errors: error.errors ?? [error.message] };
  }
}

/** Modello da scaricare: si apre con Excel, si compila e si ricarica */
export function menuTemplate() {
  const rows = [
    '# MENÙ DELLA SAGRA — si apre e si modifica con Excel. Salvare come "CSV UTF-8 (delimitato da virgole)".',
    '# Le righe che iniziano con # sono commenti: l\'app le ignora. Una riga per piatto. Colonne:',
    '#   categoria   = es. Antipasti, Primi, Secondi, Contorni, Dolci, Bevande (nell\'app nell\'ordine in cui compaiono qui)',
    '#   piatto      = nome del piatto (obbligatorio)',
    '#   descrizione = breve, facoltativa',
    '#   prezzo      = in euro, con la virgola: 9,00 (obbligatorio)',
    `#   simboli     = facoltativi, separati da virgola: ${Object.keys(SYMBOLS).join(', ')}`,
    '#   allergeni   = facoltativi, separati da virgola: glutine, uova, latte, frutta a guscio...',
    'categoria;piatto;descrizione;prezzo;simboli;allergeni',
    'Primi;Tagliatelle ai porcini;Pasta fresca fatta a mano;10,00;porcini;glutine, uova',
    'Secondi;Porcini fritti;;12,00;porcini, vegetariano;glutine',
    'Dolci;Castagnaccio;Dolce di farina di castagne;3,50;vegetariano;frutta a guscio',
    'Bevande;Acqua naturale o frizzante;Bottiglia da 0,5 l;1,00;;',
  ];
  return `\uFEFF${rows.join('\r\n')}\r\n`; // BOM: Excel legge bene le lettere accentate
}
