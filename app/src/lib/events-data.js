// Calendario eventi (D145): eventi dal database (supabase/migrations/042_calendario.sql), copia sul telefono.
// Si richiedono solo quando la configurazione dell'app segnala una versione diversa (come i punti della mappa).
// Ogni evento: { id, day: 'AAAA-MM-GG', start: 'HH:MM', end: 'HH:MM' | null, title, description, point: id | null }.
// Se l'ora di fine è prima dell'inizio, l'evento finisce il giorno dopo (es. 22:00–01:00).

import { rpc, serverConfigured } from './api.js';
import { readJson, writeJson } from './storage.js';
import { eventsVersion } from './app-config.js';

const KEY = 'sagra-calendario';
let data = readJson(KEY, null); // { version, events }

/** Eventi sul telefono, in ordine cronologico */
export const cachedEvents = () => data?.events ?? [];

/** Aggiorna dal server se la versione è cambiata; `force` chiede sempre */
export async function refreshEvents({ force = false } = {}) {
  if (!serverConfigured) return cachedEvents();
  const same = data && eventsVersion() !== undefined && (eventsVersion() ?? null) === (data.version ?? null);
  if (!force && same) return cachedEvents();
  try {
    const res = await rpc('get_events');
    if (res.ok) {
      data = { version: res.version ?? null, events: res.events ?? [] };
      writeJson(KEY, data);
    }
  } catch {
    // senza rete resta l'ultima copia
  }
  return cachedEvents();
}

/** Salva sul telefono gli eventi appena cambiati dallo staff (senza rileggere tutto) */
export function setEvents(events, version = data?.version) {
  data = { version, events: sortEvents(events) };
  writeJson(KEY, data);
}

/** Ordine cronologico: giorno, ora di inizio, poi chi è stato creato prima */
export const sortEvents = (events) =>
  [...events].sort((a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start) || a.id - b.id);

/** Inizio e fine come Date (ora del telefono); senza fine: un'ora dopo l'inizio, solo per dire "In corso" */
export function eventRange(e) {
  const start = new Date(`${e.day}T${e.start}:00`);
  const end = new Date(`${e.day}T${e.end ?? e.start}:00`);
  if (!e.end) end.setHours(end.getHours() + 1);
  else if (end <= start) end.setDate(end.getDate() + 1); // finisce dopo mezzanotte
  return { start, end };
}

/** 'past' (finito), 'live' (in corso) o 'future' */
export function eventStatus(e, now = new Date()) {
  const { start, end } = eventRange(e);
  if (now >= end) return 'past';
  if (now >= start) return 'live';
  return 'future';
}

/** 'AAAA-MM-GG' del giorno di `date` (ora del telefono) */
export const dayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const DAY_FORMAT = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const SHORT_DAY_FORMAT = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });

/** "Venerdì 15 agosto" */
export function dayLabel(day) {
  const text = DAY_FORMAT.format(new Date(`${day}T12:00:00`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Ven 15 ago" */
export function shortDayLabel(day) {
  const text = SHORT_DAY_FORMAT.format(new Date(`${day}T12:00:00`)).replace(/\./g, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "21:00" oppure "21:00–23:00" */
export const timeLabel = (e) => (e.end ? `${e.start}–${e.end}` : e.start);

/** Eventi raggruppati per giorno, in ordine: [{ day, events }] */
export function groupByDay(events) {
  const groups = [];
  for (const e of sortEvents(events)) {
    const last = groups[groups.length - 1];
    if (last?.day === e.day) last.events.push(e);
    else groups.push({ day: e.day, events: [e] });
  }
  return groups;
}

/** Eventi di un punto della mappa, in ordine cronologico */
export const eventsAt = (pointId, events = cachedEvents()) => sortEvents(events.filter((e) => e.point === pointId));
