// Pure economy logic (no DOM / three). Shared by the game, the simulator and tests.

export const MAX_OFFLINE_SECONDS_HARD = 12 * 3600; // never above 12h
export const OFFLINE_EFFICIENCY = 0.5; // offline income is 50% of online passive income
export const MAX_SPAWN_RATE = 120; // logical objects/s (physics uses batching, so this is not a body count)

export const GRADES = [
  {
    id: 1, name: 'โรงงานพื้นฐาน', en: 'Basic Factory', cost: 0, levelCap: 10,
    valueMult: 1, spawnMult: 1, collectMult: 1, capBonus: 0,
    fx: 'เครื่องจักรสีฟ้า เหรียญเงิน',
    body: 0x3b8fd9, accent: 0xffd23f, trim: 0xc8d4e3, light: 0xfff2d0,
  },
  {
    id: 2, name: 'โรงงานปรับปรุง', en: 'Improved Factory', cost: 3500, levelCap: 20,
    valueMult: 3, spawnMult: 1.15, collectMult: 1.1, capBonus: 12,
    fx: 'ท่อทองแดง ไฟกะพริบ',
    body: 0x3fb86b, accent: 0xffb02e, trim: 0xd9e4d0, light: 0xfff0c0,
  },
  {
    id: 3, name: 'โรงงานขั้นสูง', en: 'Advanced Factory', cost: 300000, levelCap: 30,
    valueMult: 9, spawnMult: 1.3, collectMult: 1.2, capBonus: 24,
    fx: 'ปลดล็อกอัญมณี ปล่องควัน',
    body: 0x8a5cf0, accent: 0x5ef2e0, trim: 0xe2d6ff, light: 0xe8dcff,
  },
  {
    id: 4, name: 'โรงงานพรีเมียม', en: 'Premium Factory', cost: 5.0e7, levelCap: 40,
    valueMult: 27, spawnMult: 1.5, collectMult: 1.35, capBonus: 40,
    fx: 'ขอบทอง สปอตไลท์',
    body: 0xe0503c, accent: 0xffe066, trim: 0xffe8c0, light: 0xffe0b0,
  },
  {
    id: 5, name: 'โรงงานอีลีท', en: 'Elite Factory', cost: 4.0e9, levelCap: 50,
    valueMult: 81, spawnMult: 1.75, collectMult: 1.55, capBonus: 60,
    fx: 'ลำแสงพลังงาน ประกายดาว',
    body: 0x1fb5b0, accent: 0xff6ad5, trim: 0xd0fffa, light: 0xc8fff6,
  },
  {
    id: 6, name: 'โรงงานมาสเตอร์', en: 'Master Factory', cost: 6.0e11, levelCap: 60,
    valueMult: 243, spawnMult: 2, collectMult: 1.8, capBonus: 90,
    fx: 'มงกุฎทอง ฝนประกาย',
    body: 0xf2b020, accent: 0xfff6a8, trim: 0xfff2c4, light: 0xfff6d8,
  },
];

export const CORE_KEYS = ['production', 'value', 'storage', 'efficiency'];
export const UPGRADE_KEYS = [...CORE_KEYS, 'automation'];

export const UPGRADES = {
  production: { name: 'ความเร็วการผลิต', icon: 'prod', base: 12, growth: 1.29 },
  value: { name: 'มูลค่าวัตถุ', icon: 'value', base: 20, growth: 1.35 },
  storage: { name: 'ความจุคลัง', icon: 'store', base: 30, growth: 1.27 },
  efficiency: { name: 'ประสิทธิภาพการเก็บ', icon: 'eff', base: 45, growth: 1.31 },
  automation: { name: 'ระบบอัตโนมัติ', icon: 'auto', base: 600, growth: 6, max: 5 },
};

export const AUTOMATION_FEATURES = [
  'ยังไม่ปลดล็อก',
  'หัวจ่ายที่ 2',
  'ระบบคัดทอง (ของมีค่าเพิ่ม)',
  'หัวจ่ายที่ 3',
  'แม่เหล็กเก็บเร็ว +25%',
  'โหมดเทอร์โบอัตโนมัติ',
];

// Object types: base values in "units" (multiplied by value upgrades and grade).
export const OBJECT_TYPES = [
  { id: 0, key: 'coin', value: 1 },
  { id: 1, key: 'gold', value: 4 },
  { id: 2, key: 'bar', value: 15 },
  { id: 3, key: 'gem', value: 60 },
];

export function newState() {
  return {
    money: 0,
    grade: 1,
    levels: { production: 0, value: 0, storage: 0, efficiency: 0, automation: 0 },
    stats: {
      totalEarned: 0,
      objectsProduced: 0,
      objectsCollected: 0,
      upgradesBought: 0,
      taps: 0,
      autoPushes: 0,
      manualPushes: 0,
      playSeconds: 0,
      offlineEarned: 0,
    },
    unlocked: ['grade1'],
    settings: { pixel: true, sfx: 0.7, music: 0.35, quality: 'high' },
    lastSaved: Date.now(),
  };
}

export function gradeOf(state) {
  return GRADES[Math.max(0, Math.min(GRADES.length - 1, state.grade - 1))];
}

export function levelCap(state) {
  return gradeOf(state).levelCap;
}

export function upgradeMaxLevel(state, key) {
  if (key === 'automation') return UPGRADES.automation.max;
  return levelCap(state);
}

export function upgradeCost(key, level) {
  const u = UPGRADES[key];
  return Math.ceil(u.base * Math.pow(u.growth, level));
}

// ---- derived stats -------------------------------------------------------

export function nozzleCount(state) {
  const a = state.levels.automation;
  return 1 + (a >= 1 ? 1 : 0) + (a >= 3 ? 1 : 0);
}

export function spawnRate(state) {
  const g = gradeOf(state);
  const nozzleBonus = 1 + 0.4 * (nozzleCount(state) - 1);
  return Math.min(MAX_SPAWN_RATE, (1 + 0.2 * state.levels.production) * g.spawnMult * nozzleBonus);
}

export function collectRate(state) {
  const g = gradeOf(state);
  const magnet = state.levels.automation >= 4 ? 1.25 : 1;
  return (1.5 + 0.4 * state.levels.efficiency) * g.collectMult * magnet;
}

export function capacity(state) {
  return Math.round(30 + 8 * state.levels.storage + gradeOf(state).capBonus);
}

export function valueMultiplier(state) {
  return Math.pow(1.17, state.levels.value) * gradeOf(state).valueMult;
}

export function offlineCapSeconds(state) {
  const hours = 2 + 0.15 * state.levels.storage;
  return Math.min(MAX_OFFLINE_SECONDS_HARD, hours * 3600);
}

export function typeProbabilities(state) {
  const sorting = state.levels.automation >= 2;
  const gems = state.grade >= 3;
  let p = sorting ? [0.58, 0.28, 0.12, 0.02] : [0.7, 0.22, 0.07, 0.01];
  if (!gems) p = [p[0], p[1], p[2] + p[3], 0];
  return p;
}

export function avgBaseValue(state) {
  const p = typeProbabilities(state);
  return OBJECT_TYPES.reduce((s, t, i) => s + t.value * p[i], 0);
}

export function pickType(state, rnd = Math.random) {
  const p = typeProbabilities(state);
  let r = rnd();
  for (let i = 0; i < p.length; i++) {
    r -= p[i];
    if (r <= 0) return i;
  }
  return 0;
}

export function throughput(state) {
  return Math.min(spawnRate(state), collectRate(state));
}

export function incomePerSec(state) {
  return throughput(state) * avgBaseValue(state) * valueMultiplier(state);
}

export function bottleneck(state) {
  return spawnRate(state) <= collectRate(state) ? 'production' : 'efficiency';
}

// ---- purchasing ----------------------------------------------------------

export function upgradeInfo(state, key) {
  const lvl = state.levels[key];
  const max = upgradeMaxLevel(state, key);
  const cost = upgradeCost(key, lvl);
  const atMax = lvl >= max;
  let locked = null;
  if (key === 'automation' && !atMax && lvl + 1 > state.grade) {
    locked = `ต้องการโรงงานเกรด ${lvl + 1}`;
  }
  return { key, lvl, max, cost, atMax, locked, canBuy: !atMax && !locked && state.money >= cost };
}

export function buyUpgrade(state, key) {
  const info = upgradeInfo(state, key);
  if (!info.canBuy) return false;
  state.money -= info.cost;
  state.levels[key] += 1;
  state.stats.upgradesBought += 1;
  return true;
}

export function previewAfter(state, key) {
  const s = JSON.parse(JSON.stringify(state));
  s.levels[key] += 1;
  return s;
}

export function effectText(state, key) {
  const next = previewAfter(state, key);
  const f1 = (n) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));
  switch (key) {
    case 'production':
      return `ผลิต ${f1(spawnRate(state))} → ${f1(spawnRate(next))} ชิ้น/วิ`;
    case 'value':
      return `มูลค่า ×${fmtNum(valueMultiplier(state))} → ×${fmtNum(valueMultiplier(next))}`;
    case 'storage':
      return `ความจุ ${capacity(state)} → ${capacity(next)} ชิ้น`;
    case 'efficiency':
      return `เก็บ ${f1(collectRate(state))} → ${f1(collectRate(next))} ชิ้น/วิ`;
    case 'automation':
      return AUTOMATION_FEATURES[Math.min(5, state.levels.automation + 1)];
    default:
      return '';
  }
}

// ---- grades --------------------------------------------------------------

export function nextGrade(state) {
  return GRADES[state.grade] || null; // GRADES[state.grade] is grade (state.grade + 1)
}

export function gradeRequirements(state) {
  const next = nextGrade(state);
  if (!next) return null;
  const need = Math.ceil(levelCap(state) * 0.8);
  const reqs = [
    { label: `เงิน ${fmtMoney(next.cost)}`, have: state.money, need: next.cost, ok: state.money >= next.cost, money: true },
  ];
  for (const k of CORE_KEYS) {
    reqs.push({
      label: `${UPGRADES[k].name} Lv.${need}`,
      have: state.levels[k], need, ok: state.levels[k] >= need,
    });
  }
  return { next, reqs, ok: reqs.every((r) => r.ok) };
}

export function upgradeGrade(state) {
  const r = gradeRequirements(state);
  if (!r || !r.ok) return false;
  state.money -= r.next.cost;
  state.grade += 1;
  const tag = 'grade' + state.grade;
  if (!state.unlocked.includes(tag)) state.unlocked.push(tag);
  return true;
}

// ---- offline -------------------------------------------------------------

export function computeOffline(state, now = Date.now()) {
  const elapsed = Math.max(0, (now - (state.lastSaved || now)) / 1000);
  if (elapsed < 30) return null;
  const cap = offlineCapSeconds(state);
  const counted = Math.min(elapsed, cap);
  const gain = incomePerSec(state) * counted * OFFLINE_EFFICIENCY;
  const objects = Math.floor(throughput(state) * counted * OFFLINE_EFFICIENCY);
  return { elapsed, counted, capped: elapsed > cap, gain, objects };
}

// ---- formatting ----------------------------------------------------------

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function fmtNum(n) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  const e = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / Math.pow(10, e * 3);
  return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + SUFFIX[e];
}

export function fmtMoney(n) {
  if (n < 1000) return '$' + Math.floor(n);
  return '$' + fmtNum(n);
}

export function fmtDuration(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} ชม. ${m} นาที`;
  if (m > 0) return `${m} นาที`;
  return `${sec} วินาที`;
}
