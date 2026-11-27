# Economy balancing report

## Method
`node scripts/sim.mjs` runs the **real** economy and progression functions second by second:

| Part of the model | How it is modelled |
|---|---|
| Coins collected per second | `E.throughput(s)`, calibrated against the real physics |
| Income | `E.incomePerSec(s)` × permanent multiplier |
| Stage completion | `E.completeStage` |
| Milestones, missions, achievements | The real functions |
| Buying | A greedy "best income gain per cost" policy over every option (`P.buyOptions`) |

**Calibration** comes from `node scripts/calibrate.mjs`, which runs the full headless game with Rapier physics at five upgrade levels on stages 1, 3 and 6. The real machine delivers about **0.95×** the model throughput on stage 1 and about **0.6×** on the multi-platform stages. The simulator applies those factors.

**Profiles:**

| Profile | Checks / buys | Flying Ball |
|---|---|---|
| Active | Buys within 2 s, uses manual drops | Plays whenever it is ready (expected boost ×9.26 for 20 min, then a 30 min cooldown) |
| Partly automated | Every 30 s | 40% of the time |
| Mostly idle | Every 5 min | Never |

## Results (simulated minutes to New Run)
| Profile | Before (stage 6) | After, run 1 (stage 10) | After, runs 2–3 | Ratio (run 1) |
|---|---|---|---|---|
| Active | 4 | 9 | 8 | 2.25× |
| Partly automated | 4–5 | 10 | 9 | 2.2× |
| Mostly idle | 8–11 | 22 | 17 | 2.2× |

**Unlock pacing:**
- In run 1 there are 48–86 unlock events: stages, first machine installs, branch unlocks, part tiers, milestones and missions.
- The longest gap between two of them is 1.2–1.5 minutes for active play and 3.5 minutes for idle play.

**Automation:** the Auto Feeder adds at most 0.83 coins/s, which is under 10% of a full machine (about 10 coins/s). Idle play is about 2.4× slower than active play, not an order of magnitude.

**No single upgrade trivialises the run:**
- The largest multipliers are Stage Resonance (+15%/stage at max, cost from $40K, doubling) and Golden Touch (+30% expected).
- Coin throughput, which is physical, stays the real limit on stage progress.
- A boost multiplies cash, not coins per second.

**Runs 2+ are slightly faster**, from permanent points and parts. This is the intended prestige effect.

## Limits
- The minutes are model time: they leave out the time spent inside Flying Ball and the 20–25 s for the machine to fill after each stage change, so real sessions run somewhat longer. The **ratios** are the meaningful result.
- The model does not value pure-physics machine upgrades (they count as a small fixed gain), so it buys them later than an eager player would.
- The economy was not tested with real players. The data to tune is in `content.js` and `economy.js` `ECON`.
