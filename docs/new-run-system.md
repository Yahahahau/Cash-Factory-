# New Run system

**Requirements:** stage ≥ 10 **and** at least 10 of the 16 run milestones (`E.canNewRun`). The Start menu entry always opens. When the requirements are not met, it explains what is missing: current stage and milestones done.

**Rewards (unchanged formulas):**
- +(stage − 1) permanent points. Each point gives +3% income and +$20 starting cash.
- New Run now happens at stage 10 instead of 6, so a run gives 9 points instead of 5.

## The New Run window
| Section | Contents |
|---|---|
| What you achieved | Stage, money earned, coins, upgrades bought, run milestones, best combo |
| Next run benefits | Starting cash, points, permanent income multiplier, machine part tiers (kept) |
| New costs | First prices with the next run multiplier |
| Kept permanently | Account and cloud save, gems, Machine Parts, missions in progress, collection items and equipped cosmetics, achievements, best stage, total earnings, statistics, settings, Flying Ball progress (a running boost or cooldown continues) |
| Reset | Cash, stage, stage progress, machine and core levels, branch upgrades, Cursor helper, run milestones |

## Safety
- New Run only changes the in-memory state, which is then saved normally. No local or cloud save is deleted.
- The account and authentication data are not part of the game state at all.
- `applyNewRun` is covered by `npm test`:
  - temporary state resets,
  - parts, missions, cosmetics, gems and points are kept,
  - the first-run achievement unlocks the Ruby pipe.
