import * as E from './economy.js';
import { L } from './layout.js';

const STEP = 1 / 60;
const SUCK_TIME = 0.26;

export class Game {
  constructor({ state, physics, world, audio, ui, pusher }) {
    this.state = state;
    this.pusher = pusher || null;
    this.physics = physics;
    this.world = world;
    this.audio = audio;
    this.ui = ui;
    this.acc = 0;
    this.spawnAcc = 0;
    this.collectCredit = 0;
    this.stored = 0; // logical objects currently in the factory
    this.nozzle = 0;
    this.limit = 100; // active physical bodies allowed by graphics quality
    this.bodyRate = 10; // max physical bodies spawned per second
    this.floatSum = 0;
    this.floatT = 0;
    this.turboT = 0;
    this.turbo = false;
    this.sceneW = 430;
    this.sceneH = 520;
    this.lastType = 0;
    this.measured = 0; // measured money/s (smoothed), for diagnostics
    this._mAcc = 0;
    this._mT = 0;
  }

  setQuality(q) {
    this.limit = q.limit;
    this.bodyRate = q.rate;
  }

  reset(state) {
    this.state = state;
    this.physics.clear();
    if (this.pusher) this.pusher.reset();
    this.stored = 0;
    this.spawnAcc = 0;
    this.collectCredit = 0;
  }

  batchSize() {
    const s = this.state;
    const rate = E.spawnRate(s) * (this.turbo ? 1.5 : 1);
    return Math.max(1, rate / this.bodyRate, E.capacity(s) / this.limit);
  }

  update(dt) {
    const s = this.state;
    s.stats.playSeconds += dt;
    // ---- turbo (automation level 5): 8 s burst every 30 s
    if (s.levels.automation >= 5) {
      this.turboT = (this.turboT + dt) % 30;
      const on = this.turboT < 8;
      if (on && !this.turbo) this.ui.toast('เทอร์โบอัตโนมัติ! ผลิตและเก็บเร็วขึ้น 1.5 เท่า', 2000);
      this.turbo = on;
    } else this.turbo = false;
    const tm = this.turbo ? 1.5 : 1;

    // ---- spawning
    const cap = E.capacity(s);
    const batch = this.batchSize();
    const rate = E.spawnRate(s) * tm;
    const nozzles = E.nozzleCount(s);
    if (this.stored + batch <= cap + batch * 0.5 && this.physics.active.length < this.limit && this.physics.freeCount > 0) {
      this.spawnAcc += rate * dt;
      let guard = 0;
      while (this.spawnAcc >= batch && guard++ < 6) {
        if (this.stored + batch > cap + batch * 0.5) break;
        this.spawnAcc -= batch;
        const type = E.pickType(s);
        const x = L.nozzleXs[this.nozzle % nozzles] + (Math.random() - 0.5) * 0.35;
        this.nozzle++;
        if (this.physics.spawn(x, L.nozzleY, type, batch) < 0) break;
        this.stored += batch;
        s.stats.objectsProduced += batch;
      }
    } else {
      this.spawnAcc = Math.min(this.spawnAcc, batch);
    }

    // ---- fixed-step physics
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      const escaped = this.physics.step(STEP);
      for (const idx of escaped) {
        const sl = this.physics.slots[idx];
        this._credit(sl.type, sl.n, false);
        this.stored -= sl.n;
        this.physics.release(idx);
      }
    }

    // ---- anti-jam monitoring
    if (this.pusher) this.pusher.scan(dt);

    // ---- collector: pulls the object nearest to the exit into the vacuum hood
    this.collectCredit = Math.min(2, this.collectCredit + (E.collectRate(s) * tm / batch) * dt);
    let guard = 0;
    while (this.collectCredit >= 1 && guard++ < 6) {
      const idx = this.physics.nearest(L.exit.x, L.exit.y, true);
      if (idx < 0) break;
      this.collectCredit -= 1;
      this.physics.beginSuck(idx);
    }
    // progress of suction animations
    const sucking = this.physics.sucking;
    for (let i = sucking.length - 1; i >= 0; i--) {
      const idx = sucking[i];
      const sl = this.physics.slots[idx];
      sl.st += dt / SUCK_TIME;
      if (sl.st >= 1) {
        this._credit(sl.type, sl.n, true);
        this.stored -= sl.n;
        this.physics.releaseSucked(idx);
      }
    }
    if (this.stored < 0.0001) this.stored = Math.max(0, this.stored);

    // ---- floating money text (aggregated)
    this.floatT -= dt;
    if (this.floatT <= 0 && this.floatSum > 0) {
      const p = this.world.project(L.hood.x, L.hood.y + 0.4, 0.3, this.sceneW, this.sceneH);
      this.ui.floatText(p.x, p.y, '+' + E.fmtMoney(this.floatSum), this.floatSum > E.incomePerSec(s) * 0.5 ? 'big' : '');
      this.floatSum = 0;
      this.floatT = 0.32;
    }
    this._mT += dt;
    if (this._mT >= 1) { this.measured = this._mAcc / this._mT; this._mAcc = 0; this._mT = 0; }
  }

  _credit(type, n, fx) {
    const s = this.state;
    const value = E.OBJECT_TYPES[type].value * n * E.valueMultiplier(s);
    s.money += value;
    s.stats.totalEarned += value;
    s.stats.objectsCollected += n;
    this._mAcc += value;
    this.floatSum += value;
    if (fx) {
      this.world.pulse = 1;
      this.audio.collect(type);
      this.world.particles.emit(L.hood.x, L.hood.y, 0.5, type >= 2 ? 3 : 1, {
        color: type === 3 ? [0x66f7ff, 0xffffff] : [0xffe066, 0xffffff], speed: 2.2, life: 0.45, gravity: 6, size: 0.1, up: 0.6,
      });
    }
  }

  // tap/click on the playfield: instantly vacuum nearby objects
  tap(wx, wy) {
    const s = this.state;
    s.stats.taps += 1;
    let got = 0;
    for (let i = 0; i < 4; i++) {
      const idx = this.physics.nearest(wx, wy, false, 1.5);
      if (idx < 0) break;
      this.physics.beginSuck(idx);
      got++;
    }
    this.audio.tap();
    this.world.particles.emit(wx, wy, 0.9, got ? 6 : 3, { color: got ? [0xffffff, 0xffe066] : [0x9aa3cc], speed: 2.4, life: 0.35, gravity: 4, size: 0.1 });
    return got;
  }
}
