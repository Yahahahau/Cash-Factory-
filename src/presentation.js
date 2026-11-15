// Presentation system: decides between MOBILE (full screen), TABLET LANDSCAPE and DESKTOP (XP desktop + game window),
// sizes the game window, owns the custom desktop cursor policy and the mouse / touch hover policy.
// It only changes CSS variables and attributes: the game runtime, physics and state are never recreated.
import { CURSOR_ASSETS } from './cursor-sprite.js';

export const PRESENT = {
  tabletMinW: 900, tabletMinH: 520, // landscape tablet threshold (CSS px)
  desktopMinW: 760, desktopMinH: 520,
  aspect: 0.56, // game content aspect (w / h) kept by the window
  marginTablet: 10, marginDesktop: 28,
  maxContentH: 920, // default desktop window never grows beyond this (maximize still fills the screen)
  minContentH: 420, titleH: 30, frame: 3,
  wideWallpaperAspect: 2,
};

const WALL = { '3x2': './assets/wallpaper-3x2.jpg', wide: './assets/wallpaper-wide.jpg' };

export class Presentation {
  constructor() {
    this.root = document.documentElement;
    this.mode = 'mobile';
    this.input = 'touch';
    this.cursor = 'native';
    this.maxed = false;
    this.diag = [];
    this.wallLoaded = {};
    this.hv = false;
    this.lastType = '';
    this._t = 0;
    this.mq = {
      hover: matchMedia('(hover: hover)'), fine: matchMedia('(pointer: fine)'),
      anyHover: matchMedia('(any-hover: hover)'), anyFine: matchMedia('(any-pointer: fine)'),
    };
    this.el = {
      work: document.getElementById('work'), win: document.getElementById('appwin'), body: document.getElementById('appbody'),
      max: document.getElementById('appMax'), bar: document.getElementById('appbar'),
    };
    this._bind();
    this.evaluate();
    this._tooltips();
  }

  log(msg) { if (!this.diag.includes(msg)) { this.diag.push(msg); } }

  // ----- detection: viewport + orientation + touch + primary pointer + hover (no user agent sniffing) -----
  detect() {
    const w = window.innerWidth, h = window.innerHeight;
    const landscape = w > h;
    const primaryFine = this.mq.fine.matches && this.mq.hover.matches; // the PRIMARY pointer is a mouse-like hover device
    const touchy = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    // an iPad with a mouse attached still reports a coarse / non-hover PRIMARY pointer, so it stays a tablet
    const input = primaryFine && !(touchy && !this.mq.fine.matches) ? 'mouse' : 'touch';
    let mode = 'mobile';
    if (input === 'mouse') { if (w >= PRESENT.desktopMinW && h >= PRESENT.desktopMinH) mode = 'desktop'; }
    else if (landscape && w >= PRESENT.tabletMinW && h >= PRESENT.tabletMinH) mode = 'tablet';
    return { mode, input, w, h };
  }

  evaluate() {
    const d = this.detect();
    const changed = d.mode !== this.mode || d.input !== this.input;
    this.mode = d.mode;
    this.input = d.input;
    const r = this.root;
    r.dataset.mode = d.mode;
    r.dataset.input = d.input;
    if (d.mode !== 'mobile') this._wallpaper(d.w, d.h);
    this._layout(d);
    this._cursorPolicy();
    if (changed) { this.onChange && this.onChange(this.mode); }
    return d;
  }

  _wallpaper(w, h) {
    const key = w / h >= PRESENT.wideWallpaperAspect ? 'wide' : '3x2';
    if (this.wall === key) return;
    this.wall = key;
    const set = () => this.root.style.setProperty('--wall', `url('${new URL(WALL[key], document.baseURI).href}')`);
    if (this.wallLoaded[key]) { set(); return; }
    const im = new Image();
    im.onload = () => { this.wallLoaded[key] = true; if (this.wall === key) set(); };
    im.onerror = () => this.log('wallpaper failed: ' + key);
    im.src = WALL[key];
  }

  _layout(d) {
    const s = this.el.win.style, bs = this.el.body.style;
    if (d.mode === 'mobile') {
      s.removeProperty('--ww'); s.removeProperty('--wh'); bs.removeProperty('--bh');
      this.el.win.classList.remove('max');
      this._syncMax();
      return;
    }
    const taskbar = parseFloat(getComputedStyle(this.root).getPropertyValue('--taskbar-h')) || 32;
    const work = this.el.work.getBoundingClientRect();
    const availW = work.width || d.w, availH = (work.height || d.h - taskbar);
    const maxed = this.maxed;
    const m = d.mode === 'tablet' ? PRESENT.marginTablet : PRESENT.marginDesktop;
    const chrome = PRESENT.titleH + PRESENT.frame;
    let ww, wh, bodyH;
    if (maxed) { ww = availW; wh = availH; bodyH = wh - PRESENT.titleH; }
    else {
      let ch = availH - 2 * m - chrome;
      ch = Math.min(ch, d.mode === 'desktop' ? PRESENT.maxContentH : 4000);
      ch = Math.max(ch, PRESENT.minContentH);
      let cw = ch * PRESENT.aspect;
      const maxW = availW - 2 * m - 2 * PRESENT.frame;
      if (cw > maxW) { cw = maxW; ch = cw / PRESENT.aspect; }
      ww = Math.round(cw + 2 * PRESENT.frame);
      bodyH = Math.round(ch);
      wh = bodyH + chrome;
    }
    s.setProperty('--ww', ww + 'px');
    s.setProperty('--wh', wh + 'px');
    bs.setProperty('--bh', Math.round(bodyH) + 'px');
    this.el.win.classList.toggle('max', maxed);
    this._syncMax();
  }

  _syncMax() {
    const b = this.el.max;
    if (!b) return;
    b.classList.toggle('restore', this.maxed && this.mode !== 'mobile');
    const t = this.maxed ? 'Restore' : 'Maximize';
    b.setAttribute('aria-label', t); b.title = t;
  }

  toggleMax() { this.maxed = !this.maxed; this.evaluate(); }

  // ----- custom cursor: desktop mouse only, only after the artwork has been verified -----
  _cursorPolicy() {
    const want = this.mode === 'desktop' && this.input === 'mouse';
    if (!want) { this._setCursor('native'); return; }
    if (this.cursorState === 'verified') { this._setCursor('custom'); return; }
    if (this.cursorState === 'failed') { this._setCursor('native'); return; }
    if (this.cursorState === 'checking') return;
    this.cursorState = 'checking';
    const supports = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('cursor', `url('${CURSOR_ASSETS.arrow}') 10 10, auto`);
    const im = new Image();
    im.onload = () => {
      const okImg = im.naturalWidth === 32 && im.naturalHeight === 32;
      if (supports && okImg) { this.cursorState = 'verified'; this._cursorPolicy(); }
      else { this.cursorState = 'failed'; this.log('custom cursor rejected (' + (!supports ? 'browser' : 'image size') + '): native pointer kept'); this._cursorPolicy(); }
    };
    im.onerror = () => { this.cursorState = 'failed'; this.log('custom cursor asset failed to load: native pointer kept'); this._cursorPolicy(); };
    im.src = CURSOR_ASSETS.arrow;
  }

  _setCursor(c) {
    this.cursor = c;
    if (c === 'custom') this.root.dataset.cursor = 'custom';
    else delete this.root.dataset.cursor;
  }

  // ----- events -----
  _bind() {
    const re = () => { clearTimeout(this._t); this._t = setTimeout(() => this.evaluate(), 80); };
    window.addEventListener('resize', re);
    window.addEventListener('orientationchange', () => { re(); setTimeout(() => this.evaluate(), 350); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) re(); });
    window.addEventListener('pageshow', re);
    for (const q of Object.values(this.mq)) q.addEventListener ? q.addEventListener('change', re) : q.addListener && q.addListener(re);
    if (this.el.max) this.el.max.addEventListener('click', () => this.toggleMax());
    if (this.el.bar) this.el.bar.addEventListener('dblclick', (e) => { if (!e.target.closest('.xp-ctl')) this.toggleMax(); });
    // hover policy: the hover look only exists while a real mouse / pen is moving; a touch removes it (no stuck hover)
    const setHv = (on) => { if (this.hv !== on) { this.hv = on; this.root.classList.toggle('hv', on); } };
    window.addEventListener('pointermove', (e) => { this.lastType = e.pointerType; if (e.pointerType === 'mouse' || e.pointerType === 'pen') setHv(true); }, { passive: true });
    window.addEventListener('pointerdown', (e) => { this.lastType = e.pointerType; setHv(e.pointerType !== 'touch' && this.hv); }, { passive: true, capture: true });
    window.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') setHv(false); }, { passive: true, capture: true });
    document.addEventListener('pointerleave', () => setHv(false));
    document.addEventListener('selectstart', (e) => { if (!e.target.closest || !e.target.closest('input, textarea')) e.preventDefault(); });
    document.addEventListener('dragstart', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => { if (!e.target.closest || !e.target.closest('input, textarea')) e.preventDefault(); });
    // the game window is the primary application: focusing the wallpaper does not change anything
    this.el.win.addEventListener('pointerdown', () => this.el.win.classList.remove('inactive'));
  }

  // ----- XP tooltips for hover capable pointers (title attributes are moved into data-tip) -----
  _tooltips() {
    const tip = document.createElement('div');
    tip.className = 'xptip'; tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    let timer = 0, cur = null;
    const hide = () => { clearTimeout(timer); tip.classList.remove('on'); cur = null; };
    document.addEventListener('pointerover', (e) => {
      if (!this.hv || e.pointerType === 'touch') return;
      const t = e.target.closest && e.target.closest('[title],[data-tip]');
      if (!t) { hide(); return; }
      if (t.hasAttribute('title')) { t.dataset.tip = t.getAttribute('title'); t.removeAttribute('title'); }
      if (t === cur) return;
      hide(); cur = t;
      timer = setTimeout(() => {
        tip.textContent = t.dataset.tip || '';
        tip.style.left = '0px'; tip.style.top = '0px';
        const r = t.getBoundingClientRect(), tr = tip.getBoundingClientRect();
        const x = Math.max(4, Math.min(window.innerWidth - tr.width - 4, r.left + r.width / 2 - tr.width / 2));
        const y = r.top - tr.height - 6 > 4 ? r.top - tr.height - 6 : r.bottom + 6;
        tip.style.left = Math.round(x) + 'px'; tip.style.top = Math.round(y) + 'px';
        tip.classList.add('on');
      }, 450);
    });
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('pointerleave', hide);
  }

  report() {
    return { mode: this.mode, input: this.input, cursor: this.cursor, maximized: this.maxed, diagnostics: this.diag.slice() };
  }
}
