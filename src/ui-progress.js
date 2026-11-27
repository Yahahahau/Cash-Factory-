// Expansion windows (XP Luna style): Upgrade Shop (4 branches + Machine Parts), Goals (missions, milestones,
// achievements), Collection, Stage Map. Every window re-renders only when what it shows changed (signature) and uses
// event delegation, so a re-render never loses a click.
import * as E from './economy.js';
import * as P from './progression.js';
import { EXTRA, EXTRA_IDS, BRANCHES, PARTS, PART_IDS, TIERS, TIER_COLOR, MILESTONES, COSMETICS, COSMETIC_CATS, NEWRUN_STAGE, NEWRUN_MILESTONES } from './content.js';
import { THEMES, themeFor } from './scene/themes.js';
import { icon } from './icons.js';
import { XPButton, XPProgressBar, esc } from './xp.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const money = (n) => '$' + E.fmtCash(n);
const bar = (v, max) => XPProgressBar(Math.min(100, (v / Math.max(1, max)) * 100), '', { cls: 'blue thin' });
const MACHINE_ICON = { pusher: 'piston', conveyor: 'conveyor', blower: 'fan', magnet: 'magnet', launcher: 'launcher' };

// ---------- generic tabbed, self-refreshing window ----------
function tabbed(ui, id, title, ico, tabs, start, width = 380) {
  let sel = Math.min(start || 0, tabs.length - 1), sig = '';
  const w = ui.wm.open({ id, title, icon: ico, width, resize: true, minW: 290, minH: 260, height: 'min(600px, calc(100% - 8px))', max: true, replace: true,
    html: `<div class="xptabs pg"><div class="xptabbar" role="tablist">${tabs.map((t, i) => `<button class="xptab" role="tab" data-i="${i}">${t.label}</button>`).join('')}</div><div class="xptabpane pg-pane" role="tabpanel"></div></div>` });
  const pane = w.q('.pg-pane');
  const btns = [...w.body.querySelectorAll('.xptab')];
  const render = (force) => {
    if (w.closed) return;
    const t = tabs[sel];
    const html = t.html();
    if (!force && html === sig) return;
    sig = html;
    const st = pane.scrollTop;
    pane.innerHTML = `<div class="pane">${html}</div>`;
    pane.scrollTop = st;
  };
  const select = (i) => { sel = i; btns.forEach((b, k) => { b.classList.toggle('sel', k === i); b.setAttribute('aria-selected', String(k === i)); }); pane.scrollTop = 0; render(true); };
  w.body.querySelector('.xptabbar').addEventListener('click', (e) => { const b = e.target.closest('.xptab'); if (b) { ui.h.onClick(); select(+b.dataset.i); } });
  pane.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    ui.h.onProgress(b.dataset.act, b.dataset.k);
    render(true);
  });
  w.refresh = () => render(false);
  select(sel);
  return w;
}

// ---------- Upgrade Shop ----------
function row({ ico, color, name, lvl, sub, fx, btn, locked }) {
  return `<div class="pg-row${locked ? ' locked' : ''}"><div class="pg-ico"${color ? ` style="--tc:${hex(color)}"` : ''}>${icon(ico, 28)}</div><div class="pg-main"><div class="pg-name">${esc(name)}${lvl ? ` <span class="pg-lv">${lvl}</span>` : ''}</div><div class="pg-sub">${sub}</div>${fx ? `<div class="pg-fx">${fx}</div>` : ''}</div><div class="pg-act">${btn}</div></div>`;
}
const buyBtn = (act, k, label, can, disabled) => `<button class="xpbtn touch${can ? ' money def' : ''}" data-act="${act}" data-k="${k}"${disabled ? ' disabled' : ''}>${label}</button>`;

function branchHtml(s, id) {
  const b = BRANCHES.find((x) => x.id === id);
  let rows = '';
  if (id === 'machine') {
    for (const k of E.MACHINE_IDS) {
      const i = E.upgradeInfo(s, k), t = E.MACHINES[k].type;
      rows += row({ ico: MACHINE_ICON[t], name: i.name, lvl: `Lv ${i.lvl}/${i.max}`, sub: esc(i.title), fx: E.effectText(s, k), btn: i.atMax ? '<span class="pg-max">MAX</span>' : buyBtn('buy', k, money(i.cost), i.canBuy, !i.canBuy) });
    }
  } else {
    if (id === 'economy') for (const k of Object.keys(E.GLOBALS)) {
      const i = E.upgradeInfo(s, k);
      rows += row({ ico: k === 'rate' ? 'coin' : k === 'capacity' ? 'box' : 'gem', name: i.name, lvl: `Lv ${i.lvl}/${i.max}`, sub: 'Core upgrade', fx: E.effectText(s, k), btn: i.atMax ? '<span class="pg-max">MAX</span>' : buyBtn('buy', k, money(i.cost), i.canBuy, !i.canBuy) });
    }
    if (id === 'automation') {
      const c = E.cursorInfo(s);
      rows += row({ ico: 'mouse', name: 'Cursor Auto Push Coin', lvl: c.owned ? 'Owned' : '', sub: 'Frees coins that get stuck', fx: c.owned ? (c.on ? 'Running' : 'Switched off (Start menu)') : 'A helper cursor pokes stuck coins loose', btn: c.owned ? '<span class="pg-max">OWNED</span>' : buyBtn('cursor', '', money(c.cost), c.canBuy, !c.canBuy) });
    }
    for (const k of EXTRA_IDS.filter((x) => EXTRA[x].branch === id)) {
      const i = P.extraInfo(s, k);
      if (!i.unlocked) { rows += row({ ico: i.icon, name: i.name, sub: esc(i.info), fx: `Unlocks on stage ${i.unlock}`, btn: `<span class="pg-lock">${icon('warn', 14)} Stage ${i.unlock}</span>`, locked: true }); continue; }
      rows += row({ ico: i.icon, name: i.name, lvl: `Lv ${i.lvl}/${i.max}`, sub: esc(i.info), fx: i.atMax ? 'Maximum level' : P.extraEffect(s, k), btn: i.atMax ? '<span class="pg-max">MAX</span>' : buyBtn('extra', k, money(i.cost), i.canBuy, !i.canBuy) });
    }
  }
  return `<div class="pg-head">${icon(b.icon, 20)}<span>${esc(b.info)}</span></div>${rows}<div class="pg-foot">Cash ${money(s.cash)} · branch upgrades reset on New Run</div>`;
}
function partsHtml(s) {
  let rows = '';
  for (const k of PART_IDS) {
    const i = P.partInfo(s, k);
    const pips = TIERS.slice(1).map((_, t) => `<i style="background:${t < i.tier ? hex(TIER_COLOR[t + 1]) : 'transparent'}"></i>`).join('');
    const btn = i.atMax ? '<span class="pg-max">MAX</span>' : !i.unlocked ? `<span class="pg-lock">${icon('warn', 14)} Best stage ${i.need}</span>` : buyBtn('part', k, `${icon('gem', 14)} ${i.cost}`, i.canBuy, !i.canBuy);
    rows += row({ ico: i.icon, color: TIER_COLOR[i.tier], name: i.name, lvl: i.tierName, sub: `${esc(i.info)}<div class="pg-pips">${pips}</div>`, fx: `${esc(i.look)} turn ${i.atMax ? TIERS[i.tier] : (i.next + ' at the next tier')}`, btn, locked: !i.atMax && !i.unlocked });
  }
  return `<div class="pg-head">${icon('gear', 20)}<span>Permanent: kept on New Run. Paid with gems, unlocked by your best stage ever. Each tier is visible on the machine.</span></div>${rows}<div class="pg-foot">${icon('gem', 14)} ${Math.floor(s.gems)} gems · best stage ${Math.max(s.perm.bestStage, s.stage)}</div>`;
}
export function openShop(ui, tab = 1) {
  const s = () => ui.state;
  const tabs = BRANCHES.map((b) => ({ label: b.name, html: () => branchHtml(s(), b.id) }));
  tabs.push({ label: 'Machine Parts', html: () => partsHtml(s()) });
  return tabbed(ui, 'shop', 'Upgrade Shop', 'gear', tabs, tab, 400);
}

// ---------- Goals ----------
function missionsHtml(s) {
  P.ensureMissions(s);
  const rows = s.missions.active.map((m) => {
    const p = P.missionProgress(s, m);
    const fmt = m.kind === 'earn' ? money : (n) => E.fmtCash(Math.floor(n));
    return `<div class="pg-mis${p.done ? ' done' : ''}"><div class="pg-name">${esc(p.text)}</div>${bar(p.value, m.target)}<div class="pg-mrow"><span>${fmt(p.value)} / ${fmt(m.target)}</span><span class="pg-rew">${icon('gem', 14)} ${m.reward}</span>
      ${p.done ? `<button class="xpbtn touch money def" data-act="claim" data-k="${m.id}">Claim</button>` : `<button class="xpbtn touch" data-act="reroll" data-k="${m.id}" title="Swap for another mission (1 gem)"${s.gems < 1 ? ' disabled' : ''}>Swap ${icon('gem', 12)}1</button>`}</div></div>`;
  }).join('');
  return `<div class="pg-head">${icon('check', 20)}<span>Three missions at a time. Claim them for gems (used for Machine Parts). Missions are kept on New Run.</span></div>${rows}<div class="pg-foot">Missions completed: ${s.stats.missionsDone}</div>`;
}
function milestonesHtml(s) {
  const done = s.runMilestones.length, nr = E.newRunNeeds(s);
  const rows = MILESTONES.map((m) => {
    const ok = s.runMilestones.includes(m.id);
    const rew = [m.cash ? money(m.cash) : '', m.gems ? `${icon('gem', 12)} ${m.gems}` : ''].filter(Boolean).join(' + ');
    return `<div class="pg-mile${ok ? ' done' : ''}"><span class="pg-chk">${ok ? icon('check', 14) : ''}</span><span class="grow">${esc(m.name)}</span><span class="pg-rew">${rew}</span></div>`;
  }).join('');
  return `<div class="pg-head">${icon('flag', 20)}<span>Run milestones pay out automatically. New Run needs stage ${NEWRUN_STAGE} and ${NEWRUN_MILESTONES} milestones.</span></div>
    <div class="pg-need"><b>New Run:</b> stage ${s.stage}/${nr.stage} ${nr.stageOk ? icon('check', 12) : ''} · milestones ${done}/${nr.milestones} ${done >= nr.milestones ? icon('check', 12) : ''}</div>${bar(done, MILESTONES.length)}${rows}`;
}
function achievementsHtml(s) {
  const rows = Object.entries(E.ACHIEVEMENTS).map(([id, a]) => {
    const ok = s.perm.achievements.includes(id), c = E.ACH_COSMETIC[id];
    return `<div class="pg-mile${ok ? ' done' : ''}"><span class="pg-chk">${ok ? icon('trophy', 14) : ''}</span><span class="grow">${esc(a.name)}</span><span class="pg-rew">${c ? esc(COSMETICS[c].name) : ''}</span></div>`;
  }).join('');
  return `<div class="pg-head">${icon('trophy', 20)}<span>Long-term goals. Most unlock a collection item.</span></div>${rows}<div class="pg-foot">${s.perm.achievements.length} / ${Object.keys(E.ACHIEVEMENTS).length} unlocked</div>`;
}
export function openGoals(ui, tab = 0) {
  const s = () => ui.state;
  return tabbed(ui, 'goals', 'Goals', 'check', [
    { label: 'Missions', html: () => missionsHtml(s()) },
    { label: 'Milestones', html: () => milestonesHtml(s()) },
    { label: 'Achievements', html: () => achievementsHtml(s()) },
  ], tab, 360);
}

// ---------- Collection (cosmetic only) ----------
function collectionHtml(s, cat) {
  const ids = Object.keys(COSMETICS).filter((k) => COSMETICS[k].cat === cat);
  const cur = P.equipped(s, cat);
  const cards = ids.map((k) => {
    const c = COSMETICS[k], own = P.owned(s, k);
    const sw = c.color != null ? `<i style="background:${hex(c.color)}"></i>` : c.colors.map((x) => `<i style="background:${hex(x)}"></i>`).join('');
    return `<button class="pg-cos${own ? '' : ' locked'}${k === cur ? ' sel' : ''}" data-act="equip" data-k="${k}"${own ? '' : ' disabled'}><span class="pg-sw">${sw}</span><b>${esc(c.name)}</b><small>${own ? (k === cur ? 'Equipped' : 'Tap to equip') : esc(c.how)}</small></button>`;
  }).join('');
  const n = ids.filter((k) => P.owned(s, k)).length;
  return `<div class="pg-head">${icon('folder', 20)}<span>Cosmetic only: changes how the machine looks, never the economy. ${n} / ${ids.length} collected.</span></div><div class="pg-cosgrid">${cards}</div>`;
}
export function openCollection(ui) {
  const s = () => ui.state;
  return tabbed(ui, 'collect', 'Collection', 'folder', Object.entries(COSMETIC_CATS).map(([cat, label]) => ({ label, html: () => collectionHtml(s(), cat) })), 0, 360);
}

// ---------- Stage Map (overview of the run; stages are played in order) ----------
function stageMapHtml(s) {
  const last = Math.max(12, s.stage + 2);
  let rows = '';
  for (let n = 1; n <= last; n++) {
    const th = themeFor(n), r = E.stageReward(n);
    const opens = [...EXTRA_IDS.filter((k) => EXTRA[k].unlock === n).map((k) => EXTRA[k].name),
      ...PART_IDS.flatMap((k) => PARTS[k].unlock.map((u, t) => (u === n ? `${PARTS[k].name} ${TIERS[t + 1]}` : null)).filter(Boolean))];
    if (n === NEWRUN_STAGE) opens.push('New Run');
    const state = n < s.stage ? 'done' : n === s.stage ? 'cur' : 'next';
    rows += `<div class="pg-stage ${state}" style="--th:${hex(th.bg.mid)};--te:${hex(th.bg.edge)}"><div class="pg-sn">${n}</div><div class="grow"><div class="pg-name">${esc(th.name)}${state === 'cur' ? ' <span class="pg-lv">You are here</span>' : ''}</div>
      <div class="pg-sub">${E.fmtCash(E.stageTarget(n))} coins · value x${E.stageValueMult(n).toFixed(2)} · reward ${money(r.cash)} + ${r.gems} gems</div>${opens.length ? `<div class="pg-fx">Unlocks: ${esc(opens.join(', '))}</div>` : ''}</div></div>`;
  }
  return `<div class="pg-head">${icon('flag', 20)}<span>Stages are played in order; each has its own machine layout, theme and unlocks. ${THEMES.length} themes cycle after stage ${THEMES.length}.</span></div>${rows}`;
}
export function openStageMap(ui) {
  const s = () => ui.state;
  return tabbed(ui, 'stagemap', 'Stage Map', 'flag', [{ label: 'This run', html: () => stageMapHtml(s()) }], 0, 360);
}

export function refreshProgress(ui) {
  for (const id of ['shop', 'goals', 'collect', 'stagemap']) { const w = ui.wm.has(id) ? ui.wm.get(id) : null; if (w && w.refresh) w.refresh(); }
}
// Start-menu entries for the expansion
export function progressMenu(ui) {
  const s = ui.state;
  const claim = P.claimableMissions(s);
  const buyable = P.buyOptions(s).filter((o) => o.cur === 'gems' && s.gems >= o.cost).length;
  return [
    { key: 'shop', icon: 'gear', label: 'Upgrade Shop', sub: buyable ? `${buyable} part upgrade${buyable > 1 ? 's' : ''} ready` : 'Branches + Machine Parts', run: () => openShop(ui) },
    { key: 'goals', icon: 'check', label: 'Goals', sub: claim ? `${claim} mission${claim > 1 ? 's' : ''} to claim` : `Milestones ${s.runMilestones.length}/${MILESTONES.length}`, run: () => openGoals(ui, 0) },
    { key: 'collect', icon: 'folder', label: 'Collection', sub: 'Cosmetics', run: () => openCollection(ui) },
    { key: 'stagemap', icon: 'flag', label: 'Stage Map', sub: 'Stage ' + s.stage, run: () => openStageMap(ui) },
  ];
}
