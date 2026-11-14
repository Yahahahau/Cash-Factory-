import * as E from './economy.js';
import { paintBall } from './sprites.js';
import { icon } from './icons.js';
import { WindowManager, XPNotification, StartMenu, XPDialog, XPButton, esc, setProgress } from './xp.js';
import { openMini, openBoost, tickMini } from './screens.js';
import { openSettings, renderUpgrade } from './xp-panels.js';

export class UI {
  constructor(h) {
    this.h = h;
    this.state = null;
    this.world = null;
    this.cache = {};
    this.floatPool = [];
    this.floatIdx = 0;
    this.labels = [];
    this.sheetKey = null;
    this._grab();
    this.wm = new WindowManager(this.el.desktop, this.el.tasks);
    this.notes = new XPNotification(this.el.notifs);
    for (const n of document.querySelectorAll('[data-ico]')) n.innerHTML = icon(n.dataset.ico, n.closest('#startBtn') ? 20 : 16);
    this._bind();
    this._floats();
    this._tray();
  }

  _grab() {
    const g = (id) => document.getElementById(id);
    this.el = {
      stageTitle: g('stageTitle'), pBar: g('pBar'), pFill: g('pFill'), pText: g('pText'), cash: g('cash'), gems: g('gems'), combo: g('combo'),
      labels: g('labels'), floats: g('floats'), flash: g('flash'), loading: g('loading'), desktop: g('desktop'), tasks: g('tasks'), notifs: g('notifs'),
      drop: g('dropBtn'), dropFill: g('dropFill'), charges: g('charges'),
      rateBtn: g('rateBtn'), ratePrice: g('ratePrice'), rateLv: g('rateLv'), rateInfo: g('rateInfo'),
      padCap: g('padCap'), padRare: g('padRare'),
      miniBtn: g('miniBtn'), miniIco: g('miniIco'), miniTxt: g('miniTxt'), miniSub: g('miniSub'), runBtn: g('runBtn'), runChip: g('runChip'), boostChip: g('boostChip'),
      profit: g('profitMult'), startBtn: g('startBtn'), boostTray: g('boostTray'), trayTxt: g('trayTxt'), clock: g('clock'), app: g('app'),
    };
  }

  setText(key, el, text) {
    if (this.cache[key] !== text) { this.cache[key] = text; el.textContent = text; }
  }

  _bind() {
    const bindBtn = (el, fn) => el.addEventListener('click', (e) => { e.stopPropagation(); fn(e); });
    bindBtn(this.el.miniBtn, () => { this.h.onClick(); openMini(this, this.state, this.h); });
    bindBtn(this.el.runBtn, () => { this.h.onClick(); this.h.onNewRunOpen(); });
    bindBtn(this.el.boostChip, () => { this.h.onClick(); openBoost(this, this.state, this.h); });
    bindBtn(this.el.boostTray, () => { this.h.onClick(); openBoost(this, this.state, this.h); });
    this.el.boostChip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBoost(this, this.state, this.h); } });
    this._wf = 0;
    bindBtn(this.el.drop, () => { this.h.onDrop(); });
    bindBtn(this.el.rateBtn, () => { this.h.onBuy('rate'); });
    for (const p of [this.el.padCap, this.el.padRare]) bindBtn(p, () => { this.h.onClick(); this.openSheet(p.dataset.key); });
    this.menu = new StartMenu(this.el.startBtn, this.el.app, () => this._menuItems(), XPButton({ id: 'smOff', label: 'Close menu', ico: 'power' }));
  }

  _menuItems() {
    const s = this.state;
    const st = E.miniStatus(s);
    return [
      { key: 'mini', icon: 'ball', label: 'Flying Ball', sub: st.state === 'ready' ? 'Ready to play' : E.fmtClock(st.remaining), run: () => openMini(this, this.state, this.h) },
      { key: 'boost', icon: 'boost', label: 'Profit Boost', sub: st.state === 'boost' ? 'x' + st.mult + ' active' : 'Not active', run: () => openBoost(this, this.state, this.h) },
      { key: 'run', icon: 'flag', label: 'New Run', sub: E.canNewRun(s) ? 'Available' : 'Unlocks at stage ' + E.ECON.run.minStage, disabled: !E.canNewRun(s), run: () => this.h.onNewRunOpen() },
      '-',
      { key: 'set', icon: 'gear', label: 'Settings', run: () => openSettings(this, 0) },
      { key: 'stat', icon: 'chart', label: 'Statistics', run: () => openSettings(this, 6) },
      { key: 'upd', icon: 'disk', label: 'Check for updates', run: () => { this.h.onCheckUpdate(); this.toast('Checking for a new version...', 2000, { title: 'Update' }); } },
    ];
  }

  _tray() {
    const tick = () => { const d = new Date(); this.setText('clock', this.el.clock, String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')); };
    tick();
    setInterval(tick, 15000);
  }

  onBoostEnd() {
    this.toast('Profit boost ended. Cooldown: ' + E.ECON.mini.cooldownMinutes + ' min.', 3200, { title: 'Profit Boost', icon: 'boost' });
    this.updateMini(this.state);
  }

  // ---------- platform price labels ----------
  setStage(def) {
    this.closeSheet();
    this.el.labels.innerHTML = '';
    this.labels = [];
    for (const l of def.labels) {
      const el = document.createElement('button');
      el.className = 'xpbtn plabel';
      el.dataset.id = l.id;
      el.innerHTML = '<b></b><em></em>';
      el.addEventListener('click', (e) => { e.stopPropagation(); this.h.onClick(); this.openSheet(l.id); });
      this.el.labels.appendChild(el);
      this.labels.push({ id: l.id, el, x: l.x, y: l.y, b: el.querySelector('b'), em: el.querySelector('em') });
    }
    this.gateLbls = [];
    for (const g of def.gates || []) {
      const el = document.createElement('div');
      el.className = 'gatelbl';
      el.textContent = 'x2';
      this.el.labels.appendChild(el);
      this.gateLbls.push({ el, x: (g.x0 + g.x1) / 2, y: (g.y0 + g.y1) / 2 });
    }
    this.cache.stageTitle = null;
    this.updateLabels();
  }

  updateLabels() {
    const s = this.state;
    if (!s) return;
    for (const l of this.labels) {
      const info = E.upgradeInfo(s, l.id);
      const txt = info.atMax ? 'MAX' : '$' + E.fmtCash(info.cost);
      if (l.b.textContent !== txt) l.b.textContent = txt;
      const lv = info.lvl > 0 ? 'Lv.' + info.lvl : '';
      if (l.em.textContent !== lv) l.em.textContent = lv;
      const cls = 'xpbtn plabel' + (info.atMax ? ' max' : info.canBuy ? ' ready' : '');
      if (l.el.className !== cls) l.el.className = cls;
    }
  }

  placeLabels(w, h) {
    if (!this.world) return;
    for (const l of this.gateLbls || []) {
      const p = this.world.project(l.x, l.y, 0.5, w, h);
      l.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
    }
    for (const l of this.labels) {
      const p = this.world.project(l.x, l.y, 0.7, w, h);
      l.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
    }
  }

  // ---------- contextual upgrade window ----------
  openSheet(key) { this.sheetKey = key; renderUpgrade(this, true); }
  closeSheet() {
    this.sheetKey = null;
    this.cache.sheetSig = null;
    const w = this.wm.get('upgrade');
    if (w && !w.closed) w.close(true);
  }
  renderSheet(force) { renderUpgrade(this, force); }

  // ---------- per-frame ----------
  update(s, game) {
    this.state = s;
    const target = E.stageTarget(s.stage);
    this.setText('stageTitle', this.el.stageTitle, 'Stage ' + s.stage);
    this.setText('pText', this.el.pText, `${Math.min(s.progress, target)} / ${target}`);
    const pct = Math.min(100, (s.progress / target) * 100);
    if (this.cache.pct !== Math.round(pct * 2)) {
      this.cache.pct = Math.round(pct * 2);
      setProgress(this.el.pBar, pct);
    }
    this.setText('runChip', this.el.runChip, `Run ${s.run} | Pts ${s.perm.points}`);
    const st = E.miniStatus(s);
    this.setText('profit', this.el.profit, 'x' + (E.permMult(s) * (st.state === 'boost' ? st.mult : 1)).toFixed(2));
    this.setText('cash', this.el.cash, '$' + E.fmtCash(s.cash));
    this.setText('gems', this.el.gems, String(Math.floor(s.gems)));
    const combo = game.combo >= 5 ? `Combo x${game.combo} +${Math.round((E.comboBonus(game.combo) - 1) * 100)}%` : ' ';
    this.setText('combo', this.el.combo, combo);
    this.setText('charges', this.el.charges, String(Math.floor(game.charges)));
    const maxC = E.maxCharges(s);
    const f = Math.min(1, game.charges >= maxC ? 1 : Math.floor(game.charges) / maxC + (game.chargeT / E.CHARGE_TIME) / maxC);
    const fs = (f * 100).toFixed(0);
    if (this.cache.fill !== fs) { this.cache.fill = fs; this.el.dropFill.style.width = fs + '%'; }
    this.el.drop.classList.toggle('empty', game.charges < 1);
    this.placeLabels(game.sceneW, game.sceneH);
  }

  slowUpdate(s) {
    this.state = s;
    this.updateLabels();
    const r = E.upgradeInfo(s, 'rate');
    this.setText('ratePrice', this.el.ratePrice, r.atMax ? 'MAX' : '$' + E.fmtCash(r.cost));
    this.setText('rateLv', this.el.rateLv, 'Lv.' + r.lvl);
    this.setText('rateInfo', this.el.rateInfo, E.spawnRate(s).toFixed(1) + '/s');
    this.el.rateBtn.classList.toggle('ready', r.canBuy);
    this.el.rateBtn.disabled = r.atMax;
    for (const p of [this.el.padCap, this.el.padRare]) {
      const info = E.upgradeInfo(s, p.dataset.key);
      p.querySelector('.pad-price').textContent = info.atMax ? 'MAX' : '$' + E.fmtCash(info.cost);
      p.querySelector('.pad-lv').textContent = info.lvl ? 'Lv.' + info.lvl : '';
      p.classList.toggle('ready', info.canBuy);
    }
    renderUpgrade(this, false);
    this.updateMini(s);
  }

  updateMini(s) {
    const st = E.miniStatus(s);
    const b = this.el.miniBtn;
    const cls = 'xpbtn ' + (st.state === 'ready' ? 'ready' : st.state === 'boost' ? 'boost' : 'cool');
    if (b.className !== cls) b.className = cls;
    this.setText('miniTxt', this.el.miniTxt, st.state === 'ready' ? 'Play' : st.state === 'boost' ? 'x' + st.mult : 'CD');
    this.setText('miniSub', this.el.miniSub, st.state === 'ready' ? 'Flying Ball' : E.fmtClock(st.remaining));
    const bc = this.el.boostChip;
    if (st.state === 'boost') { bc.classList.remove('hidden'); this.setText('boostChip', bc, `Boost x${st.mult} ${E.fmtClock(st.remaining)}`); }
    else bc.classList.add('hidden');
    bc.classList.add('hidden');
    const bt = this.el.boostTray;
    if (st.state === 'ready') bt.classList.add('hidden');
    else { bt.classList.remove('hidden'); this.setText('trayTxt', this.el.trayTxt, (st.state === 'boost' ? 'x' + st.mult + ' ' : 'CD ') + E.fmtClock(st.remaining)); }
    this._wf = (this._wf + 1) % 4;
    paintBall(this.el.miniIco, [1, 0, 1, 2][this._wf], false);
    this.el.runBtn.classList.toggle('hidden', !E.canNewRun(s));
    tickMini(this, s);
  }

  // ---------- floating cash ----------
  _floats() {
    for (let i = 0; i < 14; i++) {
      const d = document.createElement('div');
      d.className = 'float';
      this.el.floats.appendChild(d);
      this.floatPool.push(d);
    }
  }

  floatText(px, py, text, cls = '') {
    const d = this.floatPool[this.floatIdx++ % this.floatPool.length];
    d.textContent = text;
    d.className = 'float ' + cls;
    const w = this.el.floats.clientWidth;
    const x = Math.round(Math.max(6, Math.min(w - 90, px - 28)));
    if (d._anim) d._anim.cancel();
    d._anim = d.animate(
      [
        { transform: `translate(${x}px, ${Math.round(py)}px)`, opacity: 0 },
        { transform: `translate(${x}px, ${Math.round(py - 14)}px)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${x}px, ${Math.round(py - 54)}px)`, opacity: 0 },
      ],
      { duration: 900, easing: 'steps(12)', fill: 'forwards' }
    );
  }

  toast(msg, ms = 2400, o = {}) { this.notes.show({ title: o.title || 'Notice', msg, ico: o.icon || 'info', ms }); }

  flash() {
    const f = this.el.flash;
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }

  stageBanner(stage, reward, bonus) {
    const kv = (a, b, c = '') => `<div class="xpkv ${c}"><span>${a}</span><b>${b}</b></div>`;
    const w = XPDialog(this.wm, {
      id: 'stage', title: 'Stage Complete', ico: 'flag', modal: false, width: 300,
      message: `<div class="xph">Stage ${stage} cleared!</div><div class="xps">Now entering stage ${stage + 1}.</div>`,
      extra: `<div class="xppanel">${kv('Cash reward', '+$' + E.fmtCash(reward.cash), 'money')}${kv('Gems', '+' + reward.gems)}${bonus > 0 ? kv('Leftover coins', '+$' + E.fmtCash(bonus), 'money') : ''}</div>`,
      buttons: [{ id: 'stOk', label: 'OK', def: true, onClick: (win) => win.close() }],
    });
    clearTimeout(this._stT);
    this._stT = setTimeout(() => { if (w && !w.closed) w.close(); }, 5000);
    this.flash();
  }

  hideLoading() {
    this.el.loading.classList.add('done');
    setTimeout(() => this.el.loading.remove(), 500);
  }

  // ---------- windows ----------
  closeModal() { this.wm.closeWhere((w) => w.o.modal || ['mini', 'boost', 'reward', 'newrun', 'settings'].includes(w.id), true); }
  isOpen(id) { return this.wm.has(id); }
  get modalOpen() { for (const id of ['mini', 'reward', 'newrun', 'offline', 'settings', 'boost']) if (this.wm.has(id)) return id; return null; }
  openMenu() { openSettings(this, 0); }

  showOffline(info) {
    const w = XPDialog(this.wm, {
      id: 'offline', title: 'Welcome Back', ico: 'clock', width: 320,
      message: `<div class="xph">You were away for ${E.fmtDuration(info.elapsed)}</div><div class="xps">${info.capped ? `Counted up to ${E.fmtDuration(info.counted)}.` : ''}</div>`,
      extra: `<div class="xppanel mstat"><span>Offline earnings</span><b id="offGain" style="color:var(--money)">+$0</b><span class="xps">About ${E.fmtNum(info.coins)} coins collected</span></div>
      <div class="xps">Offline income is ${Math.round(E.OFFLINE_EFFICIENCY * 100)}% of normal and stores up to ${E.fmtDuration(info.cap)}. Upgrade Capacity to raise the limit.</div>`,
      buttons: [{ id: 'offOk', label: 'Collect', def: true, onClick: (win) => { this.h.onClick(); win.close(); } }],
    });
    const gain = w.q('#offGain');
    const t0 = performance.now();
    const tick = () => {
      if (w.closed) return;
      const k = Math.min(1, (performance.now() - t0) / 1200);
      gain.textContent = '+' + E.fmtMoney(info.gain * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
  }
}
