# Existing Audio Assets Audit

Phase 1 inventory of every audio asset and audio mechanism in the project. Nothing was modified.

Companion documents: [specification](sfx-complete-specification.md) · [event map](sfx-event-map.md) · [missing assets](sfx-missing-assets.md)

## 1. Result

- **Audio files found:** 4 (all music, MP3). **SFX files found: 0.**
- **Procedural sound effects found:** 8 functions in `src/audio.js` (synthesised at run time, not files).
- **Related non-audio files:** 4 cover images (JPG) used by LunaWave.
- **Suitable for the new SFX list as-is:** none of the 8 procedural sounds (square / sawtooth chiptune beeps); they are counted as **Replacement Needed** and may stay as interim fallbacks.

Method note: audio cannot be auditioned in this environment, so what a file or synth "sounds like" is **Unverified** unless it follows directly from the numbers. Technical values below (duration, sample rate, bit rate, integrated loudness) were measured with `ffprobe` / `ffmpeg ebur128` on the actual files.

## 2. Audio files (`public/music/`)

| Filename | Format | Duration | Sample rate / bit rate | Integrated loudness | Type | Sound character | Matches a required SFX? | Used in source? |
|---|---|---|---|---|---|---|---|---|
| `jerseyclub.mp3` | MP3 | 152.03 s | 44.1 kHz stereo / 320 kbps | -8.1 LUFS (LRA 8.6 LU) | Music | Unverified (title "NO SIGNAL #jerseyclub", credit Tai2Talented) | No | Yes: `music-library.js` TRACKS, LunaWave |
| `funk.mp3` | MP3 | 61.10 s | 44.1 kHz stereo / 320 kbps | -6.5 LUFS (LRA 3.8 LU) | Music | Unverified (title "No Signal Funk!", credit DynaCarl) | No | Yes |
| `fullversion.mp3` | MP3 | 112.09 s | 44.1 kHz stereo / 320 kbps | -11.0 LUFS (LRA 4.3 LU) | Music | Unverified (title "No Signal [Full Version]", credit @tayonese) | No | Yes |
| `hallway.mp3` | MP3 | 123.48 s | 44.1 kHz stereo / 320 kbps | -11.8 LUFS (LRA 6.2 LU) | Music | Unverified (title "You're Walking Down the Hallway", credit JomJom412) | No | Yes |

Notes: file sizes are 6.1 MB (jerseyclub), 2.4 MB (funk), 4.5 MB (fullversion) and 4.9 MB (hallway). All are tracks of **very different loudness** (-6.5 to -11.8 LUFS): the loudest is about 5 dB hotter than the quietest, so SFX levels will feel different from track to track; consider a per-track gain in LunaWave later (not part of this phase). Filenames and titles come from the supplied files and are kept as-is; actual playback tests with real audio were done in the earlier LunaWave work, but the musical character is still not described here.

### Cover images (not audio)

| File | Size | Dimensions | Used by |
|---|---|---|---|
| `jerseyclub.jpg` | 11.6 KB | 640 x 360 | LunaWave album art |
| `funk.jpg` | 38.4 KB | 640 x 360 | LunaWave album art |
| `fullversion.jpg` | 29.5 KB | 480 x 360 | LunaWave album art |
| `hallway.jpg` | 8.9 KB | 300 x 300 | LunaWave album art |

## 3. Procedural sound effects (`src/audio.js`)

There are no sample files: each function builds oscillators and an envelope. "Sounds like" is derived from the synthesis recipe, not from listening.

| Function | Recipe | Approx. duration | Called from | Maps to required SFX | Verdict |
|---|---|---|---|---|---|
| `tap()` | square, 660 -> 880 Hz sweep, 0.06 s, gain 0.10 | ~60 ms | Generic button blip (`h.onClick` everywhere), playfield poke, Flying Ball flap, reward roll ticks | UI-01, CM-24, FB-03, FB-08 | Replacement Needed. Overloaded: five different jobs share one sound |
| `drop()` | square 440 -> 300 Hz (0.14 s) then triangle 330 -> 220 Hz | ~140 ms | Drop button when a coin is spawned | CM-01 | Replacement Needed. Chiptune beeps, not a coin / chute sound |
| `collect(type)` | square sweep + triangle, base 988 / 1175 / 784 / 1568 Hz for bronze / silver / gold / rare, throttled to 1 per 55 ms | ~170 ms | Each collected coin; also each Flying Ball gate (type 1) | CM-10..13, FB-04 | Replacement Needed. Pitch order is not ascending by value (gold is lowest) |
| `buy()` | square arpeggio 523 / 659 / 784 Hz, 60 ms apart, 0.14 s each | ~260 ms | Successful purchase; also the multiplier gate | UP-01, CM-21 | Replacement Needed. Gate reuses the purchase sound |
| `deny()` | sawtooth 180 -> 110 Hz, 0.16 s | ~160 ms | Failed purchase, empty Drop, Flying Ball crash | UP-02, FB-05 | Replacement Needed. Harsh buzz; three unrelated events share it |
| `clunk()` | square 120 -> 70 Hz + triangle 90 -> 60 Hz | ~150 ms | Piston stroke, launcher, air burst (via `onFire` / `onLaunch`) | CM-15, CM-20, CM-22 | Replacement Needed. Every machine sounds the same |
| `grade()` | six-note square + triangle arpeggio, 392 -> 1319 Hz, 90 ms apart, 0.3 s each | ~750 ms | Stage clear, New Run, Flying Ball mission complete, reward reveal | UP-07, UP-08, FB-07, FB-09 | Replacement Needed. One fanfare for four different moments |
| `welcome()` | triangle notes 659 / 784 / 988 / 1319 Hz, 0.1 s apart, 0.2 s each | ~500 ms | Welcome Back (offline earnings) dialog | SYS-02 | Replacement Needed. Only used once per session |

### Engine facts (`src/audio.js`)

- Web Audio graph: oscillators -> SFX bus gain (`settings.sfx` x 0.55, default 0.7) -> destination. Created lazily; unlocked on the first pointer-down; suspended when the page is hidden. Browsers without `AudioContext` / `webkitAudioContext` stay silent.
- `collect()` is throttled to one sound per 55 ms; no other sound has a throttle or voice cap.
- Pitch is fixed per function (no random variation), so repeated sounds are identical.
- All sounds are mono, synthesised, with no reverb and no layering.

### Dead or unused audio code (found while inspecting; not changed)

- The old 8-bit music scheduler was removed: `_schedule()` is now an empty function (a timer still calls it every 120 ms for no purpose), and `musicBus` / the `music` argument of `setVolumes()` are unused. The Settings "Music" slider controls the LunaWave volume.
- `screens.js showReward()` is not called anywhere (the Flying Ball window does its own reward roll).
- `machines.manual()` and `onShake` exist but no UI calls them.

## 4. Coverage summary

| Metric | Value |
|---|---|
| SFX requirements in the specification | 82 |
| Requirements whose own event plays a placeholder synth sound | 21 (Replacement Needed) |
| Requirements with no dedicated sound (silent, or borrowing a generic placeholder such as `tap`) | 61 (Missing) |
| Existing files usable as SFX | 0 |
