# SFX Event Map

Maps every actual game event and UI interaction found in the source to the SFX that it needs. "Today" is the sound that currently plays (`tap`, `drop`, `collect`, `buy`, `deny`, `clunk`, `grade`, `welcome` are the 8 procedural sounds of `src/audio.js`; "none" means silent). IDs refer to the [complete specification](sfx-complete-specification.md).

- Events listed: **84**
- Events that currently make no sound: **54**
- Events that play a placeholder: **30**

| # | Event / interaction | Source | Today | Required SFX | Notes |
|---|---|---|---|---|---|
| 1 | Pointer hovers a button (mouse / pen only) | presentation.js `.hv` policy | none | UI-02 | Optional, rate-limited |
| 2 | Pointer down on Drop / Upgrade / Flying Ball buttons | index.html buttons | none | UI-03 | Optional; replaces UI-01 there |
| 3 | Tap on a price tag / pad (opens upgrade window) | main.js `onPadTap`, ui.js | tap | UI-01 then WIN-01 | Click then window open |
| 4 | Coins/s Upgrade button | ui.js `rateBtn` | buy or deny | UP-01 / UP-02 |  |
| 5 | Upgrade window Buy / Install | xp-panels.js `#upBuy`, main.js `onBuy` | buy or deny | UP-01, UP-03 (first install), UP-02, UP-04 (at max) | Plus NOT-03 only if it is not already covered |
| 6 | Upgrade window Close | xp-panels.js `#upClose` | tap | UI-10 (or WIN-02) | Play only one |
| 7 | Cursor Auto Push buy | main.js `onBuyCursor` | buy or deny | UP-03 / UP-02 |  |
| 8 | Cursor Auto Push enable / disable | main.js `onToggleCursor` | tap | UI-05 / UI-06 |  |
| 9 | Cursor assistant slides in / pushes | cursor.js `onStatus` | none | UP-05 / UP-06 | Optional |
| 10 | Drop button press | main.js `dropBtn`, game.js `drop` | drop | CM-01 |  |
| 11 | Drop with 0 charges | game.js `drop` returns false | deny | UI-04 | Currently the harsh buzz |
| 12 | Drop charge regained | game.js `chargeT` | none | CM-02 | Optional, throttle |
| 13 | Coins/s auto spawn | game.js `_spawn(false)` | none | CM-03 | Optional |
| 14 | Coin lands / hits platform | physics (no events yet) | none | CM-04 | Needs contact events |
| 15 | Coin hits coin | physics (no events yet) | none | CM-05 | Needs contact events; voice cap |
| 16 | Coin hits wall / frame | physics (no events yet) | none | CM-06 | Needs contact events |
| 17 | Coins sliding in a pile | physics (no events yet) | none | CM-07 | Optional |
| 18 | Coin falls off a platform lip | physics (no detection yet) | none | CM-08 | Optional layer |
| 19 | Coin reaches the grinder | game.js `_collect` -> `beginSuck` | none | CM-09 | Optional |
| 20 | Coin collected, bronze | game.js `_collect` -> `audio.collect(0)` | collect(0) | CM-10 | Throttled 55 ms |
| 21 | Coin collected, silver | same | collect(1) | CM-11 |  |
| 22 | Coin collected, gold star | same | collect(2) | CM-12 |  |
| 23 | Coin collected, rare gem (+1 gem) | same | collect(3) | CM-13 |  |
| 24 | Combo counter milestone | game.js `combo` | none | CM-14 | Optional, thresholds only |
| 25 | Piston stroke (auto / anti-jam) | machines.js `onFire` -> main.js | clunk | CM-15 (+ CM-16 retract) | Frequent |
| 26 | Conveyor installed and running | machines.js belts | none | CM-17 | Loop, optional |
| 27 | Blower fan installed and running | machines.js fans | none | CM-18 | Loop, optional |
| 28 | Magnet installed and running | machines.js magnets | none | CM-19 | Loop, optional |
| 29 | Launcher kicks a coin | machines.js `onLaunch` | clunk | CM-20 |  |
| 30 | Multiplier gate doubles a coin | machines.js `onGate` | buy | CM-21 | Currently the purchase sound |
| 31 | Anti-jam air burst | machines.js `onPuff` | clunk | CM-22 |  |
| 32 | Machine ambience (main game running) | main loop | none | CM-23 | Loop, optional |
| 33 | Tap / poke on the playfield | game.js `poke` | tap | CM-24 |  |
| 34 | Stage cleared | game.js `_clearStage` | grade | UP-07 | Plus Stage Complete window (WIN-01 / UI-09) |
| 35 | Machine rebuilt for the next stage | game.js `loadStage(true)` | none | CM-25 | Optional |
| 36 | New Run dialog opens | ui `openNewRun` | none | WIN-06 |  |
| 37 | New Run started | main.js `onNewRun` | grade + flash | UP-08 |  |
| 38 | Profit boost activates | main.js `onReveal` / `endMini` | none (toast) | UP-09 |  |
| 39 | Profit boost ends | game.js `onBoostEnd` | none (toast) | UP-10 |  |
| 40 | Flying Ball ready again after cooldown | economy `miniStatus` | none | UP-11 | Needs a new event |
| 41 | Achievement unlocked | economy `checkAchievements` | none (toast) | NOT-04 |  |
| 42 | Welcome Back dialog (offline earnings) | main.js `applyOffline` | welcome | SYS-02 (+ WIN-06) |  |
| 43 | Offline cash count-up | main.js `showOffline` | none | SYS-03 | Optional |
| 44 | Offline "Collect" button | main.js | none | UI-09 |  |
| 45 | Game finished loading | ui `hideLoading` | none | SYS-01 | Optional; needs first gesture |
| 46 | Window opens (any) | xp.js `wm.open` | none | WIN-01 | Not when only nudged |
| 47 | Window closes | xp.js `close` | none | WIN-02 | Not for silent closes |
| 48 | Window minimize / restore | xp.js `minimize` / `restore` | none | WIN-03 / WIN-04 |  |
| 49 | Window maximize / restore down | xp.js `toggleMax`, presentation.js `toggleMax` | none | WIN-05 / WIN-04 |  |
| 50 | Disabled caption button / disabled button clicked | xp.js (`off` buttons) | none | UI-04 | Needs a capture listener |
| 51 | Modal backdrop click / close refused | xp.js `nudge` | none | UI-04 |  |
| 52 | Modal dialog appears | xp.js `XPDialog` | none | WIN-06 |  |
| 53 | Start Menu opens / closes | xp.js `StartMenu` | none | WIN-07 / WIN-08 |  |
| 54 | Start Menu item chosen | xp.js `StartMenu` | none | WIN-09 |  |
| 55 | Taskbar window button | xp.js `wm.open` task | none | UI-01 / WIN-03 / WIN-04 |  |
| 56 | Toast: info / warn / success | xp.js `XPNotification` | none | NOT-01 / NOT-02 / NOT-03 | Deduplicated by text |
| 57 | Toast dismissed | xp.js `XPNotification.hide` | none | NOT-05 | Optional |
| 58 | Settings tab changes | xp.js `XPTabControl` | none | UI-07 |  |
| 59 | Settings quality radio / Retro Pixel toggle | xp-panels.js | tap | UI-05 / UI-06 |  |
| 60 | SFX volume slider released | xp-panels.js `#sfx` | tap | UI-08 |  |
| 61 | Music volume slider | xp-panels.js `#mus` | none | none (silent) |  |
| 62 | Settings OK | xp-panels.js `#setOk` | tap | UI-09 |  |
| 63 | Check for updates | xp-panels.js `#sUpd` | none | UI-09 + NOT-01 |  |
| 64 | Update found, game reloads | embed.js | none | SYS-04 | Optional |
| 65 | Reset progress dialog and confirm | xp-panels.js `#sReset` | none | WIN-06 then UI-11 | Cancel = UI-10 |
| 66 | LunaWave Play / Pause / Prev / Next | lunawave-ui.js | none | MP-01 |  |
| 67 | LunaWave Repeat / Mute | lunawave-ui.js | none | UI-05 / UI-06 |  |
| 68 | LunaWave seek / volume / track ends | lunawave-ui.js | none | none (silent) |  |
| 69 | Flying Ball window opens | flyball.js `_build` | none | FB-01 |  |
| 70 | Flying Ball Start (briefing) | ui.js `#mStart` | none | FB-01 |  |
| 71 | First flap starts the flight | flyball.js `core.flap` | tap | FB-02 + FB-03 |  |
| 72 | Wing flap | flyball.js event `flap` | tap | FB-03 |  |
| 73 | Gate passed | flyball.js event `score` | collect(1) | FB-04 |  |
| 74 | Crash | flyball.js event `dead` | deny | FB-05 |  |
| 75 | Game Over panel | flyball.js `showOver` | none | FB-06 | Optional |
| 76 | Retry / Restart | flyball.js `manualRetry` | none | FB-14 |  |
| 77 | Pause / Resume | flyball.js `togglePause` | none | FB-12 / FB-13 |  |
| 78 | Quit dialog, Quit, Keep playing | flyball.js `askQuit` | none | WIN-06, UI-11, UI-10 |  |
| 79 | Mission complete | flyball.js event `won` | grade | FB-07 |  |
| 80 | Reward roll ticks (14) | flyball.js `showWin` -> `onTick` | tap | FB-08 |  |
| 81 | Reward revealed | flyball.js `onReveal` | grade + flash | FB-09 / FB-10 / FB-11 by rarity |  |
| 82 | Reward window Close | flyball.js `#mDone` | none | UI-09 then FB-15 |  |
| 83 | Flying Ball closed, main game resumes | main.js `endMini` | none | FB-15 |  |
| 84 | Flight ambience | flyball.js state `play` | none | FB-16 | Loop, optional |

## Requirements without a dedicated row above

none

## Cross-event rules

- **One sound per click:** when a click also triggers a bigger event (purchase, reward, window open), only the bigger sound plays.
- **Window open after menu launch:** WIN-09 then WIN-01 about 80 ms later, or WIN-09 alone.
- **Mini-game freeze:** while Flying Ball is open the main game is frozen, so no machine, coin or ambience sounds may play (they would be stale); only FB-* sounds and the music.
- **Page hidden:** all SFX stay suspended (existing engine behaviour).
- **Touch devices (iPad / Android):** no hover sounds; all other sounds apply.
