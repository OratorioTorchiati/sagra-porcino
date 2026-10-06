// Unisce le 43 migrazioni in un solo file: ogni funzione una sola volta (la versione finale), al posto della sua
// prima creazione (o della prima dopo l'ultimo "drop function"); le altre istruzioni restano nell'ordine originale.
import fs from 'node:fs';
import { MIG, migrationFiles } from './lib.mjs';

/** Divide un file SQL in istruzioni, tenendo con ciascuna i commenti che la precedono */
export function splitSql(sql) {
  const out = [];
  let i = 0;
  let start = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      const e = sql.indexOf('\n', i);
      i = e < 0 ? n : e + 1;
    } else if (c === '/' && sql[i + 1] === '*') {
      const e = sql.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
    } else if (c === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") { i++; break; }
        else i++;
      }
    } else if (c === '"') {
      const e = sql.indexOf('"', i + 1);
      i = e < 0 ? n : e + 1;
    } else if (c === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) {
        const e = sql.indexOf(m[0], i + m[0].length);
        i = e < 0 ? n : e + m[0].length;
      } else i++;
    } else if (c === ';') {
      out.push(sql.slice(start, i + 1));
      i++;
      start = i;
    } else i++;
  }
  const rest = sql.slice(start);
  if (rest.trim()) out.push(rest);
  return out;
}

/** Testo senza commenti (per riconoscere il tipo di istruzione) */
const code = (s) => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

/** Tipi degli argomenti, senza nomi e valori predefiniti: "text,bigint,double precision" */
function argTypes(args) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of args) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  // i parametri OUT non fanno parte della firma
  return parts.filter((p) => !/^\s*out\s/i.test(p)).map((p) => {
    let t = p.trim().replace(/\s+(default|=)\s[\s\S]*$/i, '').trim().toLowerCase();
    t = t.replace(/^(in|out|inout|variadic)\s+/, '');
    const tokens = t.split(/\s+/);
    const typeStarts = ['double', 'timestamp', 'character', 'time', 'bit', 'interval'];
    if (tokens.length > 1 && !typeStarts.includes(tokens[0])) tokens.shift();
    return tokens.join(' ').replace(/^public\./, '');
  }).join(',');
}

/** Firma della funzione creata o eliminata dall'istruzione, o null */
function functionKey(stmt) {
  const c = code(stmt);
  const m = /^(create(?:\s+or\s+replace)?|drop)\s+function\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_0-9]+)\s*\(/i.exec(c);
  if (!m) return null;
  const open = m.index + m[0].length;
  let depth = 1;
  let j = open;
  while (j < c.length && depth) {
    if (c[j] === '(') depth++;
    if (c[j] === ')') depth--;
    j++;
  }
  return { kind: m[1].toLowerCase().startsWith('drop') ? 'drop' : 'create', key: `${m[2].toLowerCase()}(${argTypes(c.slice(open, j - 1))})` };
}

export function consolidate() {
  const items = []; // { file, stmt, fn }
  for (const f of migrationFiles()) {
    for (const stmt of splitSql(fs.readFileSync(MIG + f, 'utf8'))) items.push({ file: f, stmt, fn: functionKey(stmt) });
  }
  // per ogni funzione: ultima versione, ultimo drop, posizione dove metterla
  const last = new Map();
  const lastDrop = new Map();
  items.forEach((it, idx) => {
    if (!it.fn) return;
    if (it.fn.kind === 'create') last.set(it.fn.key, idx);
    else lastDrop.set(it.fn.key, idx);
  });
  const place = new Map();
  items.forEach((it, idx) => {
    if (it.fn?.kind !== 'create' || place.has(it.fn.key)) return;
    if (idx > (lastDrop.get(it.fn.key) ?? -1)) place.set(it.fn.key, idx);
  });
  const kept = items.map((it, idx) => {
    if (!it.fn) {
      // permessi dati a una versione poi eliminata (drop function): la versione finale li riceve più avanti
      const c = code(it.stmt);
      if (/^(grant|revoke)\b/i.test(c) && /\bfunction\b/i.test(c)) {
        const refRe = /(?:public\.)?([a-z_0-9]+)\s*\(([^)]*)\)/gi;
        const m = /^([\s\S]*?\bon\s+function\s+)([\s\S]*?)(\s+(?:from|to)\s[\s\S]*)$/i.exec(c);
        if (!m) return it;
        const refs = [...m[2].matchAll(refRe)].map((r) => ({ text: r[0], key: `${r[1].toLowerCase()}(${argTypes(r[2])})` }));
        const ok = refs.filter((r) => place.has(r.key) && place.get(r.key) <= idx);
        if (ok.length === refs.length) return it;
        if (!ok.length) return null;
        // tolte dall'elenco solo le versioni eliminate più avanti
        return { ...it, stmt: `\n${m[1]}${ok.map((r) => r.text).join(', ')}${m[3]}` };
      }
      return it;
    }
    const { kind, key } = it.fn;
    if (kind === 'drop') {
      // drop di una funzione che poi non esiste più nella versione finale, o ricreata dopo: inutile in un database nuovo
      return null;
    }
    if (place.get(key) !== idx) return null;
    return { ...it, stmt: leadingComments(it.stmt) + stripLeading(items[last.get(key)].stmt) };
  });
  return kept.filter(Boolean);
}

/** Commenti in testa all'istruzione (senza l'istruzione) e istruzione senza commenti in testa */
const leadRe = /^(\s*(?:--[^\n]*\n|\s+))*/;
const leadingComments = (s) => (leadRe.exec(s)?.[0] ?? '');
const stripLeading = (s) => s.slice(leadingComments(s).length);

export { functionKey };
