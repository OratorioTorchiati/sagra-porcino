// Identità del dispositivo (docs/02-ARCHITETTURA.md §2.1).
// - ID dispositivo: UUID casuale salvato in tre posti (localStorage, IndexedDB, cookie) per sopravvivere
//   a pulizie parziali. Il server lo lega all'account alla registrazione: un telefono = un account creato.
// - Impronta: hash di caratteristiche tecniche del telefono. Solo informativa per lo staff, NON blocca
//   (molti telefoni uguali hanno impronte uguali).

const KEY = 'sagra-device-id';
const DB_NAME = 'sagra';
const STORE = 'kv';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidId = (value) => typeof value === 'string' && UUID_RE.test(value);

/** Il primo ID valido tra quelli trovati, nell'ordine dato (null se nessuno). */
export function firstValidId(candidates) {
  return candidates.find(isValidId) ?? null;
}

// ---------- localStorage ----------

function readLocal() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeLocal(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Bloccato (navigazione privata): restano gli altri posti
  }
}

// ---------- IndexedDB ----------

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIdb() {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const request = db.transaction(STORE).objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeIdb(id) {
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(id, KEY);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {
    // Non disponibile: pazienza
  }
}

// ---------- Cookie ----------

function readCookie() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${KEY}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(id) {
  // 400 giorni = durata massima consentita dai browser
  document.cookie = `${KEY}=${encodeURIComponent(id)}; max-age=${400 * 24 * 3600}; path=/; SameSite=Lax; Secure`;
}

// ---------- API ----------

let cached = null;

/** ID del dispositivo: letto dal primo posto in cui si trova, altrimenti creato; poi riscritto ovunque. */
export async function getDeviceId() {
  if (cached) return cached;
  const id = firstValidId([readLocal(), await readIdb(), readCookie()]) ?? crypto.randomUUID();
  writeLocal(id);
  writeCookie(id);
  await writeIdb(id);
  cached = id;
  return id;
}

/** Impronta tecnica (SHA-256 esadecimale). Solo informativa. */
export async function getFingerprint() {
  const parts = [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    window.devicePixelRatio,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency ?? '',
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
