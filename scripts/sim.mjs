// Progression simulator: uses the real economy formulas (economy.js / progression.js) with an expected-value income model.
// Coins collected per second = E.throughput(s) (the economy's own estimate of what the machine can process).
// Usage: node scripts/sim.mjs [legacy]   -> prints minutes to New Run for three player profiles and run 1..3
import * as E from '../src/economy.js';
import * as P from '../src/progression.js';
// Before the expansion (commit 945bfaf) the same simulator gave: active 4 min, partly automated 4-5 min, idle 8-11 min
// to New Run (stage 6). Those formulas are no longer in the tree; see docs/economy-balancing.md.

const PROFILES = {
  active: { buyEvery: 2, mini: 1.0, label: 'Active (buys at once, plays Flying Ball whenever ready)' },
  partial: { buyEvery: 30, mini: 0.4, label: 'Partly automated (checks every 30 s, Flying Ball 40%)' },
  idle: { buyEvery: 300, mini: 0, label: 'Mostly idle (checks every 5 min, no Flying Ball)' },
};
const EXP_MULT = E.rewardTable().reduce((a, r) => a + r.mult * r.p, 0);

function options(s) { return P.buyOptions(s); }
function canRun(s) { return E.canNewRun(s); }
function incomeRate(s) { return E.incomePerSec(s) * E.permMult(s) * CAL(s.stage); }
// calibration from scripts/calibrate.mjs (real Rapier game, headless): measured coins/s = model x 0.95 on the single-platform
// stage 1 and x 0.6 on the multi-platform stages 2+; the machine needs about 20 s to fill before coins arrive
export const CAL = (stage) => (stage === 1 ? 0.95 : 0.6);
function collectRate(s) { return E.throughput(s) * CAL(s.stage); }

// greedy-by-value policy: best (income gain + progress gain) per cost. Upgrades the model cannot value (machines that
// only shape the physics) count as a small fixed gain, so they are bought when cheap relative to income, like a player would.
function worth(s) { const v = incomeRate(s); return v + collectRate(s) * 0.5 * E.stageValueMult(s.stage); }
function pick(s) {
  const base = worth(s);
  let best = null, bs = 0;
  for (const o of options(s)) {
    const have = o.cur === 'gems' ? s.gems : s.cash;
    if (have < o.cost) continue;
    const c = structuredClone({ ...s }); const oc = options(c).find((x) => x.key === o.key);
    if (!oc || !oc.buy()) continue;
    let gain = worth(c) - base;
    if (gain <= 1e-9) gain = 0.03 * Math.max(base, 0.5);
    const price = o.cur === 'gems' ? o.cost * 40 * Math.max(1, base) / 10 : o.cost;
    const sc = gain / price;
    if (sc > bs) { bs = sc; best = o; }
  }
  return best;
}

export function simulate(profile, runs = 1, seed = 1, maxH = 40) {
  const pr = PROFILES[profile];
  let s = E.newState();
  let rnd = seed; const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let r = 0; r < runs; r++) {
    let t = 0, lastBuy = -1e9, boostUntil = 0, cool = 0, mult = 1, unlocks = [], lastUnlock = 0, gaps = [];
    const dt = 1;
    while (!canRun(s) && t < maxH * 3600) {
      // Flying Ball: 20 min boost, then 30 min cooldown (expected-value multiplier)
      if (t >= cool && t >= boostUntil && rand() < pr.mini * dt / 60) { mult = EXP_MULT; boostUntil = t + 1200; cool = boostUntil + 1800; }
      const m = t < boostUntil ? mult : 1;
      const inc = incomeRate(s) * m * dt;
      s.cash += inc; s.stats.totalEarned += inc; s.runStats.earned += inc;
      const c = collectRate(s) * dt;
      s.progress += c; s.stats.coinsCollected += c; s.runStats.coins += c;
      s.gems += c * E.typeProbabilities(s)[3];
      s.stats.playSeconds += dt;
      s.stats.manualDrops += pr.buyEvery <= 2 ? 0.3 * dt : 0; // an active player taps the drop button
      while (E.stageDone(s)) { E.completeStage(s); s.stats.stagesCleared; unlocks.push({ t, what: 'stage ' + s.stage }); }
      if (t % 5 === 0) { for (const m of P.checkMilestones(s)) unlocks.push({ t, what: m.id }); E.checkAchievements(s); }
      s.runStats.bestCombo = Math.max(s.runStats.bestCombo, Math.min(60, Math.floor(collectRate(s) * 2.5 * (1 + 0.16 * s.xlv.combo))));
      s.stats.bestCombo = Math.max(s.stats.bestCombo, s.runStats.bestCombo);
      if (t - lastBuy >= pr.buyEvery) {
        lastBuy = t;
        for (let k = 0; k < 50; k++) {
          const o = pick(s);
          if (!o || !o.buy()) break;
          if (process.env.DBG) console.log(Math.round(t / 60), o.key, Math.round(s.cash));
          if (o.first) unlocks.push({ t, what: o.key });
        }
        P.ensureMissions(s);
        for (const m of [...s.missions.active]) if (P.missionProgress(s, m).done && P.claimMission(s, m.id)) unlocks.push({ t, what: 'mission' });
      }
      t += dt;
    }
    const ts = unlocks.map((u) => u.t).sort((a, b) => a - b);
    let maxGap = 0, prev = 0; for (const x of ts) { maxGap = Math.max(maxGap, x - prev); prev = x; }
    out.push({ run: s.run, minutes: Math.round(t / 60), stage: s.stage, unlocks: unlocks.length, maxGapMin: +(maxGap / 60).toFixed(1), earned: Math.round(s.runStats.earned) });
    E.applyNewRun(s);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Expanded formulas | expected Flying Ball multiplier', EXP_MULT.toFixed(2));
  for (const p of Object.keys(PROFILES)) {
    const r = simulate(p, 3);
    console.log(PROFILES[p].label);
    for (const x of r) console.log(`  run ${x.run}: ${x.minutes} min to New Run (stage ${x.stage}), ${x.unlocks} unlock events, longest gap ${x.maxGapMin} min, earned $${E.fmtCash(x.earned)}`);
  }
}
