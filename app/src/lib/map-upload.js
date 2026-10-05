// Prepara l'immagine della mappa sul telefono dell'Admin prima di inviarla (D136): lato lungo al massimo 2000 px,
// WebP (o JPEG dove il browser non sa fare WebP, es. Safari), in base64. Così pesa poche centinaia di KB.

const MAX_SIDE = 2000;

/** File immagine → { mime, data (base64), width, height } */
export async function prepareMapImage(file) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * ratio);
  const height = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // le parti trasparenti diventano bianche (il JPEG non ha trasparenza)
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const toBlob = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await toBlob('image/webp', 0.8);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.82);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { mime: blob.type, data: btoa(binary), width, height };
}
