// Prepara le immagini degli sponsor per il sito (D126): dagli originali in contenuti/sponsor/ (che restano come
// riferimento) crea copie leggere in app/src/assets/sponsor/<nome>.webp. Nella home compaiono in ordine alfabetico del
// nome del file, con i numeri contati come numeri: 1-macelleria.png, 2-bar.jpg, … 10-forno.png (10 dopo 9, non dopo 1).
//
//   npm run sponsor-images
//
// Le proporzioni restano quelle dell'originale (niente ritagli qui): è la home a riempire ogni quadrato.
// Lato lungo al massimo 400 px (i quadrati sul telefono sono al massimo ~180 px: bastano anche per gli schermi ×2).
// Le copie di sponsor tolti da contenuti/sponsor/ vengono cancellate.

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
const SRC = fileURLToPath(new URL('contenuti/sponsor/', ROOT));
const OUT = fileURLToPath(new URL('app/src/assets/sponsor/', ROOT));
const MAX_SIDE = 400;
const QUALITY = 80;

fs.mkdirSync(SRC, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const files = fs.readdirSync(SRC).filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f));
const names = new Set();
for (const file of files) {
  // nome del file "pulito": minuscole, trattini, niente accenti o spazi
  const name = path
    .basename(file, path.extname(file))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  names.add(name);
  const target = path.join(OUT, `${name}.webp`);
  await sharp(path.join(SRC, file), { density: 300 })
    .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY, alphaQuality: 90, effort: 6 })
    .toFile(target);
  const { width, height } = await sharp(target).metadata();
  console.log(`${file} → assets/sponsor/${name}.webp  ${width}×${height}  ${Math.round(fs.statSync(target).size / 1024)} KB`);
}
for (const old of fs.readdirSync(OUT)) {
  if (old.endsWith('.webp') && !names.has(path.basename(old, '.webp'))) {
    fs.rmSync(path.join(OUT, old));
    console.log(`tolto: assets/sponsor/${old}`);
  }
}
if (!files.length) console.log('Nessuna immagine in contenuti/sponsor/.');
