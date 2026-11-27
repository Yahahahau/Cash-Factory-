import './style.css';
import * as E from './economy.js';
import * as Save from './save.js';
import { Physics, loadRapier } from './physics.js';
import { Machines } from './machines.js';
import { World } from './world.js';
import { PixelPipeline } from './pixel.js';
import { GameAudio } from './audio.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { Embed, BUILD_ID, inIframe } from './embed.js';
import { openNewRun, rarityOf } from './screens.js';
import { PauseManager, GS } from './pause.js';
import { LunaWave } from './lunawave.js';
import { CursorAssistant } from './cursor.js';
import { Presentation } from './presentation.js';
import { CursorSprite } from './cursor-sprite.js';
import { createAccount } from './account/index.js';
import * as P from './progression.js';
import { PARTS, TIERS, COSMETICS } from './content.js';

const QUALITY = {
  low: { limit: 50, rows: 330, dpr: 1.5, shadows: false, shadowMap: 512 },
  medium: { limit: 80, rows: 420, dpr: 2, shadows: true, shadowMap: 512 },
  high: { limit: 120, rows: 500, dpr: 2, shadows: true, shadowMap: 1024 },
};
const MAX_BODIES = 130;

async function boot() {
  const loadingSub = document.querySelector('.ld-sub');
  try {
    await Promise.all([
      loadRapier(),
      document.fonts ? document.fonts.load('12px "Windows XP"').catch(() => {}) : null,
    ]);
  } catch (e) {
    loadingSub.textContent = 'Could not load the physics engine. Please refresh.';
    throw e;
  }

  let { state, fresh } = Save.load();
  E.normalizeClock(state, Date.now());
  // a Flying Ball attempt that was interrupted (refresh / crash) is void: it can never pay out afterwards
  if (state.mini.session) state.mini.session = null;
  const pause = new PauseManager();
  const canvas = document.getElementById('c');
  const sceneEl = document.getElementById('scene');
  const presentation = new Presentation();

  let world;
  try {
    world = new World(canvas, { maxBodies: MAX_BODIES, particles: 200 });
    // price labels fade out while a stage transition moves the platforms
    world.onTransition = (busy) => { const l = document.getElementById('labels'); if (l) l.classList.toggle('stage-anim', busy); };
  } catch (e) {
    loadingSub.textContent = 'This device does not support WebGL.';
    throw e;
  }
  const physics = new Physics(MAX_BODIES);
  const machines = new Machines(physics, () => state);
  const pipeline = new PixelPipeline(world.renderer, world.scene, world.camera);
  const audio = new GameAudio();
  audio.setVolumes(state.settings.sfx, state.settings.music);

  let game; // assigned below
  let embed;
  let saveTimer = 0;
  let suspendedAt = null;
  let account = null; // cloud account (assigned after the UI exists)
  const doSave = () => { Save.save(state); if (account) account.notifySaved(state); };

  const ui = new UI({
    version: BUILD_ID,
    inIframe,
    onClick: () => { audio.unlock(); audio.tap(); },
    onBuy: (key) => {
      if (pause.frozen) return false;
      audio.unlock();
      const info = E.upgradeInfo(state, key);
      if (info.atMax) { ui.toast('Already at maximum level.', 1500, { title: 'Upgrade', icon: 'warn' }); return false; }
      if (!E.buyUpgrade(state, key)) { audio.deny(); ui.toast('Not enough cash.', 1500, { title: 'Upgrade', icon: 'warn' }); return false; }
      audio.buy();
      world.particles.emit(0, 8, 1, 14, { color: [0xffe066, 0x66f7ff, 0xffffff], speed: 3.5, life: 0.7, gravity: 5, size: 0.14, up: 0.9 });
      if (info.isMachine && info.lvl === 0) ui.toast(E.MACHINES[key].name + ' installed!', 2000, { title: 'Upgrade', icon: 'check' });
      if (key === 'capacity') game.charges = Math.min(E.maxCharges(state), game.charges);
      doSave();
      return true;
    },
    onBuyCursor: () => {
      if (pause.frozen) return false;
      audio.unlock();
      const info = E.cursorInfo(state);
      if (info.owned) return false;
      if (!E.buyCursor(state)) { audio.deny(); ui.toast(`Need $${E.fmtCash(info.missing)} more.`, 1800, { title: 'Cursor Auto Push Coin', icon: 'warn' }); return false; }
      audio.buy();
      doSave();
      ui.toast('Cursor Auto Push Coin is now active for this run.', 2800, { title: 'Purchased', icon: 'check' });
      ui.updateCursor();
      return true;
    },
    onToggleCursor: (on) => {
      if (pause.frozen) return;
      if (!E.setCursorOn(state, on)) return;
      audio.tap();
      doSave();
      ui.updateCursor();
    },
    onDrop: () => {
      if (pause.frozen) return false;
      audio.unlock();
      const ok = game.drop();
      if (!ok) audio.deny();
      return ok;
    },
    onSetting: (k, v) => {
      state.settings[k] = v;
      if (k === 'pixel') applySize();
      else if (k === 'quality') { game.setQuality(QUALITY[v]); world.setQuality(QUALITY[v]); applySize(); }
      else if (k === 'music') lunawave.setVolume(v);
      else audio.setVolumes(state.settings.sfx, state.settings.music);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, 400);
    },
    onReset: () => {
      Save.wipe();
      const keep = state.settings;
      state = Save.load().state;
      state.settings = { ...keep };
      game.reset(state);
      world.applyLook(state);
      ui.state = state;
      doSave();
      ui.toast('Progress has been reset.', 2400, { title: 'Reset' });
    },
    onCheckUpdate: () => embed.check(true),
    // ----- Flying Ball -----
    onMiniStart: () => startMini(),
    isFrozen: () => pause.frozen,
    getMusicVolume: () => lunawave.volume,
    onTick: () => audio.tap(),
    onReveal: () => { audio.grade(); },
    // ----- runs -----
    onNewRunOpen: () => {
      if (pause.frozen) return;
      if (!E.canNewRun(state)) {
        const n = E.newRunNeeds(state);
        ui.toast(`New Run needs stage ${n.stage} (now ${state.stage}) and ${n.milestones} run milestones (done ${n.done}). See Goals > Milestones.`, 3600, { title: 'New Run', icon: 'flag' });
        return;
      }
      openNewRun(ui, state, E.previewNewRun(state), ui.h);
    },
    onNewRun: () => {
      if (pause.frozen) return;
      audio.unlock();
      const pv = E.applyNewRun(state);
      game.reset(state);
      world.applyLook(state);
      ui.state = state;
      doSave();
      audio.grade();
      ui.flash();
      ui.toast(`Run ${state.run} started. Starting cash ${E.fmtMoney(state.cash)}, permanent income x${E.permMult(state).toFixed(2)}.`, 3600, { title: 'New Run', icon: 'flag' });
      void pv;
    },
    // expansion windows: branch upgrades, parts, missions, collections
    onProgress: (act, k) => {
      if (pause.frozen) return;
      audio.unlock();
      const fx = (col) => world.particles.emit(0, 8, 1, 14, { color: col, speed: 3.5, life: 0.7, gravity: 5, size: 0.14, up: 0.9 });
      let ok = false;
      if (act === 'buy') { ui.h.onBuy(k); return; }
      if (act === 'cursor') { ui.h.onBuyCursor(); return; }
      if (act === 'extra') {
        const i = P.extraInfo(state, k);
        ok = P.buyExtra(state, k);
        if (ok && i.lvl === 0) ui.toast(i.name + ' unlocked!', 2000, { title: 'Upgrade Shop', icon: 'check' });
        if (ok) fx([0xffe066, 0xffffff]);
      } else if (act === 'part') {
        ok = P.buyPart(state, k);
        if (ok) { world.applyLook(state); fx([0x74f6ff, 0xffffff, 0xffe066]); ui.flash(); ui.toast(`${PARTS[k].name} upgraded to ${TIERS[state.parts[k]]}.`, 2400, { title: 'Machine Parts', icon: 'gear' }); game.charges = Math.min(E.maxCharges(state), game.charges); }
      } else if (act === 'claim') {
        const m = P.claimMission(state, k);
        ok = !!m;
        if (ok) { fx([0x74f6ff, 0xffffff]); ui.toast(`Mission complete: +${m.reward} gems.`, 2200, { title: 'Goals', icon: 'gem' }); }
      } else if (act === 'reroll') ok = P.rerollMission(state, k);
      else if (act === 'equip') { ok = P.equip(state, k); if (ok) world.applyLook(state); }
      if (ok) { audio.buy(); doSave(); } else audio.deny();
    },
    getPresentation: () => presentation.report(),
    getFps: () => Math.round(1000 / Math.max(1, ema)),
  });
  // LunaWave music: independent of the game loop, pause manager and mini-game sessions
  const lunawave = new LunaWave();
  ui.lunawave = lunawave;
  lunawave.autoStart(); // the game's music starts by itself (as soon as the browser allows audio)
  ui.state = state;
  P.ensureMissions(state);
  world.applyLook(state);
  ui.world = world;

  // ---------- Flying Ball: an exclusive session. The main game is frozen (centralized pause) until the window is closed ----------
  let lastReward = null;
  let renderDirty = true; // the frozen main scene is redrawn only when needed (resize)
  async function startMini() {
    audio.unlock();
    if (!pause.running) return;
    const ses = E.startMini(state);
    if (!ses) { ui.toast('Flying Ball is not available right now (boost or cooldown).', 2400, { title: 'Flying Ball', icon: 'warn' }); ui.closeModal(); return; }
    ui.closeModal();
    pause.enterMini(state); // freeze first: from here no main-game system advances
    doSave();
    let FlyView;
    try { ({ FlyView } = await import('./flyball.js')); } catch (e) {
      state.mini.session = null;
      endMini(false);
      ui.toast('Could not load Flying Ball. Check your connection.', 2600, { title: 'Flying Ball', icon: 'warn' });
      return;
    }
    lastReward = null;
    const view = new FlyView(null, {
      wm: ui.wm,
      objective: ses.objective,
      best: state.mini.best,
      audio,
      onTick: () => audio.tap(),
      onReveal: () => { audio.grade(); ui.flash(); },
      onFinish: (result) => {
        const r = E.finishMini(state, result);
        if (r.ok) { lastReward = r; ui.updateMini(state); }
        const na = E.checkAchievements(state);
        if (na.length) ui.toast(na.map((id) => E.ACHIEVEMENTS[id].name).join(', '), 3000, { title: 'Achievement unlocked', icon: 'trophy' });
        doSave(); // settle + persist at once: a refresh can never replay this result
        return { ...r, best: state.mini.best };
      },
      onRetry: () => {
        const s2 = E.startMini(state);
        if (!s2) return null;
        doSave();
        return s2.objective;
      },
      onClose: () => endMini(true),
    });
    window.__pcf && (window.__pcf.miniView = view);
  }
  // the mini-game window was closed (only possible once its attempt is settled): hand control back to the main game
  function endMini(announce) {
    state.mini.session = null;
    pause.exitMini(state);
    ui.updateMini(state);
    doSave();
    if (account) account.kick();
    if (announce && lastReward) {
      const ra = rarityOf(lastReward.mult);
      ui.toast(`Profit Boost x${lastReward.mult} (${ra[1]}) is active for ${E.ECON.mini.boostMinutes} minutes.`, 3600, { title: 'Reward', icon: 'trophy' });
    }
    lastReward = null;
  }
  pause.on((st) => {
    const on = st === GS.MINIGAME;
    document.documentElement.classList.toggle('mini-active', on);
    ui.wm.isolate(on);
    ui.menu && ui.menu.close();
    for (const id of ['appwin', 'cursorBox', 'tray']) { const el = document.getElementById(id); if (el) el.inert = on; }
    if (on) renderDirty = true;
  });

  // ---------- machine feedback ----------
  machines.onFire = (kind) => {
    if (kind === 'manual') state.stats.manualPushes++;
    else if (kind === 'auto') state.stats.autoPushes++;
    audio.clunk();
  };
  machines.onPuff = (x, y) => world.particles.emit(x, y, 0.6, 8, { color: [0xffffff, 0xbfe9ff], speed: 2.2, life: 0.35, gravity: -1, size: 0.1, up: 0.2 });
  machines.onGate = (x, y) => { world.particles.emit(x, y, 0.6, 8, { color: [0x7dffb0, 0xffffff], speed: 2.2, life: 0.5, gravity: 2, size: 0.1, up: 0.6 }); audio.buy(); };
  machines.onLaunch = (x, y) => { world.particles.emit(x, y, 0.6, 6, { color: [0xff9e1a, 0xfff2b0], speed: 2.5, life: 0.4, gravity: 4, size: 0.1, up: 0.8 }); audio.clunk(); };
  machines.onShake = () => { world.shake = 1; audio.clunk(); };

  const sprite = new CursorSprite(sceneEl);
  game = new Game({ state, physics, machines, world, audio, ui });
  const cursor = new CursorAssistant({
    physics,
    getDef: () => game.stageDef,
    project: (x, y) => world.project(x, y, 0, game.sceneW, game.sceneH),
    getSize: () => ({ w: game.sceneW, h: game.sceneH }),
    getState: () => state.cursor,
    onSprite: (s) => sprite.set(s),
    onStatus: (st) => ui.setCursorStatus(st),
  });
  physics.helperUpdate = (dt) => cursor.stepHelper(dt);
  game.cursor = cursor;
  game.setQuality(QUALITY[state.settings.quality]);
  world.setQuality(QUALITY[state.settings.quality]);
  game.loadStage(false);

  // ---------- sizing ----------
  let cssW = 1, cssH = 1;
  function applySize() {
    const r = sceneEl.getBoundingClientRect();
    cssW = Math.max(1, Math.floor(r.width));
    cssH = Math.max(1, Math.floor(r.height));
    const q = QUALITY[state.settings.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    world.renderer.setPixelRatio(dpr);
    world.renderer.setSize(cssW, cssH, false);
    let aspect = cssW / cssH;
    if (state.settings.pixel) {
      const rt = pipeline.resize(Math.floor(cssW * dpr), Math.floor(cssH * dpr), q.rows);
      aspect = rt.w / rt.h;
    }
    world.fit(cssW, cssH, aspect);
    game.sceneW = cssW;
    game.sceneH = cssH;
    renderDirty = true;
    embed && embed.reportSize(window.innerWidth, window.innerHeight);
  }
  const ro = new ResizeObserver(() => applySize());
  ro.observe(sceneEl);
  window.addEventListener('orientationchange', () => setTimeout(applySize, 200));

  // ---------- input: tap the playfield to poke coins (real impulse) ----------
  function cropX() {
    const q = QUALITY[state.settings.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    return Math.floor(cssW * dpr) / (pipeline.rt ? pipeline.rt.width * pipeline.block : 1);
  }
  function cropY() {
    const q = QUALITY[state.settings.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    return Math.floor(cssH * dpr) / (pipeline.rt ? pipeline.rt.height * pipeline.block : 1);
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (pause.frozen) return;
    audio.unlock();
    if (e.pointerType === 'mouse' && e.button !== 0) return; // only the primary mouse button pokes
    if (ui.sheetKey) { ui.closeSheet(); return; }
    const r = canvas.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const p = state.settings.pixel
      ? world.unprojectToPlane(-1 + (nx + 1) * cropX(), -1 + (ny + 1) * cropY())
      : world.unprojectToPlane(nx, ny);
    game.poke(p.x, p.y);
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  // ---------- offline earnings ----------
  function applyOffline() {
    const info = E.computeOffline(state);
    E.expireBoost(state);
    if (!info) return;
    state.cash += info.gain;
    state.stats.totalEarned += info.gain;
    state.runStats.earned += info.gain;
    state.stats.offlineEarned += info.gain;
    state.stats.coinsCollected += info.coins;
    state.progress = Math.min(E.stageTarget(state.stage) - 1, state.progress + info.coins);
    info.cap = E.offlineCapSeconds(state);
    doSave();
    ui.showOffline(info);
    audio.welcome();
    return info;
  }

  // ---------- suspend / resume ----------
  function suspend() {
    if (suspendedAt) return;
    doSave();
    suspendedAt = Date.now();
    audio.setPaused(true);
  }
  function resume() {
    if (!suspendedAt) return;
    suspendedAt = null;
    audio.setPaused(false);
    last = performance.now();
    E.normalizeClock(state, Date.now());
    if (pause.running) applyOffline(); // no offline income for time spent inside the exclusive mini-game
    else state.lastSaved = Date.now();
    lastNow = Date.now();
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? suspend() : resume()));
  window.addEventListener('pagehide', doSave);
  window.addEventListener('beforeunload', doSave);

  embed = new Embed({
    onPause: suspend,
    onResume: resume,
    onQuality: (v) => ui.h.onSetting('quality', v),
    onBeforeReload: doSave,
    onUpdateAvailable: () => ui.toast('A new version is available. Updating automatically...', 2800, { title: 'Update', icon: 'disk' }),
  });

  // ---------- main loop ----------
  let last = performance.now();
  let slowT = 0;
  const notified = new Set(); // mission / part notifications already shown this session
  let lastNow = Date.now();
  let ema = 16;
  let autoSave = 0;
  let lowFpsTime = 0;
  const bootAt = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (suspendedAt) return;
    const raw = (now - last) / 1000;
    last = now;
    if (pause.frozen) {
      // main game frozen: no physics, production, machines, cursor, timers, income or animations. The last frame stays on screen.
      if (pause.state === GS.RESUMING) {
        // fresh baselines everywhere, then continue from the exact previous simulation state (no catch-up step)
        game.rebase();
        ema = 16; lowFpsTime = 0; slowT = 0; autoSave = 0;
        lastNow = Date.now();
        pause.settle();
      } else {
        autoSave += Math.min(0.1, raw);
        if (autoSave >= 5) { autoSave = 0; doSave(); }
        if (renderDirty) { renderDirty = false; if (state.settings.pixel) pipeline.render(); else world.renderer.render(world.scene, world.camera); }
      }
      return;
    }
    const dt = Math.min(0.05, raw);
    game.update(dt);
    world.syncObjects(physics);
    world.update(dt, machines);
    ui.update(state, game);
    slowT += dt;
    if (slowT >= 0.25) {
      slowT = 0;
      const now = Date.now();
      if (now < lastNow - 2000) E.normalizeClock(state, now, lastNow); // clock moved backwards: keep remaining times
      lastNow = now;
      ui.slowUpdate(state);
      const had = state.perm.unlocks.length;
      const miles = P.checkMilestones(state);
      for (const m of miles) ui.toast(`${m.name}${m.cash ? ' · +' + E.fmtMoney(m.cash) : ''}${m.gems ? ' · +' + m.gems + ' gems' : ''}`, 2600, { title: 'Run milestone', icon: 'flag' });
      P.ensureMissions(state);
      for (const m of state.missions.active) if (!notified.has(m.id) && P.missionProgress(state, m).done) { notified.add(m.id); ui.toast(P.missionProgress(state, m).text + ' – claim it in Goals.', 2600, { title: 'Mission complete', icon: 'check' }); }
      const na = E.checkAchievements(state);
      if (state.perm.unlocks.length > had) ui.toast('New Run is now available (Start menu > New Run).', 3200, { title: 'Unlocked', icon: 'flag' });
      if (na.length) {
        ui.toast(na.map((id) => E.ACHIEVEMENTS[id].name + (E.ACH_COSMETIC[id] ? ' · new item: ' + COSMETICS[E.ACH_COSMETIC[id]].name : '')).join(', '), 3400, { title: 'Achievement unlocked', icon: 'trophy' });
      }
      for (const k of Object.keys(PARTS)) { const i = P.partInfo(state, k); const key = 'pu:' + k + i.tier; if (i.unlocked && !notified.has(key) && i.tier === 0 && state.gems >= i.cost) { notified.add(key); ui.toast(`${i.name} can be installed (Upgrade Shop > Machine Parts).`, 3000, { title: 'Machine Parts', icon: 'gear' }); } }
    }
    autoSave += dt;
    if (autoSave >= 5) { autoSave = 0; doSave(); }
    if (state.settings.pixel) pipeline.render();
    else world.renderer.render(world.scene, world.camera);

    // adaptive quality: step down once if the device cannot keep up
    ema += (raw * 1000 - ema) * 0.05;
    if (ema > 30 && state.settings.quality !== 'low') lowFpsTime += raw; else lowFpsTime = Math.max(0, lowFpsTime - raw);
    if (lowFpsTime > 5 && performance.now() - bootAt > 12000) {
      lowFpsTime = 0;
      const next = state.settings.quality === 'high' ? 'medium' : 'low';
      ui.h.onSetting('quality', next);
      ui.toast('Graphics quality lowered automatically for smoother play.', 3200, { title: 'Performance', icon: 'speed' });
    }
  }

  presentation.onLayout = () => ui.wm.relayout();
  presentation.evaluate();
  applySize();
  if (!fresh) applyOffline();
  doSave();
  ui.slowUpdate(state);
  document.fonts && document.fonts.ready.then(() => {});
  requestAnimationFrame(frame);
  // ----- player account + cloud save (inert unless VITE_SUPABASE_* is configured) -----
  account = createAccount({
    ui,
    getState: () => state,
    canApply: () => pause.running,
    build: BUILD_ID,
    // replaces the game state with a cloud save the player chose / that is strictly newer. Settings stay per device.
    applyState: (next) => {
      const keep = state.settings;
      state = next;
      state.settings = { ...keep };
      state.lastSaved = Date.now(); // no offline income for the gap between devices
      state.mini.session = null;
      E.normalizeClock(state, Date.now());
      game.reset(state);
      world.applyLook(state);
      ui.state = state;
      ui.wm.closeWhere((w) => ['cursor', 'mini', 'boost', 'newrun'].includes(w.id), true);
      ui.slowUpdate(state);
      ui.updateCursor();
      ui.updateMini(state);
      Save.save(state);
    },
  });
  ui.account = account;
  account.start();
  ui.hideLoading();
  embed.start({ w: window.innerWidth, h: window.innerHeight });

  // handy for debugging / automated tests
  window.__pcf = { account, lunawave, pause, presentation, cursor, get state() { return state; }, game, world, physics, machines, E, Save, ui, pipeline, audio };
}

boot().catch((e) => {
  console.error(e);
  const sub = document.querySelector('.ld-sub');
  if (sub && !/Could not|not support/.test(sub.textContent)) sub.textContent = 'Error: ' + (e && e.message ? e.message : e);
});
