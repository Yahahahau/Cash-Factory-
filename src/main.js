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
import { showReward, openNewRun } from './screens.js';

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
  const canvas = document.getElementById('c');
  const sceneEl = document.getElementById('scene');

  let world;
  try {
    world = new World(canvas, { maxBodies: MAX_BODIES, particles: 200 });
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
  const doSave = () => Save.save(state);

  const ui = new UI({
    version: BUILD_ID,
    inIframe,
    onClick: () => { audio.unlock(); audio.tap(); },
    onBuy: (key) => {
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
    onDrop: () => {
      audio.unlock();
      const ok = game.drop();
      if (!ok) audio.deny();
      return ok;
    },
    onSetting: (k, v) => {
      state.settings[k] = v;
      if (k === 'pixel') applySize();
      else if (k === 'quality') { game.setQuality(QUALITY[v]); world.setQuality(QUALITY[v]); applySize(); }
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
      ui.state = state;
      doSave();
      ui.toast('Progress has been reset.', 2400, { title: 'Reset' });
    },
    onCheckUpdate: () => embed.check(true),
    // ----- Flying Ball -----
    onMiniStart: () => startMini(),
    onTick: () => audio.tap(),
    onReveal: () => { audio.grade(); },
    // ----- runs -----
    onNewRunOpen: () => {
      if (!E.canNewRun(state)) { ui.toast('New Run unlocks at stage ' + E.ECON.run.minStage + '.', 2200, { title: 'New Run', icon: 'flag' }); return; }
      openNewRun(ui, state, E.previewNewRun(state), ui.h);
    },
    onNewRun: () => {
      audio.unlock();
      const pv = E.applyNewRun(state);
      game.reset(state);
      ui.state = state;
      doSave();
      audio.grade();
      ui.flash();
      ui.toast(`Run ${state.run} started. Starting cash ${E.fmtMoney(state.cash)}, permanent income x${E.permMult(state).toFixed(2)}.`, 3600, { title: 'New Run', icon: 'flag' });
      void pv;
    },
    getFps: () => Math.round(1000 / Math.max(1, ema)),
  });
  ui.state = state;
  ui.world = world;

  // ---------- Flying Ball (lazy: the module is only fetched when the player starts it) ----------
  let miniOpen = false;
  let lastReward = null;
  async function startMini() {
    audio.unlock();
    const ses = E.startMini(state);
    if (!ses) { ui.toast('Flying Ball is not available right now (boost or cooldown).', 2400, { title: 'Flying Ball', icon: 'warn' }); ui.closeModal(); return; }
    doSave();
    ui.closeModal();
    miniOpen = true;
    const { FlyView } = await import('./flyball.js');
    lastReward = null;
    const view = new FlyView(null, {
      wm: ui.wm,
      objective: ses.objective,
      best: state.mini.best,
      audio,
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
      onClose: (won) => {
        miniOpen = false;
        last = performance.now();
        ui.updateMini(state);
        if (won && lastReward) { showReward(ui, lastReward, ui.h); lastReward = null; }
      },
    });
    window.__pcf && (window.__pcf.miniView = view);
  }

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

  game = new Game({ state, physics, machines, world, audio, ui });
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
    audio.unlock();
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
    applyOffline();
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
      const na = E.checkAchievements(state);
      if (state.perm.unlocks.length > had) ui.toast('New Run is now available (New Run button).', 3200, { title: 'Unlocked', icon: 'flag' });
      if (na.length) ui.toast(na.map((id) => E.ACHIEVEMENTS[id].name).join(', '), 3000, { title: 'Achievement unlocked', icon: 'trophy' });
    }
    autoSave += dt;
    if (autoSave >= 5) { autoSave = 0; doSave(); }
    if (!miniOpen) {
      if (state.settings.pixel) pipeline.render();
      else world.renderer.render(world.scene, world.camera);
    }

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

  applySize();
  if (!fresh) applyOffline();
  doSave();
  ui.slowUpdate(state);
  document.fonts && document.fonts.ready.then(() => {});
  requestAnimationFrame(frame);
  ui.hideLoading();
  embed.start({ w: window.innerWidth, h: window.innerHeight });

  // handy for debugging / automated tests
  window.__pcf = { get state() { return state; }, game, world, physics, machines, E, Save, ui, pipeline, audio };
}

boot().catch((e) => {
  console.error(e);
  const sub = document.querySelector('.ld-sub');
  if (sub && !/Could not|not support/.test(sub.textContent)) sub.textContent = 'Error: ' + (e && e.message ? e.message : e);
});
