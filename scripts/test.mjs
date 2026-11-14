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
  eq(E.fmtMoney(5), '$5'); eq(E.fmtCash(12345), '12.3K'); eq(E.fmtDuration(125), '2 min');
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
    truthy(d.labels.length >= d.pistons.filter((p) => p.id !== 'sweeper').length + d.belts.length, 'labels stage ' + n);
    for (const l of d.labels) truthy(E.MACHINES[l.id], 'machine ' + l.id);
    truthy(d.pit.x1 > d.pit.x0 && d.pipe && d.spawn, 'pit/pipe');
    truthy(d.palette, 'palette');
  }
  eq(layoutIndex(6), 3); eq(layoutIndex(7), 4); eq(layoutIndex(8), 5); eq(layoutIndex(9), 3);
  eq(COIN_TYPES.length, E.COIN_VALUES.length);
  for (const id of LAYOUT_IDS) truthy(E.MACHINES[id], 'id ' + id);
});


// ================== run / pricing / mini-game / boost tests ==================
import { FlyCore, FLY } from '../src/flyball.js';

t('dynamic pricing: run + level + wallet tier; stable, capped, never random', () => {
  const s = E.newState();
  eq(E.globalCost('rate', 0, s), 3);
  const c1 = E.machineCost('pusherC', 3, s);
  s.run = 3; truthy(E.machineCost('pusherC', 3, s) > c1, 'higher run = higher price');
  s.run = 1; s.priceTier = 0;
  const lo = E.globalCost('capacity', 4, s);
  s.cash = 1e6; E.refreshTier(s);
  const hi = E.globalCost('capacity', 4, s);
  truthy(hi > lo && hi <= lo * E.ECON.price.walletCap + 1, 'wallet raises price moderately');
  eq(E.globalCost('capacity', 4, s), hi, 'same state, same price');
  s.cash = 5; truthy(!E.refreshTier(s) && E.globalCost('capacity', 4, s) === hi, 'tier never drops after spending');
  s.cash = 1e300; E.refreshTier(s); truthy(E.walletMult(s.priceTier) <= E.ECON.price.walletCap, 'wallet cap');
  s.run = 9999; truthy(E.runPriceMult(s.run) <= E.ECON.price.runCap, 'run cap');
  truthy(E.walletTier(50) === 0 && E.walletTier(100) >= 1, 'tier starts at $100');
});

t('income pipeline: boost multiplies once, perm bonus separate, gems / stage reward / costs untouched', () => {
  const s = E.newState();
  const now = 1_000_000;
  eq(E.income(s, 10, now).final, 10);
  s.boost = { mult: 16, until: now + 60000 };
  eq(E.income(s, 10, now).final, 160, 'x16');
  eq(E.income(s, 10, now + 61000).final, 10, 'expired');
  s.perm.points = 10; truthy(Math.abs(E.income(s, 10, now).final - 160 * 1.3) < 1e-9, 'perm x1.3');
  const c0 = E.globalCost('rate', 0, s);
  s.cash = 0; s.gems = 0;
  const rw = E.completeStage(s);
  eq(s.cash, rw.cash, 'stage cash not boosted'); eq(s.gems, rw.gems, 'gems not boosted');
  eq(E.globalCost('rate', 0, s), c0, 'upgrade cost not boosted');
});

t('reward table: configurable, sums to 1, rarer tiers are less likely, roll matches distribution', () => {
  const tb = E.rewardTable();
  truthy(Math.abs(tb.reduce((a, r) => a + r.p, 0) - 1) < 1e-9, 'sum');
  for (let i = 1; i < tb.length; i++) truthy(tb[i].p < tb[i - 1].p && tb[i].mult > tb[i - 1].mult, 'monotonic');
  const n = 40000, cnt = {};
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) { const m = E.rollReward(rnd); cnt[m] = (cnt[m] || 0) + 1; }
  for (const r of tb) truthy(Math.abs(cnt[r.mult] / n - r.p) < 0.012, 'x' + r.mult + ' freq ' + cnt[r.mult] / n);
  eq(E.rollReward(() => 0), 2); eq(E.rollReward(() => 0.999999), 256);
});

t('mini-game core: a simple autopilot can clear 10 and 20 gates; gates are never skipped; failing is possible', () => {
  for (const goal of [10, 20]) {
    let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const c = new FlyCore(goal, rnd);
    c.flap();
    for (let i = 0; i < 60 * 120 && c.state === 'play'; i++) {
      const p = c.pipes.find((q) => q.x + FLY.PIPEW > FLY.BX - FLY.R - 2);
      const target = p ? p.c + p.gap * 0.18 : FLY.H * 0.45;
      if (c.vy > 0 && c.y > target) c.flap();
      c.update(1 / 60);
    }
    eq(c.state, 'won', 'goal ' + goal + ' score ' + c.score); eq(c.score, goal);
    truthy(c.t * 1000 >= goal * E.ECON.mini.minMsPerGate, 'duration plausible ' + c.t);
  }
  const d = new FlyCore(10); d.flap(); for (let i = 0; i < 600; i++) d.update(1 / 60);
  eq(d.state, 'dead', 'doing nothing = falls to the ground');
});

t('mini-game session: only a started session can pay, once; failures cost nothing; no cooldown on fail', () => {
  const s = E.newState();
  const now = 5_000_000;
  eq(E.finishMini(s, { score: 99, durationMs: 99999 }, now).ok, false, 'no session -> no reward');
  const ses = E.startMini(s, now);
  truthy(ses && ses.objective === 10, 'objective 10');
  const bad = E.finishMini(s, { score: 4, durationMs: 9000 }, now + 9000);
  eq(bad.ok, false); eq(s.boost.mult, 1); eq(s.cooldownUntil, 0, 'fail = no cooldown'); eq(s.mini.fails, 1);
  eq(E.finishMini(s, { score: 10, durationMs: 12000 }, now + 12000).ok, false, 'a settled session cannot be replayed');
  const ses2 = E.startMini(s, now + 20000);
  const cheat = E.finishMini(s, { score: 10, durationMs: 800 }, now + 20800);
  eq(cheat.ok, false, 'impossibly fast result is rejected'); eq(cheat.reason, 'implausible');
  E.startMini(s, now + 30000);
  const win = E.finishMini(s, { score: 10, durationMs: 12000 }, now + 42000, () => 0.7);
  eq(win.ok, true); eq(win.mult, 4); eq(s.boost.mult, 4); eq(s.boost.until, now + 42000 + 20 * 60000);
  eq(s.mini.wins, 1); eq(E.miniObjective(s), 12, 'next objective harder'); void ses2;
  eq(E.startMini(s, now + 50000), null, 'cannot start during the boost');
});

t('boost 20 min -> 30 min cooldown -> ready; works across offline gaps and refresh', () => {
  const s = E.newState();
  const t0 = 10_000_000;
  E.startMini(s, t0); E.finishMini(s, { score: 10, durationMs: 11000 }, t0 + 11000, () => 0.9995);
  eq(s.boost.mult, 256); const end = s.boost.until;
  eq(E.miniStatus(s, end - 1000).state, 'boost');
  eq(E.expireBoost(s, end - 1), false);
  eq(E.expireBoost(s, end + 5 * 60000), true, 'expires (even if found late)');
  eq(s.boost.mult, 1); eq(s.cooldownUntil, end + 30 * 60000, 'cooldown starts at the exact end of the boost');
  eq(E.miniStatus(s, end + 10 * 60000).state, 'cooldown');
  eq(E.startMini(s, end + 10 * 60000), null, 'locked during cooldown');
  eq(E.miniStatus(s, end + 30 * 60000).state, 'ready');
  // save / load keeps the timers (refresh safe) and a pending session
  const s2 = sanitize(JSON.parse(serialize(s)));
  eq(s2.cooldownUntil, s.cooldownUntil);
  E.startMini(s2, end + 31 * 60000);
  const s3 = sanitize(JSON.parse(serialize(s2)));
  truthy(s3.mini.session && s3.mini.session.id === s2.mini.session.id, 'session survives refresh');
  // clock rolled back by 10 minutes: remaining time unchanged
  const s4 = E.newState(); s4.boost = { mult: 2, until: 2_000_000 + 600000 }; s4.lastSaved = 2_000_000;
  E.normalizeClock(s4, 2_000_000 - 600000);
  eq(s4.boost.until, 2_000_000, 'shifted back with the clock');
});

t('offline income counts the boost only for the overlapping time', () => {
  const s = E.newState();
  s.machines.pusherA = 3; s.levels.rate = 4;
  const now = 50_000_000;
  s.lastSaved = now - 3600000;
  const base = E.computeOffline(s, now).gain;
  s.boost = { mult: 16, until: now - 1800000 }; // boost covered the first half hour
  const boosted = E.computeOffline(s, now).gain;
  truthy(Math.abs(boosted / base - (0.5 * 16 + 0.5)) < 1e-6, 'half boosted: ' + boosted / base);
});

t('new run: temporary state resets, permanent progress is kept, prices rise, points convert to income', () => {
  const s = E.newState();
  eq(E.canNewRun(s), false);
  s.stage = 9; s.cash = 12345; s.levels.rate = 7; s.machines.pusherB = 4; s.progress = 33; s.gems = 41; s.stats.totalEarned = 9999; s.runStats.earned = 5000;
  s.boost = { mult: 4, until: Date.now() + 99999 }; s.mini.best = 14; s.perm.bestStage = 9;
  truthy(E.canNewRun(s));
  const pv = E.previewNewRun(s);
  eq(pv.run, 2); eq(pv.pointsGain, 8); truthy(pv.startCash === 10 + 20 * 8); truthy(pv.permMult > 1.2);
  E.applyNewRun(s);
  eq(s.run, 2); eq(s.stage, 1); eq(s.progress, 0); eq(s.cash, 170); eq(s.levels.rate, 0); eq(s.machines.pusherB, 0); eq(s.priceTier, 0);
  eq(s.gems, 41); eq(s.stats.totalEarned, 9999); eq(s.perm.points, 8); eq(s.perm.runsCompleted, 1); eq(s.perm.bestStage, 9);
  eq(s.mini.best, 14); eq(s.boost.mult, 4, 'boost survives a new run'); eq(s.runStats.earned, 0);
  truthy(E.globalCost('rate', 0, s) > 3, 'new run prices are higher');
  truthy(s.perm.achievements.includes('run1'));
});

t('save v3: round trip + old v2 save (no new fields) loads with safe defaults + hostile values clamped', () => {
  const s = E.newState(); s.run = 4; s.perm.points = 7; s.boost = { mult: 16, until: Date.now() + 1000 }; s.cooldownUntil = Date.now() + 5000; s.mini.best = 11;
  const r = sanitize(JSON.parse(serialize(s)));
  eq(r.run, 4); eq(r.perm.points, 7); eq(r.boost.mult, 16); eq(r.mini.best, 11);
  const old = sanitize({ v: 2, cash: 500, gems: 3, stage: 5, progress: 10, levels: { rate: 2 } });
  eq(old.run, 1); eq(old.stage, 5); eq(old.cash, 500); eq(old.boost.mult, 1); eq(old.perm.bestStage, 5);
  const evil = sanitize({ boost: { mult: 1e12, until: Date.now() + 1e13 }, cooldownUntil: 'x', run: -5, perm: { points: -9, achievements: [1, 'ok'] } });
  eq(evil.boost.mult, 1, 'boost with absurd expiry dropped'); eq(evil.run, 1); eq(evil.perm.points, 0); eq(evil.perm.achievements.length, 1);
});

console.log(`\n${pass} tests passed`);
