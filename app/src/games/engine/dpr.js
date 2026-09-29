// Risoluzione dei canvas dei giochi: al massimo 2 pixel reali per pixel CSS. Sui telefoni a 3× la differenza
// non si vede, ma i pixel da disegnare a ogni frame sono meno della metà (meno scatti).
export function canvasDpr() {
  return Math.min(window.devicePixelRatio || 1, 2);
}
