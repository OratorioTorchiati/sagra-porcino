// Prepara le immagini degli sponsor per il sito (D126): dagli originali in contenuti/sponsor/ (che restano come
// riferimento) crea copie leggere in app/src/assets/sponsor/<nome>.webp. Nella home compaiono in ordine alfabetico del
// nome del file, con i numeri contati come numeri: 1-macelleria.png, 2-bar.jpg, … 10-forno.png (10 dopo 9, non dopo 1).
// Sponsor GRANDI (D129): nome che finisce con "-grande" (es. 1-vit-grande.png): occupano più riquadri, secondo la
// forma dell'originale (quadrato → 2×2, largo → 2 colonne, alto → 2 righe).
//
//   npm run sponsor-images
//
// Ogni immagine viene portata alla proporzione ESATTA del suo riquadro (1:1, 2:1 o 1:2) aggiungendo sfondo ai lati
// che mancano, senza tagliare niente: così nella home tutte le caselle sono piene (D130). Lo sfondo aggiunto:
// - se l'originale ha già uno sfondo pieno (angoli non trasparenti), lo stesso colore degli angoli;
// - se è trasparente, bianco (quasi nero solo per i loghi tutti chiari, senza parti scure), con un margine del 10% intorno;
// - oppure quello scelto a mano in BACKGROUNDS (es. il crema del sito dello sponsor).
// Lato lungo al massimo 400 px (600 per i grandi). Scrive anche app/src/assets/sponsor/sponsors.json (nome, grande,
// forma) che la home legge. Le copie di sponsor tolti da contenuti/sponsor/ vengono cancellate.

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
const SRC = fileURLToPath(new URL('contenuti/sponsor/', ROOT));
const OUT = fileURLToPath(new URL('app/src/assets/sponsor/', ROOT));
const MAX_SIDE = 400;
const MAX_SIDE_BIG = 600;
const QUALITY = 80;
const WIDE = 1.4; // larghezza/altezza da qui in su: "largo"; fino a 1/WIDE: "alto"; in mezzo: quadrato
const TARGET = { square: 1, wide: 2, tall: 0.5 }; // proporzione del riquadro di un grande
const MARGIN = 0.1; // loghi trasparenti: margine intorno (frazione del lato), così la scritta non tocca i bordi
// Sfondo scelto a mano per uno sponsor (nome senza numero e senza "-grande"), es. quello del suo sito
const BACKGROUNDS = {
  raffael: '#fef9ed', // crema del sito raffael.it
};

const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), alpha: 1 });

const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Sfondo da aggiungere: { background, transparent } — quello degli angoli se pieni, altrimenti in contrasto col logo */
async function backgroundFor(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const i = (y * info.width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const corners = [px(0, 0), px(info.width - 1, 0), px(0, info.height - 1), px(info.width - 1, info.height - 1)];
  if (corners.every((c) => c[3] > 240)) {
    const avg = [0, 1, 2].map((k) => Math.round(corners.reduce((n, c) => n + c[k], 0) / 4));
    return { background: { r: avg[0], g: avg[1], b: avg[2], alpha: 1 }, transparent: false };
  }
  // trasparente: bianco, a meno che il logo sia quasi tutto chiaro (scritte bianche): allora quasi nero.
  // Basta un po' di scuro (contorni, scritte: almeno il 3% del logo) perché il bianco sia lo sfondo giusto.
  let dark = 0;
  let light = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 200) {
      const l = luminance([data[i], data[i + 1], data[i + 2]]);
      if (l < 0.35) dark++;
      else if (l > 0.8) light++;
      n++;
    }
  }
  const lightLogo = n > 0 && dark / n < 0.03 && light / n > 0.5;
  const background = lightLogo ? { r: 34, g: 34, b: 34, alpha: 1 } : { r: 255, g: 255, b: 255, alpha: 1 };
  return { background, transparent: true };
}

fs.mkdirSync(SRC, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const files = fs.readdirSync(SRC).filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f));
const manifest = [];
for (const file of files) {
  // nome del file "pulito": minuscole, trattini, niente accenti o spazi
  const name = path
    .basename(file, path.extname(file))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const big = /-grande$/.test(name);
  const original = await sharp(path.join(SRC, file), { density: 300 }).png().toBuffer();
  const found = await backgroundFor(original);
  const key = name.replace(/^[0-9]+-/, '').replace(/-grande$/, '');
  const background = BACKGROUNDS[key] ? hex(BACKGROUNDS[key]) : found.background;
  // loghi trasparenti: un po' di margine tutto intorno prima di arrivare alla proporzione del riquadro
  const meta = await sharp(original).metadata();
  const m = found.transparent ? Math.round(Math.max(meta.width, meta.height) * MARGIN) : 0;
  const w = meta.width + 2 * m;
  const h = meta.height + 2 * m;
  const ratio = meta.width / meta.height;
  const shape = ratio >= WIDE ? 'wide' : ratio <= 1 / WIDE ? 'tall' : 'square';
  const want = big ? TARGET[shape] : 1;
  // sfondo aggiunto ai lati che mancano per arrivare alla proporzione del riquadro (niente tagli)
  const W = w / h >= want ? w : Math.round(h * want);
  const H = w / h >= want ? Math.round(w / want) : h;
  const padX = W - meta.width;
  const padY = H - meta.height;
  const padded = await sharp(original)
    .flatten({ background })
    .extend({ left: Math.floor(padX / 2), right: Math.ceil(padX / 2), top: Math.floor(padY / 2), bottom: Math.ceil(padY / 2), background })
    .png()
    .toBuffer();
  const side = big ? MAX_SIDE_BIG : MAX_SIDE;
  const target = path.join(OUT, `${name}.webp`);
  await sharp(padded)
    .resize(side, side, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 6 })
    .toFile(target);
  const { width, height } = await sharp(target).metadata();
  manifest.push({ name, big, shape });
  const bg = `rgb(${background.r},${background.g},${background.b})`;
  console.log(`${file} → assets/sponsor/${name}.webp  ${width}×${height}  ${Math.round(fs.statSync(target).size / 1024)} KB${big ? `  GRANDE (${shape})` : ''}${padX || padY ? `  sfondo ${bg}` : ''}`);
}
for (const old of fs.readdirSync(OUT)) {
  if (old.endsWith('.webp') && !manifest.some((m) => `${m.name}.webp` === old)) {
    fs.rmSync(path.join(OUT, old));
    console.log(`tolto: assets/sponsor/${old}`);
  }
}
fs.writeFileSync(path.join(OUT, 'sponsors.json'), `${JSON.stringify(manifest, null, 2)}\n`);
if (!files.length) console.log('Nessuna immagine in contenuti/sponsor/.');
