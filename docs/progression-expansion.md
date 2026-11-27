# Progression expansion

## Audit of the game before the expansion (commit 945bfaf)

**New Run**
- New Run unlocked at **stage 6**.
- It gave stage − 1 permanent points (+3% income each) and +$20 starting cash per point.
- The run price multiplier was +35% per run, capped at x8.

**Upgrades and currency**
- Upgrades were the 8 machines (pistons A–D, conveyor, blower, magnet, launcher), 3 globals (coin rate, capacity, rare chance) and the Cursor helper.
- Upgrade prices were base × growth^level × run multiplier × wallet tier.
- **Gems were earned but could not be spent on anything.**
- Achievements: 5, with no rewards.
- Missions, collections and per-run goals: none.

**Measured time to New Run** with `node scripts/sim.mjs` (see [economy-balancing.md](economy-balancing.md)):

| Player profile | Time to New Run |
|---|---|
| Active | about 4 min |
| Partly automated | about 4–5 min |
| Mostly idle | about 8–11 min |

New Run was reached faster than anything else in the game could happen, so the button arrived too early.

## What was added
| System | Summary | Doc |
|---|---|---|
| Upgrade branches | Coin Machine, Economy (+Coin Polish, Stage Bounty), Automation (+Auto Feeder, Night Vault), Special (Combo Keeper, Golden Touch, Stage Resonance). They unlock by stage | [upgrade-branches.md](upgrade-branches.md) |
| Machine Parts | 5 permanent components with 5 tiers each, bought with gems. Each tier changes the 3D machine and a gameplay value | [upgrade-branches.md](upgrade-branches.md) |
| Stages | New Run moved to stage 10. The Stage Map shows themes, targets, rewards and what each stage unlocks | [stage-progression.md](stage-progression.md) |
| Run milestones | 16 per run, paid automatically. 10 are required for New Run | [new-run-system.md](new-run-system.md) |
| Missions | 3 at a time, claimed for gems, can be swapped for 1 gem. Kept across runs | this page |
| Achievements | 11 (was 5). 8 of them unlock collection items | this page |
| Collections | Pipe paints (6) and collect sparks (4). **Cosmetic only** | this page |
| New Run screen | Shows the run summary, next-run benefits, what is kept and what resets | [new-run-system.md](new-run-system.md) |

All expansion code lives in:
- `src/content.js` (data),
- `src/progression.js` (logic),
- `src/ui-progress.js` (windows).

Formula hooks are in `economy.js`. The machine hooks are in `machines.js`, which applies the part multipliers, and `game.js`, which handles golden coins, the Auto Feeder, the combo window and the cosmetic sparks. The look is in `world.applyLook`.

## Missions
- Templates, cycled: collect N coins (120 + 60q), buy N upgrades, earn about 2 minutes of current income, clear stages, use manual drops, upgrade a machine part, win Flying Ball.
- Progress is the stat now minus the stat when the mission was created, so old progress never counts.
- Reward is 3 + min(12, ⌊q/3⌋) gems, +3 for part and Flying Ball missions. `q` is the mission number.

## Collections (cosmetic only)
Items come from achievements:
- Ruby: first run.
- Cobalt: stage 10.
- Gold Leaf: $1M.
- Obsidian: 15 part tiers.
- Candy Pink: 25 missions.
- Ice Sparks: 3 Flying Ball wins.
- Neon Sparks: a x50 combo.
- Ember Sparks: all run milestones.

Pipe paint recolours the dispenser pipe. Sparks recolour the particles when a coin is collected. There are no paid or random rewards.

## Save compatibility
- The save format is now v4. A v3 (or v2) save loads with every new field at its default.
- Run milestones that the current run has already passed are granted on migration, without paying their rewards.
- Hostile values are clamped.
- The cloud payload version (`SAVE_VERSION`) is 4: an older client sees a v4 cloud save as "newer format" and asks the player instead of overwriting it.
- Tests: `npm test` covers round trip, migration and clamping.

**One behaviour change for existing players:** a run that had passed stage 6 can no longer start New Run until it reaches stage 10 and 10 milestones. Nothing is lost; the run simply continues.
