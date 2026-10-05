// Mappa della sagra (D136): immagine e punti di interesse dal database (supabase/migrations/039_mappa.sql).
// - Punti: copia sul telefono; si richiedono solo quando la configurazione dell'app segnala una versione diversa.
// - Immagine: la più pesante, scaricata una volta sola per versione e tenuta nella Cache del browser (se manca,
//   per esempio fuori da https, resta solo in memoria finché la pagina è aperta).

import { rpc, serverConfigured } from './api.js';
import { readJson, writeJson } from './storage.js';
import { mapVersion, mapImageVersion } from './app-config.js';

/** Tipologie dei punti: id (come _map_types() nel database), nome, icona e colore */
export const MAP_TYPES = [
  { id: 'ristorazione', label: 'Ristorazione', icon: '🍽️', color: '#c0392b' },
  { id: 'bar', label: 'Bar e bevande', icon: '🍺', color: '#d68910' },
  { id: 'cassa', label: 'Cassa', icon: '💶', color: '#1e8449' },
  { id: 'info', label: 'Info Point', icon: 'ℹ️', color: '#1f6fb2' },
  { id: 'wc', label: 'Servizi igienici', icon: '🚻', color: '#5d6d7e' },
  { id: 'soccorso', label: 'Primo soccorso', icon: '⛑️', color: '#e74c3c' },
  { id: 'palco', label: 'Palco e spettacoli', icon: '🎵', color: '#8e44ad' },
  { id: 'bambini', label: 'Area bambini', icon: '🧒', color: '#e67e22' },
  { id: 'parcheggio', label: 'Parcheggio', icon: '🅿️', color: '#2e4053' },
  { id: 'ingresso', label: 'Ingresso e uscita', icon: '🚪', color: '#117a65' },
  { id: 'rifiuti', label: 'Raccolta rifiuti', icon: '♻️', color: '#27ae60' },
  { id: 'altro', label: 'Altro', icon: '📍', color: '#7a4a1e' },
];
export const mapType = (id) => MAP_TYPES.find((t) => t.id === id) ?? MAP_TYPES[MAP_TYPES.length - 1];

const KEY = 'sagra-mappa';
const IMAGE_CACHE = 'sagra-mappa';
const IMAGE_URL = '/__sagra-mappa-immagine';
let data = readJson(KEY, null); // { version, points, image: { version, width, height } | null }
let imageUrl = null; // { version, url } già pronta in questa sessione

/** "Apri con…" (D142): indicazioni a piedi verso un punto con la posizione reale (D139) */
export const directionsLinks = ({ lat, lng, title }) => ({
  google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`,
  apple: `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`,
  waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  // Android: apre la scelta tra le app di mappe installate
  geo: `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(title ?? '')})`,
  coords: `${lat}, ${lng}`,
});

const mercator = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** Posizione GPS → posizione sul disegno (x, y da 0 a 1) con gli angoli della mappa (D142); fuori se <0 o >1 */
export function latLngToXY(bounds, lat, lng) {
  const x = (lng - bounds.west) / (bounds.east - bounds.west);
  const y = (mercator(bounds.north) - mercator(lat)) / (mercator(bounds.north) - mercator(bounds.south));
  return { x, y };
}

/** Distanza in metri tra due posizioni GPS */
export function distanceM(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Punti con il numero dentro la tipologia (da 1, in ordine di inserimento) */
export function numberedPoints(points = data?.points ?? []) {
  const counters = {};
  return points.map((p) => ({ ...p, number: (counters[p.type] = (counters[p.type] ?? 0) + 1) }));
}

/** Mappa sul telefono: { version, points, image } o null */
export const cachedMap = () => data;

/** Aggiorna i punti (e i dati dell'immagine) dal server se la versione è cambiata; `force` chiede sempre */
export async function refreshMap({ force = false } = {}) {
  if (!serverConfigured) return data;
  const sameVersion = data && mapVersion() !== undefined && (mapVersion() ?? null) === (data.version ?? null) &&
    (mapImageVersion() ?? null) === (data.image?.version ?? null);
  if (!force && sameVersion) return data;
  try {
    const res = await rpc('get_map');
    if (res.ok) {
      data = { version: res.version ?? null, points: res.points ?? [], image: res.image ?? null, bounds: res.bounds ?? null };
      writeJson(KEY, data);
    }
  } catch {
    // senza rete resta l'ultima copia
  }
  return data;
}

/** Salva sul telefono i punti appena cambiati dallo staff (senza rileggere tutto) */
export function setPoints(points, version = data?.version) {
  data = { ...(data ?? { image: null }), points, version };
  writeJson(KEY, data);
}

const openCache = async () => {
  try {
    return 'caches' in window ? await caches.open(IMAGE_CACHE) : null;
  } catch {
    return null;
  }
};

/** URL dell'immagine della mappa (scaricata solo se la versione è nuova), o null se non c'è una mappa */
export async function mapImage() {
  const version = data?.image?.version;
  if (!version) return null;
  if (imageUrl?.version === version) return imageUrl.url;
  const cache = await openCache();
  const cached = await cache?.match(IMAGE_URL);
  let blob = null;
  if (cached && cached.headers.get('x-version') === version) blob = await cached.blob();
  if (!blob) {
    const res = await rpc('get_map_image');
    if (!res.ok) return null;
    const bytes = Uint8Array.from(atob(res.data), (c) => c.charCodeAt(0));
    blob = new Blob([bytes], { type: res.mime });
    await cache?.put(IMAGE_URL, new Response(blob, { headers: { 'content-type': res.mime, 'x-version': res.version } }));
  }
  if (imageUrl) URL.revokeObjectURL(imageUrl.url);
  imageUrl = { version, url: URL.createObjectURL(blob) };
  return imageUrl.url;
}

