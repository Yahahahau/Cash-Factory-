import * as E from './economy.js';
import * as P from './progression.js';
import { COSMETICS } from './content.js';
import { getStage } from './layout.js';

const STEP = 1 / 60;
const SUCK_TIME = 0.22;

export class Game {
  constructor({ state, physics, machines, world, audio, ui }) {
    this.state = state;
    this.physics = physics;
    this.machines = machines;
    this.world = world;
    this.audio = audio;
    this.ui = ui;
    this.acc = 0;
    this.spawnAcc = 0;
    this.limit = 100; // active physical coins allowed by graphics quality
    this.charges = 3; // manual drop charges
    this.chargeT = 0;
    this.combo = 0;
    this.comboT = 0;
    this.floatSum = 0;
    this.floatT = 0;
    this.sceneW = 430;
    this.sceneH = 870;
    this.escaped = 0;
    this.stageDef = null;
    this.stageBusy = 0; // >0 while the stage-clear banner plays
    this.measured = 0; // measured cash/s (smoothed), for diagnostics
    this._mAcc = 0;
    this._mT = 0;
    this.charges = E.maxCharges(state);
  }

  setQuality(q) {
    this.limit = q.limit;
  }

  // (re)build the machine for the current stage
  loadStage(animate) {
    const def = getStage(this.state.stage);
    this.stageDef = def;
    this.cursor && this.cursor.cancel();
    this.physics.clear();
    this.physics.buildStage(def);
    this.machines.setStage(def);
    this.world.setStage(def, animate);
    this.ui.setStage && this.ui.setStage(def);
  }

  reset(state) {
    this.state = state;
    this.spawnAcc = 0;
    this.combo = 0;
    this.charges = E.maxCharges(state);
    this.chargeT = 0;
    this.stageBusy = 0;
    this.loadStage(false);
    this.machines.reset();
  }

  // after a pause: drop every accumulated frame time so nothing catches up in one big step
  rebase() {
    this.acc = 0;
    this.timerT = 0;
    this._mAcc = 0;
    this._mT = 0;
    this.floatT = 0;
  }

  get stored() {
    return this.physics.active.length;
  }

  _spawn(manual) {
    const s = this.state;
    const d = this.stageDef.spawn;
    const type = E.pickType(s);
    const x = d.x + (Math.random() - 0.5) * 0.24;
    const mult = Math.random() < E.goldenChance(s) ? E.GOLDEN_MULT : 1; // Golden Touch: drawn gold, worth x3
    const idx = this.physics.spawn(x, d.y, type, mult);
    if (idx < 0) return false;
    s.stats.coinsDropped++;
    if (manual) s.stats.manualDrops++;
    this.world.pipeKick = 1;
    return true;
  }

  // manual drop button
  drop() {
    if (this.stageBusy > 0) return false;
    if (this.charges < 1) return false;
    if (!this._spawn(true)) return false;
    this.charges -= 1;
    this.audio.drop();
    return true;
  }

  // tap on the playfield: a small physical poke on the nearest coins (helps wake / un-wedge them)
  poke(wx, wy) {
    let n = 0;
    for (const idx of this.physics.active) {
      const s = this.physics.slots[idx];
      const p = s.body.translation();
      const dx = p.x - wx, dy = p.y - wy;
      const d = Math.hypot(dx, dy);
      if (d > 0.9) continue;
      const m = 0.02 * (1 - d / 0.9) + 0.004;
      s.body.applyImpulse({ x: (dx / (d + 0.1)) * m * 3, y: m * 4, z: 0 }, true);
      s.lowT = 0;
      n++;
    }
    this.audio.tap();
    this.world.particles.emit(wx, wy, 0.7, n ? 5 : 2, { color: n ? [0xffffff, 0xffe066] : [0xdddddd], speed: 2, life: 0.3, gravity: 5, size: 0.08 });
    return n;
  }

  update(dt) {
    const s = this.state;
    s.stats.playSeconds += dt;

    // ---- automatic production (Coin/s) + manual charges
    const maxC = E.maxCharges(s);
    if (this.charges < maxC) {
      this.chargeT += dt;
      if (this.chargeT >= E.CHARGE_TIME) { this.chargeT = 0; this.charges++; }
    } else this.chargeT = 0;
    if (this.charges > maxC) this.charges = maxC;
    // Auto Feeder (Automation branch): uses one stored drop charge by itself at its interval
    const fl = s.xlv ? s.xlv.feeder : 0;
    if (fl > 0 && this.stageBusy <= 0) {
      this.feedT = (this.feedT || 0) + dt;
      if (this.feedT >= P.feederInterval(fl) && this.charges >= 1 && this.physics.active.length < Math.min(E.capacity(s), this.limit)) {
        this.feedT = 0;
        if (this._spawn(false)) this.charges -= 1;
      }
    }
    if (this.stageBusy > 0) this.stageBusy -= dt;
    else {
      const cap = Math.min(E.capacity(s), this.limit);
      this.spawnAcc += E.spawnRate(s) * dt;
      let guard = 0;
      while (this.spawnAcc >= 1 && guard++ < 4) {
        if (this.physics.active.length >= cap) { this.spawnAcc = Math.min(this.spawnAcc, 1); break; }
        this.spawnAcc -= 1;
        if (!this._spawn(false)) break;
      }
    }

    // ---- fixed-step physics
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      const r = this.physics.step(STEP);
      for (const idx of r.collected) this._collect(idx, true);
      for (const idx of r.escaped) { this.escaped++; this._collect(idx, false); }
    }

    // ---- timers: boost expiry -> 30 min cooldown, wallet price tier
    this.timerT = (this.timerT || 0) + dt;
    if (this.timerT >= 0.25) {
      this.timerT = 0;
      const now = E.clock.now();
      if (E.expireBoost(s, now)) this.ui.onBoostEnd && this.ui.onBoostEnd();
      if (E.refreshTier(s)) this.ui.updateLabels && this.ui.updateLabels();
    }

    // ---- anti-jam monitoring
    this.machines.scan(dt);
    if (this.cursor) this.cursor.update(dt);

    // ---- grinder animation
    const sucking = this.physics.sucking;
    for (let i = sucking.length - 1; i >= 0; i--) {
      const idx = sucking[i];
      const sl = this.physics.slots[idx];
      sl.st += dt / SUCK_TIME;
      if (sl.st >= 1) this.physics.releaseSucked(idx);
    }

    // ---- combo decay
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }

    // ---- floating cash text (aggregated)
    this.floatT -= dt;
    if (this.floatT <= 0 && this.floatSum > 0) {
      const pit = this.stageDef.pit;
      const p = this.world.project((pit.x0 + pit.x1) / 2, 2.0, 0.3, this.sceneW, this.sceneH);
      const bm = E.boostMult(s);
      this.ui.floatText(p.x, p.y, '+' + E.fmtMoney(this.floatSum) + (bm > 1 ? ' ×' + bm : ''), bm > 1 ? 'big' : this.floatSum > 20 ? 'big' : '');
      this.floatSum = 0;
      this.floatT = 0.3;
    }
    this._mT += dt;
    if (this._mT >= 1) { this.measured = this._mAcc / this._mT; this._mAcc = 0; this._mT = 0; }

    // ---- stage clear
    if (E.stageDone(s) && this.stageBusy <= 0) this._clearStage();
  }

  _collect(idx, fx) {
    const s = this.state;
    const sl = this.physics.slots[idx];
    if (sl.state !== 1) return;
    if (fx) {
      this.combo++;
      this.comboT = E.comboWindow(s);
      if (this.combo > s.stats.bestCombo) s.stats.bestCombo = this.combo;
      if (this.combo > s.runStats.bestCombo) s.runStats.bestCombo = this.combo;
    }
    const inc = E.income(s, E.coinValue(s, sl.type, sl.mult, fx ? this.combo : 0));
    const value = inc.final;
    this.boostNow = inc.mult;
    s.cash += value;
    s.stats.totalEarned += value;
    s.runStats.earned += value;
    s.runStats.coins++;
    s.stats.coinsCollected++;
    this._mAcc += value;
    this.floatSum += value;
    if (fx) {
      E.addProgress(s, 1);
      if (sl.type === 3) s.gems += 1;
      this.audio.collect(sl.type);
      const pit = this.stageDef.pit;
      this.world.pulse = 1;
      this.world.particles.emit(sl.body.translation().x, pit.collectY + 0.3, 0.5, sl.type >= 2 ? 4 : 2, {
        color: sl.type === 3 ? [0x74f6ff, 0xffffff] : sl.mult > 1 ? [0xffd700, 0xfff4b0] : COSMETICS[P.equipped(s, 'spark')].colors, speed: 2, life: 0.4, gravity: 6, size: 0.09, up: 0.8,
      });
      this.physics.beginSuck(idx);
    } else this.physics.release(idx);
  }

  _clearStage() {
    const s = this.state;
    // leftover coins on the board are banked as a bonus (stage change rebuilds the machine)
    let bonus = 0;
    for (const idx of [...this.physics.active]) {
      const sl = this.physics.slots[idx];
      bonus += E.income(s, E.coinValue(s, sl.type, sl.mult, 0)).final;
      this.physics.release(idx);
    }
    s.cash += bonus;
    s.stats.totalEarned += bonus;
    s.runStats.earned += bonus;
    const done = s.stage;
    const reward = E.completeStage(s);
    this.stageBusy = 2.4;
    this.audio.grade();
    this.ui.stageBanner(done, reward, bonus);
    this.loadStage(true);
    this.world.particles.emit(0, 8, 1, 40, { color: [0xffe066, 0x74f6ff, 0xffffff], speed: 5, life: 1.0, gravity: 4, size: 0.16, up: 0.9 });
  }
}
