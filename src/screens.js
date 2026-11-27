// XP windows: Flying Ball briefing, Profit Boost status, reward reveal, New Run dialog.
import * as E from './economy.js';
import { ballCanvas } from './sprites.js';
import { icon } from './icons.js';
import { XPButton, XPProgressBar, XPDialog, XPGroup, setProgress, esc } from './xp.js';

const RARITY = [
  [256, 'Legendary', 'r5'],
  [64, 'Epic', 'r4'],
  [16, 'Rare', 'r3'],
  [4, 'Good', 'r2'],
  [0, 'Common', 'r1'],
];
export const rarityOf = (m) => RARITY.find((r) => m >= r[0]);
const pct = (p) => (p * 100 >= 10 ? (p * 100).toFixed(0) : (p * 100).toFixed(1).replace(/\.0$/, '')) + '%';
const kv = (a, b, c = '') => `<div class="xpkv ${c}"><span>${a}</span><b>${b}</b></div>`;

export function probRows(highlight) {
  return E.rewardTable()
    .map((r) => {
      const ra = rarityOf(r.mult);
      return `<div class="pr ${ra[2]} ${highlight === r.mult ? 'win' : ''}"><b>x${r.mult}</b><i><u style="width:${Math.max(3, r.p * 100)}%"></u></i><span>${pct(r.p)}</span><em>${ra[1]}</em></div>`;
    })
    .join('');
}

const BOOST_S = () => E.ECON.mini.boostMinutes * 60;
const COOL_S = () => E.ECON.mini.cooldownMinutes * 60;

function statusBlock(st) {
  if (st.state === 'boost') return `<div class="xppanel mstat"><span>Profit Boost active</span><b>x${st.mult}</b><span class="xps">${rarityOf(st.mult)[1]} | ${E.fmtClock(st.remaining)} remaining</span></div>${XPProgressBar((st.remaining / BOOST_S()) * 100, '', { id: 'mBar' })}`;
  if (st.state === 'cooldown') return `<div class="xppanel mstat"><span>Cooldown</span><b id="mTime">${E.fmtClock(st.remaining)}</b><span class="xps">Next challenge unlocks when the timer ends.</span></div>${XPProgressBar((1 - st.remaining / COOL_S()) * 100, '', { id: 'mBar', cls: 'blue' })}`;
  return `<div class="xppanel mstat"><span>Ready</span><b>Play now!</b><span class="xps">Win to get a ${E.ECON.mini.boostMinutes}-minute profit multiplier.</span></div>`;
}

// ---------- Flying Ball window (briefing) ----------
export function openMini(ui, s, h) {
  const st = E.miniStatus(s);
  const obj = E.miniObjective(s);
  const ready = st.state === 'ready';
  const html = `<div class="xprow"><div class="xpico-lg" id="dBall"></div><div class="grow"><div class="xph">Flying Ball</div><div class="xps">Fly the ball through the crystal gates.</div></div></div>
    ${statusBlock(st)}
    ${XPGroup('Objective', `<div class="xpt">Fly through <b>${obj}</b> gates without crashing.</div>`)}
    ${kv('Best score', s.mini.best)}${kv('Plays / wins', `${s.mini.plays} / ${s.mini.wins}`)}
    <div class="xps">A failed attempt costs nothing and has no cooldown.</div>
    <div class="xp-btnrow">${XPButton({ id: 'mStart', label: ready ? 'Start' : 'Unavailable', def: ready, disabled: !ready, cls: 'touch green' })}${XPButton({ id: 'mBoost', label: 'Boost info', ico: 'boost', cls: 'touch' })}${XPButton({ id: 'mCloseDlg', label: 'Close', cls: 'touch' })}</div>`;
  const w = ui.wm.open({ id: 'mini', title: 'Flying Ball', icon: 'ball', width: 340, html, max: false });
  w.q('#dBall').appendChild(ballCanvas(1));
  w.q('#mCloseDlg').addEventListener('click', () => { h.onClick(); w.close(); });
  w.q('#mBoost').addEventListener('click', () => { h.onClick(); openBoost(ui, ui.state, h); });
  w.q('#mStart').addEventListener('click', () => { if (ready) h.onMiniStart(); });
  w._ready = ready;
}

// ---------- Profit Boost window ----------
export function openBoost(ui, s, h) {
  const st = E.miniStatus(s);
  const html = `<div class="xprow"><div class="xpico-lg">${icon('boost', 32)}</div><div class="grow"><div class="xph">Profit Boost</div><div class="xps">Multiplies coin income for a limited time.</div></div></div>
    ${statusBlock(st)}
    ${kv('Duration', E.ECON.mini.boostMinutes + ' min')}${kv('Cooldown after boost', E.ECON.mini.cooldownMinutes + ' min')}${kv('Next challenge', st.state === 'ready' ? `${E.miniObjective(s)} gates` : `${E.miniObjective(s)} gates (after timer)`)}
    ${XPGroup('Reward chances', `<div class="probs">${probRows(st.state === 'boost' ? st.mult : 0)}</div>`)}
    <div class="xps">A new multiplier replaces the old one. It does not apply to gems, upgrade prices or stage rewards.</div>
    <div class="xp-btnrow">${XPButton({ id: 'bPlay', label: 'Open Flying Ball', ico: 'ball', cls: 'touch' })}${XPButton({ id: 'bClose', label: 'Close', def: true, cls: 'touch' })}</div>`;
  const w = ui.wm.open({ id: 'boost', title: 'Profit Boost', icon: 'boost', width: 340, resize: true, minW: 300, minH: 260, html, max: false });
  w.q('#bClose').addEventListener('click', () => { h.onClick(); w.close(); });
  w.q('#bPlay').addEventListener('click', () => { h.onClick(); w.close(); openMini(ui, ui.state, h); });
  w._mode = st.state;
}

// live countdown while either window is open
export function tickMini(ui, s) {
  const st = E.miniStatus(s);
  for (const id of ['mini', 'boost']) {
    const w = ui.wm.get(id);
    if (!w || w.closed) continue;
    const mode = id === 'mini' ? (st.state === 'ready') : st.state;
    const prev = id === 'mini' ? w._ready : w._mode;
    if (mode !== prev) { (id === 'mini' ? openMini : openBoost)(ui, s, ui.h); continue; }
    const t = w.q('#mTime'); if (t) t.textContent = E.fmtClock(st.remaining);
    const bar = w.q('#mBar');
    if (bar && st.state === 'boost') setProgress(bar, (st.remaining / BOOST_S()) * 100);
    else if (bar && st.state === 'cooldown') setProgress(bar, (1 - st.remaining / COOL_S()) * 100);
  }
}

// ---------- reward reveal ----------
export function showReward(ui, res, h) {
  const tbl = E.rewardTable();
  const ra = rarityOf(res.mult);
  const html = `<div class="xprow"><div class="xpico-lg">${icon('trophy', 32)}</div><div class="grow"><div class="xph">Challenge complete!</div><div class="xps">Score ${res.score} / ${res.objective}</div></div></div>
    <div class="rv-slot"><b id="rvNum">x?</b></div>
    <div class="xph" id="rvRar" style="text-align:center">&nbsp;</div>
    <div class="xppanel mstat" id="rvBox" style="visibility:hidden"><span>Profit Boost</span><b>x${res.mult}</b><span class="xps">${E.ECON.mini.boostMinutes}:00 minutes | replaces any current boost</span></div>
    ${XPGroup('Reward chances', `<div class="probs" id="rvProbs">${probRows()}</div>`)}
    <div class="xp-btnrow center">${XPButton({ id: 'rvOk', label: 'Rolling...', disabled: true, cls: 'touch' })}</div>`;
  const w = ui.wm.open({ id: 'reward', title: 'Reward', icon: 'trophy', width: 330, html, modal: true, min: false, max: false, close: false, esc: false });
  const num = w.q('#rvNum');
  const seq = [];
  for (let i = 0; i < 16; i++) seq.push(tbl[Math.floor(Math.random() * tbl.length)].mult);
  let i = 0, delay = 60;
  const step = () => {
    if (w.closed) return;
    if (i < seq.length) {
      num.textContent = 'x' + seq[i++];
      num.classList.remove('tick'); void num.offsetWidth; num.classList.add('tick');
      h.onTick && h.onTick();
      delay *= 1.12;
      setTimeout(step, delay);
    } else {
      num.textContent = 'x' + res.mult;
      num.className = 'final ' + ra[2];
      const rr = w.q('#rvRar'); rr.textContent = ra[1]; rr.className = 'xph ' + ra[2];
      w.q('#rvBox').style.visibility = 'visible';
      w.q('#rvProbs').innerHTML = probRows(res.mult);
      const ok = w.q('#rvOk'); ok.disabled = false; ok.classList.add('def'); ok.querySelector('span').textContent = 'Start earning!';
      ok.focus({ preventScroll: true });
      ui.flash();
      h.onReveal && h.onReveal(res);
    }
  };
  setTimeout(step, 300);
  w.q('#rvOk').addEventListener('click', () => { h.onClick(); w.close(); });
}

// ---------- New Run dialog ----------
export function openNewRun(ui, s, pv, h) {
  const names = { pusherA: 'Piston A', rate: 'Coins/s', capacity: 'Capacity' };
  const boost = E.miniStatus(s);
  const tiers = Object.values(s.parts || {}).reduce((a, v) => a + v, 0);
  const html = `<div class="xprow"><div class="xpico-lg">${icon('flag', 32)}</div><div class="grow"><div class="xph">Start run ${pv.run}?</div><div class="xps">A milestone: bank this run as permanent upgrade points and start again stronger.</div></div></div>
    ${XPGroup(`What you achieved in run ${pv.prev.run}`, kv('Stage reached', pv.prev.stage) + kv('Money earned', E.fmtMoney(pv.prev.earned), 'money') + kv('Coins collected', E.fmtCash(Math.floor(pv.prev.coins))) + kv('Upgrades bought', s.runStats.upgrades || 0) + kv('Run milestones', (s.runMilestones || []).length) + kv('Best combo', 'x' + (s.runStats.bestCombo || 0)))}
    ${XPGroup('Next run benefits', kv('Starting cash', E.fmtMoney(pv.startCash), 'money') + kv('Upgrade points', `+${pv.pointsGain} (total ${pv.points})`) + kv('Permanent income', `x${pv.permMult.toFixed(2)}`) + kv('Machine part tiers', tiers + ' (kept)'))}
    ${XPGroup(`New costs (x${pv.priceMult.toFixed(2)})`, pv.prices.map((p) => kv(names[p.key], E.fmtMoney(p.cost))).join(''))}
    ${XPGroup('Kept permanently', `<div class="xpt">Your account and cloud save, gems (${Math.floor(s.gems)}), Machine Parts, missions in progress, collection items and equipped cosmetics, achievements (${s.perm.achievements.length}), best stage (${Math.max(s.perm.bestStage, s.stage)}), total earnings, statistics, settings and Flying Ball progress${boost.state === 'ready' ? '' : ' (boost and cooldown keep running)'}.</div>`)}
    ${XPGroup('Reset for the new run', '<div class="xpt">Cash, stage and stage progress, machine and core upgrade levels, branch upgrades (Economy, Automation, Special), the Cursor helper and run milestones. Nothing is deleted from your saves: the new run is saved like any other progress.</div>')}
    <div class="xp-btnrow">${XPButton({ id: 'nrGo', label: 'Start', def: true, cls: 'touch green' })}${XPButton({ id: 'nrNo', label: 'Cancel', cls: 'touch' })}</div>`;
  const w = ui.wm.open({ id: 'newrun', title: 'New Run', icon: 'flag', width: 360, html, modal: true, min: false, max: false });
  w.q('#nrNo').addEventListener('click', () => { h.onClick(); w.close(); });
  w.q('#nrGo').addEventListener('click', () => { w.close(true); h.onNewRun(); });
}
