// Expansion logic (pure, no DOM): branch upgrades, machine parts, missions, run milestones, collections.
// Shared by the game, the UI, the progression simulator and the tests.
import * as E from './economy.js';
import { EXTRA, EXTRA_IDS, PARTS, PART_IDS, TIERS, MILESTONES, MISSION_KINDS, COSMETICS, DEFAULT_EQUIP, feederInterval, xl, pt } from './content.js';
export { feederInterval };

// ---------------- branch upgrades ----------------
export function extraCost(s, k, lvl = xl(s, k)) {
  const d = EXTRA[k];
  return Math.ceil(d.base * Math.pow(d.growth, lvl) * E.priceMult(s));
}
export function extraUnlocked(s, k) { return s.stage >= EXTRA[k].unlock; }
export function extraInfo(s, k) {
  const d = EXTRA[k], lvl = xl(s, k), cost = extraCost(s, k, lvl), atMax = lvl >= d.max, unlocked = extraUnlocked(s, k);
  return { key: k, ...d, lvl, cost, atMax, unlocked, canBuy: unlocked && !atMax && s.cash >= cost };
}
export function buyExtra(s, k) {
  const i = extraInfo(s, k);
  if (!i.canBuy) return false;
  s.cash -= i.cost;
  s.xlv[k] = i.lvl + 1;
  s.stats.upgradesBought += 1;
  s.runStats.upgrades = (s.runStats.upgrades || 0) + 1;
  E.refreshTier(s);
  return true;
}
// what the next level of a branch upgrade changes
export function extraEffect(s, k) {
  const L = xl(s, k), n = L + 1;
  const pct = (v) => Math.round(v * 100) + '%';
  switch (k) {
    case 'polish': return `Coin value +${pct(0.05 * L)} → +${pct(0.05 * n)}`;
    case 'bounty': return `Stage cash +${pct(0.15 * L)} → +${pct(0.15 * n)}, gems +${Math.floor(L / 2)} → +${Math.floor(n / 2)}`;
    case 'feeder': return L ? `Auto drop every ${feederInterval(L).toFixed(1)} s → ${feederInterval(n).toFixed(1)} s` : `Activates: auto drop every ${feederInterval(1).toFixed(1)} s`;
    case 'vault': return `Offline limit +${L} h → +${n} h, efficiency ${pct(E.OFFLINE_EFFICIENCY + 0.04 * L)} → ${pct(E.OFFLINE_EFFICIENCY + 0.04 * n)}`;
    case 'combo': return `Combo window ${(2.5 + 0.4 * L).toFixed(1)} s → ${(2.5 + 0.4 * n).toFixed(1)} s, cap +${pct(0.1 * L)} → +${pct(0.1 * n)}`;
    case 'golden': return `Golden coins ${(1.5 * L).toFixed(1)}% → ${(1.5 * n).toFixed(1)}% (x${E.GOLDEN_MULT} value)`;
    case 'resonance': return `Coins +${3 * L}% → +${3 * n}% per stage cleared (now ${s.stage - 1})`;
    default: return '';
  }
}

// ---------------- machine parts (permanent, gems) ----------------
export function partInfo(s, k) {
  const d = PARTS[k], tier = pt(s, k), max = d.unlock.length, atMax = tier >= max;
  const need = atMax ? 0 : d.unlock[tier], cost = atMax ? 0 : d.gems[tier];
  const best = Math.max(s.perm.bestStage, s.stage);
  const unlocked = !atMax && best >= need;
  return { key: k, ...d, tier, tierName: TIERS[tier], next: atMax ? null : TIERS[tier + 1], max, atMax, need, cost, unlocked, canBuy: unlocked && s.gems >= cost };
}
export function buyPart(s, k) {
  const i = partInfo(s, k);
  if (!i.canBuy) return false;
  s.gems -= i.cost;
  s.parts[k] = i.tier + 1;
  s.stats.partsUpgraded += 1;
  return true;
}
export function partTiersTotal(s) { return PART_IDS.reduce((a, k) => a + pt(s, k), 0); }

// ---------------- run milestones (automatic) ----------------
export function checkMilestones(s) {
  const done = [];
  for (const m of MILESTONES) {
    if (s.runMilestones.includes(m.id) || !m.test(s)) continue;
    s.runMilestones.push(m.id);
    s.cash += m.cash; s.gems += m.gems;
    s.stats.totalEarned += m.cash; s.runStats.earned += m.cash;
    done.push(m);
  }
  if (done.length) E.refreshTier(s);
  return done;
}
export function nextMilestone(s) { return MILESTONES.find((m) => !s.runMilestones.includes(m.id)) || null; }

// ---------------- missions (3 at a time, claimed for gems) ----------------
const KIND_ORDER = ['coins', 'buy', 'earn', 'stage', 'drops', 'parts', 'coins', 'fly', 'buy', 'earn'];
function makeMission(s) {
  const q = s.missions.seq++;
  let kind = KIND_ORDER[q % KIND_ORDER.length];
  const K = MISSION_KINDS;
  const taken = new Set(s.missions.active.map((m) => m.kind));
  for (let i = 0; i < KIND_ORDER.length && (taken.has(kind) || (K[kind].needs && !K[kind].needs(s))); i++) kind = KIND_ORDER[(q + i + 1) % KIND_ORDER.length];
  let target = K[kind].size ? K[kind].size(q) : 0;
  if (kind === 'earn') { // about two minutes of current income, rounded to a friendly number
    const v = Math.max(200, E.incomePerSec(s) * E.permMult(s) * 120);
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    target = Math.ceil(v / mag) * mag;
  }
  const reward = 3 + Math.min(12, Math.floor(q / 3)) + (kind === 'fly' || kind === 'parts' ? 3 : 0);
  return { id: 'q' + q, kind, target, base: K[kind].stat(s), reward };
}
export function ensureMissions(s) {
  s.missions.active = s.missions.active.filter((m) => MISSION_KINDS[m.kind]);
  while (s.missions.active.length < 3) s.missions.active.push(makeMission(s));
}
export function missionProgress(s, m) {
  const v = Math.max(0, MISSION_KINDS[m.kind].stat(s) - m.base);
  return { value: Math.min(v, m.target), done: v >= m.target, text: MISSION_KINDS[m.kind].text(m.target) };
}
export function claimMission(s, id) {
  const i = s.missions.active.findIndex((m) => m.id === id);
  if (i < 0) return null;
  const m = s.missions.active[i];
  if (!missionProgress(s, m).done) return null;
  s.gems += m.reward;
  s.stats.missionsDone += 1;
  s.missions.active.splice(i, 1, makeMission(s));
  return m;
}
export function claimableMissions(s) { return s.missions.active.filter((m) => missionProgress(s, m).done).length; }
// a mission that stays out of reach (e.g. Flying Ball while it is on cooldown) can be swapped for 1 gem
export function rerollMission(s, id) {
  const i = s.missions.active.findIndex((m) => m.id === id);
  if (i < 0 || s.gems < 1) return false;
  s.gems -= 1;
  s.missions.active.splice(i, 1);
  s.missions.active.splice(i, 0, makeMission(s));
  return true;
}

// ---------------- collections (cosmetic only) ----------------
export function owned(s, id) { return DEFAULT_EQUIP[COSMETICS[id].cat] === id || s.perm.cosmetics.includes(id); }
export function equip(s, id) {
  if (!COSMETICS[id] || !owned(s, id)) return false;
  s.perm.equip[COSMETICS[id].cat] = id;
  return true;
}
export function equipped(s, cat) {
  const id = s.perm.equip && s.perm.equip[cat];
  return COSMETICS[id] && owned(s, id) ? id : DEFAULT_EQUIP[cat];
}

// ---------------- one list of everything buyable (UI badge counts, simulator) ----------------
export function buyOptions(s) {
  const out = [];
  for (const k of [...Object.keys(E.GLOBALS), ...E.MACHINE_IDS]) {
    const i = E.upgradeInfo(s, k);
    if (!i.atMax) out.push({ key: k, cost: i.cost, cur: 'cash', buy: () => E.buyUpgrade(s, k), first: i.lvl === 0 && i.isMachine });
  }
  for (const k of EXTRA_IDS) {
    const i = extraInfo(s, k);
    if (i.unlocked && !i.atMax) out.push({ key: k, cost: i.cost, cur: 'cash', buy: () => buyExtra(s, k), first: i.lvl === 0 });
  }
  const c = E.cursorInfo(s);
  if (!c.owned) out.push({ key: 'cursor', cost: c.cost, cur: 'cash', buy: () => E.buyCursor(s), first: true });
  for (const k of PART_IDS) {
    const i = partInfo(s, k);
    if (i.unlocked) out.push({ key: 'part:' + k, cost: i.cost, cur: 'gems', buy: () => buyPart(s, k), first: true });
  }
  return out;
}

// ---------------- save migration helpers (used by save.js) ----------------
export function sanitizeExpansion(s, raw) {
  const n = (v, max) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
  const xr = raw.xlv || {};
  for (const k of EXTRA_IDS) s.xlv[k] = n(xr[k], EXTRA[k].max);
  const pr = raw.parts || {};
  for (const k of PART_IDS) s.parts[k] = n(pr[k], PARTS[k].unlock.length);
  const ms = raw.missions || {};
  s.missions.seq = n(ms.seq, 1e6);
  s.missions.active = Array.isArray(ms.active) ? ms.active.filter((m) => m && MISSION_KINDS[m.kind] && typeof m.id === 'string').slice(0, 3)
    .map((m) => ({ id: m.id.slice(0, 12), kind: m.kind, target: Math.max(1, n(m.target, 1e15)), base: typeof m.base === 'number' && isFinite(m.base) ? m.base : 0, reward: Math.max(1, n(m.reward, 50)) })) : [];
  const ids = new Set(MILESTONES.map((m) => m.id));
  s.runMilestones = Array.isArray(raw.runMilestones) ? [...new Set(raw.runMilestones.filter((x) => ids.has(x)))] : [];
  const eq = (raw.perm && raw.perm.equip) || {};
  s.perm.equip = { ...DEFAULT_EQUIP };
  for (const c of Object.keys(DEFAULT_EQUIP)) if (COSMETICS[eq[c]] && COSMETICS[eq[c]].cat === c) s.perm.equip[c] = eq[c];
  const rs = raw.runStats || {};
  s.runStats.upgrades = n(rs.upgrades, 1e9);
  s.runStats.bestCombo = n(rs.bestCombo, 1e9);
  // a save from before the expansion: grant the milestones the run already passed, silently and without rewards
  if (!Array.isArray(raw.runMilestones)) for (const m of MILESTONES) if (m.test(s)) s.runMilestones.push(m.id);
  return s;
}
