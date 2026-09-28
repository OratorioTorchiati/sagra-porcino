// Sfondo morbido e poco invasivo (sottobosco sfocato), disegnato una volta su un canvas a parte.
// Solo gradienti: niente filtri di sfocatura, veloce su tutti i telefoni.

import { createRng } from './rng.js';

const MEADOW = {
  top: '#eef3e0',
  bottom: '#dde7c7',
  blobs: ['199, 214, 168', '181, 201, 146', '214, 196, 150', '226, 214, 180', '170, 190, 140'],
};

/**
 * @param {number} width
 * @param {number} height
 * @param {{top: string, bottom: string, blobs: string[]}} palette  colori; `blobs` come "r, g, b"
 */
export function softBackground(width, height, palette = MEADOW) {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);

  const sky = g.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, palette.top);
  sky.addColorStop(1, palette.bottom);
  g.fillStyle = sky;
  g.fillRect(0, 0, width, height);

  // Generatore a parte: lo sfondo non deve cambiare la sequenza casuale della partita
  const rng = createRng(Math.round(width) * 7919 + Math.round(height));
  const count = rng.int(14, 18);
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, width);
    const y = rng.range(0, height);
    const r = rng.range(50, 140);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const c = rng.pick(palette.blobs);
    grad.addColorStop(0, `rgba(${c}, 0.55)`);
    grad.addColorStop(1, `rgba(${c}, 0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return canvas;
}
