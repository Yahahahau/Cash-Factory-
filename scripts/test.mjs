// Economy / save tests (pure logic). Run: npm test
import * as E from '../src/economy.js';
import { sanitize, serialize } from '../src/save.js';
import { getStage, layoutIndex, COIN_TYPES, MACHINE_IDS as LAYOUT_IDS } from '../src/layout.js';

let pass = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} expected ${b}, got ${a}`); };
const truthy = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };

t('new game: $10, stage 1 target 50, first pusher costs $5', () => {
  const s = E.newState();
  eq(s.cash, 10); eq(s.stage, 1); eq(E.stageTarget(1), 50); eq(E.machineCost('pusherA', 0), 5); eq(E.globalCost('rate', 0), 3);
});
t('coin type probabilities sum to 1 and rare chance upgrades increase it', () => {
  const s = E.newState();
  const sum = E.typeProbabilities(s).reduce((a, b) => a + b, 0);
  truthy(Math.abs(sum - 1) < 1e-9, 'sum');
  const before = E.typeProbabilities(s)[3];
  s.levels.rare = 5;
  truthy(E.typeProbabilities(s)[3] > before, 'rare chance grows');
});
t('buying: cash is spent, level rises, cannot buy without money or above max', () => {
  const s = E.newState();
  s.cash = 5;
  truthy(E.buyUpgrade(s, 'pusherA'), 'buy'); eq(s.cash, 0); eq(s.machines.pusherA, 1);
  truthy(!E.buyUpgrade(s, 'pusherA'), 'no money');
  s.cash = 1e12; s.machines.pusherA = 12;
  truthy(!E.buyUpgrade(s, 'pusherA'), 'max level');
  s.levels.rate = 0; truthy(E.buyUpgrade(s, 'rate')); eq(s.levels.rate, 1);
});
t('upgrade effects are measurable and monotonic (rate, capacity, pusher, conveyor, blower, magnet, launcher)', () => {
  truthy(E.spawnRate({ levels: { rate: 5 } }) > E.spawnRate({ levels: { rate: 4 } }));
  truthy(E.capacity({ levels: { capacity: 3 } }) > E.capacity({ levels: { capacity: 2 } }));
  truthy(E.pusherParams(6).interval < E.pusherParams(1).interval, 'pusher interval');
  truthy(!E.pusherParams(0).active && E.pusherParams(1).active, 'pusher activation');
  truthy(E.conveyorSpeed(5) > E.conveyorSpeed(1)); truthy(E.blowerForce(5) > E.blowerForce(1));
  truthy(E.magnetForce(5) > E.magnetForce(1)); truthy(E.launcherParams(5).power > E.launcherParams(1).power);
  const s = E.newState();
  truthy(E.effectText(s, 'rate').includes('→')); truthy(E.effectText(s, 'pusherA').length > 3);
});
t('stage targets grow, rewards grow, value multiplier grows', () => {
  eq(E.stageTarget(2), 250);
  for (let n = 1; n < 12; n++) { truthy(E.stageTarget(n + 1) >= E.stageTarget(n), 'target'); truthy(E.stageReward(n + 1).cash > E.stageReward(n).cash, 'reward'); }
  truthy(E.stageValueMult(5) > E.stageValueMult(1));
});
t('stage completion pays cash + gems, advances stage, resets progress (progress is separate from cash)', () => {
  const s = E.newState();
  s.progress = 49; truthy(!E.stageDone(s));
  s.progress = 50; truthy(E.stageDone(s));
  const c0 = s.cash;
  const r = E.completeStage(s);
  eq(s.stage, 2); eq(s.progress, 0); eq(s.cash, c0 + r.cash); truthy(r.gems >= 2);
});
t('coin value uses stage multiplier, gate multiplier and combo bonus (capped)', () => {
  const s = E.newState();
  eq(E.coinValue(s, 0), 1);
  eq(E.coinValue(s, 2), 10);
  eq(E.coinValue(s, 0, 2), 2);
  truthy(E.coinValue(s, 0, 1, 20) > E.coinValue(s, 0, 1, 0));
  truthy(E.comboBonus(10000) <= 1.5);
  s.stage = 3; truthy(E.coinValue(s, 0) > 1);
});
t('offline income: needs an active pusher, capped, 50% efficiency', () => {
  const s = E.newState();
  s.lastSaved = Date.now() - 3600 * 1000;
  eq(E.computeOffline(s), null);
  s.machines.pusherA = 3; s.machines.pusherB = 3; s.levels.rate = 4;
  const o = E.computeOffline(s);
  truthy(o && o.gain > 0, 'gain');
  s.lastSaved = Date.now() - 100 * 3600 * 1000;
  const o2 = E.computeOffline(s);
  truthy(o2.capped && o2.counted <= E.offlineCapSeconds(s) + 1);
});
t('formatting', () => {
  eq(E.fmtMoney(5), '$5'); eq(E.fmtCash(12345), '12.3K'); eq(E.fmtDuration(125), '2 นาที');
});
t('save: round trip keeps cash, gems, stage, progress, levels, machines, settings, timestamp', () => {
  const s = E.newState();
  s.cash = 1234; s.gems = 7; s.stage = 3; s.progress = 120; s.levels.rate = 5; s.machines.pusherB = 4; s.machines.conv1 = 2; s.settings.pixel = false;
  const r = sanitize(JSON.parse(serialize(s)));
  eq(r.cash, 1234); eq(r.gems, 7); eq(r.stage, 3); eq(r.progress, 120); eq(r.levels.rate, 5); eq(r.machines.pusherB, 4); eq(r.machines.conv1, 2); eq(r.settings.pixel, false);
  truthy(Math.abs(r.lastSaved - s.lastSaved) < 5);
});
t('save: corrupt / hostile data is sanitised', () => {
  const r = sanitize({ cash: 'x', stage: -4, levels: { rate: 1e9 }, machines: { pusherA: 99 }, settings: { quality: 'ultra' } });
  eq(r.stage, 1); eq(r.levels.rate, E.GLOBALS.rate.max); eq(r.machines.pusherA, 12); eq(r.settings.quality, 'high');
  eq(sanitize(null).cash, 10);
});
t('layout: every stage has labels for its machines, a pit, a pipe and coin configs match', () => {
  for (let n = 1; n <= 12; n++) {
    const d = getStage(n);
    truthy(d.labels.length >= d.pistons.length + d.belts.length, 'labels stage ' + n);
    for (const l of d.labels) truthy(E.MACHINES[l.id], 'machine ' + l.id);
    truthy(d.pit.x1 > d.pit.x0 && d.pipe && d.spawn, 'pit/pipe');
    truthy(d.palette, 'palette');
  }
  eq(layoutIndex(6), 3); eq(layoutIndex(7), 4); eq(layoutIndex(8), 5); eq(layoutIndex(9), 3);
  eq(COIN_TYPES.length, E.COIN_VALUES.length);
  for (const id of LAYOUT_IDS) truthy(E.MACHINES[id], 'id ' + id);
});

console.log(`\n${pass} tests passed`);
