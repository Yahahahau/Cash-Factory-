// Windows XP "Luna" component kit: window manager, taskbar, start menu, balloon notifications and small UI builders.
// Timings mirror the CSS tokens (--t-*), so JS-driven waits and CSS animations stay in sync (reduced motion → 0).
import { icon } from './icons.js';

export const ANIM = { open: 200, close: 150, min: 180, btn: 90, tab: 140, note: 260, noteOut: 200 };
export const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => (reducedMotion() ? 0 : ms);

// ---------- stateless builders (return HTML strings) ----------
export function XPButton({ id = '', label = '', ico = '', cls = '', disabled = false, def = false, attrs = '' } = {}) {
  return `<button class="xpbtn ${def ? 'def ' : ''}${cls}" ${id ? `id="${id}"` : ''} ${disabled ? 'disabled' : ''} ${attrs}>${ico ? icon(ico, 16) : ''}<span>${label}</span></button>`;
}
export function XPProgressBar(pct, text = '', { cls = '', id = '' } = {}) {
  const p = Math.max(0, Math.min(100, pct));
  return `<div class="xpprog ${cls}" ${id ? `id="${id}"` : ''} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}"><i style="width:${p}%"></i>${text ? `<span>${text}</span>` : ''}</div>`;
}
export function XPPanel(inner, cls = '') { return `<div class="xppanel ${cls}">${inner}</div>`; }
export function XPGroup(title, inner) { return `<div class="xpgroup"><span class="gt">${title}</span>${inner}</div>`; }
export function XPTitleBar(title, ico, { min = true, max = true, close = true } = {}) {
  return `<div class="xp-title">${ico ? icon(ico, 16) : ''}<span class="xp-ttl">${esc(title)}</span><span class="xp-ctl">${min ? '<button class="xp-min" aria-label="Minimize" title="Minimize"></button>' : ''}${max ? '<button class="xp-max" aria-label="Maximize" title="Maximize"></button>' : ''}${close ? '<button class="xp-close" aria-label="Close" title="Close"></button>' : ''}</span></div>`;
}
export function XPToggle({ id, label, checked = false, radio = false, name = '', value = '' }) {
  return `<label class="xpchk ${radio ? 'radio' : ''}"><input type="${radio ? 'radio' : 'checkbox'}" id="${id}" ${name ? `name="${name}"` : ''} ${value !== '' ? `value="${value}"` : ''} ${checked ? 'checked' : ''}><span class="box"></span><span>${label}</span></label>`;
}
export function setProgress(el, pct, text) {
  const p = Math.max(0, Math.min(100, pct));
  el.firstElementChild.style.width = p + '%';
  el.setAttribute('aria-valuenow', String(Math.round(p)));
  if (text !== undefined && el.children[1]) el.children[1].textContent = text;
}

// ---------- tab control ----------
export class XPTabControl {
  // tabs: [{id,label,html,onShow?}]
  constructor(host, tabs, start = 0) {
    this.host = host; this.tabs = tabs; this.sel = Math.min(start, tabs.length - 1);
    host.innerHTML = `<div class="xptabs"><div class="xptabbar" role="tablist">${tabs.map((t, i) => `<button class="xptab" role="tab" data-i="${i}">${t.label}</button>`).join('')}</div><div class="xptabpane" role="tabpanel"></div></div>`;
    this.pane = host.querySelector('.xptabpane');
    this.btns = [...host.querySelectorAll('.xptab')];
    host.querySelector('.xptabbar').addEventListener('click', (e) => { const b = e.target.closest('.xptab'); if (b) this.select(+b.dataset.i); });
    host.querySelector('.xptabbar').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') this.select((this.sel + 1) % tabs.length, true);
      else if (e.key === 'ArrowLeft') this.select((this.sel + tabs.length - 1) % tabs.length, true);
    });
    this.select(this.sel, false, true);
  }
  select(i, focus, first) {
    this.sel = i;
    this.btns.forEach((b, k) => { b.classList.toggle('sel', k === i); b.setAttribute('aria-selected', k === i ? 'true' : 'false'); b.tabIndex = k === i ? 0 : -1; });
    this.pane.innerHTML = `<div class="pane">${this.tabs[i].html}</div>`;
    if (focus) this.btns[i].focus();
    this.tabs[i].onShow && this.tabs[i].onShow(this.pane, first);
  }
}

// ---------- balloon notifications ----------
export class XPNotification {
  constructor(host) { this.host = host; this.items = []; }
  show({ title = 'Notice', msg = '', ico = 'info', ms = 3000 } = {}) {
    const dup = this.items.find((n) => n.msg === msg);
    if (dup) { clearTimeout(dup.t); dup.t = setTimeout(() => this.hide(dup), ms); return dup; }
    const el = document.createElement('div');
    el.className = 'xpnote'; el.setAttribute('role', 'status');
    el.innerHTML = `<div class="nh">${icon(ico, 16)}<span>${esc(title)}</span></div><div class="nm">${esc(msg)}</div><button class="nx" aria-label="Dismiss">x</button>`;
    const n = { el, msg, t: 0 };
    el.addEventListener('click', () => this.hide(n));
    this.host.appendChild(el);
    this.items.push(n);
    while (this.items.length > 3) this.hide(this.items[0], true);
    n.t = setTimeout(() => this.hide(n), ms);
    return n;
  }
  hide(n, now) {
    const i = this.items.indexOf(n);
    if (i < 0) return;
    this.items.splice(i, 1);
    clearTimeout(n.t);
    if (now) { n.el.remove(); return; }
    n.el.classList.add('out');
    setTimeout(() => n.el.remove(), wait(ANIM.noteOut) + 20);
  }
}

// ---------- window ----------
// A window lives in one of the desktop layers (never inside the game window). Positions are kept in layer coordinates, one
// per boundary policy: "free" (desktop / landscape tablet: the whole workspace) and "contain" (phone portrait: inside the
// game viewport). The manager keeps every window reachable when the workspace changes size or orientation.
const KEEP = 96; // px of a free window that must stay on the desktop
const TITLE_KEEP = 34;
export class XPWindow {
  constructor(wm, o) {
    this.wm = wm; this.o = o; this.id = o.id; this.minimized = false; this.maxed = false; this.closed = false;
    this.layer = o.layer === 'mini' ? 'mini' : 'float';
    this.pos = { free: null, contain: null }; // user chosen positions (null = auto placed)
    this.size = null; // user chosen {w,h}
    const canMin = o.min !== false && !o.modal, canMax = o.max !== false && !o.modal, canClose = o.close !== false;
    const el = document.createElement('div');
    el.className = 'xpwin' + (o.cls ? ' ' + o.cls : '');
    el.dataset.win = o.id;
    el.setAttribute('role', o.modal ? 'dialog' : 'group');
    el.setAttribute('aria-label', o.title);
    if (o.modal) el.setAttribute('aria-modal', 'true');
    el.style.setProperty('--w', (o.width || 340) + 'px');
    if (o.height) el.style.height = o.height;
    el.innerHTML = `${XPTitleBar(o.title, o.icon, { min: canMin, max: canMax, close: canClose })}<div class="xp-body ${o.fill ? 'fill' : ''}"></div>${o.resize ? '<i class="xp-rz e"></i><i class="xp-rz s"></i><i class="xp-rz se"></i>' : ''}`;
    this.el = el; this.bar = el.querySelector('.xp-title'); this.body = el.querySelector('.xp-body');
    this.titleEl = el.querySelector('.xp-ttl'); this.maxBtn = el.querySelector('.xp-max'); this.closeBtn = el.querySelector('.xp-close');
    if (o.html !== undefined) this.body.innerHTML = o.html;
    if (o.reveal) this.body.classList.add('xp-reveal');
    const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); };
    on('.xp-min', () => this.minimize());
    on('.xp-max', () => this.toggleMax());
    on('.xp-close', () => this.requestClose());
    el.addEventListener('pointerdown', () => wm.focus(this), true);
    if (canMax) this.bar.addEventListener('dblclick', (e) => { if (!e.target.closest('.xp-ctl')) this.toggleMax(); });
    this._drag();
    if (o.resize) this._resize();
  }
  q(sel) { return this.body.querySelector(sel); }
  qa(sel) { return [...this.body.querySelectorAll(sel)]; }
  setTitle(t) { this.titleEl.textContent = t; this.el.setAttribute('aria-label', t); if (this.task) this.task.querySelector('span').textContent = t; }
  setHtml(h) { this.body.innerHTML = h; }
  // the close button / Esc ask first: a window can refuse (e.g. a running mini-game)
  allowClose() { return !this.o.canClose || this.o.canClose(); }
  requestClose() { if (!this.allowClose()) { this.nudge(); return false; } this.close(); return true; }
  setCloseEnabled(on) {
    if (!this.closeBtn) return;
    this.closeBtn.disabled = !on;
    this.closeBtn.classList.toggle('off', !on);
  }
  toggleMax() {
    this.maxed = !this.maxed;
    this.el.classList.toggle('max', this.maxed);
    this.maxBtn && this.maxBtn.classList.toggle('restore', this.maxed);
    this.maxBtn && this.maxBtn.setAttribute('aria-label', this.maxed ? 'Restore' : 'Maximize');
    if (!this.maxed) this.wm.place(this);
    this.o.onResize && this.o.onResize();
  }
  minimize() {
    if (this.minimized || this.closed) return;
    this.minimized = true;
    this.el.classList.add('minimizing');
    this.o.onMinimize && this.o.onMinimize();
    setTimeout(() => { if (!this.minimized) return; this.el.classList.remove('minimizing'); this.el.classList.add('minimized'); }, wait(ANIM.min) + 10);
    this.wm._refocus(this);
  }
  restore() {
    if (!this.minimized) { this.wm.focus(this); return; }
    this.minimized = false;
    this.el.classList.remove('minimizing', 'minimized');
    this.el.classList.add('restoring');
    setTimeout(() => this.el.classList.remove('restoring'), wait(ANIM.min) + 10);
    this.o.onRestore && this.o.onRestore();
    this.wm.focus(this);
  }
  close(silent) {
    if (this.closed) return;
    this.closed = true;
    this.wm._remove(this);
    this.el.classList.remove('minimizing', 'restoring');
    this.el.classList.add('closing');
    const done = () => { this.el.remove(); this.backdrop && this.backdrop.remove(); };
    if (this.minimized || reducedMotion()) done(); else setTimeout(done, wait(ANIM.close) + 10);
    if (this.backdrop) this.backdrop.style.opacity = '0';
    if (!silent) this.o.onClose && this.o.onClose();
  }
  nudge() { this.el.classList.remove('nudge'); void this.el.offsetWidth; this.el.classList.add('nudge'); }
  _drag() {
    let st = null;
    this.bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.xp-ctl') || this.maxed || e.button > 0) return;
      const r = this.el.getBoundingClientRect(), d = this.wm.layerEl(this).getBoundingClientRect();
      st = { dx: e.clientX - r.left, dy: e.clientY - r.top, d, id: e.pointerId };
      this.bar.setPointerCapture(e.pointerId);
    });
    this.bar.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      this.el.classList.add('dragging');
      const p = this.wm.clamp(this, e.clientX - st.d.left - st.dx, e.clientY - st.d.top - st.dy);
      this.el.style.left = p.x + 'px'; this.el.style.top = p.y + 'px';
      this.pos[this.wm.policy()] = p;
    });
    const end = (e) => { if (st && e.pointerId === st.id) { st = null; this.el.classList.remove('dragging'); } };
    this.bar.addEventListener('pointerup', end);
    this.bar.addEventListener('pointercancel', end);
  }
  _resize() {
    const minW = this.o.minW || 280, minH = this.o.minH || 180;
    for (const h of this.el.querySelectorAll('.xp-rz')) {
      let st = null;
      h.addEventListener('pointerdown', (e) => {
        if (this.maxed || e.button > 0) return;
        e.stopPropagation();
        const B = this.wm.bounds(this);
        st = { x: e.clientX, y: e.clientY, w: this.el.offsetWidth, h: this.el.offsetHeight, B, id: e.pointerId, px: this.el.offsetLeft, py: this.el.offsetTop };
        h.setPointerCapture(e.pointerId);
      });
      h.addEventListener('pointermove', (e) => {
        if (!st || e.pointerId !== st.id) return;
        const dx = h.classList.contains('s') ? 0 : e.clientX - st.x, dy = h.classList.contains('e') ? 0 : e.clientY - st.y;
        const w = Math.round(Math.max(minW, Math.min(st.B.w - 8 - Math.max(0, st.px), st.w + dx)));
        const hh = Math.round(Math.max(minH, Math.min(st.B.h - 8 - Math.max(0, st.py), st.h + dy)));
        this.el.style.setProperty('--w', w + 'px'); this.el.style.height = hh + 'px';
        this.size = { w, h: hh };
        this.o.onResize && this.o.onResize();
      });
      const end = (e) => { if (st && e.pointerId === st.id) st = null; };
      h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
    }
  }
}

// ---------- window manager + taskbar ----------
// layers: { float, mini } DOM containers (siblings of the game window). opts: { free(): bool, anchor(): {x,y,w,h}|null }
export class WindowManager {
  constructor(layers, tasks, opts = {}) {
    this.layers = layers; this.desktop = layers.float; this.tasks = tasks; this.wins = new Map(); this.z = 10; this.active = null;
    this.opts = opts; this.saved = new Map(); this.isolated = false;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const w = this.top();
      if (w && w.o.close !== false && w.o.esc !== false) { e.preventDefault(); w.requestClose(); }
    });
    if (typeof ResizeObserver !== 'undefined') {
      let raf = 0;
      this._ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => this.relayout()); });
      this._ro.observe(layers.float);
    }
  }
  has(id) { const w = this.wins.get(id); return !!w && !w.closed; }
  get(id) { return this.wins.get(id); }
  layerEl(w) { return this.layers[w.layer] || this.layers.float; }
  policy() { return this.opts.free && !this.opts.free() ? 'contain' : 'free'; }
  bounds(w) { const l = this.layerEl(w || { layer: 'float' }); return { w: l.clientWidth, h: l.clientHeight }; }
  _rank(w) { return (w.layer === 'mini' ? 1e6 : 0) + (+w.el.style.zIndex || 0); }
  top() { let b = null; for (const w of this.wins.values()) if (!w.minimized && (!b || this._rank(w) > this._rank(b))) b = w; return b; }
  hasModal() { for (const w of this.wins.values()) if (w.o.modal) return true; return false; }

  // keep a window reachable: contained windows stay fully inside, free windows keep a grip of their title bar on the desktop
  clamp(w, x, y) {
    const B = this.bounds(w), W = w.el.offsetWidth, H = w.el.offsetHeight;
    if (this.policy() === 'contain') return { x: Math.round(Math.max(0, Math.min(B.w - W, x))), y: Math.round(Math.max(0, Math.min(B.h - H, y))) };
    const keep = Math.min(KEEP, W);
    return { x: Math.round(Math.max(-(W - keep), Math.min(B.w - keep, x))), y: Math.round(Math.max(0, Math.min(B.h - Math.min(TITLE_KEEP, H), y))) };
  }
  _anchor(w) {
    const B = this.bounds(w);
    const a = this.policy() === 'free' && this.opts.anchor ? this.opts.anchor(this.layerEl(w)) : null;
    return a && a.w > 0 ? a : { x: 0, y: 0, w: B.w, h: B.h };
  }
  // size (responsive) + position of one window. Windows the user never moved are re-centred on the game window.
  place(w) {
    if (w.maxed || w.closed) return;
    const B = this.bounds(w), pol = this.policy();
    const sz = w.size || (w.o.size ? w.o.size(B, pol) : null);
    if (sz) { w.el.style.setProperty('--w', Math.round(sz.w) + 'px'); if (sz.h) w.el.style.height = Math.round(sz.h) + 'px'; }
    if (w.size) w.el.style.height = w.size.h + 'px';
    const W = w.el.offsetWidth, H = w.el.offsetHeight;
    let p = w.pos[pol];
    if (!p) {
      const other = w.pos[pol === 'free' ? 'contain' : 'free'];
      if (other) p = other; // nearest valid position derived from the other layout (clamped below)
    }
    if (!p) {
      const a = this._anchor(w);
      let x = a.x + (a.w - W) / 2, y;
      if (w.o.dock === 'bottom') y = a.y + a.h - H - 8; else y = a.y + (a.h - H) / 2;
      if (!w.o.modal && !w.o.dock && w.layer === 'float') {
        const n = [...this.wins.values()].filter((o) => o !== w && !o.closed && o.layer === w.layer && !o.o.modal && !o.o.dock && !o.maxed).length % 6;
        x += n * 22; y += n * 22 - 22;
      }
      p = { x, y };
    }
    const c = this.clamp(w, p.x, p.y);
    w.el.style.left = c.x + 'px'; w.el.style.top = c.y + 'px';
  }
  relayout() { for (const w of this.wins.values()) if (!w.closed) { this.place(w); w.o.onResize && w.o.onResize(); } }
  isolate(on) {
    this.isolated = on;
    this.layers.float.inert = on;
    for (const t of this.tasks.children) t.inert = on && t.dataset.layer !== 'mini';
  }

  open(o) {
    const ex = this.wins.get(o.id);
    if (ex && !ex.closed) {
      if (o.html !== undefined && o.replace !== false) ex.setHtml(o.html);
      ex.restore(); ex.nudge(); return ex;
    }
    const w = new XPWindow(this, o);
    const sv = this.saved.get(o.id);
    if (sv) { w.pos = { ...sv.pos }; w.size = sv.size ? { ...sv.size } : null; }
    this.wins.set(o.id, w);
    const host = this.layerEl(w);
    if (o.modal) {
      const bd = document.createElement('div'); bd.className = 'xpbackdrop';
      bd.addEventListener('pointerdown', () => w.nudge());
      host.appendChild(bd); w.backdrop = bd; w._bdZ = ++this.z; bd.style.zIndex = w._bdZ;
    }
    host.appendChild(w.el);
    this.place(w);
    if (o.task !== false) {
      const t = document.createElement('button');
      t.className = 'task'; t.dataset.win = o.id; t.dataset.layer = w.layer; t.innerHTML = `${icon(o.icon || 'info', 16)}<span>${esc(o.title)}</span>`;
      t.addEventListener('click', () => {
        if (w.minimized) w.restore();
        else if (this.active === w && w.el.classList.contains('xpwin') && !w.o.modal && w.o.min !== false) w.minimize();
        else { this.focus(w); w.nudge(); }
      });
      if (this.isolated && w.layer !== 'mini') t.inert = true;
      this.tasks.appendChild(t); w.task = t;
    }
    this.focus(w);
    return w;
  }
  focus(w) {
    if (!w || w.closed) return;
    if (this.active === w && w.el.style.zIndex) return;
    // a modal dialog keeps focus: other windows cannot be raised above it
    const modal = [...this.wins.values()].find((x) => x.o.modal && !x.closed && x !== w);
    if (modal && !w.o.modal) { modal.nudge(); return; }
    w.el.style.zIndex = ++this.z;
    this.active = w;
    this._paint();
  }
  _paint() {
    for (const w of this.wins.values()) {
      w.el.classList.toggle('inactive', w !== this.active);
      if (w.task) w.task.classList.toggle('active', w === this.active && !w.minimized);
    }
  }
  _refocus(from) {
    if (this.active === from) { this.active = null; const t = this.top(); if (t && t !== from) this.focus(t); else this._paint(); }
    else this._paint();
  }
  _remove(w) {
    this.wins.delete(w.id);
    // remember the last valid position / size so reopening the window puts it back
    if (w.pos.free || w.pos.contain || w.size) this.saved.set(w.id, { pos: { ...w.pos }, size: w.size ? { ...w.size } : null });
    if (w.task) w.task.remove();
    if (this.active === w) { this.active = null; const t = this.top(); if (t) this.focus(t); }
    this._paint();
  }
  closeWhere(fn, silent) { for (const w of [...this.wins.values()]) if (fn(w)) w.close(silent); }
  closeAll(silent) { this.closeWhere(() => true, silent); }
}

// ---------- XPDialog: message-box style window ----------
// buttons: [{id,label,def,cls,onClick}] ; resolves via callbacks. kind: info|warn|ask
export function XPDialog(wm, { id, title, ico = 'info', message = '', extra = '', buttons = [], width = 320, modal = true, onClose, cls = '', layer }) {
  const html = `<div class="xprow" style="align-items:flex-start;gap:12px">${icon(ico, 32)}<div class="grow xpt">${message}</div></div>${extra}<div class="xp-btnrow center">${buttons.map((b) => XPButton({ id: b.id, label: b.label, def: b.def, cls: b.cls || '', disabled: b.disabled })).join('')}</div>`;
  const w = wm.open({ id, title, icon: ico, html, width, modal, onClose, cls, layer, min: false, max: false });
  for (const b of buttons) { const el = w.q('#' + b.id); if (el) el.addEventListener('click', () => b.onClick && b.onClick(w)); }
  const d = w.q('.xpbtn.def'); if (d) setTimeout(() => d.focus({ preventScroll: true }), 30);
  return w;
}

// ---------- start menu ----------
export class StartMenu {
  constructor(btn, host, items, foot, panel) {
    this.btn = btn; this.host = host; this.items = items; this.foot = foot; this.panel = panel || null; this.el = null; this._unmount = null;
    btn.addEventListener('click', (e) => { e.stopPropagation(); this.el ? this.close() : this.open(); });
    document.addEventListener('pointerdown', (e) => { if (this.el && !this.el.contains(e.target) && !btn.contains(e.target)) this.close(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.el) this.close(); });
  }
  open() {
    const el = document.createElement('div');
    el.id = 'startMenu'; el.setAttribute('role', 'menu');
    const items = typeof this.items === 'function' ? this.items() : this.items;
    el.innerHTML = `<div class="sm-head"><span class="sm-av">${icon('coin', 24)}</span><span>Pixel Coin Pusher</span></div><div class="sm-items">${items.map((it) => it === '-' ? '<div class="sm-sep"></div>' : `<button class="sm-item" role="menuitem" data-k="${it.key}" ${it.disabled ? 'disabled' : ''}>${icon(it.icon, 24)}<span>${it.label}${it.sub ? `<small>${it.sub}</small>` : ''}</span></button>`).join('')}</div><div class="sm-foot">${this.foot || ''}</div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.sm-item'); if (!b) return;
      const it = items.find((x) => x !== '-' && x.key === b.dataset.k);
      this.close(); it && it.run && it.run();
    });
    // optional dedicated section (LunaWave): a separated, recessed row between the shortcuts and the footer
    if (this.panel) {
      const slot = document.createElement('div'); slot.className = 'sm-music';
      el.insertBefore(slot, el.querySelector('.sm-foot'));
      try { this._unmount = this.panel(slot); } catch (e) { slot.remove(); this._unmount = null; }
    }
    // while an exclusive mini-game runs, only the music section stays usable
    if (document.documentElement.classList.contains('mini-active')) for (const n of el.querySelectorAll('.sm-items, .sm-foot')) n.inert = true;
    this.host.appendChild(el); this.el = el; this.btn.classList.add('open');
    const f = el.querySelector('.sm-item:not(:disabled)'); f && f.focus({ preventScroll: true });
  }
  close() { if (!this.el) return; if (this._unmount) { try { this._unmount(); } catch (e) { /* ignore */ } this._unmount = null; } this.el.remove(); this.el = null; this.btn.classList.remove('open'); }
}
