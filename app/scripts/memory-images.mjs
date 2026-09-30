// Prepara le immagini del Memory per il sito: dagli originali in contenuti/memory/ (che restano come riferimento)
// crea copie leggere in app/src/games/memory/photos/<nome>.webp.
//
//   npm run memory-images            → tutte le immagini
//   npm run memory-images salvatore  → solo quelle indicate
//
// Cosa fa, per ogni immagine:
// 1. se non ha lo sfondo trasparente (es. sfondo bianco), lo toglie partendo dai bordi: si cancella solo lo
//    sfondo collegato al bordo, così le parti chiare DENTRO il soggetto restano;
// 2. ritaglia stretto attorno al soggetto (il vuoto intorno rimpicciolirebbe il soggetto sulla carta);
// 3. lo mette in un quadrato trasparente, centrato in larghezza e appoggiato sul fondo;
// 4. riduce a 480×480 (le carte sul telefono sono ~80 px: 480 basta anche per gli schermi più fitti)
//    e salva in WebP con trasparenza (~30–60 KB invece di ~1 MB).
// Ritagli speciali (es. solo mezzo busto) in CROPS qui sotto.

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
const SRC = new URL('contenuti/memory/', ROOT);
const OUT = new URL('app/src/games/memory/photos/', ROOT);

const SIZE = 480;
const MARGIN = 0.01; // margine intorno al soggetto, in proporzione al lato (quasi nulla: il soggetto riempie la carta)
const QUALITY = 80;

/** Ritagli per singola immagine, in frazioni del soggetto già ritagliato: { top, bottom, left, right } (0–1) */
const CROPS = {
  // bottom = dove finisce il ritaglio, in frazione dell'altezza del soggetto (0.5 = tiene la metà alta)
  salvatore: { bottom: 0.42 }, // mezzo busto: testa con aureola, mano e globo (D72)
  monumento: { bottom: 0.82 }, // tolta la base sotto la ringhiera (D72)
  municipio: { left: 0.15, right: 0.85, bottom: 0.74 }, // Municipio e aiuola, un po' di zoom: senza lampioni e gran parte della piazza
  incoronata: { bottom: 0.62 }, // la parte alta: volti, corona e colomba (intera, sulla carta piccola, non si distingue)
};

/** Distanza di colore al quadrato */
const dist2 = (d, i, c) => (d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2;

/**
 * Toglie lo sfondo uniforme collegato ai bordi (flood fill). Pixel molto vicini al colore dello sfondo → trasparenti;
 * sul contorno una fascia sfumata per non lasciare scalini.
 */
function removeBackground(data, width, height) {
  const border = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) border.push(y * width, y * width + width - 1);
  // Colore dello sfondo: media dei pixel del bordo
  const bg = [0, 0, 0];
  for (const p of border) for (let k = 0; k < 3; k++) bg[k] += data[p * 4 + k] / border.length;

  const FULL = 22 ** 2; // entro questa distanza: sfondo pieno
  const SOFT = 60 ** 2; // fino a questa: sfumato (solo se confina con lo sfondo)
  const seen = new Uint8Array(width * height);
  const stack = border.filter((p) => dist2(data, p * 4, bg) <= FULL);
  stack.forEach((p) => (seen[p] = 1));
  while (stack.length) {
    const p = stack.pop();
    data[p * 4 + 3] = 0;
    const x = p % width;
    const y = (p - x) / width;
    for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
      if (q < 0 || seen[q]) continue;
      seen[q] = 1;
      const d = dist2(data, q * 4, bg);
      if (d <= FULL) stack.push(q);
      else if (d <= SOFT) data[q * 4 + 3] = Math.min(data[q * 4 + 3], Math.round(255 * ((Math.sqrt(d) - 22) / (60 - 22))));
    }
  }
}

/** Pixel della "scacchiera finta": bianco o grigio chiarissimo, senza colore */
function isCheckerPixel(data, p) {
  const [r, g, b] = [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]];
  return Math.min(r, g, b) >= 226 && Math.max(r, g, b) - Math.min(r, g, b) <= 8;
}

/**
 * Alcuni PNG "senza sfondo" hanno la scacchiera grigia e bianca DISEGNATA nell'immagine (non è trasparenza vera).
 * La si riconosce dal bordo in alto quasi tutto bianco/grigio chiaro con due toni alternati.
 */
function hasFakeChecker(data, width) {
  let checker = 0;
  const tones = new Set();
  for (let x = 0; x < width; x++) {
    if (isCheckerPixel(data, x)) {
      checker++;
      tones.add(Math.round(data[x * 4] / 8));
    }
  }
  return checker > width * 0.9 && tones.size >= 2;
}

/**
 * Toglie la scacchiera finta collegata al bordo in alto (il cielo). Solo dall'alto: in basso, per esempio,
 * le righe bianche di una piazza toccano il bordo e non vanno cancellate.
 */
function removeFakeChecker(data, width, height) {
  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) if (isCheckerPixel(data, x)) stack.push(x);
  stack.forEach((p) => (seen[p] = 1));
  while (stack.length) {
    const p = stack.pop();
    data[p * 4 + 3] = 0;
    const x = p % width;
    const y = (p - x) / width;
    for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
      if (q < 0 || seen[q]) continue;
      seen[q] = 1;
      if (isCheckerPixel(data, q)) stack.push(q);
    }
  }
}

/** Riquadro del soggetto (pixel abbastanza opachi) */
function subjectBox(data, width, height) {
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

async function prepare(file) {
  const name = path.basename(file, path.extname(file));
  const { data, info } = await sharp(fileURLToPath(new URL(file, SRC))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const hasTransparency = data.some((v, i) => i % 4 === 3 && v < 250);
  const fakeChecker = !hasTransparency && hasFakeChecker(data, width);
  if (fakeChecker) removeFakeChecker(data, width, height);
  else if (!hasTransparency) removeBackground(data, width, height);

  let box = subjectBox(data, width, height);
  const crop = CROPS[name];
  if (crop) {
    const l = Math.round(box.width * (crop.left ?? 0));
    const t = Math.round(box.height * (crop.top ?? 0));
    const r = Math.round(box.width * (1 - (crop.right ?? 1)));
    const b = Math.round(box.height * (1 - (crop.bottom ?? 1)));
    box = { left: box.left + l, top: box.top + t, width: box.width - l - r, height: box.height - t - b };
  }

  const side = Math.round(Math.max(box.width, box.height) * (1 + 2 * MARGIN));
  const subject = await sharp(data, { raw: { width, height, channels: 4 } }).extract(box).png().toBuffer();
  const output = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    // appoggiato sul fondo: le foto sono tagliate dritte in basso e sulla carta toccano la didascalia (D92)
    .composite([{ input: subject, left: Math.round((side - box.width) / 2), top: side - box.height }])
    .png()
    .toBuffer();
  const target = new URL(`${name}.webp`, OUT);
  await sharp(output).resize(SIZE, SIZE).webp({ quality: QUALITY, alphaQuality: 90, effort: 6 }).toFile(fileURLToPath(target));
  const kb = Math.round(fs.statSync(target).size / 1024);
  console.log(`${file} → photos/${name}.webp  ${kb} KB${fakeChecker ? '  (scacchiera finta tolta)' : hasTransparency ? '' : '  (sfondo tolto dai bordi)'}${crop ? '  (ritaglio speciale)' : ''}`);
}

fs.mkdirSync(fileURLToPath(OUT), { recursive: true });
const only = process.argv.slice(2);
const files = fs
  .readdirSync(fileURLToPath(SRC))
  .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  .filter((f) => !only.length || only.includes(path.basename(f, path.extname(f))));
for (const file of files) await prepare(file);
