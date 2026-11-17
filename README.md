# PIXEL COIN PUSHER

เกมเพิ่มพูนรายได้แนว coin-pusher แนวตั้ง 2.5D สร้างด้วย Three.js + Rapier + Vite
เหรียญตกจากท่อสีเขียวด้านบน ตกบนแพลตฟอร์มหนา ซ้อนกัน ล้ม กลิ้ง ถูกลูกสูบที่ผนังดันไปแพลตฟอร์มถัดไป จนตกลงเครื่องบดหนามด้านล่างกลายเป็นเงิน — เอาเงินไปอัปเกรดเครื่องจักรและผ่านด่านต่างๆ

```bash
npm install
npm run dev            # เครื่องพัฒนา
npm run build          # dist/ (รวม version.json)
npm test               # เศรษฐกิจ + เซฟ + เลย์เอาต์ด่าน
npm run test:physics   # ฟิสิกส์ Rapier + ลูปเกมแบบไม่มีหน้าจอ
```

## การเล่น

- **ปุ่มกลมใหญ่ "ปล่อย"** ปล่อยเหรียญเอง (มีชาร์จสะสม แถบเติมตามเวลา) / **เหรียญ/วิ** ปล่อยอัตโนมัติ — ใช้ระบบฟิสิกส์เดียวกัน
- **ป้ายราคาบนแพลตฟอร์ม** แตะเพื่อเปิดแผงอัปเกรดของเครื่องจักรจุดนั้น (ชื่อ, ระดับ, ผลลัพธ์, ราคา, ปุ่มซื้อ) — สีฟ้า = ซื้อได้
- เครื่องจักร: ลูกสูบดัน, สายพาน, พัดลมเป่าลม, แม่เหล็ก, เครื่องดีด, ประตูตัวคูณ ×2 (ระดับของเครื่องเก็บถาวรข้ามด่าน) + ความจุเหรียญ + โอกาสเหรียญหายาก
- ด่านมีแถบความคืบหน้า (เช่น 0 / 50) ผ่านแล้วได้เงิน+เพชร ปลดล็อกเลย์เอาต์/สีพื้นหลัง/เครื่องจักรใหม่ (ด่าน 1-5 ออกแบบเอง จากนั้นวนเลย์เอาต์ที่ยากขึ้น)
- เหรียญ 4 ชนิด (ทองแดง/เงิน/ทอง/หายาก ให้เพชร), คอมโบ +5% ต่อ 5 เหรียญ (สูงสุด +50%)
- แตะที่ฉาก = ดีดเหรียญใกล้นิ้วเบาๆ ด้วยแรงจริง; ปุ่ม **ช่วยดันเหรียญ** = ลูกสูบทุกตัวดันเพิ่มหนึ่งรอบ + เขย่ากระดาน (คูลดาวน์ 8 วิ)
- รายได้ออฟไลน์ 50% (ต้องมีลูกสูบทำงานอยู่), เซฟ localStorage, ตั้งค่า Retro Pixel ON/OFF, เสียง, คุณภาพกราฟิก (ปรับอัตโนมัติถ้าเครื่องช้า)

## เทคนิค

- **กล้อง**: `OrthographicCamera` มองตรงด้านหน้า เอียงลงเล็กน้อยเพื่อให้เห็นหน้าบนของแพลตฟอร์ม ไม่มี perspective distortion ฉากเป็นโมเดล 3D จริง มีแสง/เงา (directional + shadow map; ปิดเงาที่คุณภาพต่ำ)
- **เหรียญ**: `CylinderGeometry` บาง มีขอบ/ลายนูน/วัสดุโลหะ ขนาดตั้งที่ `COIN_TYPES` (`src/layout.js`) และ Rapier cylinder collider ใช้ค่าเดียวกันเป๊ะ
- **ฟิสิกส์ 2.5D**: ช่องลึก 0.9 หน่วย กั้นด้วยกระจกใสหน้า/หลัง เหรียญหมุนได้อิสระ ล้ม/กลิ้ง/ตีลังกาได้ ใช้ pool 130 ตัว, CCD, collision groups, fixed step 1/60
- **พื้นหลัง/แพลตฟอร์ม**: พื้นหลังเป็น shader ไล่สีแนวนอน (กลางสว่าง ขอบมืด) เปลี่ยนสีตามด่าน; แพลตฟอร์มใช้ texture ไล่สีขาว→ฟ้าอ่อน + ขอบล่างเข้มบางๆ ไม่มีเส้นขอบวัตถุ/edge detection
- **Anti-jam** (`src/machines.js`): เหรียญที่นิ่งสนิท ≥1.5 วิ ในโซนเฝ้าระวัง (ปลายแพลตฟอร์ม, ช่องกรวยแคบ) ถือว่าค้าง → ลูกสูบเดินเต็มช่วงหรือแรงอากาศเล็กน้อย (impulse จริง) มีคูลดาวน์; เหรียญที่นอนนิ่งที่อื่นไม่ถูกแตะ ไม่เคยวาร์ป/ลบ/ตั้งตำแหน่งเหรียญ
- **เอฟเฟกต์พิกเซล** (`src/pixel.js`): เปิด = เรนเดอร์ความละเอียดต่ำแบบ nearest + dither เบาๆ (ไม่มีเส้นขอบ); ปิด = เรนเดอร์คมปกติ UI เป็น DOM คมทั้งสองโหมด

## ฝังในแอปอื่น (iframe / Rezona)

```html
<iframe src="https://yahahahau.github.io/cash-factory-/"
        style="width:100%;height:100%;border:0" allow="autoplay; fullscreen"></iframe>
```

- เลย์เอาต์ปรับตามขนาดของ iframe เองแบบเรียลไทม์ (ResizeObserver) ไม่ต้องกำหนดอัตราส่วน; จอกว้างจะจัดเวทีแนวตั้งไว้กลางจอ
- ไม่ใช้ Fullscreen API, popup หรือเข้าถึง parent; ถ้า storage ถูกบล็อกจะเก็บไว้ในหน่วยความจำชั่วคราว
- ดูตัวอย่างที่ `public/embed-example.html`

### ข้อความระหว่างโฮสต์กับเกม (postMessage)

| จากเกมไปโฮสต์ | ความหมาย |
|---|---|
| `pcf:ready` | เกมพร้อมแล้ว (`version`, `aspect`) |
| `pcf:resize` | ขนาดหน้าต่างเปลี่ยน |
| `pcf:updateAvailable` / `pcf:reloading` | พบเวอร์ชันใหม่ / กำลังรีโหลด |

| จากโฮสต์ไปเกม (`{target:'pixel-cash-factory', type, value}`) | ความหมาย |
|---|---|
| `pcf:pause` / `pcf:resume` | หยุด/เล่นต่อ (คิดรายได้ออฟไลน์ตอนกลับมา) |
| `pcf:setQuality` (`low`/`medium`/`high`) | ตั้งคุณภาพ |
| `pcf:checkUpdate` | สั่งเช็กเวอร์ชันใหม่ทันที |

## อัปเดตแบบเรียลไทม์

1. ทุกครั้งที่ push เข้า `main` GitHub Actions จะ build และดีพลอย โดยใช้ commit SHA เป็นเลขเวอร์ชันใน `version.json`
2. เกมที่เปิดอยู่ใน iframe จะตรวจ `version.json` ทุก ~45 วินาที (และตอนกลับมาที่แท็บ/ต่อเน็ต)
3. เมื่อเวอร์ชันต่าง เกมเซฟ → แจ้งโฮสต์ → รีโหลดตัวเองเป็น `?v=<เวอร์ชัน>` (หลีกเลี่ยงแคช HTML) ความคืบหน้าไม่หาย

ไม่ต้องให้ AI ของแพลตฟอร์มทำเพิ่ม ตราบใดที่แพลตฟอร์มฝัง **URL ที่ดีพลอยจริง** (เช่น GitHub Pages) ไว้ใน iframe ถ้าแพลตฟอร์มคัดลอกไฟล์ไปเก็บไว้เอง ต้องให้แพลตฟอร์มชี้มาที่ URL แทน

## ดีพลอย

เปิด GitHub → Settings → Pages → Source: **GitHub Actions** แล้ว push เข้า `main` ได้เลย (`.github/workflows/pages.yml`) หรือจะใช้ Netlify/Cloudflare Pages ก็ได้ (`public/_headers` ตั้งให้ฝัง iframe ได้และไม่แคช index/version)

## โครงสร้าง

```
src/economy.js   สูตรเศรษฐกิจ/เกรด/ออฟไลน์ (ไม่พึ่ง DOM)   src/save.js    เซฟ/โหลด
src/physics.js   Rapier + object pool                       src/world.js   ฉาก Three.js + เอฟเฟกต์ตามเกรด
src/pixel.js     พิกเซลโพสต์โปรเซส                          src/ui.js      UI แบบ Windows XP Luna (อังกฤษทั้งหมด)
src/game.js      ลูปเกม ผลิต/เก็บ/เงิน                       src/embed.js   iframe + อัปเดตอัตโนมัติ
```

## อัปเดต 2.5D / ฟิสิกส์เหรียญ / ระบบกันเหรียญค้าง

- **กล้อง**: `THREE.OrthographicCamera` เอียงเล็กน้อย (ไม่มี perspective distortion) ฉากยังเป็นโมเดล 3D จริง ปรับด้วย `World.fit()` / `_placeCam()`
- **สไตล์พิกเซล**: ตัดเส้นขอบ/edge detection ออกทั้งหมด เหลือแค่ลดความละเอียด + ดิเธอร์เบาๆ (ปิดได้ในตั้งค่า, UI คมชัดทั้งสองโหมด)
- **เหรียญ**: `CylinderGeometry` บางๆ มีขอบและลายนูน (ปรับขนาดที่ `COIN_TYPES` ใน `src/layout.js` — ใช้ร่วมกับ collider)
- **ฟิสิกส์**: Rapier cylinder collider รัศมี/ความหนาตรงกับโมเดล หมุน/กลิ้ง/ตีลังกาได้ในช่องแคบลึก 0.4 หน่วย (CCD, collision groups, pooling, fixed 1/60s)
- **Anti-jam**: `src/pusher.js` ตรวจเหรียญที่นิ่งในช่องผลิต (ไม่นับถังเก็บปลายทาง) แล้วสั่งลูกสูบ kinematic 4 ตัวดันด้วยแรงจริง ไม่วาร์ป ไม่ลบ ไม่ตั้งตำแหน่งเหรียญ มี cooldown
- **ปุ่ม "ช่วยดันเหรียญ"**: ดันเพิ่มหนึ่งรอบ มีแอนิเมชันกด, แถบ cooldown 7 วินาที และข้อความแจ้ง
- ทดสอบ: `npm test` (เศรษฐกิจ) และ `npm run test:physics` (ฟิสิกส์ 9 ชุด)


## ระบบรัน · Flying Ball · ตัวคูณกำไร (อัปเดตล่าสุด)

- **รัน (New Run)**: ปุ่ม `NEW RUN` ปลดล็อกที่ด่าน 6 (ตั้งค่าใน `ECON.run.minStage`) เริ่มรันใหม่จะรีเซ็ตเงิน/ด่าน/ระดับอัปเกรด แต่เก็บเพชร สถิติ ความสำเร็จ แต้มถาวร (+3% รายได้ต่อแต้ม) และเวลาบูสต์/คูลดาวน์
- **ราคาไดนามิก**: `ราคา = base × ตัวคูณรัน × growth^เลเวล × ตัวคูณกระเป๋าเงิน` ตัวคูณกระเป๋าเงินเป็น tier (ครึ่งหลัก log10 ของเงิน เริ่มที่ $100) ขึ้นอย่างเดียวในหนึ่งรัน มีเพดาน ค่าทั้งหมดอยู่ที่ `ECON` ใน `src/economy.js`
- **Flying Ball**: ปุ่มมุมขวาล่าง (โหลดโค้ดเกมเมื่อกดเล่นเท่านั้น) ผ่านประตูตามเป้าหมายจึงสุ่มตัวคูณ ×2/×4/×16/×64/×256 (55/28/12/4/1% ปรับได้ที่ `ECON.mini.rewards`) บูสต์ 20 นาที แล้วคูลดาวน์ 30 นาที ใช้ timestamp ที่เซฟไว้ รีเฟรชไม่รีเซ็ต และผลแต่ละรอบจ่ายได้ครั้งเดียว
- **รายได้**: ทุกการเก็บเหรียญ/ออฟไลน์ผ่าน `E.income()` จุดเดียว บูสต์ไม่คูณเพชร ราคาอัปเกรด รางวัลผ่านด่าน หรือเงินที่มีอยู่
- **UI แบบ Windows XP Luna**: คอมโพเนนต์/WindowManager/Taskbar/Start menu/Notification ใน `src/xp.js`, หน้าต่างอัปเกรด+ตั้งค่าใน `src/xp-panels.js`, หน้าจอเกมใน `src/screens.js`, ไอคอน SVG ใน `src/icons.js`, tokens + animation ใน `src/style.css`, ฟอนต์ `src/fonts/windows-xp.otf` (ใช้ฟอนต์นี้ฟอนต์เดียว)
- เวลา: ไม่มีบริการเวลาฝั่งเซิร์ฟเวอร์ใน Rezona จึงใช้เวลาเครื่อง ถ้านาฬิกาถูกย้อนหลังจะเลื่อนเวลาหมดอายุตามเพื่อไม่ให้ได้เวลาเพิ่ม

## CURSOR AUTO PUSH COIN (per-run upgrade)
- Toolbar button (taskbar) + info window; price `ECON.cursor.price` ($500, scaled by the dynamic price multiplier); resets on New Run; saved in `state.cursor`.
- `src/cursor.js`: stuck-coin detector (thresholds in `ECON.cursor`), target scoring, human-like motion model (min-jerk speed, curved Bezier paths, endpoint scatter, overshoot, micro corrections, pauses), state machine (READY / DETECTING / APPROACHING / PUSHING / ASSISTING / RETURNING / IDLE), physical help through a kinematic helper collider (`Physics.setHelper`, coins only).
- `src/cursor-sprite.js`: draws the supplied artwork (`public/assets/cursor-auto-push.png`, `cursor-auto-push-link.png`) crisply at whole device pixels; hotspot constants live there. Replace the PNGs to change the artwork.
- Tests: `npm test` (economy/save) and `npm run test:physics` (detection, motion, push, cancel, failure).

## Presentation modes (src/presentation.js)
- MOBILE (portrait / small screens): full-screen game, compact taskbar (Start menu, Cursor Auto Push Coin, boost timer).
- TABLET LANDSCAPE (touch primary pointer, >= 900x520, landscape): XP wallpaper + centered game window, native pointer kept.
- DESKTOP (primary pointer fine + hover): wallpaper + game window, custom cursor from `public/assets/cursor-auto-push*.png` (only after the asset is verified; otherwise the native cursor stays and Settings > Performance reports why).
- The game window has no Close button; Maximize/Restore works. Wallpapers: `public/assets/wallpaper-3x2.jpg` and `wallpaper-wide.jpg` (chosen by viewport aspect).
- Hover styles only apply while a real mouse/pen is active (`html.hv`), so touch never leaves stuck hover states.

## Floating windows + exclusive Flying Ball session
- **Desktop-level window layers** (`#winlayer`, `#minilayer`, `#notifs` in `index.html`) are siblings of the game window, so secondary windows are never clipped by it. `WindowManager` (`src/xp.js`) gives every window an id, z-order, active/inactive state, drag, optional resize (Settings, Profit Boost), maximize, and remembers the last position / size per window id.
- **Boundaries by mode**: desktop and landscape tablet = the whole workspace (a window can leave the game window and cover the wallpaper, but a grip of its title bar always stays reachable); phone portrait = exactly the game viewport (`Presentation._bounds` writes `--dx/--dy/--dw/--dh`), windows are fully contained, content scrolls inside. Orientation / resize re-clamps every window (nothing is closed) and the free-layout position is restored when rotating back.
- **Flying Ball** is its own application window in `#minilayer` (fixed ratio, not resizable). Its close button / Esc stay disabled during a flight; pause → *Quit* asks for confirmation. After the attempt is settled (game over / mission complete) the window stays open showing the result; the main game resumes only when it is closed.
- **Central pause** (`src/pause.js`): `RUNNING → MINIGAME_ACTIVE → RESUMING → RUNNING`. While frozen the main loop skips physics, production, machines, cursor assistant, income, stage progress, timers and animations; `E.clock` (game clock) is frozen so boost / cooldown cannot expire, and deadlines are shifted on resume. Resume re-bases every accumulator (`game.rebase()`), so there is no catch-up step. The game window and taskbar are `inert` (no pointer / keyboard) while the mini-game runs, and handlers also refuse input when `pause.frozen`.
- **Save safety**: the reward is settled exactly once when the attempt ends (session cleared + saved at once); an attempt interrupted by a refresh is void on the next load; no offline income is counted for time spent in the mini-game.

## LunaWave Music Player (Start Menu)
- A dedicated, separated row inside the Start Menu (`src/lunawave-ui.js`); the engine (`src/lunawave.js`) is independent from the game loop, the pause manager and the Flying Ball session, so closing the menu or opening Flying Ball never restarts the song. Only an explicit Pause stops it. While Flying Ball runs the game shortcuts in the menu are locked but the music row stays usable.
- Library: `src/music-library.js` + `public/music/*` (supplied tracks and covers; credits come from the supplied file names and the supplied Credit image). Covers are shown inside a square slot with `object-fit: contain` (never cropped).
- Playback: one `HTMLAudioElement`, previous / play-pause / next / repeat-one, seek (click, drag, arrow keys), volume + mute (volume, repeat, last track and visualizer style persist in `pixelCashFactory.lunawave.v1`). The playlist loops; Previous restarts the track after 3 s.
- Visualizer: `HTMLAudioElement → MediaElementSource → AnalyserNode → Gain → destination`, one rAF loop that runs only while playing and while the menu is open. Line and bar modes; the artwork pulse follows real bass transients. Without Web Audio analysis it shows a clearly labelled "basic mode" animation and the artwork does not pulse.
- The old built-in 8-bit chiptune music has been removed; LunaWave is the game's only music (sound effects are unchanged). Settings → Music is now the LunaWave volume.
- **Autoplay**: LunaWave tries to start the saved/first track as soon as the game opens. If the browser blocks audio before a user gesture, it starts on the first tap / key press (and builds the analyser at that moment), unless the player was explicitly paused.
- **Caption buttons**: every window shows minimize / maximize / close; a button that cannot be used (e.g. the main game window's minimize / close, dialogs without min / max) is rendered greyed-out, disabled and does nothing.
- **Audio-reactive artwork** (`src/audio-reactive.js`): the artwork scale (1.0 – 1.10) is computed from the same analyser as the bars: weighted RMS of 40–220 Hz (bins derived from `sampleRate / fftSize`), adaptive rolling min/max normalisation (no per-song settings), transient detection, and an attack/release envelope with delta-time smoothing. One central rAF loop; the analyser data is checked for freezing and a suspended / interrupted `AudioContext` is resumed automatically. Developer diagnostics: open the game with `?lwdebug=1`.

## Player account + cloud save (Supabase)
Start Menu > Account: e-mail and OAuth sign-in, profile, cloud save with autosave, offline play and an explicit conflict dialog. Inactive until `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set (see `.env.example`). **Not yet verified against a live Supabase project.** Docs: `docs/backend-setup.md`, `docs/account-system.md`, `docs/cloud-save-system.md`, `docs/account-testing-report.md`. Tests: `npm test`, `npm run test:account`, `bash scripts/sql-test.sh`.
