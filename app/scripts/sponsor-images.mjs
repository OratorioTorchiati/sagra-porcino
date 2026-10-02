// Prepara le immagini degli sponsor per il sito (D126): dagli originali in contenuti/sponsor/ (che restano come
// riferimento) crea copie leggere in app/src/assets/sponsor/<nome>.webp. Nella home compaiono in ordine alfabetico del
// nome del file, con i numeri contati come numeri: 1-macelleria.png, 2-bar.jpg, … 10-forno.png (10 dopo 9, non dopo 1).
// Sponsor GRANDI (D129): nome che finisce con "-grande" (es. 1-vit-grande.png): occupano più riquadri, secondo la
// forma dell'originale (quadrato → 2×2, largo → 2 colonne, alto → 2 righe).
//
//   npm run sponsor-images
//
// Le proporzioni restano quelle dell'originale (niente ritagli qui): è la home a riempire ogni riquadro.
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
  const source = sharp(path.join(SRC, file), { density: 300 });
  const { width: w, height: h } = await source.metadata();
  const ratio = w / h;
  const shape = ratio >= WIDE ? 'wide' : ratio <= 1 / WIDE ? 'tall' : 'square';
  const side = big ? MAX_SIDE_BIG : MAX_SIDE;
  const target = path.join(OUT, `${name}.webp`);
  await source
    .resize(side, side, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY, alphaQuality: 90, effort: 6 })
    .toFile(target);
  const { width, height } = await sharp(target).metadata();
  manifest.push({ name, big, shape });
  console.log(`${file} → assets/sponsor/${name}.webp  ${width}×${height}  ${Math.round(fs.statSync(target).size / 1024)} KB${big ? `  GRANDE (${shape})` : ''}`);
}
for (const old of fs.readdirSync(OUT)) {
  if (old.endsWith('.webp') && !manifest.some((m) => `${m.name}.webp` === old)) {
    fs.rmSync(path.join(OUT, old));
    console.log(`tolto: assets/sponsor/${old}`);
  }
}
fs.writeFileSync(path.join(OUT, 'sponsors.json'), `${JSON.stringify(manifest, null, 2)}\n`);
if (!files.length) console.log('Nessuna immagine in contenuti/sponsor/.');
