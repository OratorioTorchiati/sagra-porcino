// Pannello staff: chiamate al server (funzioni staff_* di supabase/migrations/008_staff.sql) e piccoli aiuti.
// Il server controlla a ogni chiamata che la sessione sia di un account staff.

import { rpc } from './api.js';
import { sessionToken } from './account.js';

/** Chiama una funzione staff_* con la sessione corrente. */
export function staffRpc(name, params = {}) {
  return rpc(`staff_${name}`, { p_token: sessionToken(), ...params });
}

/** Motivi con cui il server segnala o esclude una partita (check_notes), in parole semplici */
export const NOTE_LABELS = {
  azioni_mancanti: 'Nessuna azione inviata',
  troppe_azioni: 'Troppe azioni',
  durata_mancante: 'Durata mancante',
  durata_troppo_lunga: 'Durata oltre il massimo del gioco',
  tocco_oltre_la_fine: 'Tocchi dopo la fine',
  partita_troppo_corta: 'Partita troppo corta',
  reazioni_troppo_rapide: 'Reazioni troppo rapide',
  tocchi_troppo_regolari: 'Tocchi troppo regolari (bot?)',
  tocchi_al_centro: 'Tocchi sempre al centro esatto (bot?)',
  finita_prima_con_vite: 'Finita prima del tempo con vite',
  prese_troppo_precise: 'Prese troppo precise',
  troppe_coppie: 'Troppe coppie',
  troppo_veloce: 'Troppo veloce',
  memory_perfetto: 'Memory perfetto (nessun errore)',
  domanda_non_prevista: 'Domanda non prevista',
  piu_veloce_dell_orologio: 'Durata di gioco più lunga del tempo passato davvero',
  risposte_troppo_rapide: 'Risposte troppo rapide',
  punteggio_non_coerente: 'Punteggio diverso da quello delle azioni',
  oltre_il_massimo: 'Oltre il massimo possibile',
  approvata_da_staff: 'Approvata dallo staff',
  scartata_da_staff: 'Scartata dallo staff',
};

export const noteLabel = (code) => NOTE_LABELS[code] ?? code;

const TZ = 'Europe/Rome';

/** Ora italiana di un istante, nel formato di <input type="datetime-local"> ("2026-10-18T23:00") */
export function isoToRomeLocal(iso) {
  if (!iso) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Da "2026-10-18T23:00" (ora italiana) a ISO con fuso ("2026-10-18T23:00:00+02:00"); '' → null */
export function romeLocalToIso(local) {
  if (!local) return null;
  for (const offset of ['+02:00', '+01:00']) {
    const iso = `${local}:00${offset}`;
    if (isoToRomeLocal(iso) === local) return iso;
  }
  return `${local}:00+01:00`;
}

/** CSV per Excel italiano: separatore ";" e BOM (per le lettere accentate) */
export function toCsv(rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
}

/** Fa scaricare un file di testo creato sul telefono/computer */
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
