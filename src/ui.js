import * as E from './economy.js';

const QUALITY_TH = { low: 'ต่ำ', medium: 'กลาง', high: 'สูง' };
const ICON = { pusher: 'ลูกสูบ', conveyor: 'สายพาน', blower: 'พัดลม', magnet: 'แม่เหล็ก', launcher: 'เครื่องดีด', rate: 'เหรียญ/วิ', capacity: 'ความจุ', rare: 'หายาก' };

export class UI {
  constructor(h) {
    this.h = h;
    this.state = null;
    this.world = null;
    this.cache = {};
    this.floatPool = [];
    this.floatIdx = 0;
    this.labels = []; // {id, el, x, y}
    this.sheetKey = null;
    this._grab();
    this._bind();
    this._floats();
  }

  _grab() {
    const g = (id) => document.getElementById(id);
    this.el = {
      stageTitle: g('stageTitle'), pFill: g('pFill'), pText: g('pText'), cash: g('cash'), gems: g('gems'), combo: g('combo'),
      labels: g('labels'), floats: g('floats'), sheet: g('sheet'), modal: g('modal'), toast: g('toast'), flash: g('flash'),
      banner: g('banner'), bannerSmall: g('bannerSmall'), bannerTitle: g('bannerTitle'), bannerSub: g('bannerSub'), loading: g('loading'),
      drop: g('dropBtn'), dropFill: g('dropFill'), charges: g('charges'),
      rateBtn: g('rateBtn'), ratePrice: g('ratePrice'), rateLv: g('rateLv'), rateInfo: g('rateInfo'),
      padCap: g('padCap'), padRare: g('padRare'), menu: g('menuBtn'),
    };
  }

  _bump(el) {
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }

  setText(key, el, text) {
    if (this.cache[key] !== text) {
      const had = this.cache[key] !== undefined;
      this.cache[key] = text;
      el.textContent = text;
      if (had && (key === 'cash' || key === 'gems' || key === 'stageTitle')) this._bump(el);
    }
  }

  _bind() {
    const bindBtn = (el, fn) => {
      // pointerdown feels instant on touch; click is the fallback for keyboards / synthetic events
      el.addEventListener('click', (e) => { e.stopPropagation(); fn(e); });
    };
    bindBtn(this.el.menu, () => { this.h.onClick(); this.openMenu(); });
    bindBtn(this.el.drop, () => {
      const ok = this.h.onDrop();
      const b = this.el.drop;
      if (ok) { b.classList.remove('press'); void b.offsetWidth; b.classList.add('press'); }
    });
    bindBtn(this.el.rateBtn, () => {
      const ok = this.h.onBuy('rate');
      if (ok) this._pop(this.el.rateBtn);
    });
    for (const p of [this.el.padCap, this.el.padRare]) bindBtn(p, () => { this.h.onClick(); this.openSheet(p.dataset.key); });
  }

  _pop(el) {
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }

  // ---------- platform price labels (attached to world positions) ----------
  setStage(def) {
    this.closeSheet();
    this.el.labels.innerHTML = '';
    this.labels = [];
    for (const l of def.labels) {
      const el = document.createElement('button');
      el.className = 'plabel';
      el.dataset.id = l.id;
      el.innerHTML = '<span class="cur">$</span><b></b><em></em>';
      el.addEventListener('click', (e) => { e.stopPropagation(); this.h.onClick(); this.openSheet(l.id); });
      this.el.labels.appendChild(el);
      this.labels.push({ id: l.id, el, x: l.x, y: l.y, b: el.querySelector('b'), em: el.querySelector('em') });
    }
    // "x2" badges for multiplier gates are plain DOM so the pixel shader never touches them
    this.gateLbls = [];
    for (const g of def.gates || []) {
      const el = document.createElement('div');
      el.className = 'gatelbl';
      el.textContent = '×2';
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
      const txt = info.atMax ? 'MAX' : E.fmtCash(info.cost);
      if (l.b.textContent !== txt) l.b.textContent = txt;
      const lv = info.lvl > 0 ? 'Lv.' + info.lvl : '';
      if (l.em.textContent !== lv) l.em.textContent = lv;
      const cls = 'plabel' + (info.atMax ? ' max' : info.canBuy ? ' ready' : '') + (info.lvl === 0 ? ' fresh' : '');
      if (l.el.className !== cls) l.el.className = cls;
    }
  }

  placeLabels(w, h) {
    if (!this.world) return;
    for (const l of this.gateLbls || []) {
      const p = this.world.project(l.x, l.y, 0.5, w, h);
      l.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
    }
    for (const l of this.labels) {
      const p = this.world.project(l.x, l.y, 0.7, w, h);
      l.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  // ---------- contextual upgrade panel ----------
  openSheet(key) {
    this.sheetKey = key;
    this.renderSheet(true);
    this.el.sheet.classList.remove('hidden');
  }

  closeSheet() {
    this.sheetKey = null;
    this.el.sheet.classList.add('hidden');
    this.el.sheet.innerHTML = '';
    this.cache.sheetSig = null;
  }

  renderSheet(force) {
    const key = this.sheetKey;
    if (!key || !this.state) return;
    const s = this.state;
    const info = E.upgradeInfo(s, key);
    const eff = E.effectText(s, key);
    const sig = [key, info.lvl, info.cost, info.canBuy, eff].join('|');
    if (!force && this.cache.sheetSig === sig) return;
    this.cache.sheetSig = sig;
    const kind = info.isMachine ? E.MACHINES[key].type : key;
    const status = info.isMachine && info.lvl === 0 ? '<span class="tag off">ยังไม่เปิดใช้งาน</span>' : info.isMachine ? '<span class="tag on">ทำงานอยู่</span>' : '';
    this.el.sheet.innerHTML = `<div class="sh-card">
      <button class="sh-x" aria-label="ปิด">×</button>
      <div class="sh-head"><span class="sh-ico2 k-${kind}"></span><div><div class="sh-name">${info.isMachine ? E.MACHINES[key].name : info.name}</div><div class="sh-type">${info.title}</div></div></div>
      <div class="sh-row"><span>ระดับ</span><b>Lv.${info.lvl} / ${info.max}</b>${status}</div>
      <div class="sh-bar"><i style="width:${(info.lvl / info.max) * 100}%"></i></div>
      <div class="sh-fx">${eff}</div>
      <button class="sh-buy ${info.atMax ? 'max' : info.canBuy ? '' : 'off'}" ${info.atMax ? 'disabled' : ''}>${info.atMax ? 'ระดับสูงสุด' : `${info.lvl === 0 && info.isMachine ? 'เปิดใช้งาน' : 'อัปเกรด'} <span class="cur">$</span>${E.fmtCash(info.cost)}`}</button>
    </div>`;
    const card = this.el.sheet;
    card.querySelector('.sh-x').addEventListener('click', (e) => { e.stopPropagation(); this.h.onClick(); this.closeSheet(); });
    const buy = card.querySelector('.sh-buy');
    buy.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.h.onBuy(key)) this._pop(buy);
      this.renderSheet(true);
    });
  }

  // ---------- per-frame ----------
  update(s, game) {
    this.state = s;
    const target = E.stageTarget(s.stage);
    this.setText('stageTitle', this.el.stageTitle, 'ด่าน ' + s.stage);
    this.setText('pText', this.el.pText, `${Math.min(s.progress, target)} / ${target}`);
    const pct = Math.min(100, (s.progress / target) * 100);
    if (this.cache.pct !== Math.round(pct * 2)) {
      this.cache.pct = Math.round(pct * 2);
      this.el.pFill.style.width = pct + '%';
    }
    this.setText('cash', this.el.cash, E.fmtCash(s.cash));
    this.setText('gems', this.el.gems, String(Math.floor(s.gems)));
    const combo = game.combo >= 5 ? `คอมโบ ×${game.combo} · +${Math.round((E.comboBonus(game.combo) - 1) * 100)}%` : '';
    this.setText('combo', this.el.combo, combo);
    this.setText('charges', this.el.charges, String(Math.floor(game.charges)));
    const maxC = E.maxCharges(s);
    const fill = game.charges >= maxC ? 1 : (game.charges - Math.floor(game.charges) + game.chargeT / E.CHARGE_TIME) / 1;
    const f = Math.min(1, game.charges >= maxC ? 1 : Math.floor(game.charges) / maxC + (game.chargeT / E.CHARGE_TIME) / maxC);
    const fs = (f * 100).toFixed(1);
    if (this.cache.fill !== fs) { this.cache.fill = fs; this.el.dropFill.style.height = fs + '%'; }
    this.el.drop.classList.toggle('empty', game.charges < 1);
    this.placeLabels(game.sceneW, game.sceneH);
    void fill;
  }

  slowUpdate(s, machines) {
    this.state = s;
    this.updateLabels();
    const r = E.upgradeInfo(s, 'rate');
    this.setText('ratePrice', this.el.ratePrice, r.atMax ? 'MAX' : E.fmtCash(r.cost));
    this.setText('rateLv', this.el.rateLv, String(r.lvl));
    this.setText('rateInfo', this.el.rateInfo, E.spawnRate(s).toFixed(1) + '/วิ');
    this.el.rateBtn.classList.toggle('ready', r.canBuy);
    for (const p of [this.el.padCap, this.el.padRare]) {
      const info = E.upgradeInfo(s, p.dataset.key);
      p.querySelector('.pad-price').textContent = info.atMax ? 'MAX' : '$' + E.fmtCash(info.cost);
      p.querySelector('.pad-lv').textContent = info.lvl ? 'Lv.' + info.lvl : '';
      p.classList.toggle('ready', info.canBuy);
    }
    this.renderSheet(false);
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
    const x = Math.max(6, Math.min(w - 90, px - 28));
    if (d._anim) d._anim.cancel();
    d._anim = d.animate(
      [
        { transform: `translate(${x}px, ${py}px) scale(0.8)`, opacity: 0 },
        { transform: `translate(${x}px, ${py - 14}px) scale(1.1)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${x}px, ${py - 54}px) scale(1)`, opacity: 0 },
      ],
      { duration: 900, easing: 'steps(12)', fill: 'forwards' }
    );
  }

  toast(msg, ms = 2000) {
    const t = this.el.toast;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('show'), ms);
  }

  flash() {
    const f = this.el.flash;
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }

  stageBanner(stage, reward, bonus) {
    this.el.bannerSmall.textContent = `ผ่านด่าน ${stage} แล้ว!`;
    this.el.bannerTitle.textContent = `ด่าน ${stage + 1}`;
    this.el.bannerSub.textContent = `รางวัล +$${E.fmtCash(reward.cash)} · +${reward.gems} เพชร` + (bonus > 0 ? ` · เหรียญคงเหลือ +$${E.fmtCash(bonus)}` : '');
    const b = this.el.banner;
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
    this.flash();
  }

  hideLoading() {
    this.el.loading.classList.add('done');
    setTimeout(() => this.el.loading.remove(), 500);
  }

  // ---------- modals ----------
  closeModal() {
    this.el.modal.classList.add('hidden');
    this.el.modal.innerHTML = '';
    this.modalOpen = null;
    this.h.onModal && this.h.onModal(false);
  }

  _open(html, name) {
    this.el.modal.innerHTML = html;
    this.el.modal.classList.remove('hidden');
    this.modalOpen = name;
    this.h.onModal && this.h.onModal(true);
  }

  openMenu() {
    const s = this.state;
    const pixelOn = s.settings.pixel;
    const q = s.settings.quality;
    const st = s.stats;
    const rows = [
      ['รายได้ทั้งหมด', E.fmtMoney(st.totalEarned)],
      ['เหรียญที่เก็บได้', E.fmtNum(Math.floor(st.coinsCollected))],
      ['ด่านที่ผ่านแล้ว', String(st.stagesCleared)],
      ['คอมโบสูงสุด', String(st.bestCombo)],
      ['อัปเกรดที่ซื้อ', String(st.upgradesBought)],
      ['ปล่อยเหรียญเอง', String(st.manualDrops)],
      ['ลูกสูบช่วยอัตโนมัติ', String(st.autoPushes | 0)],
      ['ช่วยดันด้วยมือ', String(st.manualPushes | 0)],
      ['รายได้ออฟไลน์รวม', E.fmtMoney(st.offlineEarned)],
      ['เวลาที่เล่น', E.fmtDuration(st.playSeconds)],
    ];
    this._open(
      `<div class="dlg"><h2>เมนู</h2>
      <div class="row"><div>เอฟเฟกต์พิกเซลเรโทร<div class="sub">Retro Pixel Effect</div></div>
        <div class="seg" id="sPixel"><button data-v="1" class="${pixelOn ? 'on' : ''}">เปิด ON</button><button data-v="0" class="${!pixelOn ? 'on off' : ''}">ปิด OFF</button></div></div>
      <div class="row"><div>เสียงเอฟเฟกต์</div><input id="sSfx" type="range" min="0" max="100" value="${Math.round(s.settings.sfx * 100)}"></div>
      <div class="row"><div>เสียงดนตรี</div><input id="sMusic" type="range" min="0" max="100" value="${Math.round(s.settings.music * 100)}"></div>
      <div class="row"><div>คุณภาพกราฟิก<div class="sub">ต่ำ = ลื่นกว่า (ปิดเงา)</div></div>
        <div class="seg" id="sQ">${['low', 'medium', 'high'].map((k) => `<button data-v="${k}" class="${q === k ? 'on' : ''}">${QUALITY_TH[k]}</button>`).join('')}</div></div>
      <div class="sec-title">สถิติ</div>
      ${rows.map((r) => `<div class="kv"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')}
      <div class="row"><div>เวอร์ชัน<div class="sub">${this.h.version}${this.h.inIframe ? ' · ฝังใน iframe' : ''}</div></div><button class="small-btn" id="sUpd">เช็กอัปเดต</button></div>
      <div class="row" id="resetRow"><div>รีเซ็ตความคืบหน้า<div class="sub">ลบเงินและอัปเกรดทั้งหมด</div></div><button class="small-btn" id="sReset" style="background:var(--red)">รีเซ็ต</button></div>
      <button class="big-btn close" id="sClose">ปิด</button></div>`,
      'menu'
    );
    const m = this.el.modal;
    m.querySelector('#sPixel').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const on = b.dataset.v === '1';
      this.h.onSetting('pixel', on);
      m.querySelectorAll('#sPixel button').forEach((x) => { x.className = ''; });
      b.className = on ? 'on' : 'on off';
      this.h.onClick();
    });
    m.querySelector('#sQ').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.h.onSetting('quality', b.dataset.v);
      m.querySelectorAll('#sQ button').forEach((x) => x.classList.toggle('on', x === b));
      this.h.onClick();
    });
    m.querySelector('#sSfx').addEventListener('input', (e) => this.h.onSetting('sfx', Number(e.target.value) / 100));
    m.querySelector('#sSfx').addEventListener('change', () => this.h.onClick());
    m.querySelector('#sMusic').addEventListener('input', (e) => this.h.onSetting('music', Number(e.target.value) / 100));
    m.querySelector('#sUpd').addEventListener('click', () => { this.h.onCheckUpdate(); this.toast('กำลังตรวจสอบเวอร์ชันใหม่…'); });
    m.querySelector('#sClose').addEventListener('click', () => { this.h.onClick(); this.closeModal(); });
    m.querySelector('#sReset').addEventListener('click', () => {
      const row = m.querySelector('#resetRow');
      row.innerHTML = '<div style="color:var(--red)">ยืนยันลบข้อมูลทั้งหมด?</div><div class="seg"><button id="rYes" style="background:var(--red)">ลบเลย</button><button id="rNo">ยกเลิก</button></div>';
      row.querySelector('#rYes').addEventListener('click', () => { this.closeModal(); this.h.onReset(); });
      row.querySelector('#rNo').addEventListener('click', () => { this.closeModal(); this.openMenu(); });
    });
    m.addEventListener('click', (e) => { if (e.target === m) this.closeModal(); }, { once: true });
  }

  showOffline(info) {
    this._open(
      `<div class="dlg"><h2>ยินดีต้อนรับกลับ!</h2>
      <div class="offline-meta">คุณไม่อยู่ ${E.fmtDuration(info.elapsed)}${info.capped ? `<br>(นับสูงสุด ${E.fmtDuration(info.counted)})` : ''}</div>
      <div class="offline-gain" id="offGain">+$0</div>
      <div class="offline-meta">เครื่องเก็บเหรียญได้ราว ${E.fmtNum(info.coins)} เหรียญ</div>
      <div class="note" style="text-align:center">รายได้ออฟไลน์คิดที่ ${Math.round(E.OFFLINE_EFFICIENCY * 100)}% ของปกติ · สะสมได้สูงสุด ${E.fmtDuration(info.cap)} (อัปเกรดความจุเพื่อเพิ่ม)</div>
      <button class="big-btn close" id="offOk">รับเงิน!</button></div>`,
      'offline'
    );
    const gain = this.el.modal.querySelector('#offGain');
    const t0 = performance.now();
    const tick = () => {
      if (this.modalOpen !== 'offline') return;
      const k = Math.min(1, (performance.now() - t0) / 1200);
      gain.textContent = '+' + E.fmtMoney(info.gain * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
    this.el.modal.querySelector('#offOk').addEventListener('click', () => { this.h.onClick(); this.closeModal(); });
  }
}
