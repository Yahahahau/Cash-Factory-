// Visual side of CURSOR AUTO PUSH COIN: draws the supplied 32x32 cursor artwork as a separate DOM sprite.
// The artwork is used exactly as supplied (no redraw, no smoothing). Replace the files in public/assets/ to change it.
export const CURSOR_ASSETS = { arrow: './assets/cursor-auto-push.png', hand: './assets/cursor-auto-push-link.png' };
export const CURSOR_HOTSPOT = { arrow: { x: 10, y: 10 }, hand: { x: 10, y: 10 } }; // pixel inside the 32x32 image that touches the target
export const CURSOR_SIZE = 32;
// opaque pixels of the arrow image (x, y, w, h): used to crop the toolbar icon
export const CURSOR_ICON_CROP = { x: 10, y: 10, w: 12, h: 22 };

export function loadCursorImages() {
  const out = {};
  for (const k of Object.keys(CURSOR_ASSETS)) { const im = new Image(); im.decoding = 'async'; im.src = CURSOR_ASSETS[k]; out[k] = im; }
  return out;
}

export class CursorSprite {
  constructor(host) {
    this.images = loadCursorImages();
    const c = document.createElement('canvas');
    c.width = c.height = CURSOR_SIZE;
    c.id = 'cursorSprite';
    c.setAttribute('aria-hidden', 'true');
    this.el = c; this.ctx = c.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.kind = ''; this.vis = false; this.dpr = 0;
    host.appendChild(c);
    c.style.display = 'none';
  }
  _draw(kind) {
    const im = this.images[kind];
    if (!im || !im.complete || !im.naturalWidth) return false;
    this.ctx.clearRect(0, 0, CURSOR_SIZE, CURSOR_SIZE);
    this.ctx.drawImage(im, 0, 0);
    this.kind = kind;
    return true;
  }
  // s: {visible,x,y,sprite}  x,y = scene css px of the hotspot
  set(s) {
    if (!s.visible) { if (this.vis) { this.el.style.display = 'none'; this.vis = false; } return; }
    if (this.kind !== s.sprite && !this._draw(s.sprite)) { if (!this.kind) return; }
    const dpr = window.devicePixelRatio || 1;
    // whole device pixels per artwork pixel keep the sprite perfectly crisp
    const per = Math.max(2, Math.round(2 * dpr));
    const css = (CURSOR_SIZE * per) / dpr;
    if (this.dpr !== dpr) { this.dpr = dpr; this.el.style.width = this.el.style.height = css + 'px'; }
    const hs = CURSOR_HOTSPOT[s.sprite] || CURSOR_HOTSPOT.arrow;
    const x = Math.round((s.x - (hs.x * per) / dpr) * dpr) / dpr, y = Math.round((s.y - (hs.y * per) / dpr) * dpr) / dpr;
    this.el.style.transform = `translate(${x}px, ${y}px)`;
    if (!this.vis) { this.el.style.display = 'block'; this.vis = true; }
  }
}
