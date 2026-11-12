// Greedy economy simulator: prints how long (idle, no taps) each grade takes.
import * as E from '../src/economy.js';

const s = E.newState();
let t = 0;
const dt = 1;
let lastGradeT = 0;
const log = [];
const MAX_T = 6 * 3600 * 4;

function bestUpgrade() {
  let best = null;
  for (const k of E.UPGRADE_KEYS) {
    const info = E.upgradeInfo(s, k);
    if (info.atMax || info.locked) continue;
    const before = E.incomePerSec(s);
    const after = E.incomePerSec(E.previewAfter(s, k));
    const gain = Math.max(after - before, before * 0.0005); // automation/storage have indirect value
    const score = info.cost / gain;
    if (!best || score < best.score) best = { k, score, cost: info.cost };
  }
  return best;
}

while (t < MAX_T && s.grade <= E.GRADES.length) {
  s.money += E.incomePerSec(s) * dt;
  t += dt;
  // grade up as soon as possible
  const gr = E.gradeRequirements(s);
  if (gr && gr.ok) {
    E.upgradeGrade(s);
    log.push(`grade ${s.grade} reached at ${(t / 60).toFixed(1)} min (+${((t - lastGradeT) / 60).toFixed(1)} min)  income ${E.fmtMoney(E.incomePerSec(s))}/s`);
    lastGradeT = t;
    continue;
  }
  // if we're blocked on grade requirements, spend freely; else save for grade when core near cap
  let guard = 0;
  while (guard++ < 50) {
    const b = bestUpgrade();
    if (!b || s.money < b.cost) break;
    E.buyUpgrade(s, b.k);
  }
  if (s.grade === E.GRADES.length) {
    const allMax = E.CORE_KEYS.every((k) => s.levels[k] >= E.levelCap(s)) && s.levels.automation >= 5;
    if (allMax) { log.push(`all maxed at ${(t / 60).toFixed(1)} min`); break; }
  }
}

console.log(log.join('\n'));
console.log('final levels', s.levels, 'grade', s.grade, 'money', E.fmtMoney(s.money), 'time', (t / 60).toFixed(1), 'min');
