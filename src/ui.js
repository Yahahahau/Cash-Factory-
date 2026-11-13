import * as E from './economy.js';
import { iconURL } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);
const QUALITY_TH = { low: 'ต่ำ', medium: 'กลาง', high: 'สูง' };

export class UI {
  constructor(h) {
    this.h = h; // handlers
    this.state = null;
    this.buyMode = '1';
    this.cache = {};
    this.tabNow = 'up';
    this.floatPool = [];
    this.floatIdx = 0;
    this.accum = 0;
    this._grab();
    this._tabs();
    this._mode();
    this._cards();
    this._floats();
    this.el.gear.addEventListener('click', () => { this.h.onClick(); this.openSettings(); });
  }

  _grab() {
    const g = (id) => document.getElementById(id);
    this.el = {
      money: g('money'), income: g('income'), gradeBadge: g('gradeBadge'), gradeName: g('gradeName'),
      chipSpawn: g('chipSpawn'), chipCollect: g('chipCollect'), chipStore: g('chipStore'),
      storeBar: g('storeBar'), storeFill: g('storeFill'), flash: g('flash'), banner: g('banner'),
      bannerTitle: g('bannerTitle'), bannerSub: g('bannerSub'), toast: g('toast'), cards: g('cards'),
      factory: g('tab-factory'), stats: g('tab-stats'), modal: g('modal'), gear: g('gear'), floats: g('floats'),
      loading: g('loading'),
    };
  }

  setText(key, el, text) {
    if (this.cache[key] !== text) {
      this.cache[key] = text;
      el.textContent = text;
    }
  }

  // ---------- tabs ----------
  _tabs() {
    document.querySelectorAll('.tab').forEach((b) => {
      b.addEventListener('click', () => {
        this.h.onClick();
        this.tabNow = b.dataset.tab;
        document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b));
        document.querySelectorAll('.tabbody').forEach((x) => x.classList.toggle('on', x.id === 'tab-' + this.tabNow));
        this.renderTab(true);
      });
    });
  }

  _mode() {
    document.querySelectorAll('.mode .m').forEach((b) => {
      b.addEventListener('click', () => {
        this.h.onClick();
        this.buyMode = b.dataset.m;
        document.querySelectorAll('.mode .m').forEach((x) => x.classList.toggle('on', x === b));
        this.updateCards(true);
      });
    });
  }

  // ---------- upgrade cards ----------
  _cards() {
    this.cardEls = {};
    for (const key of E.UPGRADE_KEYS) {
      const def = E.UPGRADES[key];
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="ico"></div><div class="info"><div class="nm"><span>${def.name}</span><span class="lv"></span></div><div class="bar"><i></i></div><div class="fx"></div></div><button class="buy"><small></small><b></b></button>`;
      card.querySelector('.ico').style.backgroundImage = `url(${iconURL(def.icon)})`;
      const btn = card.querySelector('.buy');
      btn.addEventListener('click', () => {
        const res = this.h.onBuy(key, this.buyMode);
        if (res) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
        this.updateCards(true);
      });
      this.el.cards.appendChild(card);
      this.cardEls[key] = {
        card, btn, lv: card.querySelector('.lv'), bar: card.querySelector('.bar i'), fx: card.querySelector('.fx'),
        small: btn.querySelector('small'), cost: btn.querySelector('b'),
      };
    }
  }

  plan(key) {
    const s = this.state;
    const info = E.upgradeInfo(s, key);
    if (info.atMax || info.locked) return { info, n: 0, cost: info.cost };
    const want = this.buyMode === 'max' ? 9999 : Number(this.buyMode);
    let n = 0;
    let cost = 0;
    let lvl = info.lvl;
    const max = info.max;
    const limit = key === 'automation' ? Math.min(max, s.grade) : max;
    while (n < want && lvl < limit) {
      const c = E.upgradeCost(key, lvl);
      if (this.buyMode === 'max' && cost + c > s.money) break;
      cost += c; lvl++; n++;
    }
    if (n === 0) { // MAX but can't afford even one
      n = 1;
      cost = info.cost;
    }
    return { info, n, cost };
  }

  updateCards(force) {
    const s = this.state;
    for (const key of E.UPGRADE_KEYS) {
      const c = this.cardEls[key];
      const p = this.plan(key);
      const info = p.info;
      this.setText('lv' + key, c.lv, `Lv.${info.lvl}/${info.max}`);
      const pct = (info.lvl / info.max) * 100;
      if (this.cache['bar' + key] !== pct) { this.cache['bar' + key] = pct; c.bar.style.width = pct + '%'; }
      this.setText('fx' + key, c.fx, info.atMax ? 'ถึงระดับสูงสุดของเกรดนี้แล้ว' : E.effectText(s, key));
      let cls = 'buy';
      let small = '';
      let cost = '';
      if (info.atMax) {
        cls += ' max';
        small = key === 'automation' ? 'สูงสุด' : (s.grade < E.GRADES.length ? 'เลื่อนเกรด' : 'สูงสุด');
        cost = 'MAX';
      } else if (info.locked) {
        cls += ' lock';
        small = info.locked;
        cost = '';
      } else {
        const can = s.money >= p.cost;
        if (!can) cls += ' off';
        small = p.n > 1 ? `ซื้อ ×${p.n}` : 'ซื้อ';
        cost = E.fmtMoney(p.cost);
      }
      const keyS = cls + small + cost;
      if (this.cache['btn' + key] !== keyS || force) {
        this.cache['btn' + key] = keyS;
        c.btn.className = cls + (c.btn.classList.contains('pop') ? ' pop' : '');
        c.small.textContent = small;
        c.cost.textContent = cost;
      }
    }
  }

  // ---------- factory + stats tabs ----------
  renderTab(force) {
    const s = this.state;
    if (!s) return;
    if (this.tabNow === 'factory') {
      const g = E.gradeOf(s);
      const gr = E.gradeRequirements(s);
      const sig = [s.grade, Math.floor(s.money), s.levels.production, s.levels.value, s.levels.storage, s.levels.efficiency].join('|');
      if (!force && this.cache.fsig === sig) return;
      this.cache.fsig = sig;
      let h = `<div class="sec-title">${g.name} (เกรด ${g.id})</div>`;
      h += '<div class="gtrack">' + E.GRADES.map((x) => `<i class="${x.id < s.grade ? 'on' : x.id === s.grade ? 'cur' : ''}">${x.id}</i>`).join('') + '</div>';
      h += `<div class="kv"><span>ตัวคูณมูลค่า</span><b>×${E.fmtNum(g.valueMult)}</b></div>`;
      h += `<div class="kv"><span>ความเร็วผลิต</span><b>×${g.spawnMult}</b></div>`;
      h += `<div class="kv"><span>ความเร็วเก็บ</span><b>×${g.collectMult}</b></div>`;
      h += `<div class="kv"><span>ความจุเพิ่ม</span><b>+${g.capBonus}</b></div>`;
      h += `<div class="kv"><span>เลเวลสูงสุดต่อด้าน</span><b>${g.levelCap}</b></div>`;
      h += `<div class="note">เอฟเฟกต์: ${g.fx}</div>`;
      if (gr) {
        h += `<div class="sec-title" style="margin-top:12px">เงื่อนไขเลื่อนเป็น ${gr.next.name}</div>`;
        for (const r of gr.reqs) {
          const val = r.money ? `${E.fmtMoney(Math.min(r.have, r.need))}/${E.fmtMoney(r.need)}` : `${r.have}/${r.need}`;
          h += `<div class="req ${r.ok ? 'ok' : 'no'}"><span>${r.ok ? '✔' : '✖'} ${r.label}</span><b>${val}</b></div>`;
        }
        h += `<div class="note">ปลดล็อก: ${gr.next.fx} · มูลค่า ×${E.fmtNum(gr.next.valueMult)} · เลเวลสูงสุด ${gr.next.levelCap}</div>`;
        h += `<button class="big-btn ${gr.ok ? '' : 'off'}" id="gradeBtn">${gr.ok ? 'อัปเกรดโรงงาน!' : 'ยังไม่ครบเงื่อนไข'}</button>`;
      } else {
        h += '<div class="sec-title" style="margin-top:12px">คุณมีโรงงานระดับสูงสุดแล้ว!</div><div class="note">อัปเกรดทุกด้านให้ถึงเลเวลสูงสุดเพื่อรายได้มหาศาล</div>';
      }
      this.el.factory.innerHTML = h;
      const b = document.getElementById('gradeBtn');
      if (b) b.addEventListener('click', () => this.h.onGrade());
    } else if (this.tabNow === 'stats') {
      const st = s.stats;
      const sig = [Math.floor(st.playSeconds), Math.floor(st.totalEarned), st.objectsCollected | 0, st.taps, st.autoPushes | 0, st.manualPushes | 0].join('|');
      if (!force && this.cache.ssig === sig) return;
      this.cache.ssig = sig;
      const rows = [
        ['รายได้ทั้งหมด', E.fmtMoney(st.totalEarned)],
        ['วัตถุที่ผลิตแล้ว', E.fmtNum(Math.floor(st.objectsProduced))],
        ['วัตถุที่เก็บแล้ว', E.fmtNum(Math.floor(st.objectsCollected))],
        ['อัปเกรดที่ซื้อ', String(st.upgradesBought)],
        ['จำนวนครั้งที่แตะเก็บ', String(st.taps)],
        ['ดันเหรียญอัตโนมัติ', String(st.autoPushes | 0)],
        ['ดันเหรียญด้วยมือ', String(st.manualPushes | 0)],
        ['รายได้ออฟไลน์รวม', E.fmtMoney(st.offlineEarned)],
        ['เวลาที่เล่น', E.fmtDuration(st.playSeconds)],
        ['รายได้ต่อวินาที', E.fmtMoney(E.incomePerSec(s))],
        ['เวอร์ชัน', this.h.version],
      ];
      this.el.stats.innerHTML = rows.map((r) => `<div class="kv"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
    }
  }

  // ---------- per-frame ----------
  update(s, game) {
    this.state = s;
    this.setText('money', this.el.money, E.fmtMoney(s.money));
    this.setText('income', this.el.income, `+${E.fmtMoney(E.incomePerSec(s))}/วินาที`);
    this.setText('gb', this.el.gradeBadge, `เกรด ${s.grade}/${E.GRADES.length}`);
    this.setText('gn', this.el.gradeName, E.gradeOf(s).name);
    this.setText('cs', this.el.chipSpawn, E.spawnRate(s).toFixed(1) + '/วิ');
    this.setText('cc', this.el.chipCollect, E.collectRate(s).toFixed(1) + '/วิ');
    const cap = E.capacity(s);
    const stored = Math.min(cap, Math.round(game.stored));
    this.setText('st', this.el.chipStore, `${stored}/${cap}`);
    const pct = Math.min(100, (stored / cap) * 100);
    if (this.cache.pct !== Math.round(pct)) {
      this.cache.pct = Math.round(pct);
      this.el.storeFill.style.width = pct + '%';
      this.el.storeBar.classList.toggle('full', pct >= 97);
      this.el.storeBar.classList.toggle('warn', pct >= 75 && pct < 97);
    }
  }

  slowUpdate(s) {
    this.state = s;
    this.updateCards(false);
    this.renderTab(false);
  }

  // ---------- floating money ----------
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
    const x = Math.max(6, Math.min(w - 80, px - 28));
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

  toast(msg, ms = 2200) {
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

  banner(grade) {
    const g = E.GRADES[grade - 1];
    this.el.bannerTitle.textContent = g.name;
    this.el.bannerSub.textContent = `เกรด ${g.id} · ${g.fx}`;
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

  openSettings() {
    const s = this.state;
    const pixelOn = s.settings.pixel;
    const q = s.settings.quality;
    this._open(
      `<div class="dlg"><h2>ตั้งค่า</h2>
      <div class="row"><div>เอฟเฟกต์พิกเซลเรโทร<div class="sub">Retro Pixel Effect</div></div>
        <div class="seg" id="sPixel"><button data-v="1" class="${pixelOn ? 'on' : ''}">เปิด ON</button><button data-v="0" class="${!pixelOn ? 'on off' : ''}">ปิด OFF</button></div></div>
      <div class="row"><div>เสียงเอฟเฟกต์</div><input id="sSfx" type="range" min="0" max="100" value="${Math.round(s.settings.sfx * 100)}"></div>
      <div class="row"><div>เสียงดนตรี</div><input id="sMusic" type="range" min="0" max="100" value="${Math.round(s.settings.music * 100)}"></div>
      <div class="row"><div>คุณภาพกราฟิก<div class="sub">ต่ำ = ลื่นกว่า</div></div>
        <div class="seg" id="sQ">${['low', 'medium', 'high'].map((k) => `<button data-v="${k}" class="${q === k ? 'on' : ''}">${QUALITY_TH[k]}</button>`).join('')}</div></div>
      <div class="row"><div>เวอร์ชัน<div class="sub">${this.h.version}${this.h.inIframe ? ' · ฝังใน iframe' : ''}</div></div><button class="small-btn" id="sUpd">เช็กอัปเดต</button></div>
      <div class="row" id="resetRow"><div>รีเซ็ตความคืบหน้า<div class="sub">ลบเงินและอัปเกรดทั้งหมด</div></div><button class="small-btn" id="sReset" style="background:var(--red)">รีเซ็ต</button></div>
      <button class="big-btn close" id="sClose">ปิด</button></div>`,
      'settings'
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
      row.querySelector('#rNo').addEventListener('click', () => { this.closeModal(); this.openSettings(); });
    });
    m.addEventListener('click', (e) => { if (e.target === m) this.closeModal(); }, { once: true });
  }

  showOffline(info) {
    this._open(
      `<div class="dlg"><h2>ยินดีต้อนรับกลับ!</h2>
      <div class="offline-meta">คุณไม่อยู่ ${E.fmtDuration(info.elapsed)}${info.capped ? `<br>(นับสูงสุด ${E.fmtDuration(info.counted)})` : ''}</div>
      <div class="offline-gain" id="offGain">+$0</div>
      <div class="offline-meta">โรงงานผลิตและเก็บได้ราว ${E.fmtNum(info.objects)} ชิ้น</div>
      <div class="note" style="text-align:center">รายได้ออฟไลน์คิดที่ ${Math.round(E.OFFLINE_EFFICIENCY * 100)}% ของปกติ · สะสมได้สูงสุด ${E.fmtDuration(info.cap)} (อัปเกรดความจุคลังเพื่อเพิ่ม)</div>
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
