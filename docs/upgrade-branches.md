# Upgrade branches and Machine Parts

Open them from Start menu > **Upgrade Shop**. It has tabs for the four branches and Machine Parts.

**Branch upgrades** cost cash and reset on New Run. Their price is

`base × growth^level × E.priceMult(s)`

where `E.priceMult(s)` is the same run × wallet-tier multiplier that every other upgrade uses.

| Branch | Upgrade | Unlock | Base / growth / max | Effect per level |
|---|---|---|---|---|
| Coin Machine | Pistons A–D, Conveyor, Blower, Magnet, Launcher | – | unchanged | unchanged (tap a machine in the game, or use the Shop tab) |
| Economy | Coins per second, Max coins, Rare chance | – | unchanged | unchanged |
| Economy | **Coin Polish** | stage 2 | 120 / 1.32 / 20 | coin value ×(1 + 0.05·L) |
| Economy | **Stage Bounty** | stage 3 | 350 / 1.5 / 10 | stage cash ×(1 + 0.15·L), gems +⌊L/2⌋ |
| Automation | Cursor Auto Push Coin | – | unchanged | unchanged |
| Automation | **Auto Feeder** | stage 3 | 250 / 1.55 / 8 | uses a stored drop charge every max(1.5, 9 − 0.95·L) s |
| Automation | **Night Vault** | stage 5 | 700 / 1.5 / 8 | offline limit +1 h, offline efficiency +4% |
| Special | **Combo Keeper** | stage 5 | 1500 / 1.6 / 6 | combo window 2.5 + 0.4·L s, combo cap ×(1 + 0.1·L) |
| Special | **Golden Touch** | stage 6 | 3000 / 1.55 / 10 | 1.5%·L of new coins are golden (×3, drawn gold) |
| Special | **Stage Resonance** | stage 7 | 40000 / 2.0 / 5 | coin value ×(1 + 0.03·L·(stage − 1)) |

The Auto Feeder, Golden Touch and Combo Keeper change how the machine behaves, not just a number. The feeder drops coins by itself, golden coins appear on the board, and a longer combo window changes how coins should be released.

## Machine Parts
Machine Parts are **permanent** (kept on New Run). They are paid with **gems**, so gems finally have a use, and a tier unlocks when your **best stage ever** reaches its value.

| Part | Tier unlock (best stage) | Gem costs | Effect per tier | Visible on the machine |
|---|---|---|---|---|
| Piston Drive | 2, 4, 6, 8, 10 | 8, 20, 40, 75, 130 | push cycle ×(1 − 0.06·t), piston capacity ×(1 + 0.08·t) | Piston heads in the tier colour (Platinum and up glow) |
| Coin Deck | 3, 5, 7, 9, 11 | 10, 24, 45, 80, 140 | coin value ×(1 + 0.06·t) | Platform edges glow in the tier colour |
| Collector Tray | 4, 6, 8, 10, 12 | 12, 26, 50, 85, 150 | rare chance +0.4%·t (cap 12%), combo cap ×(1 + 0.05·t) | Grinder rollers |
| Machine Frame | 2, 5, 8, 11, 14 | 8, 22, 45, 80, 140 | +4 coins on the field, +1 drop charge at Silver and Platinum | Piston, belt and grinder housings |
| Main Drive | 5, 7, 9, 11, 13 | 15, 30, 55, 95, 160 | conveyor, blower and magnet power ×(1 + 0.07·t) (launcher capped at ×1.25), coin rate ×(1 + 0.05·t) | Dark steel fittings and belt frames |

The tiers are Stock, Bronze, Silver, Gold, Platinum and Crystal. Colours are in `content.js` `TIER_COLOR`.

The launcher multiplier is capped so that coins are never thrown out of the machine. The physics test suite still passes (33 tests).
