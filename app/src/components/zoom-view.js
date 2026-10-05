// Vista con zoom e spostamento (D136), per la mappa: due dita per ingrandire, un dito per spostare,
// doppio tocco per ingrandire, rotella del mouse sul computer. Il contenuto (`stage`) è largo quanto l'immagine
// adattata alla vista; i figli con la classe "zoom-keep" restano della stessa grandezza a qualunque zoom.
// onTap({ x, y, target }) con x, y da 0 a 1 sull'immagine (null se il tocco è fuori dall'immagine).

const MAX_ZOOM = 4; // rispetto alla vista di apertura
const TAP_MOVE = 8; // px: oltre, non è un tocco ma uno spostamento

export function createZoomView(viewport, stage, { width, height, onTap }) {
  let scale = 1;
  let tx = 0;
  let ty = 0;
  // scala minima: l'immagine copre sempre tutta la vista, quindi niente bordi vuoti nemmeno rimpicciolendo (D137)
  let fit = 1;
  const pointers = new Map();
  let start = null; // inizio del gesto: { scale, tx, ty, cx, cy, dist }
  let moved = false;
  let lastTap = 0;
  let downTarget = null; // elemento toccato (con il puntatore catturato, pointerup arriva alla vista)

  function layout() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    fit = Math.max(vw / width, vh / height);
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    if (scale < fit) scale = fit;
    clamp();
    apply();
  }

  // L'immagine non esce dalla vista più del necessario (se è più piccola, resta al centro)
  function clamp() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const w = width * scale;
    const h = height * scale;
    tx = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, tx));
    ty = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, ty));
  }

  function apply() {
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    stage.style.setProperty('--zoom-inv', String(1 / scale));
  }

  /** Zoom verso `next` tenendo fermo il punto (px, py) della vista */
  function zoomAt(next, px, py) {
    const s = Math.min(fit * MAX_ZOOM, Math.max(fit, next));
    tx = px - ((px - tx) * s) / scale;
    ty = py - ((py - ty) * s) / scale;
    scale = s;
    clamp();
    apply();
  }

  const local = (e) => {
    const r = viewport.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  viewport.addEventListener('pointerdown', (e) => {
    if (!pointers.size) downTarget = e.target;
    try {
      viewport.setPointerCapture(e.pointerId); // il gesto continua anche se il dito esce dalla mappa
    } catch {
      // puntatore non catturabile (es. eventi simulati): va bene lo stesso
    }
    pointers.set(e.pointerId, local(e));
    moved = false;
    begin();
  });

  function begin() {
    const pts = [...pointers.values()];
    const cx = pts.reduce((n, p) => n + p.px, 0) / pts.length;
    const cy = pts.reduce((n, p) => n + p.py, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].px - pts[1].px, pts[0].py - pts[1].py) : 0;
    start = { scale, tx, ty, cx, cy, dist };
  }

  viewport.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    const pts = [...pointers.values()];
    const cx = pts.reduce((n, p) => n + p.px, 0) / pts.length;
    const cy = pts.reduce((n, p) => n + p.py, 0) / pts.length;
    if (Math.hypot(cx - start.cx, cy - start.cy) > TAP_MOVE) moved = true;
    if (pts.length > 1 && start.dist) {
      moved = true;
      const dist = Math.hypot(pts[0].px - pts[1].px, pts[0].py - pts[1].py);
      const s = Math.min(fit * MAX_ZOOM, Math.max(fit, (start.scale * dist) / start.dist));
      // il punto sotto le dita all'inizio resta sotto le dita
      tx = cx - ((start.cx - start.tx) * s) / start.scale;
      ty = cy - ((start.cy - start.ty) * s) / start.scale;
      scale = s;
    } else if (moved) {
      tx = start.tx + (cx - start.cx);
      ty = start.ty + (cy - start.cy);
    }
    clamp();
    apply();
  });

  function end(e) {
    if (!pointers.has(e.pointerId)) return;
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (pointers.size) return begin(); // da due dita a una: si continua a spostare da qui
    if (!wasSingle || moved || e.type === 'pointercancel') return;
    const { px, py } = local(e);
    const now = Date.now();
    if (now - lastTap < 300) {
      lastTap = 0;
      zoomAt(scale * 2 > fit * MAX_ZOOM ? fit : scale * 2, px, py); // doppio tocco: ingrandisce (al massimo, torna alla vista di apertura)
      return;
    }
    lastTap = now;
    const x = (px - tx) / (width * scale);
    const y = (py - ty) / (height * scale);
    onTap?.({ x: x >= 0 && x <= 1 ? x : null, y: y >= 0 && y <= 1 ? y : null, target: downTarget });
  }
  viewport.addEventListener('pointerup', end);
  viewport.addEventListener('pointercancel', end);

  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const { px, py } = local(e);
      zoomAt(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), px, py);
    },
    { passive: false },
  );

  const resize = new ResizeObserver(() => layout());
  resize.observe(viewport);
  layout();
  // all'apertura la mappa riempie la vista (una mappa larga su un telefono in verticale: tutta l'altezza, poi ci si sposta)
  scale = fit;
  clamp();
  apply();

  return {
    /** Porta il punto (x, y da 0 a 1) al centro, ingrandendo almeno a `minZoom` volte la vista di apertura */
    focus(x, y, minZoom = 1.8) {
      scale = Math.max(scale, fit * minZoom);
      tx = viewport.clientWidth / 2 - x * width * scale;
      ty = viewport.clientHeight / 2 - y * height * scale;
      clamp();
      stage.style.transition = 'transform 0.35s ease';
      apply();
      setTimeout(() => (stage.style.transition = ''), 400);
    },
    /** Torna alla vista di apertura */
    reset() {
      scale = fit;
      clamp();
      apply();
    },
    destroy: () => resize.disconnect(),
  };
}
