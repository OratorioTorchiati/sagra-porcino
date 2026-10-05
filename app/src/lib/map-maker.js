// Creazione della mappa del paese (D139), solo per l'Admin e caricato solo quando serve (import dinamico: MapLibre
// pesa ~250 KB e i giocatori non lo scaricano mai).
// - searchPlaces: cerca il paese su Nominatim (la ricerca di OpenStreetMap; uso leggero, solo dall'Admin).
// - createPreview: mappa vera (OpenFreeMap, stile Liberty) nel popup, con il nord sempre in alto, per scegliere l'area.
// - renderArea: disegna l'area scelta in alta risoluzione → immagine WebP/JPEG in base64 + coordinate esatte degli
//   angoli. I telefoni dei giocatori scaricano solo questa immagine (offline, come prima).

import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// il "worker" di MapLibre (disegna i pezzi di mappa in parallelo) va indicato a mano con Vite
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(workerUrl);

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
// lato lungo in px "logici" × densità: le scritte della mappa restano grandi rispetto all'immagine (~2100 px)
const OUT_LONG_SIDE = 700;
const OUT_PIXEL_RATIO = 3;

/** Paesi che corrispondono al testo: [{ label, detail, south, west, north, east }] (i più affini prima) */
export async function searchPlaces(text) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ q: text, format: 'jsonv2', limit: '8', addressdetails: '1', 'accept-language': 'it' });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const list = await res.json();
  return list
    .filter((r) => Array.isArray(r.boundingbox))
    .map((r) => {
      const a = r.address ?? {};
      const name = r.name || r.display_name.split(',')[0];
      const town = a.city || a.town || a.village || a.municipality;
      const detail = [town && town !== name ? town : null, a.county || a.state, a.country].filter(Boolean).join(', ');
      const [south, north, west, east] = r.boundingbox.map(Number);
      return { label: name, detail, south, west, north, east };
    });
}

/** Mappa nel popup per scegliere l'area (nord sempre in alto: niente rotazione) */
export function createPreview(container, place) {
  const map = new maplibregl.Map({
    container,
    style: STYLE,
    bounds: [
      [place.west, place.south],
      [place.east, place.north],
    ],
    fitBoundsOptions: { padding: 10 },
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: { compact: true },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  return map;
}

/** Disegna in alta risoluzione l'area inquadrata nella mappa del popup → { mime, data, width, height, bounds } */
export async function renderArea(preview) {
  const rect = preview.getContainer().getBoundingClientRect();
  const ratio = OUT_LONG_SIDE / Math.max(rect.width, rect.height);
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:-10000px;top:0;width:${Math.round(rect.width * ratio)}px;height:${Math.round(rect.height * ratio)}px;`;
  document.body.append(box);
  const map = new maplibregl.Map({
    container: box,
    style: STYLE,
    center: preview.getCenter(),
    zoom: preview.getZoom() + Math.log2(ratio), // stessa area, più pixel
    bearing: 0,
    interactive: false,
    attributionControl: false,
    pixelRatio: OUT_PIXEL_RATIO,
    canvasContextAttributes: { preserveDrawingBuffer: true },
    preserveDrawingBuffer: true,
  });
  try {
    await new Promise((resolve, reject) => {
      map.once('idle', resolve);
      map.once('error', (e) => reject(e.error ?? new Error('mappa')));
    });
    const b = map.getBounds();
    const canvas = map.getCanvas();
    const toBlob = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    let blob = await toBlob('image/webp', 0.82);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return {
      mime: blob.type,
      data: btoa(binary),
      width: canvas.width,
      height: canvas.height,
      bounds: { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
    };
  } finally {
    map.remove();
    box.remove();
  }
}
