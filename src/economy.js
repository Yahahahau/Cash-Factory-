// Pure economy logic (no DOM / three). Shared by the game, the simulator and tests.
import { EXTRA_IDS, PART_IDS, NEWRUN_STAGE, NEWRUN_MILESTONES, DEFAULT_EQUIP, feederInterval, xl, pt } from './content.js';
// Coin-pusher incremental: cash + gems, Coin/s, machine upgrades, stage targets, combo, offline income.

export const MAX_OFFLINE_SECONDS_HARD = 12 * 3600;
export const OFFLINE_EFFICIENCY = 0.5;

// ---- central economy configuration (every multiplier lives here) -----------------
export const ECON = {
  price: {
    runStep: 0.35, // +35% base price per completed run
    runCap: 8,
    walletStep: 0.05, // +5% per balance tier
    walletCap: 2.5, // wallet multiplier never exceeds x2.5
    // balance tier = floor(2*log10(cash)) - 3 (half-decade steps from $100). The tier only ever goes UP within a run, so a
    // purchase can never make the next price cheaper and prices never flicker.
    tierFloorCash: 100,
  },
  run: {
    minStage: NEWRUN_STAGE, // a new run can be started from this stage on (was 6 before the expansion)
    milestones: NEWRUN_MILESTONES, // ...and once this many run milestones are done
    startCash: 10,
    startCashPerPoint: 20,
    pointsPerStage: 1, // upgrade points awarded for every stage cleared in the run
    pointBonus: 0.03, // +3% income per permanent upgrade point
  },
  mini: {
    boostMinutes: 20,
    cooldownMinutes: 30,
    baseGates: 10,
    gatesPerWin: 2,
    maxExtraSteps: 5,
    minMsPerGate: 900, // plausibility check: a legit run cannot clear gates faster than this
    rewards: [
      { mult: 2, p: 55 },
      { mult: 4, p: 28 },
      { mult: 16, p: 12 },
      { mult: 64, p: 4 },
      { mult: 256, p: 1 },
    ],
  },
  // CURSOR AUTO PUSH COIN (per-run upgrade). Every threshold of the stuck-coin detector / assistant lives here.
  cursor: {
    price: 500, // base price (scaled by the same dynamic run/wallet price multiplier as every other upgrade)
    stuckSeconds: 3.5, // a coin must stay almost motionless this long inside a watched passage
    linSpeed: 0.12, // m/s below which a coin counts as motionless
    angSpeed: 0.6, // rad/s
    scanInterval: 0.2, // s between obstruction scans
    resolveSpeed: 0.6, // m/s: a target that moves faster than this is considered freed
    taskCooldown: 4, // s between successful assists
    failCooldown: 12, // s after a failed task
    ignoreAfterAssist: 8, // s a helped coin is left alone
    ignoreAfterFail: 20,
    maxAttempts: 3,
    strokeMaxSpeed: 3.2, // m/s peak speed of the physical helper (never launches coins)
    observeSeconds: 0.9,
    successDisplacement: 0.45,
  },
  multiplyStageReward: false, // stage-clear cash/gems are never boosted
};

// coin types: 0 bronze, 1 silver, 2 gold, 3 rare (crystal coin, also pays 1 gem)
export const COIN_VALUES = [1, 3, 10, 25];
export const COIN_NAMES = ['Bronze coin', 'Silver coin', 'Gold coin', 'Rare crystal'];

// ---- machines (levels are per machine id and persist across stages) -------
export const MACHINE_TYPES = {
  pusher: { name: 'Coin Piston', base: 5, growth: 1.5, max: 12 },
  conveyor: { name: 'Conveyor Belt', base: 20, growth: 1.55, max: 10 },
  blower: { name: 'Blower Fan', base: 25, growth: 1.55, max: 10 },
  magnet: { name: 'Coin Magnet', base: 40, growth: 1.6, max: 10 },
  launcher: { name: 'Coin Launcher', base: 50, growth: 1.6, max: 10 },
};
export const MACHINES = {
  pusherA: { type: 'pusher', mult: 1, name: 'Piston A' },
  pusherB: { type: 'pusher', mult: 1, name: 'Piston B' },
  pusherC: { type: 'pusher', mult: 2, name: 'Piston C' },
  pusherD: { type: 'pusher', mult: 3, name: 'Piston D' },
  conv1: { type: 'conveyor', mult: 1, name: 'Conveyor' },
  fan1: { type: 'blower', mult: 1, name: 'Blower Fan' },
  magnet1: { type: 'magnet', mult: 1, name: 'Magnet' },
  launch1: { type: 'launcher', mult: 1, name: 'Launcher' },
};
export const MACHINE_IDS = Object.keys(MACHINES);

// ---- global upgrades ------------------------------------------------------
export const GLOBALS = {
  rate: { name: 'Coins per second', base: 3, growth: 1.17, max: 80 },
  capacity: { name: 'Max coins on field', base: 40, growth: 1.34, max: 20 },
  rare: { name: 'Rare coin chance', base: 80, growth: 1.42, max: 15 },
};

export function newState() {
  const machines = {};
  for (const id of MACHINE_IDS) machines[id] = 0;
  return {
    cash: ECON.run.startCash,
    gems: 0,
    stage: 1,
    progress: 0, // coins collected in the current stage
    run: 1, // current run number (a run = one prestige cycle)
    priceTier: 0, // highest balance tier seen this run (drives the wallet price multiplier)
    runStats: { earned: 0, coins: 0, upgrades: 0, bestCombo: 0 },
    perm: { points: 0, bestStage: 1, runsCompleted: 0, bestRunEarned: 0, unlocks: [], achievements: [], cosmetics: [], equip: { ...DEFAULT_EQUIP } },
    xlv: Object.fromEntries(EXTRA_IDS.map((k) => [k, 0])), // branch upgrades (per run)
    parts: Object.fromEntries(PART_IDS.map((k) => [k, 0])), // machine part tiers (permanent)
    missions: { active: [], seq: 0 }, // permanent mission board
    runMilestones: [], // milestone ids completed in this run
    boost: { mult: 1, until: 0 }, // active profit multiplier + expiry timestamp (ms)
    cooldownUntil: 0, // mini-game locked until this timestamp (ms)
    mini: { best: 0, plays: 0, wins: 0, fails: 0, gates: 0, bestMult: 0, session: null },
    levels: { rate: 0, capacity: 0, rare: 0 },
    cursor: { owned: false, on: true }, // CURSOR AUTO PUSH COIN (per run)
    machines,
    stats: {
      totalEarned: 0,
      coinsCollected: 0,
      coinsDropped: 0,
      upgradesBought: 0,
      manualDrops: 0,
      autoPushes: 0,
      manualPushes: 0,
      stagesCleared: 0,
      bestCombo: 0,
      playSeconds: 0,
      offlineEarned: 0,
      partsUpgraded: 0,
      missionsDone: 0,
    },
    settings: { pixel: true, sfx: 0.7, music: 0.35, quality: 'high' },
    lastSaved: Date.now(),
  };
}

// ---- stages ---------------------------------------------------------------
const TARGETS = [50, 250, 300, 400, 550, 750];
export function stageTarget(stage) {
  if (stage <= TARGETS.length) return TARGETS[stage - 1];
  return Math.round((TARGETS[TARGETS.length - 1] * Math.pow(1.22, stage - TARGETS.length)) / 10) * 10;
}
export function stageValueMult(stage) {
  return 1 + 0.65 * (stage - 1);
}
export function stageReward(stage) {
  return { cash: Math.round(30 * stage * (1 + 0.6 * stage)), gems: 2 + Math.floor(stage / 2) };
}

// ---- derived stats --------------------------------------------------------
export function spawnRate(s) {
  return (0.45 + 0.3 * s.levels.rate) * (1 + 0.05 * pt(s, 'drive')); // coins per second dropped by the dispenser
}
export function capacity(s) {
  return 30 + 8 * s.levels.capacity + 4 * pt(s, 'frame'); // simultaneously active coins (also limited by graphics quality)
}
export function maxCharges(s) {
  const f = pt(s, 'frame');
  return 3 + Math.floor(s.levels.capacity / 3) + (f >= 2 ? 1 : 0) + (f >= 4 ? 1 : 0);
}
export const CHARGE_TIME = 1.2;

export function typeProbabilities(s) {
  const r = s.levels.rare;
  const rare = Math.min(0.12, 0.01 + 0.006 * r + 0.004 * pt(s, 'tray'));
  const gold = Math.min(0.2, 0.05 + 0.012 * r);
  const silver = Math.min(0.3, 0.2 + 0.01 * r);
  return [1 - rare - gold - silver, silver, gold, rare];
}
export function avgBaseValue(s) {
  const p = typeProbabilities(s);
  return COIN_VALUES.reduce((a, v, i) => a + v * p[i], 0);
}
export function pickType(s, rnd = Math.random) {
  const p = typeProbabilities(s);
  let r = rnd();
  for (let i = 0; i < p.length; i++) {
    r -= p[i];
    if (r <= 0) return i;
  }
  return 0;
}

export function comboCap(s) {
  return s ? 0.5 * (1 + 0.1 * xl(s, 'combo') + 0.05 * pt(s, 'tray')) : 0.5;
}
export function comboBonus(combo, s = null) {
  return 1 + Math.min(comboCap(s), Math.floor(combo / 5) * 0.05); // +5% per 5 combo, max +50% (raised by Combo Keeper / tray)
}
export function comboWindow(s) {
  return 2.5 + 0.4 * xl(s, 'combo');
}
// every value modifier of the expansion in one place (Coin Polish, Coin Deck, Stage Resonance)
export function valueMods(s) {
  return (1 + 0.05 * xl(s, 'polish')) * (1 + 0.06 * pt(s, 'deck')) * (1 + 0.03 * xl(s, 'resonance') * Math.max(0, s.stage - 1));
}
export function goldenChance(s) {
  return 0.015 * xl(s, 'golden');
}
export const GOLDEN_MULT = 3;
export function coinValue(s, type, mult = 1, combo = 0) {
  return COIN_VALUES[type] * stageValueMult(s.stage) * mult * comboBonus(combo, s) * valueMods(s);
}

// machine effects ------------------------------------------------------------
export function machineLevel(s, id) {
  return s.machines[id] || 0;
}
// part-aware variants used by the machines: Piston Drive shortens the push cycle, Main Drive strengthens the rest
export function pusherParamsS(s, level) {
  const p = pusherParams(level);
  if (!p.active) return p;
  const k = 1 - 0.06 * pt(s, 'piston');
  return { ...p, interval: Math.max(1.2, p.interval * k), out: Math.max(0.4, p.out * k), back: Math.max(0.55, p.back * k) };
}
export function driveMult(s) {
  return 1 + 0.07 * pt(s, 'drive');
}
export function pusherParams(level) {
  // level 0: only the emergency anti-jam stroke (no regular cycling)
  if (level <= 0) return { active: false, interval: Infinity, out: 1.0, back: 1.2 };
  return { active: true, interval: Math.max(1.6, 4.6 - 0.3 * level), out: Math.max(0.5, 1.25 - 0.07 * level), back: Math.max(0.7, 1.4 - 0.06 * level) };
}
export function conveyorSpeed(level) {
  return level <= 0 ? 0 : 0.55 + 0.22 * level;
}
export function blowerForce(level) {
  return level <= 0 ? 0 : 3 + 1.1 * level; // m/s^2 applied to coins in the airstream
}
export function magnetForce(level) {
  return level <= 0 ? 0 : 2.5 + 0.9 * level;
}
export function launcherParams(level) {
  return level <= 0 ? { active: false } : { active: true, power: 4.2 + 0.35 * level, cooldown: Math.max(1.2, 3.2 - 0.18 * level) };
}

// ---- costs / buying ---------------------------------------------------------
// price = basePrice x runPriceMultiplier x upgradeLevelMultiplier (growth^level) x walletMultiplier
export function runPriceMult(run = 1) {
  return Math.min(ECON.price.runCap, 1 + ECON.price.runStep * (Math.max(1, run) - 1));
}
export function walletTier(cash) {
  if (!(cash >= ECON.price.tierFloorCash)) return 0;
  return Math.max(0, Math.floor(2 * Math.log10(cash)) - 3);
}
export function walletMult(tier = 0) {
  return Math.min(ECON.price.walletCap, 1 + ECON.price.walletStep * tier);
}
export function priceMult(s) {
  return runPriceMult(s ? s.run : 1) * walletMult(s ? s.priceTier : 0);
}
// raise the balance tier if the wallet entered a new one; returns true when prices changed
export function refreshTier(s) {
  const t = walletTier(s.cash);
  if (t > s.priceTier) { s.priceTier = t; return true; }
  return false;
}
export function machineCost(id, level, s = null) {
  const m = MACHINES[id];
  const t = MACHINE_TYPES[m.type];
  return Math.ceil(t.base * m.mult * Math.pow(t.growth, level) * priceMult(s));
}
export function globalCost(key, level, s = null) {
  const g = GLOBALS[key];
  return Math.ceil(g.base * Math.pow(g.growth, level) * priceMult(s));
}

// uniform description of any purchasable: machine id or global key
export function upgradeInfo(s, key) {
  const isMachine = !!MACHINES[key];
  const lvl = isMachine ? machineLevel(s, key) : s.levels[key];
  const max = isMachine ? MACHINE_TYPES[MACHINES[key].type].max : GLOBALS[key].max;
  const cost = isMachine ? machineCost(key, lvl, s) : globalCost(key, lvl, s);
  const atMax = lvl >= max;
  const name = isMachine ? MACHINES[key].name : GLOBALS[key].name;
  const title = isMachine ? MACHINE_TYPES[MACHINES[key].type].name : GLOBALS[key].name;
  return { key, isMachine, lvl, max, cost, atMax, name, title, canBuy: !atMax && s.cash >= cost };
}

export function buyUpgrade(s, key) {
  const info = upgradeInfo(s, key);
  if (!info.canBuy) return false;
  s.cash -= info.cost;
  if (info.isMachine) s.machines[key] += 1;
  else s.levels[key] += 1;
  s.stats.upgradesBought += 1;
  s.runStats.upgrades = (s.runStats.upgrades || 0) + 1;
  refreshTier(s);
  return true;
}

// ---- CURSOR AUTO PUSH COIN ----------------------------------------------------
export function cursorCost(s) {
  return Math.ceil(ECON.cursor.price * priceMult(s));
}
export function cursorInfo(s) {
  const cost = cursorCost(s);
  return { owned: !!s.cursor.owned, on: !!s.cursor.on, cost, canBuy: !s.cursor.owned && s.cash >= cost, missing: Math.max(0, cost - s.cash) };
}
export function buyCursor(s) {
  const info = cursorInfo(s);
  if (!info.canBuy) return false;
  s.cash -= info.cost;
  s.cursor.owned = true;
  s.cursor.on = true;
  s.stats.upgradesBought += 1;
  s.runStats.upgrades = (s.runStats.upgrades || 0) + 1;
  refreshTier(s);
  return true;
}
export function setCursorOn(s, on) {
  if (!s.cursor.owned) return false;
  s.cursor.on = !!on;
  return true;
}

const f1 = (n) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));

// text describing what the next level changes
export function effectText(s, key) {
  const info = upgradeInfo(s, key);
  if (info.atMax) return 'Maximum level reached';
  const L = info.lvl;
  if (!info.isMachine) {
    if (key === 'rate') return `Spawn rate ${f1(0.45 + 0.3 * L)} → ${f1(0.45 + 0.3 * (L + 1))} coins/s`;
    if (key === 'capacity') return `Coins on field ${30 + 8 * L} → ${30 + 8 * (L + 1)} · Drop charges ${3 + Math.floor(L / 3)} → ${3 + Math.floor((L + 1) / 3)}`;
    const a = typeProbabilities(s)[3] * 100;
    const n = JSON.parse(JSON.stringify(s));
    n.levels.rare += 1;
    return `Rare coins ${a.toFixed(1)}% → ${(typeProbabilities(n)[3] * 100).toFixed(1)}%`;
  }
  const type = MACHINES[key].type;
  if (type === 'pusher') {
    const a = pusherParams(L), b = pusherParams(L + 1);
    return L === 0 ? `Activates: pushes every ${f1(b.interval)} s` : `Push interval ${f1(a.interval)} → ${f1(b.interval)} s`;
  }
  if (type === 'conveyor') return L === 0 ? `Activates: speed ${f1(conveyorSpeed(1))} m/s` : `Speed ${f1(conveyorSpeed(L))} → ${f1(conveyorSpeed(L + 1))} m/s`;
  if (type === 'blower') return L === 0 ? `Activates: air force ${f1(blowerForce(1))}` : `Air force ${f1(blowerForce(L))} → ${f1(blowerForce(L + 1))}`;
  if (type === 'magnet') return L === 0 ? `Activates: pull ${f1(magnetForce(1))}` : `Pull ${f1(magnetForce(L))} → ${f1(magnetForce(L + 1))}`;
  if (type === 'launcher') {
    const b = launcherParams(L + 1);
    return L === 0 ? `Activates: power ${f1(b.power)}` : `Power ${f1(launcherParams(L).power)} → ${f1(b.power)}`;
  }
  return '';
}

// ---- stage completion ---------------------------------------------------------
export function addProgress(s, n) {
  s.progress += n;
}
export function stageDone(s) {
  return s.progress >= stageTarget(s.stage);
}
export function completeStage(s) {
  const base = stageReward(s.stage);
  const b = xl(s, 'bounty');
  const reward = { cash: Math.round(base.cash * (1 + 0.15 * b)), gems: base.gems + Math.floor(b / 2) };
  s.cash += reward.cash;
  s.gems += reward.gems;
  s.stats.totalEarned += reward.cash;
  s.runStats.earned += reward.cash;
  if (s.stage + 1 > s.perm.bestStage) s.perm.bestStage = s.stage + 1;
  refreshTier(s);
  s.stats.stagesCleared += 1;
  s.stage += 1;
  s.progress = 0;
  return reward;
}

// ---- income estimate / offline --------------------------------------------------
export function activePushers(s) {
  return ['pusherA', 'pusherB', 'pusherC', 'pusherD'].filter((id) => s.machines[id] > 0).length;
}
// coins per second the machine can really process: limited by the drop rate and by the pushers
export function throughput(s) {
  const pushCap = (0.6 + 0.9 * s.machines.pusherA + 0.6 * s.machines.pusherB) * (1 + 0.08 * pt(s, 'piston'));
  const feed = 1 / feederInterval(xl(s, 'feeder')); // Auto Feeder drops extra coins from the charge pool
  return activePushers(s) > 0 ? Math.min(spawnRate(s) + Math.min(feed, 1 / CHARGE_TIME), pushCap) : 0;
}
export function incomePerSec(s) {
  return throughput(s) * avgBaseValue(s) * stageValueMult(s.stage) * valueMods(s) * (1 + (GOLDEN_MULT - 1) * goldenChance(s));
}
export function offlineCapSeconds(s) {
  return Math.min(MAX_OFFLINE_SECONDS_HARD + 8 * 3600, (2 + 0.2 * s.levels.capacity + xl(s, 'vault')) * 3600);
}
export function offlineEfficiency(s) {
  return OFFLINE_EFFICIENCY + 0.04 * xl(s, 'vault');
}
// ---- game clock: while a mini-game session pauses the main game this clock is frozen, so boost / cooldown deadlines
// cannot expire in the background. Resuming shifts every deadline by the paused duration (remaining time is preserved).
export const clock = {
  frozenAt: null,
  now() { return this.frozenAt === null ? Date.now() : this.frozenAt; },
  freeze() { if (this.frozenAt === null) this.frozenAt = Date.now(); return this.frozenAt; },
  // returns the paused duration in ms and shifts the stored deadlines by it
  thaw(s) {
    if (this.frozenAt === null) return 0;
    const d = Math.max(0, Date.now() - this.frozenAt);
    this.frozenAt = null;
    if (s) {
      if (s.boost && s.boost.until) s.boost.until += d;
      if (s.cooldownUntil) s.cooldownUntil += d;
    }
    return d;
  },
};
export function computeOffline(s, now = Date.now()) {
  const elapsed = Math.max(0, (now - (s.lastSaved || now)) / 1000);
  if (elapsed < 30) return null;
  const cap = offlineCapSeconds(s);
  const counted = Math.min(elapsed, cap);
  // boost only counts for the part of the absence that really overlapped the boost window
  const ov = Math.max(0, Math.min(counted, (Math.min(now, s.boost.until) - (s.lastSaved || now)) / 1000));
  const bm = s.boost.mult > 1 ? (ov * s.boost.mult + (counted - ov)) / counted : 1;
  const eff = offlineEfficiency(s);
  const gain = incomePerSec(s) * counted * eff * bm * permMult(s);
  const coins = Math.floor(throughput(s) * counted * eff);
  if (gain <= 0) return null;
  return { elapsed, counted, capped: elapsed > cap, gain, coins };
}

// ---- formatting ----------------------------------------------------------------
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
export function fmtNum(n) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  const e = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / Math.pow(10, e * 3);
  return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + SUFFIX[e];
}
export function fmtCash(n) {
  if (n < 10000) return String(Math.floor(n));
  return fmtNum(n);
}
export function fmtMoney(n) {
  return '$' + fmtCash(n);
}
export function fmtDuration(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${sec} s`;
}

// ---- the ONE income pipeline: every cash earning (coins, passive, offline-per-second) goes through here --------------
export function permMult(s) {
  return 1 + ECON.run.pointBonus * s.perm.points;
}
export function boostMult(s, now = clock.now()) {
  return s.boost.mult > 1 && now < s.boost.until ? s.boost.mult : 1;
}
export function income(s, base, now = clock.now()) {
  const mult = boostMult(s, now);
  const final = base * mult * permMult(s);
  return { base, mult, perm: permMult(s), final };
}

// ---- time safety ---------------------------------------------------------------------------------------------------
// If the device clock moved backwards, shift the stored expiries by the same amount so remaining time is unchanged
// (rolling the clock back can never extend a boost or shorten a cooldown).
export function normalizeClock(s, now = Date.now(), ref = s.lastSaved) {
  if (ref && now < ref - 2000) {
    const d = ref - now;
    if (s.boost.until) s.boost.until -= d;
    if (s.cooldownUntil) s.cooldownUntil -= d;
    s.lastSaved = now;
    return d;
  }
  return 0;
}

// ---- mini-game: availability / session / reward ----------------------------------------------------------------------
// ends the boost when its timestamp passed and starts the 30 minute cooldown from the exact end time
export function expireBoost(s, now = clock.now()) {
  if (s.boost.mult > 1 && now >= s.boost.until) {
    s.cooldownUntil = s.boost.until + ECON.mini.cooldownMinutes * 60000;
    s.boost = { mult: 1, until: 0 };
    return true;
  }
  return false;
}
export function miniStatus(s, now = clock.now()) {
  if (s.boost.mult > 1 && now < s.boost.until) return { state: 'boost', remaining: (s.boost.until - now) / 1000, mult: s.boost.mult };
  if (now < s.cooldownUntil) return { state: 'cooldown', remaining: (s.cooldownUntil - now) / 1000, mult: 1 };
  return { state: 'ready', remaining: 0, mult: 1 };
}
export function miniObjective(s) {
  return ECON.mini.baseGates + ECON.mini.gatesPerWin * Math.min(ECON.mini.maxExtraSteps, s.mini.wins);
}
export function rewardTable() {
  const tot = ECON.mini.rewards.reduce((a, r) => a + r.p, 0);
  return ECON.mini.rewards.map((r) => ({ mult: r.mult, p: r.p / tot }));
}
export function rollReward(rnd = Math.random) {
  const t = rewardTable();
  let r = rnd();
  for (const x of t) { r -= x.p; if (r <= 0) return x.mult; }
  return t[t.length - 1].mult;
}
export function startMini(s, now) {
  if (miniStatus(s, now === undefined ? clock.now() : now).state !== 'ready') return null;
  now = now === undefined ? Date.now() : now; // the session timestamp is real time (it validates the flight duration)
  s.mini.session = { id: Math.random().toString(36).slice(2) + now.toString(36), objective: miniObjective(s), t0: now };
  return s.mini.session;
}
// verifies a finished attempt against the persisted session. A session can be settled exactly once, so a refresh or a
// replayed result can never pay out twice, and a result that was not started here is rejected.
export function finishMini(s, result, now, rnd = Math.random) {
  const real = now === undefined ? Date.now() : now; // real time validates the flight, the game clock times the reward
  const gnow = now === undefined ? clock.now() : now;
  const ses = s.mini.session;
  if (!ses) return { ok: false, reason: 'no-session' };
  s.mini.session = null;
  s.mini.plays += 1;
  const score = Math.max(0, Math.floor(result.score || 0));
  s.mini.gates += score;
  if (score > s.mini.best) s.mini.best = score;
  const dur = result.durationMs || 0;
  const plausible = dur >= ses.objective * ECON.mini.minMsPerGate && real - ses.t0 >= dur - 3000;
  if (score < ses.objective || !plausible) {
    s.mini.fails += 1;
    return { ok: false, reason: score < ses.objective ? 'objective' : 'implausible', score, objective: ses.objective };
  }
  const mult = rollReward(rnd);
  s.boost = { mult, until: gnow + ECON.mini.boostMinutes * 60000 };
  s.cooldownUntil = 0;
  s.mini.wins += 1;
  if (mult > s.mini.bestMult) s.mini.bestMult = mult;
  return { ok: true, score, objective: ses.objective, mult, until: s.boost.until };
}

// ---- runs (prestige) ---------------------------------------------------------------------------------------------------
export function canNewRun(s) {
  return s.stage >= ECON.run.minStage && (s.runMilestones || []).length >= ECON.run.milestones;
}
export function newRunNeeds(s) {
  return { stage: ECON.run.minStage, stageOk: s.stage >= ECON.run.minStage, milestones: ECON.run.milestones, done: (s.runMilestones || []).length };
}
export function previewNewRun(s) {
  const gain = Math.max(0, s.stage - 1) * ECON.run.pointsPerStage;
  const points = s.perm.points + gain;
  const probe = { ...s, run: s.run + 1, priceTier: 0, perm: { ...s.perm, points } };
  return {
    run: s.run + 1,
    prev: { run: s.run, stage: s.stage, earned: s.runStats.earned, coins: s.runStats.coins },
    pointsGain: gain,
    points,
    startCash: ECON.run.startCash + ECON.run.startCashPerPoint * points,
    permMult: 1 + ECON.run.pointBonus * points,
    prices: ['pusherA', 'rate', 'capacity'].map((k) => ({ key: k, cost: k === 'pusherA' ? machineCost(k, 0, probe) : globalCost(k, 0, probe) })),
    priceMult: runPriceMult(s.run + 1),
  };
}
export const ACHIEVEMENTS = {
  run1: { name: 'Finish your first run', test: (s) => s.perm.runsCompleted >= 1 },
  stage10: { name: 'Reach stage 10', test: (s) => s.perm.bestStage >= 10 },
  flyer: { name: 'Win Flying Ball 3 times', test: (s) => s.mini.wins >= 3 },
  x16: { name: 'Win a x16 or higher boost', test: (s) => s.mini.bestMult >= 16 },
  rich: { name: 'Earn $1M in total', test: (s) => s.stats.totalEarned >= 1e6 },
  parts15: { name: 'Install 15 part tiers', test: (s) => PART_IDS.reduce((a, k) => a + pt(s, k), 0) >= 15 },
  missions25: { name: 'Complete 25 missions', test: (s) => s.stats.missionsDone >= 25 },
  combo50: { name: 'Reach a x50 combo', test: (s) => s.stats.bestCombo >= 50 },
  allMiles: { name: 'Complete all run milestones', test: (s) => (s.runMilestones || []).length >= 16 },
  stage15: { name: 'Reach stage 15', test: (s) => s.perm.bestStage >= 15 },
  crystal: { name: 'Get a Crystal machine part', test: (s) => PART_IDS.some((k) => pt(s, k) >= 5) },
};
// cosmetic reward of an achievement (collections, cosmetic only)
export const ACH_COSMETIC = { run1: 'pipe_ruby', stage10: 'pipe_cobalt', rich: 'pipe_gold', parts15: 'pipe_obsidian', missions25: 'pipe_candy', flyer: 'spark_ice', combo50: 'spark_neon', allMiles: 'spark_ember' };
export function checkAchievements(s) {
  const out = [];
  for (const [id, a] of Object.entries(ACHIEVEMENTS)) {
    if (!s.perm.achievements.includes(id) && a.test(s)) {
      s.perm.achievements.push(id); out.push(id);
      const c = ACH_COSMETIC[id];
      if (c && !s.perm.cosmetics.includes(c)) s.perm.cosmetics.push(c);
    }
  }
  if (canNewRun(s) && !s.perm.unlocks.includes('newrun')) s.perm.unlocks.push('newrun');
  return out;
}
// resets everything temporary, keeps everything permanent (stats, gems, perm, mini-game, boost/cooldown, settings)
export function applyNewRun(s) {
  const pv = previewNewRun(s);
  s.perm.points = pv.points;
  s.perm.runsCompleted += 1;
  s.perm.bestStage = Math.max(s.perm.bestStage, s.stage);
  s.perm.bestRunEarned = Math.max(s.perm.bestRunEarned, s.runStats.earned);
  const nm = {};
  for (const id of MACHINE_IDS) nm[id] = 0;
  s.run += 1;
  s.cash = pv.startCash;
  s.stage = 1;
  s.progress = 0;
  s.priceTier = 0;
  s.levels = { rate: 0, capacity: 0, rare: 0 };
  s.cursor = { owned: false, on: true };
  s.machines = nm;
  s.runStats = { earned: 0, coins: 0, upgrades: 0, bestCombo: 0 };
  s.xlv = Object.fromEntries(EXTRA_IDS.map((k) => [k, 0]));
  s.runMilestones = [];
  // kept: gems, machine parts, missions, collections, achievements, points, statistics, Flying Ball, settings
  checkAchievements(s);
  return pv;
}
export function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), r = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}
