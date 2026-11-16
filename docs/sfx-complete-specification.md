# PIXEL COIN PUSHER: Complete SFX Specification

Phase 1 deliverable (inspection and specification only). No audio was downloaded or imported and no gameplay code was changed.

Companion documents: [existing assets audit](sfx-existing-assets-audit.md) · [event map](sfx-event-map.md) · [missing assets shopping list](sfx-missing-assets.md)

## 1. Summary

| Item | Count |
|---|---|
| SFX requirements (entries below) | **82** |
| Essential / Recommended / Optional | **19** / **34** / **29** |
| Asset status: Replacement Needed | **21** (its own event plays a placeholder synth beep today) |
| Asset status: Missing | **61** (no dedicated sound exists: the event is silent or borrows a generic placeholder such as `tap` or `deny`; the event map shows which) |
| Asset status: Existing and suitable / Unverified | **0** / **0** |
| Estimated audio files to collect (all variants) | about **126** |

The project contains **no sound-effect audio files at all**. Every current sound effect is generated live by `src/audio.js` with Web Audio oscillators (8 sounds, 0.06-0.75 s each). The only audio files are the 4 LunaWave music tracks in `public/music/`. See the audit for details.

## 2. How this specification was made

Everything below comes from reading the actual source, not from assumptions. Systems inspected:

- **Coin machine:** `game.js`, `physics.js` (Rapier, no contact events exposed), `machines.js` (pistons, conveyors, blower fan, magnet, launcher, multiplier gate, anti-jam air burst), `layout.js` (stages 1-5, 4 coin types: bronze, silver, gold star, rare gem), `cursor.js` (Cursor Auto Push assistant).
- **Economy and progression:** `economy.js` (upgrades, stage clear, New Run prestige, profit boost 20 min + 30 min cooldown, 5 achievements, offline earnings).
- **UI and desktop shell:** `ui.js`, `screens.js`, `xp.js` (windows, title-bar buttons, dialogs, balloons, Start Menu, taskbar), `xp-panels.js` (upgrade window, 7-tab Settings), `presentation.js`, `index.html`.
- **Mini-game:** `flyball.js` (Flying Ball: intro, flap, gate score, crash, pause, quit, win, reward roll), `pause.js`.
- **Music:** `lunawave.js`, `lunawave-ui.js`, `music-library.js`.
- **Audio engine:** `audio.js` and every `audio.*` / `h.onClick` call site in `main.js`, `ui.js`, `flyball.js`.

## 3. Audio identity (Phase 7)

PIXEL COIN PUSHER should sound like **an arcade coin cabinet running inside a friendly Luna-blue desktop**. Five sound families keep it consistent:

| Family | Sounds | Shared style rules |
|---|---|---|
| **A. Brass and metal coins** | CM-04..08, CM-10..13, CM-24 | Real recorded or realistic metal. Bright transient, short ring (< 250 ms), no reverb tail. Pitch-vary every play. Bronze is warm, silver is bright, gold is rich, the gem is glassy. |
| **B. Cabinet mechanics** | CM-15..23, CM-25, CM-09 | Soft, low-mid (80-250 Hz) body, rounded transients, never sharp. Rubber / felt / oiled steel. Loops very quiet. |
| **C. Luna desktop chrome** | UI-01..11, WIN-01..09, NOT-01..05, MP-01 | Short (< 300 ms), rounded, warm. Glassy sine / soft-bell tones with a small upward gesture for "open / yes" and a downward one for "close / no". Nostalgic in feel but **original**: do not use Microsoft's Windows XP sound files or soundalikes of them (copyrighted). |
| **D. Reward sparkle** | UP-01, UP-03, UP-07..10, NOT-03/04, SYS-02, FB-04, FB-07, FB-09..11 | Glassy bells and soft chimes, key-consistent. Size scales with importance: gate ping < purchase < machine install < stage clear < jackpot. |
| **E. Soft negative** | UP-02, UP-04, UI-04, NOT-02, FB-05/06 | Muted, low, short, rounded. Never a harsh buzz or square-wave beep. |

**Loudness hierarchy** (target short-term loudness relative to the average UI click = 0 dB): hover -20 · click 0 · coin collect -2..+2 · piston -3 · purchase +3 · stage clear / mission complete +5 · legendary reward +6. Peaks no higher than -3 dBFS. The SFX bus keeps its own volume slider; the LunaWave music has its own.

**Avoid:** loud or harsh sounds above ~8 kHz, repetitive identical clicks (collect 2-3 pitch variants of the most frequent sounds), long UI effects (> 400 ms for chrome), sounds that clash with the pixel / Luna visuals (no cinematic or realistic-horror sounds), and stacked coin collisions (see rules below).

**Overlap rules for the implementation phase:** global cap of about 6 simultaneous coin-contact voices; per-sound cooldowns (collect 55 ms already exists); collisions only above a velocity threshold; skip lower-priority sounds when a purchase / reward sound plays in the same frame; no hover or pointer-move sounds on touch devices (iPad / Android keep the native pointer); no SFX while the page is hidden (the existing engine already suspends it).

**Interaction with music:** LunaWave music plays whole-session. Short UI sounds should be mid-bright and dry so they sit above music without a ducking system; reward fanfares (UP-07, FB-07, FB-09..11) are long enough that a light 3 dB music duck (implementation phase, optional) would help.

**Technical delivery guidelines (for downloading):** mono 44.1 kHz is enough for nearly every SFX (stereo only for ambience loops and big fanfares); trim silence; normalise by loudness, not peak; export as WAV for editing and ship as MP3 or AAC (Ogg Vorbis support on older iPads / Safari is not reliable, so do not depend on it); seamless loops for loops; total shipped size best kept under about 1.5 MB. Keep a licence record per file (source URL, author, licence) in a `docs/audio-licences.md` file.

**Licensing:** prefer CC0 / public-domain, or licences that allow commercial use and embedding without attribution. Avoid CC-BY-NC (non-commercial) and "editorial only" files: the game is embedded in a host app. If you use CC-BY, record the attribution text and show it in the game's credits. Typical sources with clear licence labels: Kenney (CC0), Freesound (filter by the "CC0" licence; check each file), OpenGameArt (check each file), Pixabay (Pixabay Content Licence), Mixkit (Mixkit licence), Sonniss GDC audio bundles (royalty-free licence). Always re-read the licence on the individual file page.

## 4. Button-by-button UI audit (Phase 4)

Every interactive control found in the source, and whether it gets a **unique** sound or **shares** one. "Today" is what plays now (`tap` = `audio.tap()` generic blip, silent = nothing).

| Control | Where | Today | Required SFX | Unique / shared |
|---|---|---|---|---|
| Normal button click | Price tags (`padCap`, `padRare`, machine labels), `miniBtn`, `runBtn`, boost chip / tray, Cursor button, dialog Close / OK | tap or silent | UI-01 | Shared by all normal buttons |
| Hover | Any button, mouse / pen only | none | UI-02 | Shared, optional, rate-limited |
| Press feedback | Drop, Coins/s Upgrade, Flying Ball | none | UI-03 | Shared, optional; replaces UI-01 there |
| Release feedback | n/a | none | none | **Not needed**: it would double every click |
| Disabled button | Disabled `xpbtn`, greyed caption buttons (main-window Minimize / Close, dialog min / max) | silent | UI-04 | Shared with blocked-close and empty-Drop |
| Purchase button | Upgrade window Buy, Coins/s button, price tags (affordable) | buy | UP-01 | Unique |
| Purchase button (cannot afford) | same | deny | UP-02 | Unique |
| Upgrade button (machine first install) | Upgrade window "Install" | buy | UP-03 | Unique |
| Max-level button | Upgrade window "Maximum level" | silent | UP-04 | Unique, optional |
| Close button (title bar / Esc) | Every closable window | silent | WIN-02 | Shared by all windows (Flying Ball uses FB-15) |
| Minimize button | Settings, upgrade window, Boost, Cursor | silent | WIN-03 | Unique |
| Maximize button | Settings; main game window (tablet / desktop) | silent | WIN-05 | Unique |
| Restore button / taskbar restore | After maximize / minimize | silent | WIN-04 | Shared (both directions) |
| Start Menu button | Taskbar | silent | WIN-07 (open), WIN-08 (close) | Unique pair |
| Start Menu items (application launch) | Flying Ball, Profit Boost, New Run, Cursor, Settings, Statistics, Check updates | silent | WIN-09 then WIN-01 | Unique launch + shared open |
| Taskbar window buttons | Taskbar | silent | UI-01 (focus) / WIN-03, WIN-04 | Shared |
| Music Play / Pause | LunaWave | silent | MP-01 | Shared transport click |
| Music Previous / Next | LunaWave | silent | MP-01 | Shared |
| Music Repeat toggle | LunaWave | silent | UI-05 / UI-06 | Shared with toggles |
| Music Mute toggle | LunaWave | silent | UI-05 / UI-06 | Shared |
| Music volume / seek | LunaWave sliders | silent | none | Silent (the song is the feedback) |
| Settings tabs | Settings | silent | UI-07 | Unique, optional |
| Settings toggles / radios | Retro Pixel, quality radios, Cursor enable | tap | UI-05 (on) / UI-06 (off) | Unique pair |
| SFX volume slider | Settings > Sound | tap on release | UI-08 | Unique |
| Music volume slider | Settings > Music | silent | none | Silent |
| Settings OK / dialog OK | Settings, Stage Complete, Offline | tap or silent | UI-09 | Shared confirm |
| Cancel / Close in dialogs | New Run Cancel, Reset Cancel, Boost / Cursor Close | tap | UI-10 | Shared |
| Back buttons | none exist | n/a | none | Not applicable |
| Reset progress "Yes, reset" | Settings > Save info | silent | UI-11 | Unique, shared with Quit |
| New Run "Start" | New Run dialog | grade + flash | UP-08 | Unique |
| Reward collection button | Offline "Collect", Mission "Close" | silent | UI-09 | Shared |
| Mini-game Start | Flying Ball "Start" | silent | FB-01 / FB-02 | Unique |
| Mini-game Pause / Resume / Restart / Retry | Flying Ball | silent | FB-12 / FB-13 / FB-14 | Unique |
| Mini-game Quit / Keep playing | Pause panel | silent | UI-11 / UI-10 | Shared |
| Mini-game close | Title-bar close after the flight | silent | FB-15 | Unique |
| Drop button | Main screen | drop / deny | CM-01 / UI-04 | Unique |
| Check for updates | Settings > Save info | silent | UI-09 | Shared |

## 5. Gameplay events with no supported source (documented gaps)

These events from the brief **do not exist** in the game, so no SFX was invented for them. They would need design work first.

- **Machine starting / machine stopping:** the machine is always running; there is no power on / off event.
- **Pusher "movement loop":** pistons are triggered strokes (`machines.onFire`), not a continuous motion; CM-15 / CM-16 cover the strokes.
- **Coin stacking, bouncing, landing, collision:** the physics runs in Rapier but exposes **no contact events** (confirmed: no `ActiveEvents` / `EventQueue` anywhere in `src/`). CM-04..08 therefore need new contact events in the implementation phase.
- **Reward payout:** collected coins add cash and a floating "+$" text; there is no separate payout event beyond the collect sound.
- **Manual "assist" shake:** `machines.manual()` / `onShake` exist in code but nothing in the UI calls them (no button), so no sound is specified.
- **Flying Ball near-miss, separate pillar / ground collision, new best score:** the core emits only `flap`, `score`, `won`, `dead`.
- **Automation action sounds:** Cursor Auto Push has visual status changes only (UP-05, UP-06 are optional).
- **Multiplier expiration warning:** none exists; only the end event (UP-10).
- **`screens.js showReward`** is dead code (the Flying Ball window rolls the reward itself), so it is not counted as a separate trigger.

## 6. Catalogue

"Today" for each entry is given in Additional Notes. Entries are grouped by category.

## UI

### UI-01 · Button click (primary)

- **SFX ID:** UI-01
- **Sound Name:** Button click (primary)
- **Category:** UI
- **Trigger:** Any normal button that calls `h.onClick` (price tags, Flying Ball / New Run / Boost buttons, Cursor button, dialog Close buttons, Settings OK).
- **Sound Description:** A short, crisp, dry UI click: a soft plastic-key tick with a very small low "body" thump under it and no ringing tail. Slightly rounded transient, nothing sharp above ~6 kHz.
- **Audio Character:** Neutral, tactile, quiet. Mid-low pitch (~1-2 kHz centre), responsive and immediate; the most common sound in the game so it must never tire.
- **Duration:** 40-80 ms
- **Playback Type:** One-shot
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `soft UI button click sound effect`; `minimal interface click`; `subtle mechanical button press`
- **Variants to collect:** 3
- **Additional Notes:** Currently `audio.tap()`: a 60 ms square-wave blip sliding 660 -> 880 Hz. That one function is also reused for coin poke, wing flap, reward roll ticks and toggles, so it is overloaded. Needs 2-3 pitch variants to avoid machine-gun repetition. Loudness must sit about 6 dB below purchase / reward sounds.

### UI-02 · Button hover

- **SFX ID:** UI-02
- **Sound Name:** Button hover
- **Category:** UI
- **Trigger:** Mouse / pen pointer enters an enabled button (only when `html.hv` is active; never for touch).
- **Sound Description:** An almost subliminal soft air-tick or tiny "tss" of filtered noise, ~10 ms attack, no pitch.
- **Audio Character:** Airy, extremely quiet (about -20 dB under the click). Must disappear in the mix.
- **Duration:** 15-30 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `UI hover sound subtle`; `soft interface tick`; `light cursor over button sound`
- **Variants to collect:** 1
- **Additional Notes:** Do NOT play when the pointer merely crosses toolbar buttons quickly: rate-limit to one hover per 120 ms and skip on touch devices (iPad / Android use the native pointer). Safe to omit entirely.

### UI-03 · Button press (pointer down)

- **SFX ID:** UI-03
- **Sound Name:** Button press (pointer down)
- **Category:** UI
- **Trigger:** Optional pointer-down feedback on large game buttons (Drop, Coins/s Upgrade, Flying Ball).
- **Sound Description:** A slightly lower, softer "key down" thud (a damped click about 20% lower in pitch than UI-01) played on pointer down, so the click on release can be dropped on those buttons.
- **Audio Character:** Physical, soft, a hint of mechanical travel. Same family as UI-01.
- **Duration:** 30-60 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `button press down soft click`; `mechanical key down UI`; `soft plastic button push`
- **Variants to collect:** 1
- **Additional Notes:** A release sound is NOT needed (it would double every click). If used, press replaces UI-01 on those buttons, never in addition to it.

### UI-04 · Blocked / disabled action

- **SFX ID:** UI-04
- **Sound Name:** Blocked / disabled action
- **Category:** UI
- **Trigger:** Tap on a disabled button or a greyed caption button, Drop with 0 charges, backdrop click on a modal, close refused during a Flying Ball flight (`nudge()`).
- **Sound Description:** A very short, muted, dull "tock": a low wooden/plastic knock (about 200-300 Hz) with a fast decay and no pitch glide.
- **Audio Character:** Dry, closed, unthreatening. Says "not now" without sounding like an error.
- **Duration:** 60-100 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `disabled button click sound`; `UI blocked action soft thud`; `subtle denied interaction knock`
- **Variants to collect:** 1
- **Additional Notes:** Disabled `<button>` elements swallow pointer events, so the implementation will need a capture listener on the container (or `aria-disabled` buttons). Currently Drop with no charge plays the harsh "deny" buzz (UP-02) and disabled buttons are silent.

### UI-05 · Toggle ON / option selected

- **SFX ID:** UI-05
- **Sound Name:** Toggle ON / option selected
- **Category:** UI
- **Trigger:** Settings: retro pixel toggle ON, quality radio chosen; Cursor Auto Push enabled (window checkbox or ON/OFF chip).
- **Sound Description:** A small two-part click: tick down then a light upward "pop" (about a semitone-and-a-half up).
- **Audio Character:** Positive, light, a little brighter than UI-01.
- **Duration:** 60-90 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `toggle switch on sound`; `checkbox tick UI soft`; `switch flip positive click`
- **Variants to collect:** 1
- **Additional Notes:** Currently these only play the generic click (`audio.tap`). Radio choices can share this sound.

### UI-06 · Toggle OFF

- **SFX ID:** UI-06
- **Sound Name:** Toggle OFF
- **Category:** UI
- **Trigger:** Retro pixel OFF, Cursor Auto Push disabled.
- **Sound Description:** The mirror image of UI-05: tick then a light downward "pop".
- **Audio Character:** Neutral to slightly darker than UI-05.
- **Duration:** 60-90 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `toggle switch off sound`; `UI switch off soft click`; `checkbox untick sound`
- **Variants to collect:** 1
- **Additional Notes:** Should be obviously the pair of UI-05 (ideally cut from the same source recording, reversed pitch movement).

### UI-07 · Tab switch

- **SFX ID:** UI-07
- **Sound Name:** Tab switch
- **Category:** UI
- **Trigger:** Settings window tab buttons (Graphics, Retro Pixel, Sound, Music, Controls, Performance, Save info).
- **Sound Description:** A tiny paper-card / index-tab "tick" with a bit of high-mid presence; lighter than UI-01.
- **Audio Character:** Light, quick, office-desktop feeling.
- **Duration:** 30-50 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `tab switch UI sound`; `soft page tab click`; `light desktop tab tick`
- **Variants to collect:** 1
- **Additional Notes:** Tabs currently make no sound (the tab bar does not call `onClick`).

### UI-08 · Slider release preview

- **SFX ID:** UI-08
- **Sound Name:** Slider release preview
- **Category:** UI
- **Trigger:** SFX volume slider released in Settings > Sound (`change` event).
- **Sound Description:** A short, medium-pitched neutral blip (a soft marimba-like pluck or a clean click) with a clear level, so the player can hear the new SFX volume.
- **Audio Character:** Clean, neutral, deliberately representative of average SFX loudness.
- **Duration:** 80-150 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `volume preview blip UI`; `soft pluck UI feedback`; `settings slider confirm tick`
- **Variants to collect:** 1
- **Additional Notes:** Fires only on release, never while dragging (`input`). The Music slider (LunaWave) needs no preview: the song itself is the feedback.

### UI-09 · Confirm / OK

- **SFX ID:** UI-09
- **Sound Name:** Confirm / OK
- **Category:** UI
- **Trigger:** Positive dialog buttons: Settings OK, Offline "Collect", New Run "Start", Quit "Keep playing", Stage Complete OK, Flying Ball Mission "Tap to start" overlay buttons, "Check for updates".
- **Sound Description:** A clean, short positive click with a hint of upward pitch (a minor-third-ish rise), slightly warmer than UI-01.
- **Audio Character:** Affirmative, polished, nostalgic desktop feel.
- **Duration:** 70-120 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `confirm button click positive`; `UI accept sound soft`; `OK button chime short`
- **Variants to collect:** 1
- **Additional Notes:** Do not stack on top of purchase / reward sounds triggered by the same click (UP-01, UP-08): the bigger sound wins and UI-09 is skipped.

### UI-10 · Cancel / Close dialog / Back

- **SFX ID:** UI-10
- **Sound Name:** Cancel / Close dialog / Back
- **Category:** UI
- **Trigger:** Cancel, Close and "No" buttons in dialogs (Cursor Close, Flying Ball Close, Boost Close, New Run Cancel, Reset "Cancel"). The game has no "Back" button.
- **Sound Description:** A soft downward click: a UI-01 style tick followed by a tiny falling "bloop".
- **Audio Character:** Gentle, neutral-negative, closing feeling.
- **Duration:** 60-100 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `cancel button click soft`; `UI back close sound`; `soft dismiss tick`
- **Variants to collect:** 1
- **Additional Notes:** Share with WIN-02 when the same click also closes a window (play only one of them).

### UI-11 · Destructive confirm

- **SFX ID:** UI-11
- **Sound Name:** Destructive confirm
- **Category:** UI
- **Trigger:** Reset progress "Yes, reset" and Flying Ball "Quit" (ends the attempt without reward).
- **Sound Description:** A short, heavier two-step thud: a low click (about 150 Hz) plus a faint falling sweep.
- **Audio Character:** Weighty, serious, never harsh.
- **Duration:** 150-250 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `confirm delete UI sound`; `dangerous action confirmation thud`; `low serious click UI`
- **Variants to collect:** 1
- **Additional Notes:** Only 2 trigger points exist today. Reset also clears every window, so the sound must be short enough to finish.


## Windows / Desktop

### WIN-01 · Window open

- **SFX ID:** WIN-01
- **Sound Name:** Window open
- **Category:** Windows / Desktop
- **Trigger:** Any floating window opens (`wm.open`): upgrade window, Settings, Cursor window, Flying Ball briefing, Boost, New Run, Offline, Stage Complete.
- **Sound Description:** A polished interface "open" gesture: a very quick soft upward airy swish (about 150 ms) ending in a clean, warm 2-3 note glassy blip that rises by a perfect fourth. No long reverb.
- **Audio Character:** Nostalgic desktop OS feeling in an original voice (Luna-blue, friendly, rounded). Bright but not piercing.
- **Duration:** 180-300 ms
- **Playback Type:** One-shot
- **Priority:** Essential
- **Asset Status:** Missing
- **Search Keywords:** `nostalgic desktop UI window open sound`; `soft computer interface opening`; `retro operating system UI sound`
- **Variants to collect:** 1
- **Additional Notes:** Currently silent (only the click that opened it). Must be a different sound from WIN-06 (modal alert). Do not copy Microsoft's Windows XP sounds: they are copyrighted; commission or pick an original sound with a similar feel. Re-opening an already open window (it just gets nudged) must not replay it.

### WIN-02 · Window close

- **SFX ID:** WIN-02
- **Sound Name:** Window close
- **Category:** Windows / Desktop
- **Trigger:** A window is closed (title-bar close button, Esc, Close buttons, `w.close()` that is not silent).
- **Sound Description:** The reverse gesture of WIN-01: a short descending soft blip pair with a tiny closing "tick".
- **Audio Character:** Quiet, tidy, quick.
- **Duration:** 120-200 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `UI window close sound soft`; `interface closing blip`; `desktop dialog dismiss sound`
- **Variants to collect:** 1
- **Additional Notes:** `close(true)` (silent closes used by game flow such as the closeModal calls) must NOT play it. Windows closed by a purchase flow should stay silent.

### WIN-03 · Minimize

- **SFX ID:** WIN-03
- **Sound Name:** Minimize
- **Category:** Windows / Desktop
- **Trigger:** Minimize button on a window that supports it (Settings, Boost, upgrade window, Cursor window); taskbar button of the active window.
- **Sound Description:** A quick downward "whoosh-pop" of filtered noise that shrinks (about 160 ms) with a soft landing tick.
- **Audio Character:** Light, airy, directional (down towards the taskbar).
- **Duration:** 120-200 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `window minimize sound whoosh`; `UI shrink swoosh soft`; `desktop minimize effect sound`
- **Variants to collect:** 1
- **Additional Notes:** The main game window's minimize is disabled on purpose (greyed): it plays UI-04 only if the blocked-action rule is implemented.

### WIN-04 · Restore (from taskbar / from maximized)

- **SFX ID:** WIN-04
- **Sound Name:** Restore (from taskbar / from maximized)
- **Category:** Windows / Desktop
- **Trigger:** Taskbar button of a minimized window; the Restore button after Maximize.
- **Sound Description:** The opposite of WIN-03: a short rising airy "whoosh-pop" up from the taskbar with a clean tick at the end.
- **Audio Character:** Light, upward, friendly.
- **Duration:** 120-200 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `window restore sound whoosh up`; `UI expand swoosh soft`; `desktop restore effect sound`
- **Variants to collect:** 1
- **Additional Notes:** Used for both un-minimize and un-maximize; keep it consistent with WIN-03 and WIN-05.

### WIN-05 · Maximize

- **SFX ID:** WIN-05
- **Sound Name:** Maximize
- **Category:** Windows / Desktop
- **Trigger:** Maximize button of a window (Settings; main game window in tablet / desktop mode).
- **Sound Description:** A short expanding "swell" (rising filtered noise 150 ms) ending in a soft, slightly lower thump.
- **Audio Character:** Roomy and expanding; subtle.
- **Duration:** 150-220 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `window maximize sound`; `UI expand whoosh`; `screen enlarge interface sound`
- **Variants to collect:** 1
- **Additional Notes:** Main-window maximize re-lays out the game (`Presentation.toggleMax`) but never touches gameplay; the sound must not delay it.

### WIN-06 · Modal dialog alert

- **SFX ID:** WIN-06
- **Sound Name:** Modal dialog alert
- **Category:** Windows / Desktop
- **Trigger:** A modal dialog appears: Quit Flying Ball?, Reset progress, Welcome Back, New Run, Reward.
- **Sound Description:** A short, calm two-tone "ding-dong" attention sound: soft electric-piano / bell pair (a falling minor third) with a short tail, clearly different from WIN-01.
- **Audio Character:** Attentive, polite, system-dialog feeling (like an OS question box).
- **Duration:** 250-400 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `system dialog alert soft ding`; `OS question prompt sound gentle`; `attention notification two tone UI`
- **Variants to collect:** 1
- **Additional Notes:** Welcome Back (SYS-02) replaces it for the offline dialog.

### WIN-07 · Start menu open

- **SFX ID:** WIN-07
- **Sound Name:** Start menu open
- **Category:** Windows / Desktop
- **Trigger:** Start button pressed and the menu opens.
- **Sound Description:** A light upward "pop-up" blip with a quick airy swipe, a little shorter and more percussive than WIN-01.
- **Audio Character:** Friendly, nostalgic, compact.
- **Duration:** 120-200 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `start menu open sound`; `popup menu appear UI soft`; `desktop menu pop sound`
- **Variants to collect:** 1
- **Additional Notes:** The LunaWave music row lives in this menu: keep the sound quiet so it does not clash with the song.

### WIN-08 · Start menu close

- **SFX ID:** WIN-08
- **Sound Name:** Start menu close
- **Category:** Windows / Desktop
- **Trigger:** Start menu closes without an item being chosen (click outside, Esc, Start button again).
- **Sound Description:** A very short descending soft tick (a lighter reverse of WIN-07).
- **Audio Character:** Barely there.
- **Duration:** 60-120 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `menu close sound soft`; `popup dismiss tick UI`; `UI menu hide subtle`
- **Variants to collect:** 1
- **Additional Notes:** Skip when closing was caused by choosing an item (WIN-09 plays instead).

### WIN-09 · Start menu item / application launch

- **SFX ID:** WIN-09
- **Sound Name:** Start menu item / application launch
- **Category:** Windows / Desktop
- **Trigger:** A Start Menu entry is chosen: Flying Ball, Profit Boost, New Run, Cursor Auto Push Coin, Settings, Statistics, Check for updates.
- **Sound Description:** A clean, slightly bigger click with a short upward "launch" shimmer (about 120 ms), distinct from UI-01.
- **Audio Character:** Confident, application-launching, still quiet.
- **Duration:** 120-200 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `application launch UI sound`; `menu item select click soft shimmer`; `app open short chime`
- **Variants to collect:** 1
- **Additional Notes:** The window that opens right after plays WIN-01; delay WIN-01 by ~80 ms or skip it when launched from the menu, so the two do not stack.


## Notification

### NOT-01 · Info notification balloon

- **SFX ID:** NOT-01
- **Sound Name:** Info notification balloon
- **Category:** Notification
- **Trigger:** `ui.toast` with an info icon (e.g. "Checking for a new version...", "Progress has been reset.").
- **Sound Description:** A soft single glassy "bloop" (sine / bell, about 880 Hz) with a tiny pitch bend up and a short natural decay.
- **Audio Character:** Informational, calm, balloon-from-the-tray feeling.
- **Duration:** 150-250 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `notification balloon sound soft`; `gentle info notification chime`; `system tray notification bubble pop`
- **Variants to collect:** 1
- **Additional Notes:** Toasts are de-duplicated by message text, so only play when a new toast is created. Max 3 toasts exist at once.

### NOT-02 · Warning notification

- **SFX ID:** NOT-02
- **Sound Name:** Warning notification
- **Category:** Notification
- **Trigger:** `ui.toast` with the warn icon: "Not enough cash.", "Already at maximum level.", "Need $X more.", "New Run unlocks at stage N", "Flying Ball is not available right now".
- **Sound Description:** Two soft low-mid tones (a small falling second), muted, with a quick decay; softer than a buzzer.
- **Audio Character:** Cautionary, polite, not alarming.
- **Duration:** 150-250 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `soft warning notification sound`; `gentle caution UI tone`; `muted alert chime low`
- **Variants to collect:** 1
- **Additional Notes:** The "Not enough cash" toast already goes with UP-02: play UP-02 OR NOT-02 for that case, never both.

### NOT-03 · Success notification

- **SFX ID:** NOT-03
- **Sound Name:** Success notification
- **Category:** Notification
- **Trigger:** `ui.toast` with the check icon: "... installed!", "Cursor Auto Push Coin is now active", "Purchased".
- **Sound Description:** A bright, warm two-note rising chime (major second), clean sine / bell, quick decay.
- **Audio Character:** Positive and small, quieter than UP-01.
- **Duration:** 200-300 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `success notification chime soft`; `positive UI confirmation ding`; `task complete notification short`
- **Variants to collect:** 1
- **Additional Notes:** Keep it subordinate: on a purchase UP-01 / UP-03 already plays, so NOT-03 should be skipped for toasts triggered by the same purchase.

### NOT-04 · Achievement unlocked

- **SFX ID:** NOT-04
- **Sound Name:** Achievement unlocked
- **Category:** Notification
- **Trigger:** `E.checkAchievements` returns new ids after a Flying Ball result ("Achievement unlocked" toast, trophy icon).
- **Sound Description:** A short, warm, triumphant 3-note ascending bell arpeggio over a soft sparkle tail.
- **Audio Character:** Rewarding, proud, brief; below UP-07 in size.
- **Duration:** 500-900 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `achievement unlocked sound short`; `trophy notification chime`; `game achievement bell arpeggio`
- **Variants to collect:** 1
- **Additional Notes:** 5 achievements exist (first run, stage 10, win 3 times, x16 boost, $1M earned). Today it is just a toast.

### NOT-05 · Notification dismiss

- **SFX ID:** NOT-05
- **Sound Name:** Notification dismiss
- **Category:** Notification
- **Trigger:** Clicking a balloon to dismiss it.
- **Sound Description:** A tiny soft "pip" with a hint of downward pitch.
- **Audio Character:** Barely audible.
- **Duration:** 40-80 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `notification dismiss sound soft`; `tiny UI pip close`; `bubble pop small UI`
- **Variants to collect:** 1
- **Additional Notes:** Safe to omit; use UI-10 if a shared sound is preferred.


## System

### SYS-01 · Game ready (loading finished)

- **SFX ID:** SYS-01
- **Sound Name:** Game ready (loading finished)
- **Category:** System
- **Trigger:** `ui.hideLoading()` after the loading screen fades.
- **Sound Description:** A soft, welcoming rising two-note startup chime (a gentle airy pad swell underneath).
- **Audio Character:** Warm, nostalgic desktop-boot feeling, but original and short.
- **Duration:** 600-1000 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `soft startup chime short`; `retro computer ready sound gentle`; `welcome desktop jingle brief`
- **Variants to collect:** 1
- **Additional Notes:** The browser blocks audio before the first user gesture, so on a normal load this can only play after the first tap. Treat it as optional, or play it on the first gesture only.

### SYS-02 · Welcome back (offline earnings)

- **SFX ID:** SYS-02
- **Sound Name:** Welcome back (offline earnings)
- **Category:** System
- **Trigger:** `applyOffline()` shows the Welcome Back dialog (offline income exists).
- **Sound Description:** A cheerful four-note rising bell / music-box phrase with a gentle shimmer: "you earned while away".
- **Audio Character:** Warm, happy, reward-adjacent but smaller than stage clear.
- **Duration:** 500-800 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Replacement Needed
- **Search Keywords:** `welcome back jingle soft`; `idle earnings collected chime`; `friendly return notification bell`
- **Variants to collect:** 1
- **Additional Notes:** Currently `audio.welcome()`: four triangle-wave notes 659 / 784 / 988 / 1319 Hz (0.1 s apart).

### SYS-03 · Cash count-up roll

- **SFX ID:** SYS-03
- **Sound Name:** Cash count-up roll
- **Category:** System
- **Trigger:** The 1.2 s count-up animation of "Offline earnings" in the Welcome Back dialog.
- **Sound Description:** A fast quiet run of tiny coin-counter ticks (a rotating-digit "rrrrip" with rising pitch), ending with a light stop tick.
- **Audio Character:** Mechanical, light, rolling.
- **Duration:** 1.0-1.2 s
- **Playback Type:** Continuous (one clip matching the animation)
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `cash counter ticking sound`; `money counter roll up sound`; `rapid tally clicks rising`
- **Variants to collect:** 1
- **Additional Notes:** The animation duration is fixed at 1200 ms (`showOffline`); cut the clip to that length.

### SYS-04 · Update check / new version

- **SFX ID:** SYS-04
- **Sound Name:** Update check / new version
- **Category:** System
- **Trigger:** `embed.check()` finds a newer build (the game saves and reloads itself).
- **Sound Description:** A neutral soft descending-to-rising "refresh" blip pair.
- **Audio Character:** Quiet system-maintenance sound.
- **Duration:** 200-350 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `software update notification soft`; `refresh sync UI sound`; `system update blip`
- **Variants to collect:** 1
- **Additional Notes:** The page reloads immediately afterwards, so the sound must be very short or skipped.


## Coin Machine

### CM-01 · Manual coin drop

- **SFX ID:** CM-01
- **Sound Name:** Manual coin drop
- **Category:** Coin Machine
- **Trigger:** `game.drop()` succeeds: the Drop button spends a charge and spawns a coin at the top pipe.
- **Sound Description:** A small plastic-chute "plink-slide": a short metallic coin leaving a slot (tiny slide whoosh, 120 ms) followed by one bright light "tink" of a single coin.
- **Audio Character:** Playful, light, metallic, arcade-cabinet.
- **Duration:** 150-250 ms
- **Playback Type:** One-shot
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `coin drop into slot sound effect`; `single coin insert arcade`; `coin slide chute plink`
- **Variants to collect:** 3
- **Additional Notes:** Currently `audio.drop()`: two falling-pitch blips (440 -> 300 Hz square, then 330 -> 220 Hz triangle). 2-3 variants, light random pitch.

### CM-02 · Drop charge refilled

- **SFX ID:** CM-02
- **Sound Name:** Drop charge refilled
- **Category:** Coin Machine
- **Trigger:** `game.chargeT` reaches CHARGE_TIME (1.2 s) and a manual drop charge is restored (`charges++`).
- **Sound Description:** A tiny soft "ready" tick like a ratchet click-in (one very quiet beat).
- **Audio Character:** Mechanical, discreet.
- **Duration:** 40-80 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `ratchet click small`; `charge ready tick UI`; `quiet reload click`
- **Variants to collect:** 1
- **Additional Notes:** Happens every 1.2 s while charges are not full, so it can become annoying: play only when charges go from 0 to 1, or omit.

### CM-03 · Automatic coin spawn from pipe

- **SFX ID:** CM-03
- **Sound Name:** Automatic coin spawn from pipe
- **Category:** Coin Machine
- **Trigger:** `game._spawn(false)`: Coins/s production releases a coin (several per second at higher rates).
- **Sound Description:** A very faint soft "pop" of a coin leaving the feed pipe (a muffled tick); must be near-inaudible.
- **Audio Character:** Background texture, not a foreground event.
- **Duration:** 30-60 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `coin dispenser soft click`; `tiny coin pop muffled`; `coin feeder tick subtle`
- **Variants to collect:** 1
- **Additional Notes:** Rate can reach many per second: throttle to one per 150 ms or use a continuous low "dispenser hum" instead (see CM-23). Safe to omit.

### CM-04 · Coin lands on platform

- **SFX ID:** CM-04
- **Sound Name:** Coin lands on platform
- **Category:** Coin Machine
- **Trigger:** A coin falls onto a platform or on top of other coins (contact with a static platform). Needs new physics contact events.
- **Sound Description:** A bright metallic coin-drop on a hard surface: a sharp, realistic transient followed by a short high ring (about 1.5-3 kHz) that decays in ~150 ms. Three intensities (soft / medium / hard) by impact speed.
- **Audio Character:** Real metal, bright but not harsh, light and quick; the heart of the "satisfying coin machine" sound.
- **Duration:** 80-200 ms
- **Playback Type:** One-shot (velocity-layered)
- **Priority:** Essential
- **Asset Status:** Missing
- **Search Keywords:** `single coin drop on metal sound effect`; `coin hits table clink`; `metal coin landing short`
- **Variants to collect:** 6
- **Additional Notes:** The physics layer (`physics.js`) has no contact / collision events today: the implementation phase must enable Rapier contact events for coins. Budget at most about 4 landing sounds per 100 ms and pitch-vary every play.

### CM-05 · Coin-to-coin collision

- **SFX ID:** CM-05
- **Sound Name:** Coin-to-coin collision
- **Category:** Coin Machine
- **Trigger:** Two coins collide above a velocity threshold (needs new physics contact events).
- **Sound Description:** A light metallic coin-on-coin "tink": thin, short, with a quick bright ring and almost no body. Several slightly different pitches so a pile rattles naturally.
- **Audio Character:** Delicate, shimmering, many-small-objects texture.
- **Duration:** 50-150 ms
- **Playback Type:** One-shot (random variants)
- **Priority:** Essential
- **Asset Status:** Missing
- **Search Keywords:** `metal coins clinking sound effect`; `coin collision metallic`; `small metal object impact`
- **Variants to collect:** 8
- **Additional Notes:** The biggest overlap risk in the game. Use a global voice cap (e.g. 6), a per-pair cooldown and a velocity threshold so a pile settling does not become noise. Variants: 6-8.

### CM-06 · Coin hits wall / frame

- **SFX ID:** CM-06
- **Sound Name:** Coin hits wall / frame
- **Category:** Coin Machine
- **Trigger:** A coin hits a side wall or the machine frame (needs contact events).
- **Sound Description:** A duller, lower metallic "tok" than a coin-on-coin hit (coin on thick plastic / painted metal), almost no ring.
- **Audio Character:** Solid, muted, short.
- **Duration:** 60-120 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `coin hits wall thud small`; `metal coin on plastic tap`; `small metallic knock`
- **Variants to collect:** 3
- **Additional Notes:** Share the voice cap with CM-04 / CM-05.

### CM-07 · Coin pile shuffle / slide

- **SFX ID:** CM-07
- **Sound Name:** Coin pile shuffle / slide
- **Category:** Coin Machine
- **Trigger:** Several coins slide against each other on a platform while a piston pushes them (needs contact events, sustained low-speed contacts).
- **Sound Description:** A soft granular "shhhk-chk" of many coins sliding: a metallic rustle with no distinct hits, 300-600 ms.
- **Audio Character:** Textural, shimmering, low energy.
- **Duration:** 300-600 ms
- **Playback Type:** Layered / short loop
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `coins sliding on metal sound`; `coin pile rustle shuffle`; `coin pusher coins moving sound`
- **Variants to collect:** 2
- **Additional Notes:** Only worth adding after CM-04 / CM-05 are in. Drive volume by the number of sliding coins.

### CM-08 · Coin falls off a platform lip

- **SFX ID:** CM-08
- **Sound Name:** Coin falls off a platform lip
- **Category:** Coin Machine
- **Trigger:** A coin leaves a platform edge and drops to the tier below (needs a "left platform" detection).
- **Sound Description:** A tiny falling "whip" (a descending breathy swish about 120 ms) ending in the CM-04 landing; kept very light.
- **Audio Character:** Light, airy, zigzag cascade feeling.
- **Duration:** 150-300 ms
- **Playback Type:** Layered (whoosh + CM-04)
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `coin falling off ledge sound`; `small object fall whoosh short`; `coin cascade drop sound`
- **Variants to collect:** 1
- **Additional Notes:** Optional layer; the landing itself already reads well. Skip if the voice cap is hit.

### CM-09 · Coin swallowed by grinder

- **SFX ID:** CM-09
- **Sound Name:** Coin swallowed by grinder
- **Category:** Coin Machine
- **Trigger:** A coin enters the collection pit and the 0.22 s suck animation plays (`beginSuck`).
- **Sound Description:** A short rising "gulp-whirr": a small mechanical swallow with a tiny pitch rise (like a coin sorter) that blends into the collect chime.
- **Audio Character:** Mechanical, quick, satisfying.
- **Duration:** 150-250 ms
- **Playback Type:** One-shot (layered with CM-10..13)
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `coin sorter whirr short`; `coin swallow mechanism sound`; `coin slot mechanism clunk`
- **Variants to collect:** 1
- **Additional Notes:** Must lead into, not duplicate, the collect sound; throttle at high rates.

### CM-10 · Collect coin: bronze

- **SFX ID:** CM-10
- **Sound Name:** Collect coin: bronze
- **Category:** Coin Machine
- **Trigger:** A bronze coin (type 0) reaches the pit (`audio.collect(0)`).
- **Sound Description:** A short warm copper "ka-ching" fragment: a soft register tick and a single mid bell, about 1 kHz, small sparkle.
- **Audio Character:** Warm, small, repeatable thousands of times per hour. Lowest pitch of the collect family.
- **Duration:** 120-200 ms
- **Playback Type:** One-shot (pitch-varied)
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `coin collect sound effect small`; `coin pickup bright short`; `cash register tick coin`
- **Variants to collect:** 3
- **Additional Notes:** Currently `audio.collect(0)`: square 988 -> 1482 Hz (90 ms) + triangle 1482 Hz (120 ms), throttled to one per 55 ms. Keep the 55 ms throttle and add 3 pitch variants.

### CM-11 · Collect coin: silver

- **SFX ID:** CM-11
- **Sound Name:** Collect coin: silver
- **Category:** Coin Machine
- **Trigger:** A silver coin (type 1) is collected (`audio.collect(1)`). Also used today for each Flying Ball gate.
- **Sound Description:** Same family as CM-10, brighter and higher (about 1.2-1.5 kHz), with a cleaner, glassier ring.
- **Audio Character:** Brighter, crisp, a clear step above bronze.
- **Duration:** 120-200 ms
- **Playback Type:** One-shot (pitch-varied)
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `coin collect silver bright`; `coin chime short`; `coin pickup chime clean`
- **Variants to collect:** 3
- **Additional Notes:** Currently `audio.collect(1)`: base 1175 Hz. Flying Ball gates must get their own sound (FB-04) once this one is replaced.

### CM-12 · Collect coin: gold (star)

- **SFX ID:** CM-12
- **Sound Name:** Collect coin: gold (star)
- **Category:** Coin Machine
- **Trigger:** A gold coin (type 2) is collected (`audio.collect(2)`).
- **Sound Description:** A richer coin hit: a clear bell with a warm lower partial plus a small sparkle on top, slightly longer ring.
- **Audio Character:** Valuable, full, golden.
- **Duration:** 200-300 ms
- **Playback Type:** One-shot (pitch-varied)
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `gold coin collect sound`; `coin pickup rich bell`; `treasure coin chime`
- **Variants to collect:** 3
- **Additional Notes:** Currently `audio.collect(2)`: base 784 Hz. Note that the existing pitch order is bronze 988, silver 1175, gold 784, rare 1568, so gold is actually the lowest. Fix the order in the new set.

### CM-13 · Collect coin: rare gem

- **SFX ID:** CM-13
- **Sound Name:** Collect coin: rare gem
- **Category:** Coin Machine
- **Trigger:** A rare gem coin (type 3) is collected: pays out cash and gives +1 gem (`audio.collect(3)`).
- **Sound Description:** A crystalline "ting" with a fast shimmering glissando (glass-bell + sparkle), very distinct from coin sounds.
- **Audio Character:** Magical, precious, high, never harsh.
- **Duration:** 300-500 ms
- **Playback Type:** One-shot
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `gem collect sound crystal`; `diamond pickup sparkle short`; `crystal chime reward`
- **Variants to collect:** 2
- **Additional Notes:** Currently `audio.collect(3)`: base 1568 Hz square + triangle. Rare coins are infrequent, so this sound can be longer and richer.

### CM-14 · Combo milestone

- **SFX ID:** CM-14
- **Sound Name:** Combo milestone
- **Category:** Coin Machine
- **Trigger:** The combo counter shows "Combo xN" (N >= 5) and crosses a threshold such as 5, 10, 20 (`game.combo`).
- **Sound Description:** A short rising "level tick": a quick 3-step glassy upward run with a soft pop.
- **Audio Character:** Energetic, fast, game-feel booster.
- **Duration:** 200-350 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `combo increase sound short`; `combo level up tick`; `arcade streak chime`
- **Variants to collect:** 1
- **Additional Notes:** Combo resets 2.5 s after the last collect. Play only at fixed thresholds, not on every coin.

### CM-15 · Piston stroke

- **SFX ID:** CM-15
- **Sound Name:** Piston stroke
- **Category:** Coin Machine
- **Trigger:** `machines.onFire` (auto or jam-recovery stroke of a piston).
- **Sound Description:** A soft, well-oiled mechanical "chunk-thud": a dull metal push with a brief low pneumatic "ffft" and a damped end thump. Not a bang.
- **Audio Character:** Mechanical, low-mid (80-200 Hz body), heavy but soft; fired often, so it must not fatigue.
- **Duration:** 150-300 ms
- **Playback Type:** One-shot (variants)
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `piston push mechanical sound short`; `pneumatic press thud soft`; `arcade machine pusher movement`
- **Variants to collect:** 4
- **Additional Notes:** Currently `audio.clunk()`: square 120 -> 70 Hz + triangle 90 -> 60 Hz. It is called for pistons, launchers, air bursts and shakes alike. Pitch per piston (A-D) to keep a rhythm.

### CM-16 · Piston retract

- **SFX ID:** CM-16
- **Sound Name:** Piston retract
- **Category:** Coin Machine
- **Trigger:** A piston returns to its rest position after a stroke.
- **Sound Description:** A lighter, shorter "slide-back" mechanical whirr, a soft low scrape with a tiny end tick.
- **Audio Character:** Quiet mechanical return.
- **Duration:** 120-250 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `piston retract mechanical sound`; `small mechanism slide back`; `machine return stroke soft`
- **Variants to collect:** 1
- **Additional Notes:** Pairs with CM-15; omit if the machine becomes too busy.

### CM-17 · Conveyor belt loop

- **SFX ID:** CM-17
- **Sound Name:** Conveyor belt loop
- **Category:** Coin Machine
- **Trigger:** A conveyor machine is installed (Conveyor upgrade level > 0, stages 3-5): loop while it is active on screen.
- **Sound Description:** A quiet rubber-belt hum: a low continuous rolling "rrrrr" with a soft regular tick (belt seams).
- **Audio Character:** Steady, soft, industrial, low.
- **Duration:** 2-4 s seamless loop
- **Playback Type:** Loop
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `conveyor belt loop sound`; `machine belt hum`; `factory conveyor ambience quiet`
- **Variants to collect:** 1
- **Additional Notes:** Loops must be seamless and very quiet; fade in on install and mute when the stage changes or the mini-game freezes the game.

### CM-18 · Blower fan loop

- **SFX ID:** CM-18
- **Sound Name:** Blower fan loop
- **Category:** Coin Machine
- **Trigger:** A blower fan is installed (Blower Fan upgrade level > 0).
- **Sound Description:** A soft airflow loop: gentle filtered-noise "whoosh" with a faint low rotor beat.
- **Audio Character:** Airy, soft, steady.
- **Duration:** 2-4 s seamless loop
- **Playback Type:** Loop
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `small fan loop sound`; `air blower hum seamless`; `ventilation whoosh quiet`
- **Variants to collect:** 1
- **Additional Notes:** Optional ambience; the game never lets this exceed the SFX bus level.

### CM-19 · Magnet field hum

- **SFX ID:** CM-19
- **Sound Name:** Magnet field hum
- **Category:** Coin Machine
- **Trigger:** A magnet machine is installed (Magnet upgrade).
- **Sound Description:** A faint electromagnetic buzz: a low sine hum (about 100 Hz) with a slow subtle beating tremolo.
- **Audio Character:** Low, electric, slightly eerie.
- **Duration:** 2-4 s seamless loop
- **Playback Type:** Loop
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `electromagnet hum loop`; `low electric buzz seamless`; `magnetic field drone quiet`
- **Variants to collect:** 1
- **Additional Notes:** Optional; very low level only.

### CM-20 · Launcher fire

- **SFX ID:** CM-20
- **Sound Name:** Launcher fire
- **Category:** Coin Machine
- **Trigger:** `machines.onLaunch`: a launcher kicks a coin (stages 4-5).
- **Sound Description:** A springy "thwok": a tight spring release with a short bright "boing" snap and an airy swish.
- **Audio Character:** Punchy, bouncy, playful.
- **Duration:** 150-250 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Replacement Needed
- **Search Keywords:** `spring launcher sound short`; `pinball kicker thwack`; `boing launch mechanical small`
- **Variants to collect:** 3
- **Additional Notes:** Currently reuses `audio.clunk()` (same as pistons).

### CM-21 · Multiplier gate x2

- **SFX ID:** CM-21
- **Sound Name:** Multiplier gate x2
- **Category:** Coin Machine
- **Trigger:** `machines.onGate`: a coin passes a multiplier gate and its value doubles (stage 5).
- **Sound Description:** A rising "whoosh-ding": a short bright upward sparkle sweep with a clear bell on top, signalling "value doubled".
- **Audio Character:** Magical, rewarding, energetic.
- **Duration:** 250-400 ms
- **Playback Type:** One-shot (pitch-varied)
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `multiplier power up sound short`; `x2 bonus ding sparkle`; `coin value doubled sound`
- **Variants to collect:** 3
- **Additional Notes:** Currently reuses `audio.buy()` (the purchase arpeggio), so a gate sounds exactly like buying an upgrade. Needs its own sound. Throttle: coins can pass in rapid succession.

### CM-22 · Anti-jam air burst

- **SFX ID:** CM-22
- **Sound Name:** Anti-jam air burst
- **Category:** Coin Machine
- **Trigger:** `machines.onPuff`: the anti-jam system gives a stuck coin a small air burst.
- **Sound Description:** A short airy "pfft" puff with a tiny fluttering tail.
- **Audio Character:** Light, harmless, helpful.
- **Duration:** 120-200 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `air puff sound short`; `compressed air burst small`; `pneumatic puff soft`
- **Variants to collect:** 1
- **Additional Notes:** Today the puff plays the piston clunk through `onFire`. Should replace it for puff events only.

### CM-23 · Machine ambience hum

- **SFX ID:** CM-23
- **Sound Name:** Machine ambience hum
- **Category:** Coin Machine
- **Trigger:** While the main game is running (not paused / not in the mini-game).
- **Sound Description:** A very low, soft arcade-cabinet room tone: a faint transformer hum with the occasional tiny relay tick, barely audible.
- **Audio Character:** Warm, subtle, "alive machine" feeling.
- **Duration:** 8-20 s seamless loop
- **Playback Type:** Loop
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `arcade cabinet hum ambience`; `low machine room tone loop`; `subtle mechanical ambience seamless`
- **Variants to collect:** 1
- **Additional Notes:** Must stop while the main game is frozen by the Flying Ball window and must stay well below the LunaWave music.

### CM-24 · Poke / tap on the playfield

- **SFX ID:** CM-24
- **Sound Name:** Poke / tap on the playfield
- **Category:** Coin Machine
- **Trigger:** `game.poke`: pointer tap on the playfield nudges nearby coins.
- **Sound Description:** A soft finger-tap on glass plus a faint metallic shuffle of the nudged coins.
- **Audio Character:** Gentle, tactile, small.
- **Duration:** 80-150 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Replacement Needed
- **Search Keywords:** `finger tap on glass soft`; `light touch tap sound`; `screen tap thud small`
- **Variants to collect:** 3
- **Additional Notes:** Currently `audio.tap()` (the generic UI click). Scale the coin-shuffle part by how many coins were moved (`poke` returns that number).

### CM-25 · Stage rebuild transition

- **SFX ID:** CM-25
- **Sound Name:** Stage rebuild transition
- **Category:** Coin Machine
- **Trigger:** `game.loadStage(true)` after a stage clear: the machine is rebuilt.
- **Sound Description:** A short mechanical "reconfigure" sequence: quick clunks, a rising servo whir and a final locking click, under the stage fanfare.
- **Audio Character:** Mechanical, hopeful, transitional.
- **Duration:** 600-1000 ms
- **Playback Type:** One-shot (layered with UP-07)
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `machine reconfigure sound servo`; `mechanical transition clunk whir`; `arcade machine reset sound`
- **Variants to collect:** 1
- **Additional Notes:** UP-07 already marks the moment; use only if the transition needs more weight.


## Upgrade / Progression

### UP-01 · Purchase successful

- **SFX ID:** UP-01
- **Sound Name:** Purchase successful
- **Category:** Upgrade / Progression
- **Trigger:** `onBuy` or `onBuyCursor` succeeds (price tags, upgrade window button, Coins/s button, Cursor Auto Push).
- **Sound Description:** A satisfying confirmation: a short ascending three-step digital chime (major third up, then fifth) with a subtle bright "register" tick underneath and a very small sparkle tail.
- **Audio Character:** Positive, polished, rewarding but not huge; bright but rounded.
- **Duration:** 300-500 ms
- **Playback Type:** One-shot (layered)
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `game purchase success sound effect`; `satisfying upgrade confirmation`; `positive digital reward chime`
- **Variants to collect:** 2
- **Additional Notes:** Currently `audio.buy()`: square arpeggio 523 / 659 / 784 Hz (60 ms apart, 140 ms each). 2 variants so repeated buying (a common action) stays fresh.

### UP-02 · Purchase failed / insufficient funds

- **SFX ID:** UP-02
- **Sound Name:** Purchase failed / insufficient funds
- **Category:** Upgrade / Progression
- **Trigger:** `onBuy` or `onBuyCursor` fails because the player cannot afford it (also the ghost-tap on an unaffordable pad).
- **Sound Description:** A short, soft negative feedback sound: a muted descending two-tone "bup-bum" or a gentle low digital buzz, never a harsh error beep.
- **Audio Character:** Soft, low, quick, polite; communicates insufficient funds without annoying.
- **Duration:** 120-200 ms
- **Playback Type:** One-shot
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `game purchase failed sound`; `insufficient coins UI sound`; `soft error notification`
- **Variants to collect:** 1
- **Additional Notes:** Currently `audio.deny()`: a 160 ms sawtooth sliding 180 -> 110 Hz (harsh, buzzy). It is also used for Flying Ball crash and empty Drop, which should get their own sounds.

### UP-03 · Machine installed / feature unlocked

- **SFX ID:** UP-03
- **Sound Name:** Machine installed / feature unlocked
- **Category:** Upgrade / Progression
- **Trigger:** First purchase of a machine (level 0 -> 1: Piston, Conveyor, Blower Fan, Magnet, Launcher) and Cursor Auto Push purchase.
- **Sound Description:** A heavier "install" confirmation: a mechanical latch-clack plus a rising synth sweep and a bright chime, bigger than UP-01.
- **Audio Character:** Solid, mechanical, rewarding; shows that something new is now running.
- **Duration:** 600-900 ms
- **Playback Type:** One-shot (layered)
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `machine installed sound mechanical confirm`; `new unlock power up short`; `equipment upgrade installed sfx`
- **Variants to collect:** 1
- **Additional Notes:** Today it plays the plain purchase sound + a toast ("... installed!").

### UP-04 · Maximum level reached

- **SFX ID:** UP-04
- **Sound Name:** Maximum level reached
- **Category:** Upgrade / Progression
- **Trigger:** Tapping an upgrade that is already at max (toast "Already at maximum level.") or the purchase that reaches max.
- **Sound Description:** A tidy, closed "full" sound: a small neutral double-tick with a short soft chime (no rising feeling).
- **Audio Character:** Calm, final, "done".
- **Duration:** 150-250 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `max level reached sound soft`; `upgrade complete maxed chime`; `full meter UI tone`
- **Variants to collect:** 1
- **Additional Notes:** Currently only a warn toast, no sound. The max-level pad button is a normal click.

### UP-05 · Cursor assistant appears

- **SFX ID:** UP-05
- **Sound Name:** Cursor assistant appears
- **Category:** Upgrade / Progression
- **Trigger:** Cursor Auto Push assistant slides in (status DETECTING / APPROACHING).
- **Sound Description:** A faint, light "slide-in swish" with a tiny cursor-like tick when it stops.
- **Audio Character:** Subtle, helpful, retro-computer.
- **Duration:** 150-250 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `small whoosh slide in UI`; `cursor appears soft swish`; `helper arrives subtle sound`
- **Variants to collect:** 1
- **Additional Notes:** Note: it is a visual-only status change today. Appears only when a coin has been stuck for a few seconds, so it is rare.

### UP-06 · Cursor assistant pushes

- **SFX ID:** UP-06
- **Sound Name:** Cursor assistant pushes
- **Category:** Upgrade / Progression
- **Trigger:** Cursor assistant status PUSHING: it gently pushes a stuck coin.
- **Sound Description:** A soft double tap of a finger on a plastic surface with a faint coin slide.
- **Audio Character:** Gentle, helpful, small.
- **Duration:** 150-250 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `soft push tap small`; `gentle nudge sound`; `finger poke light`
- **Variants to collect:** 1
- **Additional Notes:** Its physical push already makes coins collide, so contact sounds (CM-05) cover most of the feedback.

### UP-07 · Stage cleared

- **SFX ID:** UP-07
- **Sound Name:** Stage cleared
- **Category:** Upgrade / Progression
- **Trigger:** `game._clearStage`: stage target reached; Stage Complete window and reward.
- **Sound Description:** A bright, celebratory fanfare: a short rising brass-and-bell stab (3-4 notes) with a coin-shower sparkle and a soft low "thump" on the final note.
- **Audio Character:** Triumphant, arcade-style but clean; biggest everyday reward sound.
- **Duration:** 900-1500 ms
- **Playback Type:** One-shot (layered)
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `level complete jingle short`; `stage clear fanfare arcade`; `victory sting coins`
- **Variants to collect:** 1
- **Additional Notes:** Currently `audio.grade()`: six-note square + triangle arpeggio (392 -> 1319 Hz, 90 ms apart, 300 ms each, about 0.75 s). Same function is used for New Run, Flying Ball mission complete and reward reveal.

### UP-08 · New Run started

- **SFX ID:** UP-08
- **Sound Name:** New Run started
- **Category:** Upgrade / Progression
- **Trigger:** `onNewRun`: prestige run starts after confirmation (the screen flashes).
- **Sound Description:** A big "reset and rebirth" sound: a descending tape-stop whoosh into a clean rising shimmer and a warm major chord swell.
- **Audio Character:** Epic but short, optimistic.
- **Duration:** 1.2-1.8 s
- **Playback Type:** One-shot (layered)
- **Priority:** Recommended
- **Asset Status:** Replacement Needed
- **Search Keywords:** `prestige rebirth sound effect`; `new game start whoosh chord`; `level reset power up transition`
- **Variants to collect:** 1
- **Additional Notes:** Currently `audio.grade()` + `ui.flash()`. Rare event, so it can be longer.

### UP-09 · Profit boost activated

- **SFX ID:** UP-09
- **Sound Name:** Profit boost activated
- **Category:** Upgrade / Progression
- **Trigger:** The Flying Ball window closes after a win and the multiplier starts (toast "Profit Boost xN ... is active").
- **Sound Description:** A rising energy-charge "power-up" sweep with a bright confirming ping.
- **Audio Character:** Energetic, powerful, positive.
- **Duration:** 500-800 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `power up activate sound`; `boost on sound energetic`; `multiplier activate sweep`
- **Variants to collect:** 1
- **Additional Notes:** Today only a toast. Pair it with the persistent boost chip in the tray.

### UP-10 · Profit boost expired

- **SFX ID:** UP-10
- **Sound Name:** Profit boost expired
- **Category:** Upgrade / Progression
- **Trigger:** `onBoostEnd`: the 20-minute boost ends (toast "Profit boost ended. Cooldown: 30 min.").
- **Sound Description:** A gentle descending "power-down" sweep, short, soft; no negative feeling.
- **Audio Character:** Calm, closing.
- **Duration:** 400-700 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `power down sound soft`; `boost end descending sweep`; `energy fade out UI`
- **Variants to collect:** 1
- **Additional Notes:** Fired from `Game.update` at 0.25 s polling resolution; it can happen at any moment, so keep it quiet.

### UP-11 · Flying Ball available again

- **SFX ID:** UP-11
- **Sound Name:** Flying Ball available again
- **Category:** Upgrade / Progression
- **Trigger:** Flying Ball cooldown ends and the Flying Ball button changes to "Play" (state ready).
- **Sound Description:** A short, friendly two-note "ready" ping with a tiny sparkle.
- **Audio Character:** Inviting, light.
- **Duration:** 250-400 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `ready ping notification soft`; `new challenge available chime`; `cooldown complete ping`
- **Variants to collect:** 1
- **Additional Notes:** There is no event or toast for this today (the button just changes look); it would require adding one in the implementation phase.


## Mini-game

### FB-01 · Flying Ball window opens

- **SFX ID:** FB-01
- **Sound Name:** Flying Ball window opens
- **Category:** Mini-game
- **Trigger:** The Flying Ball application window opens (`FlyView` constructed, exclusive session starts).
- **Sound Description:** A bigger "arcade launch" open: a rising electronic whoosh with a soft "insert coin" style ping, more playful than WIN-01.
- **Audio Character:** Playful, exciting, retro arcade.
- **Duration:** 400-700 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `arcade game start whoosh`; `mini game launch sound`; `retro game boot blip`
- **Variants to collect:** 1
- **Additional Notes:** Plays instead of WIN-01 for this window. The main game freezes at the same moment, so the main game's own sounds stop.

### FB-02 · Flight start (Tap to start)

- **SFX ID:** FB-02
- **Sound Name:** Flight start (Tap to start)
- **Category:** Mini-game
- **Trigger:** The player taps the intro overlay / stage and the first flap starts the run (`core.flap` from ready).
- **Sound Description:** A short "go" sting: a clear rising two-note blip with a small whoosh.
- **Audio Character:** Energetic, clear.
- **Duration:** 200-350 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `game start go sound short`; `ready go blip arcade`; `run start whoosh blip`
- **Variants to collect:** 1
- **Additional Notes:** Plays once per attempt, together with the first FB-03.

### FB-03 · Wing flap

- **SFX ID:** FB-03
- **Sound Name:** Wing flap
- **Category:** Mini-game
- **Trigger:** Every flap (tap, click, Space or ArrowUp) while playing (`core` event `flap`).
- **Sound Description:** A tiny soft "fwip": a quick feathery flutter or a small rubbery hop with a brief rising pitch.
- **Audio Character:** Light, cute, very short; it can fire 2-4 times per second so it must stay quiet and never harsh.
- **Duration:** 60-120 ms
- **Playback Type:** One-shot (variants)
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `flappy wing flap sound short`; `cartoon hop blip soft`; `bird flap small sfx`
- **Variants to collect:** 4
- **Additional Notes:** Currently `audio.tap()` (the generic UI click). Use 3-4 variants and a slight random pitch.

### FB-04 · Gate passed (score)

- **SFX ID:** FB-04
- **Sound Name:** Gate passed (score)
- **Category:** Mini-game
- **Trigger:** The ball passes the gap between two crystal pillars (`core` event `score`).
- **Sound Description:** A crisp crystal "ting": a clear glass-bell ping with a bright high sparkle and a small upward pitch step per consecutive gate.
- **Audio Character:** Rewarding, precise, bright but soft.
- **Duration:** 150-250 ms
- **Playback Type:** One-shot (ascending steps)
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `score point sound short ding`; `crystal ping reward arcade`; `gate pass chime bright`
- **Variants to collect:** 5
- **Additional Notes:** Currently reuses `audio.collect(1)` (the silver coin sound). A 5-8 step pitch ladder over the run would reinforce progress (the mission is a fixed number of gates).

### FB-05 · Crash / collision

- **SFX ID:** FB-05
- **Sound Name:** Crash / collision
- **Category:** Mini-game
- **Trigger:** The ball hits a pillar or the ground (`core` event `dead`).
- **Sound Description:** A short soft impact: a rounded "boink-thud" plus a brief descending cartoon wobble; no harsh crash.
- **Audio Character:** Disappointed but comedic, soft, quick; not punishing.
- **Duration:** 300-500 ms
- **Playback Type:** One-shot
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `game over bonk sound soft`; `cartoon hit thud short`; `arcade fail impact`
- **Variants to collect:** 1
- **Additional Notes:** Currently `audio.deny()`. One event covers pillar and ground (no separate event exists for either).

### FB-06 · Game Over panel

- **SFX ID:** FB-06
- **Sound Name:** Game Over panel
- **Category:** Mini-game
- **Trigger:** The Game Over overlay appears 650 ms after the crash (`showOver`).
- **Sound Description:** A short descending three-note "try again" sting (soft, not sad).
- **Audio Character:** Gentle, encouraging.
- **Duration:** 500-800 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `game over sting soft short`; `try again jingle gentle`; `arcade lose sting`
- **Variants to collect:** 1
- **Additional Notes:** Optional: the crash sound may be enough. A failed attempt costs nothing in this game, so avoid a heavy sad tone.

### FB-07 · Mission complete

- **SFX ID:** FB-07
- **Sound Name:** Mission complete
- **Category:** Mini-game
- **Trigger:** The objective gate count is reached (`core` event `won`).
- **Sound Description:** A joyful fanfare: a quick bright ascending arpeggio ending on a held bell chord with sparkle.
- **Audio Character:** Triumphant, exciting, clearly more than a gate ping.
- **Duration:** 900-1400 ms
- **Playback Type:** One-shot (layered)
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `mission complete jingle short`; `win fanfare arcade bright`; `success stinger celebratory`
- **Variants to collect:** 1
- **Additional Notes:** Currently `audio.grade()` (the same sound as stage clear).

### FB-08 · Reward roll tick

- **SFX ID:** FB-08
- **Sound Name:** Reward roll tick
- **Category:** Mini-game
- **Trigger:** Each of the 14 rolling numbers in the reward slot (`onTick`), with intervals growing 60 ms -> about 330 ms.
- **Sound Description:** A short mechanical slot-machine tick: a plastic ratchet click with a faint bell, slightly rising in pitch as the roll slows.
- **Audio Character:** Anticipatory, dry, rhythmic.
- **Duration:** 40-80 ms
- **Playback Type:** One-shot (stepped pitch)
- **Priority:** Recommended
- **Asset Status:** Replacement Needed
- **Search Keywords:** `slot machine tick sound`; `roulette tick ratchet short`; `reward spinner click`
- **Variants to collect:** 2
- **Additional Notes:** Currently `audio.tap()` ticks. Tick spacing is driven by the animation, so play it from the same callback (14 ticks per reward).

### FB-09 · Reward reveal: Common / Good (x2-x8)

- **SFX ID:** FB-09
- **Sound Name:** Reward reveal: Common / Good (x2-x8)
- **Category:** Mini-game
- **Trigger:** Reward roll stops on a multiplier below x16 (`onReveal`).
- **Sound Description:** A pleasant "ta-da" chime: two warm bell notes, short sparkle tail.
- **Audio Character:** Pleasant, modest, positive.
- **Duration:** 600-900 ms
- **Playback Type:** One-shot
- **Priority:** Essential
- **Asset Status:** Replacement Needed
- **Search Keywords:** `small reward reveal chime`; `prize reveal ding short`; `bonus unlocked jingle soft`
- **Variants to collect:** 1
- **Additional Notes:** Currently `audio.grade()` + screen flash for every multiplier.

### FB-10 · Reward reveal: Rare / Epic (x16-x128)

- **SFX ID:** FB-10
- **Sound Name:** Reward reveal: Rare / Epic (x16-x128)
- **Category:** Mini-game
- **Trigger:** Reward roll stops on x16 to x128 (rarity "Rare" or "Epic").
- **Sound Description:** A fuller reveal: ascending bell arpeggio with a shimmering synth swell and a stronger final hit.
- **Audio Character:** Exciting, bigger than FB-09.
- **Duration:** 1.0-1.5 s
- **Playback Type:** One-shot (layered)
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `big win reveal jingle`; `rare item reveal sound`; `epic reward fanfare short`
- **Variants to collect:** 1
- **Additional Notes:** The reward table gives high multipliers low probability, so these sounds are rare and can be rich.

### FB-11 · Reward reveal: Legendary (x256)

- **SFX ID:** FB-11
- **Sound Name:** Reward reveal: Legendary (x256)
- **Category:** Mini-game
- **Trigger:** Reward roll stops on x256 (rarity "Legendary").
- **Sound Description:** A grand moment: low impact boom, choir-like synth swell, rising sparkle shower and a long bell tail.
- **Audio Character:** Epic, once-in-a-while spectacle.
- **Duration:** 2.0-3.0 s
- **Playback Type:** One-shot (layered)
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `jackpot win sound short`; `legendary item drop sound`; `epic win celebration stinger`
- **Variants to collect:** 1
- **Additional Notes:** Extremely rare; keep under 3 s so the Close button is not delayed (the overlay unlocks after the roll).

### FB-12 · Pause

- **SFX ID:** FB-12
- **Sound Name:** Pause
- **Category:** Mini-game
- **Trigger:** Pause button, or Esc / auto-pause when the window loses focus during a flight (`togglePause(true)`).
- **Sound Description:** A soft "freeze" blip: a quick downward filtered tick with a short muted tail.
- **Audio Character:** Calm, cooling down.
- **Duration:** 100-200 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `pause menu sound soft`; `game paused blip`; `time stop short UI`
- **Variants to collect:** 1
- **Additional Notes:** Plays only on explicit pause; auto-pause on visibility change should stay silent.

### FB-13 · Resume

- **SFX ID:** FB-13
- **Sound Name:** Resume
- **Category:** Mini-game
- **Trigger:** Resume button (`togglePause(false)`).
- **Sound Description:** A matching upward "release" blip, the inverse of FB-12.
- **Audio Character:** Light, rising.
- **Duration:** 100-200 ms
- **Playback Type:** One-shot
- **Priority:** Recommended
- **Asset Status:** Missing
- **Search Keywords:** `game resume sound soft`; `unpause blip rising`; `continue game UI sound`
- **Variants to collect:** 1
- **Additional Notes:** Keep the pair obviously related.

### FB-14 · Retry / Restart

- **SFX ID:** FB-14
- **Sound Name:** Retry / Restart
- **Category:** Mini-game
- **Trigger:** Retry button after a crash, Retry at the top bar, Restart in the pause panel (new attempt starts).
- **Sound Description:** A quick "rewind" blip: a short upward reverse-swish into a soft click.
- **Audio Character:** Fast, optimistic.
- **Duration:** 150-250 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `retry restart sound short`; `quick rewind blip`; `game restart whoosh small`
- **Variants to collect:** 1
- **Additional Notes:** Starting a new attempt does not need a heavy sound; the player may retry often.

### FB-15 · Mini-game closed / main game resumes

- **SFX ID:** FB-15
- **Sound Name:** Mini-game closed / main game resumes
- **Category:** Mini-game
- **Trigger:** `endMini`: the Flying Ball window closes and the main game thaws.
- **Sound Description:** A smooth "return" sound: a soft descending whoosh with a gentle low settle thump, as the machine starts working again.
- **Audio Character:** Calm, grounding.
- **Duration:** 300-500 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `game resume transition whoosh`; `return to main screen soft`; `window close settle thump`
- **Variants to collect:** 1
- **Additional Notes:** Plays instead of WIN-02 for the mini-game window. Pair it with the boost sound (UP-09) when a reward exists; the louder one wins.

### FB-16 · Flight ambience

- **SFX ID:** FB-16
- **Sound Name:** Flight ambience
- **Category:** Mini-game
- **Trigger:** While a Flying Ball flight is in progress (state `play`).
- **Sound Description:** A soft airy wind bed with a faint distant rhythmic flutter; barely audible.
- **Audio Character:** Airy, steady, calm.
- **Duration:** 4-8 s seamless loop
- **Playback Type:** Loop
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `soft wind loop seamless`; `sky ambience gentle`; `airy background loop quiet`
- **Variants to collect:** 1
- **Additional Notes:** Should be very quiet; remove if it competes with LunaWave music.


## Music Player

### MP-01 · Music transport click

- **SFX ID:** MP-01
- **Sound Name:** Music transport click
- **Category:** Music Player
- **Trigger:** LunaWave Previous / Play-Pause / Next / Repeat / Mute buttons (they do not call `onClick` today, so they are silent).
- **Sound Description:** A very quiet, soft "key" click (a gentler variant of UI-01, about 4 dB quieter).
- **Audio Character:** Unobtrusive; must not fight the music being controlled.
- **Duration:** 30-60 ms
- **Playback Type:** One-shot
- **Priority:** Optional
- **Asset Status:** Missing
- **Search Keywords:** `soft media player button click`; `quiet transport button tick`; `subtle music player UI sound`
- **Variants to collect:** 1
- **Additional Notes:** Mute and Repeat can reuse UI-05 / UI-06. Seek-bar and volume dragging stay silent. No sound should play on automatic track changes.

