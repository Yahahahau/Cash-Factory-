import './style.css';
import * as E from './economy.js';
import * as Save from './save.js';
import { Physics, loadRapier } from './physics.js';
import { World } from './world.js';
import { PixelPipeline } from './pixel.js';
import { GameAudio } from './audio.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { Embed, BUILD_ID, inIframe } from './embed.js';

const QUALITY = {
  low: { limit: 55, rows: 220, dpr: 1.5, rate: 7 },
  medium: { limit: 85, rows: 270, dpr: 2, rate: 9 },
  high: { limit: 125, rows: 320, dpr: 2, rate: 11 },
};
const MAX_BODIES = 130;

async function boot() {
  const loadingSub = document.querySelector('.ld-sub');
  try {
    await Promise.all([
      loadRapier(),
      document.fonts ? Promise.all([document.fonts.load('12px "Press Start 2P"'), document.fonts.load('700 14px Sarabun')]).catch(() => {}) : null,
    ]);
  } catch (e) {
    loadingSub.textContent = 'โหลดเอนจินฟิสิกส์ไม่สำเร็จ กรุณารีเฟรช';
    throw e;
  }

  let { state, fresh } = Save.load();
  const canvas = document.getElementById('c');
  const sceneEl = document.getElementById('scene');

  let world;
  try {
    world = new World(canvas, { maxBodies: MAX_BODIES, particles: 200 });
  } catch (e) {
    loadingSub.textContent = 'อุปกรณ์นี้ไม่รองรับ WebGL';
    throw e;
  }
  const physics = new Physics(MAX_BODIES);
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
    onBuy: (key, mode) => {
      audio.unlock();
      const plan = ui.plan(key);
      let bought = 0;
      for (let i = 0; i < plan.n; i++) if (E.buyUpgrade(state, key)) bought++; else break;
      if (!bought) { audio.deny(); ui.toast(plan.info.locked || (plan.info.atMax ? 'ถึงระดับสูงสุดแล้ว' : 'เงินไม่พอ'), 1200); return false; }
      audio.buy();
      world.particles.emit(0, 9.5, 1.2, 14, { color: [0xffe066, 0x66f7ff, 0xffffff], speed: 3.5, life: 0.7, gravity: 5, size: 0.14, up: 0.9 });
      if (key === 'automation') {
        world.setNozzles(E.nozzleCount(state));
        ui.toast('ปลดล็อก: ' + E.AUTOMATION_FEATURES[state.levels.automation], 2600);
        if (!state.unlocked.includes('auto' + state.levels.automation)) state.unlocked.push('auto' + state.levels.automation);
      }
      doSave();
      return true;
    },
    onGrade: () => {
      audio.unlock();
      if (!E.upgradeGrade(state)) { audio.deny(); return; }
      world.setGrade(state.grade, true);
      ui.banner(state.grade);
      audio.grade();
      ui.toast('เลื่อนเป็น ' + E.gradeOf(state).name + '!', 2800);
      ui.renderTab(true);
      doSave();
    },
    onSetting: (k, v) => {
      state.settings[k] = v;
      if (k === 'pixel') applySize();
      else if (k === 'quality') { game.setQuality(QUALITY[v]); applySize(); }
      else audio.setVolumes(state.settings.sfx, state.settings.music);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, 400);
    },
    onReset: () => {
      Save.wipe();
      const fresh2 = Save.load().state;
      fresh2.settings = { ...state.settings };
      state = fresh2;
      game.reset(state);
      world.setGrade(1, false);
      world.setNozzles(1, false);
      ui.state = state;
      ui.renderTab(true);
      ui.updateCards(true);
      doSave();
      ui.toast('รีเซ็ตความคืบหน้าแล้ว');
    },
    onCheckUpdate: () => embed.check(true),
    onModal: () => {},
  });
  ui.state = state;

  game = new Game({ state, physics, world, audio, ui });
  game.setQuality(QUALITY[state.settings.quality]);
  world.setGrade(state.grade, false);
  world.setNozzles(E.nozzleCount(state), false);

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
    const hudEl = document.getElementById('hud');
    const hudFrac = hudEl ? (hudEl.offsetHeight + 4) / cssH : 0;
    world.fit(cssW, cssH, aspect, hudFrac);
    game.sceneW = cssW;
    game.sceneH = cssH;
    embed && embed.reportSize(window.innerWidth, window.innerHeight);
  }
  const ro = new ResizeObserver(() => applySize());
  ro.observe(sceneEl);
  ro.observe(document.getElementById('hud'));
  window.addEventListener('orientationchange', () => setTimeout(applySize, 200));

  // ---------- input (tap to vacuum) ----------
  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    const r = canvas.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
    let wx, wy;
    if (state.settings.pixel) {
      // visible region is the bottom-left part of the low-res target; map through the same crop
      const p = world.unprojectToPlane(-1 + (nx + 1) * cropX(), -1 + (ny + 1) * cropY());
      wx = p.x; wy = p.y;
    } else {
      const p = world.unprojectToPlane(nx, ny);
      wx = p.x; wy = p.y;
    }
    game.tap(wx, wy);
  });
  function cropX() {
    const q = QUALITY[state.settings.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    return (Math.floor(cssW * dpr)) / (pipeline.rt ? pipeline.rt.width * pipeline.block : 1);
  }
  function cropY() {
    const q = QUALITY[state.settings.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    return (Math.floor(cssH * dpr)) / (pipeline.rt ? pipeline.rt.height * pipeline.block : 1);
  }
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  // ---------- offline earnings ----------
  function applyOffline(initial) {
    const info = E.computeOffline(state);
    if (!info) return;
    state.money += info.gain;
    state.stats.totalEarned += info.gain;
    state.stats.offlineEarned += info.gain;
    state.stats.objectsProduced += info.objects;
    state.stats.objectsCollected += info.objects;
    info.cap = E.offlineCapSeconds(state);
    doSave();
    ui.showOffline(info);
    audio.welcome();
    return info;
  }

  // ---------- suspend / resume (tab hidden, host pause) ----------
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
    applyOffline(false);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? suspend() : resume()));
  window.addEventListener('pagehide', doSave);
  window.addEventListener('beforeunload', doSave);

  embed = new Embed({
    onPause: suspend,
    onResume: resume,
    onQuality: (v) => ui.h.onSetting('quality', v),
    onBeforeReload: doSave,
    onUpdateAvailable: () => ui.toast('มีเวอร์ชันใหม่ กำลังอัปเดตอัตโนมัติ…', 2600),
  });

  // ---------- main loop ----------
  let last = performance.now();
  let slowT = 0;
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
    world.update(dt, physics, state);
    ui.update(state, game);
    slowT += dt;
    if (slowT >= 0.25) { slowT = 0; ui.slowUpdate(state); }
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
      ui.toast('ลดคุณภาพกราฟิกอัตโนมัติเพื่อความลื่นไหล');
    }
  }

  applySize();
  if (!fresh) applyOffline(true);
  doSave();
  world.refreshTextures();
  document.fonts && document.fonts.ready.then(() => world.refreshTextures());
  requestAnimationFrame(frame);
  ui.hideLoading();
  embed.start({ w: window.innerWidth, h: window.innerHeight });

  // handy for debugging / automated tests
  window.__pcf = { get state() { return state; }, game, world, physics, E, Save, ui, pipeline, audio };
}

boot().catch((e) => {
  console.error(e);
  const sub = document.querySelector('.ld-sub');
  if (sub && !sub.textContent.includes('ไม่')) sub.textContent = 'เกิดข้อผิดพลาด: ' + (e && e.message ? e.message : e);
});
