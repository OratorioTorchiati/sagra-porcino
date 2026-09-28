// Genera il QR code del sito da stampare (tavoli, stand, cartelloni): `npm run qr`
// Crea stampa/qr-sito.svg (per la tipografia, scalabile senza perdere qualità) e stampa/qr-sito.png.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const SITE_URL = 'https://oratoriotorchiati.github.io/sagra-porcino/';
const outDir = new URL('../../stampa/', import.meta.url);

// Nero su bianco e correzione d'errore "Q" (fino al 25% del codice rovinato o sporco): si legge anche stampato piccolo
const options = { errorCorrectionLevel: 'Q', margin: 4, color: { dark: '#000000', light: '#ffffff' } };

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(new URL('qr-sito.svg', outDir), await QRCode.toString(SITE_URL, { ...options, type: 'svg' }));
await QRCode.toFile(fileURLToPath(new URL('qr-sito.png', outDir)), SITE_URL, { ...options, width: 1200 });

console.log(`QR code di ${SITE_URL} creato in stampa/qr-sito.svg e stampa/qr-sito.png`);
