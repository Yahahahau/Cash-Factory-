import assert from 'node:assert/strict';
import * as E from '../src/economy.js';
import { sanitize, serialize } from '../src/save.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok  ', name); };

t('costs strictly increase per level', () => {
  for (const k of E.UPGRADE_KEYS) {
    let prev = 0;
    for (let l = 0; l < 30; l++) { const c = E.upgradeCost(k, l); assert.ok(c > prev); prev = c; }
  }
});

t('cannot buy without money; buying deducts exactly the cost', () => {
  const s = E.newState();
  assert.equal(E.buyUpgrade(s, 'production'), false);
  s.money = 100;
  const cost = E.upgradeCost('production', 0);
  assert.equal(E.buyUpgrade(s, 'production'), true);
  assert.equal(s.money, 100 - cost);
  assert.equal(s.levels.production, 1);
  assert.equal(s.stats.upgradesBought, 1);
});

t('every upgrade improves its stat', () => {
  const s = E.newState();
  s.money = 1e9;
  const before = { sp: E.spawnRate(s), cr: E.collectRate(s), cap: E.capacity(s), vm: E.valueMultiplier(s) };
  E.buyUpgrade(s, 'production'); E.buyUpgrade(s, 'efficiency'); E.buyUpgrade(s, 'storage'); E.buyUpgrade(s, 'value');
  assert.ok(E.spawnRate(s) > before.sp && E.collectRate(s) > before.cr);
  assert.ok(E.capacity(s) > before.cap && E.valueMultiplier(s) > before.vm);
});

t('level cap per grade is enforced', () => {
  const s = E.newState();
  s.money = 1e30;
  s.levels.production = E.levelCap(s);
  assert.equal(E.upgradeInfo(s, 'production').atMax, true);
  assert.equal(E.buyUpgrade(s, 'production'), false);
});

t('automation requires grade', () => {
  const s = E.newState();
  s.money = 1e30;
  assert.equal(E.buyUpgrade(s, 'automation'), true); // level 1 at grade 1
  assert.equal(E.buyUpgrade(s, 'automation'), false); // level 2 needs grade 2
  assert.ok(E.upgradeInfo(s, 'automation').locked);
  assert.equal(E.nozzleCount(s), 2);
});

t('grade requirements and upgrade', () => {
  const s = E.newState();
  s.money = 1e15;
  assert.equal(E.upgradeGrade(s), false); // levels missing
  const need = Math.ceil(E.levelCap(s) * 0.8);
  for (const k of E.CORE_KEYS) s.levels[k] = need;
  const g = E.gradeRequirements(s);
  assert.equal(g.ok, true);
  const before = s.money;
  assert.equal(E.upgradeGrade(s), true);
  assert.equal(s.grade, 2);
  assert.equal(s.money, before - E.GRADES[1].cost);
  assert.ok(s.unlocked.includes('grade2'));
});

t('last grade has no next', () => {
  const s = E.newState();
  s.grade = 6;
  assert.equal(E.gradeRequirements(s), null);
  assert.equal(E.upgradeGrade(s), false);
});

t('grade raises income at equal levels', () => {
  const s = E.newState();
  let prev = E.incomePerSec(s);
  for (let g = 2; g <= 6; g++) { s.grade = g; const inc = E.incomePerSec(s); assert.ok(inc > prev); prev = inc; }
});

t('spawn rate is capped', () => {
  const s = E.newState();
  s.grade = 6; s.levels.production = 60; s.levels.automation = 5;
  assert.ok(E.spawnRate(s) <= E.MAX_SPAWN_RATE);
});

t('offline earnings: none <30s, capped, 50% efficiency', () => {
  const s = E.newState();
  s.levels.production = 5; s.levels.efficiency = 5;
  s.lastSaved = 1000;
  assert.equal(E.computeOffline(s, 1000 + 10000), null);
  const r = E.computeOffline(s, 1000 + 3600 * 1000);
  assert.ok(Math.abs(r.gain - E.incomePerSec(s) * 3600 * E.OFFLINE_EFFICIENCY) < 1e-6);
  const big = E.computeOffline(s, 1000 + 1000 * 3600 * 1000);
  assert.equal(big.capped, true);
  assert.equal(big.counted, E.offlineCapSeconds(s));
  assert.ok(big.counted <= E.MAX_OFFLINE_SECONDS_HARD);
});

t('type probabilities sum to 1 and gems need grade 3', () => {
  const s = E.newState();
  for (let g = 1; g <= 6; g++) {
    s.grade = g;
    for (const a of [0, 2]) { s.levels.automation = a; const p = E.typeProbabilities(s); assert.ok(Math.abs(p.reduce((x, y) => x + y) - 1) < 1e-9); }
  }
  s.grade = 2; assert.equal(E.typeProbabilities(s)[3], 0);
  s.grade = 3; assert.ok(E.typeProbabilities(s)[3] > 0);
});

t('formatting', () => {
  assert.equal(E.fmtMoney(5), '$5');
  assert.equal(E.fmtNum(1500), '1.50K');
  assert.equal(E.fmtNum(2.5e6), '2.50M');
  assert.ok(E.fmtDuration(3700).includes('ชม.'));
});

t('save sanitize round trip and corrupt data', () => {
  const s = E.newState();
  s.money = 1234.5; s.grade = 3; s.levels.value = 7; s.settings.pixel = false; s.settings.quality = 'low';
  s.stats.objectsCollected = 99;
  const back = sanitize(JSON.parse(serialize(s)));
  assert.equal(back.money, 1234.5);
  assert.equal(back.grade, 3);
  assert.equal(back.levels.value, 7);
  assert.equal(back.settings.pixel, false);
  assert.equal(back.settings.quality, 'low');
  assert.equal(back.stats.objectsCollected, 99);
  assert.ok(back.unlocked.includes('grade3'));
  const bad = sanitize({ money: -5, grade: 99, levels: { production: 9999, automation: 99 }, settings: { quality: 'x', sfx: 7 } });
  assert.equal(bad.money, 0);
  assert.equal(bad.grade, 6);
  assert.equal(bad.levels.production, 60);
  assert.ok(bad.levels.automation <= 5);
  assert.equal(bad.settings.quality, 'high');
  assert.equal(bad.settings.sfx, 1);
  assert.equal(sanitize(null).money, 0);
  assert.equal(sanitize({ money: NaN }).money, 0);
});

console.log(`\n${n} tests passed`);
