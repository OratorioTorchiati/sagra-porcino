// Disegni SVG → immagini su canvas, preparate una volta sola prima della partita (più veloce che disegnare SVG a ogni frame).

function loadSvgImage(svg) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return img.decode().then(() => img);
}

/**
 * Converte una mappa { nome: svg } in { nome: canvas } quadrati di `sizePx` pixel reali.
 * Conviene usare la dimensione massima a cui verranno disegnati (× devicePixelRatio).
 */
export async function rasterizeSprites(svgMap, sizePx) {
  const size = Math.ceil(sizePx);
  const entries = await Promise.all(
    Object.entries(svgMap).map(async ([name, svg]) => {
      const img = await loadSvgImage(svg);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(img, 0, 0, size, size);
      return [name, canvas];
    }),
  );
  return Object.fromEntries(entries);
}
