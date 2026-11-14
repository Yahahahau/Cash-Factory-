// Pixel-art screens: Flying Ball briefing, reward reveal, New Run. All plain DOM built on the nine-slice skins.
import * as E from './economy.js';
import { ballCanvas } from './sprites.js';

const RARITY = [
  [256, 'ตำนาน', 'r5'],
  [64, 'มหากาพย์', 'r4'],
  [16, 'หายาก', 'r3'],
  [4, 'ดี', 'r2'],
  [0, 'ธรรมดา', 'r1'],
];
export const rarityOf = (m) => RARITY.find((r) => m >= r[0]);
const pct = (p) => (p * 100 >= 10 ? (p * 100).toFixed(0) : (p * 100).toFixed(1).replace(/\.0$/, '')) + '%';

export function probRows(highlight) {
  return E.rewardTable()
    .map((r) => {
      const ra = rarityOf(r.mult);
      return `<div class="pr ${ra[2]} ${highlight === r.mult ? 'win' : ''}"><b>×${r.mult}</b><i><u style="width:${Math.max(3, r.p * 100)}%"></u></i><span>${pct(r.p)}</span><em>${ra[1]}</em></div>`;
    })
    .join('');
}

// ---------- Flying Ball briefing ----------
export function openMini(ui, s, h) {
  const st = E.miniStatus(s);
  const obj = E.miniObjective(s);
  const ready = st.state === 'ready';
  let status;
  if (st.state === 'boost') status = `<div class="mstat boost">PROFIT BOOST ×${st.mult}<br><b id="mTime">${E.fmtClock(st.remaining)}</b><small>เหลือเวลาบูสต์ · หลังหมดเวลารอ ${E.ECON.mini.cooldownMinutes} นาที</small></div>`;
  else if (st.state === 'cooldown') status = `<div class="mstat cool">คูลดาวน์<br><b id="mTime">${E.fmtClock(st.remaining)}</b><small>รอครบเวลาเพื่อเล่นรอบรางวัลอีกครั้ง</small></div>`;
  else status = `<div class="mstat ready">พร้อมเล่น!<small>สำเร็จ = ตัวคูณกำไร ${E.ECON.mini.boostMinutes} นาที</small></div>`;
  ui._open(
    `<div class="dlg pxd"><div class="dlg-ball" id="dBall"></div><h2>FLYING BALL</h2>
    ${status}
    <div class="obj"><span>ภารกิจ</span><b>บินผ่านประตู ${obj} บาน</b></div>
    <div class="sec-title">โอกาสได้ตัวคูณ (สุ่มเมื่อสำเร็จ)</div>
    <div class="probs">${probRows()}</div>
    <div class="note">ตัวคูณใหม่แทนที่ของเดิม ไม่ซ้อนกัน · ไม่คูณเพชร ราคาอัปเกรด หรือรางวัลผ่านด่าน · เล่นไม่สำเร็จไม่เสียอะไรและไม่มีคูลดาวน์</div>
    <div class="kv"><span>คะแนนสูงสุด</span><b>${s.mini.best}</b></div>
    <div class="kv"><span>เล่น / สำเร็จ</span><b>${s.mini.plays} / ${s.mini.wins}</b></div>
    <button class="big-btn ${ready ? '' : 'off'}" id="mStart" ${ready ? '' : 'disabled'}>${ready ? 'เริ่มเล่น' : 'ยังเล่นไม่ได้'}</button>
    <button class="big-btn grey" id="mCloseDlg">ปิด</button></div>`,
    'mini'
  );
  const m = ui.el.modal;
  m.querySelector('#dBall').appendChild(ballCanvas(1));
  m.querySelector('#mCloseDlg').addEventListener('click', () => { h.onClick(); ui.closeModal(); });
  m.querySelector('#mStart').addEventListener('click', () => { if (ready) h.onMiniStart(); });
  m.addEventListener('click', (e) => { if (e.target === m) ui.closeModal(); }, { once: true });
}

// live countdown while the briefing is open
export function tickMini(ui, s) {
  if (ui.modalOpen !== 'mini') return;
  const el = ui.el.modal.querySelector('#mTime');
  if (!el) return;
  const st = E.miniStatus(s);
  if (st.state === 'ready') { openMini(ui, s, ui.h); return; }
  el.textContent = E.fmtClock(st.remaining);
}

// ---------- reward reveal ----------
export function showReward(ui, res, h) {
  const tbl = E.rewardTable();
  const ra = rarityOf(res.mult);
  ui._open(
    `<div class="dlg pxd rv"><h2>ภารกิจสำเร็จ!</h2>
    <div class="rv-sub">คะแนน ${res.score} / ${res.objective}</div>
    <div class="rv-slot"><b id="rvNum">×?</b></div>
    <div class="rv-rar" id="rvRar">&nbsp;</div>
    <div class="rv-box" id="rvBox" style="visibility:hidden">
      <div class="rv-boost">PROFIT BOOST ×${res.mult}</div>
      <div class="rv-time">${E.ECON.mini.boostMinutes}:00 นาที</div>
      <div class="note" style="text-align:center">รายได้เหรียญคูณ ${res.mult} · แทนที่ตัวคูณเดิม</div>
    </div>
    <div class="sec-title">โอกาสของแต่ละระดับ</div>
    <div class="probs" id="rvProbs">${probRows()}</div>
    <button class="big-btn off" id="rvOk" disabled>กำลังสุ่ม…</button></div>`,
    'reward'
  );
  const m = ui.el.modal;
  const num = m.querySelector('#rvNum');
  const seq = [];
  for (let i = 0; i < 16; i++) seq.push(tbl[Math.floor(Math.random() * tbl.length)].mult);
  let i = 0, delay = 60;
  const step = () => {
    if (ui.modalOpen !== 'reward') return;
    if (i < seq.length) {
      num.textContent = '×' + seq[i++];
      num.classList.remove('tick'); void num.offsetWidth; num.classList.add('tick');
      h.onTick && h.onTick();
      delay *= 1.12;
      setTimeout(step, delay);
    } else {
      num.textContent = '×' + res.mult;
      num.className = 'final ' + ra[2];
      m.querySelector('#rvRar').textContent = ra[1];
      m.querySelector('#rvRar').className = 'rv-rar ' + ra[2];
      m.querySelector('#rvBox').style.visibility = 'visible';
      m.querySelector('#rvProbs').innerHTML = probRows(res.mult);
      const ok = m.querySelector('#rvOk');
      ok.disabled = false; ok.className = 'big-btn'; ok.textContent = 'เยี่ยม! เริ่มรับกำไร';
      ui.flash();
      h.onReveal && h.onReveal(res);
    }
  };
  setTimeout(step, 300);
  m.querySelector('#rvOk').addEventListener('click', () => { h.onClick(); ui.closeModal(); });
}

// ---------- New Run ----------
export function openNewRun(ui, s, pv, h) {
  const rows = (a) => a.map((r) => `<div class="kv"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
  const names = { pusherA: 'ลูกสูบ A', rate: 'เหรียญ/วิ', capacity: 'ความจุ' };
  const boost = E.miniStatus(s);
  ui._open(
    `<div class="dlg pxd"><h2>รันที่ ${pv.run}</h2>
    <div class="sec-title">ผลรันที่แล้ว (รัน ${pv.prev.run})</div>
    ${rows([['ด่านที่ไปถึง', pv.prev.stage], ['เงินที่หาได้', E.fmtMoney(pv.prev.earned)], ['เหรียญที่เก็บ', E.fmtCash(Math.floor(pv.prev.coins))]])}
    <div class="sec-title">รางวัลเริ่มรันใหม่</div>
    ${rows([['เงินเริ่มต้น', E.fmtMoney(pv.startCash)], ['แต้มอัปเกรดถาวร', `+${pv.pointsGain} (รวม ${pv.points})`], ['รายได้ถาวร', `×${pv.permMult.toFixed(2)}`]])}
    <div class="sec-title">ราคาอัปเกรดรันใหม่ (×${pv.priceMult.toFixed(2)})</div>
    ${rows(pv.prices.map((p) => [names[p.key], E.fmtMoney(p.cost)]))}
    <div class="sec-title">เก็บไว้ถาวร</div>
    <div class="note">เพชร ${Math.floor(s.gems)} · ด่านสูงสุด ${Math.max(s.perm.bestStage, s.stage)} · รายได้รวม ${E.fmtMoney(s.stats.totalEarned)} · จบรัน ${s.perm.runsCompleted + 1} ครั้ง · ความสำเร็จ ${s.perm.achievements.length} รายการ · การตั้งค่า · สถิติและเวลา Flying Ball${boost.state === 'ready' ? '' : ' (บูสต์/คูลดาวน์เดินต่อ)'}</div>
    <div class="sec-title">รีเซ็ต</div>
    <div class="note">ระดับอัปเกรด ด่าน ความคืบหน้า และเงินของรันนี้ จะกลับไปเริ่มต้นใหม่</div>
    <button class="big-btn" id="nrGo">เริ่มรันใหม่</button>
    <button class="big-btn grey" id="nrNo">ยกเลิก</button></div>`,
    'newrun'
  );
  const m = ui.el.modal;
  m.querySelector('#nrNo').addEventListener('click', () => { h.onClick(); ui.closeModal(); });
  m.querySelector('#nrGo').addEventListener('click', () => { ui.closeModal(); h.onNewRun(); });
}
