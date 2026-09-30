// Converte contenuti/menu.csv (compilato con Excel dagli organizzatori) nei dati del menù usati dall'app.
// Gira durante la build (e in sviluppo): se il file contiene errori la build si ferma con l'elenco delle righe
// da correggere, così un menù sbagliato non viene mai pubblicato. Lo usa anche il pannello Admin per il menù
// caricato dal telefono (D96): stessi controlli, errori mostrati prima di pubblicare.

/** Simboli ammessi nella colonna "simboli" → descrizione mostrata nella legenda. */
export const SYMBOLS = {
  porcini: 'Contiene porcini',
  vegetariano: 'Vegetariano',
  piccante: 'Piccante',
};

// Varianti tollerate (singolare/plurale, maschile/femminile)
const SYMBOL_ALIASES = {
  porcino: 'porcini',
  vegetariana: 'vegetariano',
  vegetariani: 'vegetariano',
  vegetariane: 'vegetariano',
  piccanti: 'piccante',
};

const REQUIRED_COLUMNS = ['categoria', 'piatto', 'prezzo'];
const OPTIONAL_COLUMNS = ['descrizione', 'simboli', 'allergeni'];

/**
 * Legge un CSV (anche con campi tra virgolette, come li salva Excel) e restituisce le righe
 * con il numero di riga del file, utile per i messaggi di errore.
 */
export function parseCsvRows(text, separator) {
  const rows = [];
  let cells = [];
  let cell = '';
  let inQuotes = false;
  let atCellStart = true;
  let line = 1;
  let rowLine = 1;

  const endCell = () => {
    cells.push(cell);
    cell = '';
    atCellStart = true;
  };
  const endRow = () => {
    endCell();
    rows.push({ line: rowLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"' && atCellStart) {
      inQuotes = true;
      atCellStart = false;
    } else if (ch === separator) {
      endCell();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else {
      cell += ch;
      atCellStart = false;
    }
  }
  if (cell !== '' || cells.length > 0) endRow();
  return rows;
}

function isCommentLine(rawLine) {
  return /^\s*"?#/.test(rawLine);
}

/** Excel italiano salva con ";", ma accettiamo anche "," e tabulazione: si decide dalla riga delle colonne. */
function detectSeparator(text) {
  const headerLine = text.split(/\r?\n/).find((l) => l.trim() !== '' && !isCommentLine(l)) ?? '';
  const counts = [';', ',', '\t'].map((sep) => [sep, headerLine.split(sep).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ';';
}

function parsePrice(value) {
  const cleaned = value.replace(/€|euro/gi, '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function splitList(value) {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Converte il testo del CSV nel menù:
 * { categories: [{ name, dishes: [{ name, description, price, symbols, allergens }] }] }
 * Lancia un errore con tutte le righe da correggere.
 */
export function parseMenuCsv(text) {
  text = text.replace(/^﻿/, '');
  const separator = detectSeparator(text);
  const errors = [];
  const categories = [];
  let columns = null;
  let lastCategory = null;

  for (const { line, cells } of parseCsvRows(text, separator)) {
    const first = (cells[0] ?? '').trim();
    if (first.startsWith('#')) continue;
    if (cells.every((c) => c.trim() === '')) continue; // riga vuota (anche ";;;;;" di Excel)

    if (!columns) {
      columns = cells.map((c) => c.trim().toLowerCase());
      const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
      if (missing.length) {
        errors.push(`Riga ${line}: mancano le colonne ${missing.join(', ')} (servono: ${[...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].join(';')})`);
        break;
      }
      continue;
    }

    const get = (name) => {
      const index = columns.indexOf(name);
      return index === -1 ? '' : (cells[index] ?? '').trim();
    };

    // Categoria vuota = stessa categoria della riga sopra
    const categoryName = get('categoria') || lastCategory?.name;
    const name = get('piatto');
    const priceText = get('prezzo');
    const price = parsePrice(priceText);

    if (!categoryName) errors.push(`Riga ${line}: manca la categoria`);
    if (!name) errors.push(`Riga ${line}: manca il nome del piatto`);
    if (!priceText) errors.push(`Riga ${line}: manca il prezzo`);
    else if (price === null) errors.push(`Riga ${line}: prezzo non valido "${priceText}" (scrivere ad esempio 9,00)`);

    const symbols = [];
    for (const raw of splitList(get('simboli'))) {
      const key = SYMBOL_ALIASES[raw.toLowerCase()] ?? raw.toLowerCase();
      if (!SYMBOLS[key]) {
        errors.push(`Riga ${line}: simbolo sconosciuto "${raw}" (ammessi: ${Object.keys(SYMBOLS).join(', ')})`);
      } else if (!symbols.includes(key)) {
        symbols.push(key);
      }
    }

    if (!categoryName || !name || price === null) continue;

    if (!lastCategory || lastCategory.name.toLowerCase() !== categoryName.toLowerCase()) {
      lastCategory =
        categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase()) ??
        categories[categories.push({ name: categoryName, dishes: [] }) - 1];
    }
    lastCategory.dishes.push({
      name,
      description: get('descrizione'),
      price,
      symbols,
      allergens: splitList(get('allergeni')),
    });
  }

  if (!columns && errors.length === 0) {
    errors.push('Manca la riga con i nomi delle colonne: categoria;piatto;descrizione;prezzo;simboli;allergeni');
  }
  if (errors.length) {
    const error = new Error(`Il file menu.csv contiene errori:\n  - ${errors.join('\n  - ')}`);
    error.errors = errors; // per il pannello Admin, che le mostra in elenco
    throw error;
  }
  return { categories };
}
