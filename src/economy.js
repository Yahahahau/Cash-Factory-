// Pure economy logic (no DOM / three). Shared by the game, the simulator and tests.
// Coin-pusher incremental: cash + gems, Coin/s, machine upgrades, stage targets, combo, offline income.

export const MAX_OFFLINE_SECONDS_HARD = 12 * 3600;
export const OFFLINE_EFFICIENCY = 0.5;

// coin types: 0 bronze, 1 silver, 2 gold, 3 rare (crystal coin, also pays 1 gem)
export const COIN_VALUES = [1, 3, 10, 25];
export const COIN_NAMES = ['เหรียญทองแดง', 'เหรียญเงิน', 'เหรียญทอง', 'เหรียญหายาก'];

// ---- machines (levels are per machine id and persist across stages) -------
export const MACHINE_TYPES = {
  pusher: { name: 'ลูกสูบดันเหรียญ', base: 5, growth: 1.5, max: 12 },
  conveyor: { name: 'สายพานลำเลียง', base: 20, growth: 1.55, max: 10 },
  blower: { name: 'พัดลมเป่าลม', base: 25, growth: 1.55, max: 10 },
  magnet: { name: 'แม่เหล็กดูดเหรียญ', base: 40, growth: 1.6, max: 10 },
  launcher: { name: 'เครื่องดีดเหรียญ', base: 50, growth: 1.6, max: 10 },
};
export const MACHINES = {
  pusherA: { type: 'pusher', mult: 1, name: 'ลูกสูบ A' },
  pusherB: { type: 'pusher', mult: 1, name: 'ลูกสูบ B' },
  pusherC: { type: 'pusher', mult: 2, name: 'ลูกสูบ C' },
  pusherD: { type: 'pusher', mult: 3, name: 'ลูกสูบ D' },
  conv1: { type: 'conveyor', mult: 1, name: 'สายพาน' },
  fan1: { type: 'blower', mult: 1, name: 'พัดลมเป่าลม' },
  magnet1: { type: 'magnet', mult: 1, name: 'แม่เหล็ก' },
  launch1: { type: 'launcher', mult: 1, name: 'เครื่องดีด' },
};
export const MACHINE_IDS = Object.keys(MACHINES);

// ---- global upgrades ------------------------------------------------------
export const GLOBALS = {
  rate: { name: 'เหรียญ/วินาที', base: 3, growth: 1.17, max: 80 },
  capacity: { name: 'ความจุเหรียญสูงสุด', base: 40, growth: 1.34, max: 20 },
  rare: { name: 'โอกาสเหรียญหายาก', base: 80, growth: 1.42, max: 15 },
};

export function newState() {
  const machines = {};
  for (const id of MACHINE_IDS) machines[id] = 0;
  return {
    cash: 10,
    gems: 0,
    stage: 1,
    progress: 0, // coins collected in the current stage
    levels: { rate: 0, capacity: 0, rare: 0 },
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
  return 0.45 + 0.3 * s.levels.rate; // coins per second dropped by the dispenser
}
export function capacity(s) {
  return 30 + 8 * s.levels.capacity; // simultaneously active coins (also limited by graphics quality)
}
export function maxCharges(s) {
  return 3 + Math.floor(s.levels.capacity / 3);
}
export const CHARGE_TIME = 1.2;

export function typeProbabilities(s) {
  const r = s.levels.rare;
  const rare = Math.min(0.1, 0.01 + 0.006 * r);
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

export function comboBonus(combo) {
  return 1 + Math.min(0.5, Math.floor(combo / 5) * 0.05); // +5% per 5 combo, max +50%
}
export function coinValue(s, type, mult = 1, combo = 0) {
  return COIN_VALUES[type] * stageValueMult(s.stage) * mult * comboBonus(combo);
}

// machine effects ------------------------------------------------------------
export function machineLevel(s, id) {
  return s.machines[id] || 0;
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
  return level <= 0 ? 0 : 4 + 1.5 * level;
}
export function launcherParams(level) {
  return level <= 0 ? { active: false } : { active: true, power: 4.2 + 0.35 * level, cooldown: Math.max(1.2, 3.2 - 0.18 * level) };
}

// ---- costs / buying ---------------------------------------------------------
export function machineCost(id, level) {
  const m = MACHINES[id];
  const t = MACHINE_TYPES[m.type];
  return Math.ceil(t.base * m.mult * Math.pow(t.growth, level));
}
export function globalCost(key, level) {
  const g = GLOBALS[key];
  return Math.ceil(g.base * Math.pow(g.growth, level));
}

// uniform description of any purchasable: machine id or global key
export function upgradeInfo(s, key) {
  const isMachine = !!MACHINES[key];
  const lvl = isMachine ? machineLevel(s, key) : s.levels[key];
  const max = isMachine ? MACHINE_TYPES[MACHINES[key].type].max : GLOBALS[key].max;
  const cost = isMachine ? machineCost(key, lvl) : globalCost(key, lvl);
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
  return true;
}

const f1 = (n) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));

// text describing what the next level changes
export function effectText(s, key) {
  const info = upgradeInfo(s, key);
  if (info.atMax) return 'ระดับสูงสุดแล้ว';
  const L = info.lvl;
  if (!info.isMachine) {
    if (key === 'rate') return `ปล่อยเหรียญ ${f1(0.45 + 0.3 * L)} → ${f1(0.45 + 0.3 * (L + 1))} เหรียญ/วินาที`;
    if (key === 'capacity') return `เหรียญพร้อมกัน ${30 + 8 * L} → ${30 + 8 * (L + 1)} · ปุ่มปล่อยเก็บได้ ${3 + Math.floor(L / 3)} → ${3 + Math.floor((L + 1) / 3)}`;
    const a = typeProbabilities(s)[3] * 100;
    const n = JSON.parse(JSON.stringify(s));
    n.levels.rare += 1;
    return `เหรียญหายาก ${a.toFixed(1)}% → ${(typeProbabilities(n)[3] * 100).toFixed(1)}%`;
  }
  const type = MACHINES[key].type;
  if (type === 'pusher') {
    const a = pusherParams(L), b = pusherParams(L + 1);
    return L === 0 ? `เปิดใช้งาน: ดันทุก ${f1(b.interval)} วิ` : `ดันทุก ${f1(a.interval)} → ${f1(b.interval)} วิ · เร็วขึ้น`;
  }
  if (type === 'conveyor') return L === 0 ? `เปิดใช้งาน: ความเร็ว ${f1(conveyorSpeed(1))} ม./วิ` : `ความเร็ว ${f1(conveyorSpeed(L))} → ${f1(conveyorSpeed(L + 1))} ม./วิ`;
  if (type === 'blower') return L === 0 ? `เปิดใช้งาน: แรงลม ${f1(blowerForce(1))}` : `แรงลม ${f1(blowerForce(L))} → ${f1(blowerForce(L + 1))}`;
  if (type === 'magnet') return L === 0 ? `เปิดใช้งาน: แรงดูด ${f1(magnetForce(1))}` : `แรงดูด ${f1(magnetForce(L))} → ${f1(magnetForce(L + 1))}`;
  if (type === 'launcher') {
    const b = launcherParams(L + 1);
    return L === 0 ? `เปิดใช้งาน: ดีดแรง ${f1(b.power)}` : `แรงดีด ${f1(launcherParams(L).power)} → ${f1(b.power)}`;
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
  const reward = stageReward(s.stage);
  s.cash += reward.cash;
  s.gems += reward.gems;
  s.stats.totalEarned += reward.cash;
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
  const pushCap = 0.6 + 0.9 * s.machines.pusherA + 0.6 * s.machines.pusherB;
  return activePushers(s) > 0 ? Math.min(spawnRate(s), pushCap) : 0;
}
export function incomePerSec(s) {
  return throughput(s) * avgBaseValue(s) * stageValueMult(s.stage);
}
export function offlineCapSeconds(s) {
  return Math.min(MAX_OFFLINE_SECONDS_HARD, (2 + 0.2 * s.levels.capacity) * 3600);
}
export function computeOffline(s, now = Date.now()) {
  const elapsed = Math.max(0, (now - (s.lastSaved || now)) / 1000);
  if (elapsed < 30) return null;
  const cap = offlineCapSeconds(s);
  const counted = Math.min(elapsed, cap);
  const gain = incomePerSec(s) * counted * OFFLINE_EFFICIENCY;
  const coins = Math.floor(throughput(s) * counted * OFFLINE_EFFICIENCY);
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
  if (h > 0) return `${h} ชม. ${m} นาที`;
  if (m > 0) return `${m} นาที`;
  return `${sec} วินาที`;
}
