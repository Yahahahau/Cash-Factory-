// Mechanical machines + anti-jam system.
//
// Pistons are kinematic bodies sliding over their platform (coins are moved by genuine contact forces).
// Conveyors, air blowers, magnets and launchers push coins with real impulses (mass * delta-velocity).
// Anti-jam: a coin counts as stuck when it sits inside a watched jam zone (platform lip / hopper) and stays
// practically motionless for JAM.time seconds. Coins resting on platforms elsewhere, or waiting for the next
// piston stroke, are never touched. The reaction is always a physical one: a full piston stroke, or a small
// air-burst impulse. Coins are never teleported, deleted or repositioned.
import * as E from './economy.js';
import { HEAD, JAM } from './layout.js';
import { ECON } from './economy.js';
import { GROUPS, colliderSize } from './physics.js';

const smooth = (t) => {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};
const MASS = [0, 1, 2, 3].map((t) => {
  const c = colliderSize(t);
  return Math.PI * c.radius * c.radius * c.halfHeight * 2;
});

export class Machines {
  constructor(physics, getState) {
    this.physics = physics;
    this.getState = getState;
    this.def = null;
    this.pistons = [];
    this.belts = [];
    this.fans = [];
    this.magnets = [];
    this.launchers = [];
    this.gates = [];
    this.globalCd = 0;
    this.manualCd = 0;
    this.stuckCount = 0;
    this.stats = { auto: 0, manual: 0, puffs: 0 };
    this.onFire = null; // (kind, piston)
    this.onPuff = null; // (x, y)
    this.onGate = null; // (x, y)
    this.onShake = null; // ()
    this.onLaunch = null; // (x, y)
    physics.beforeStep = (dt) => this.step(dt);
  }

  level(id) {
    return this.getState().machines[id] || 0;
  }

  setStage(def) {
    const R = this.physics.R;
    for (const p of this.pistons) this.physics.world.removeRigidBody(p.body);
    this.def = def;
    this.pistons = def.pistons.map((d, i) => {
      const rodHalf = d.maxExt / 2 + 0.2;
      const a = d.ang || 0;
      const body = this.physics.world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(d.wall - d.dir * Math.cos(a) * rodHalf, d.y - d.dir * Math.sin(a) * rodHalf, 0).setRotation({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) })
      );
      this.physics.world.createCollider(
        R.ColliderDesc.cuboid(rodHalf, HEAD.hy, HEAD.hz).setFriction(0.4).setRestitution(0.05).setCollisionGroups(GROUPS.push),
        body
      );
      return { def: d, body, rodHalf, phase: 'idle', t: 0, tOut: 1, tBack: 1.2, ext: 0, cool: 0, timer: 1 + i * 0.9, kind: 'cycle', delay: 0, flash: 0 };
    });
    this.belts = def.belts.map((d) => ({ def: d, speed: 0, phase: 0 }));
    this.fans = def.fans.map((d) => ({ def: d, on: false, spin: 0 }));
    this.magnets = def.magnets.map((d) => ({ def: d, on: false, glow: 0 }));
    this.launchers = def.launchers.map((d) => ({ def: d, cd: 0, anim: 0 }));
    this.gates = def.gates.map((d) => ({ def: d, flash: 0 }));
  }

  reset() {
    for (const p of this.pistons) {
      p.phase = 'idle'; p.t = 0; p.ext = 0; p.cool = 0; p.delay = 0; p.timer = 1;
      this._place(p);
    }
    this.globalCd = 0;
    this.manualCd = 0;
  }

  // ---- pistons ------------------------------------------------------------
  _par(p) {
    // the hopper sweeper runs on a fixed rhythm; platform pistons follow their upgrade level
    return p.def.rhythm ? { active: true, interval: p.def.rhythm, out: 1.0, back: 1.1 } : E.pusherParams(this.level(p.def.id));
  }

  // kinematic pose from the current extension (pistons may lie along a sloped plate)
  _place(p) {
    const d = p.def;
    const a = d.ang || 0;
    const ux = d.dir * Math.cos(a), uy = d.dir * Math.sin(a);
    const fx = d.wall + ux * p.ext, fy = d.y + uy * p.ext;
    p.body.setNextKinematicTranslation({ x: fx - ux * p.rodHalf, y: fy - uy * p.rodHalf, z: 0 });
  }

  _begin(p, kind, delay = 0) {
    if (p.phase !== 'idle') return false;
    const par = this._par(p);
    p.kind = kind;
    p.delay = delay;
    // emergency / manual strokes use a gentle but complete stroke
    p.tOut = kind === 'cycle' ? par.out : Math.max(0.7, par.out);
    p.tBack = kind === 'cycle' ? par.back : Math.max(0.9, par.back);
    p.phase = delay > 0 ? 'wait' : 'out';
    p.t = 0;
    p.cool = JAM.pistonCooldown;
    return true;
  }

  fire(p, kind, delay = 0) {
    if (!this._begin(p, kind, delay)) return false;
    if (kind === 'auto') { this.stats.auto++; if (this.onFire) this.onFire('auto', p); }
    else if (kind === 'manual') { this.stats.manual++; if (this.onFire) this.onFire('manual', p); }
    return true;
  }

  // ---- fixed-step update (called by physics before every world step) ------------
  step(dt) {
    // pistons
    for (const p of this.pistons) {
      if (p.cool > 0) p.cool -= dt;
      if (p.flash > 0) p.flash -= dt;
      const par = this._par(p);
      if (p.phase === 'idle') {
        if (par.active) {
          p.timer -= dt;
          if (p.timer <= 0) { this._begin(p, 'cycle'); p.timer = par.interval; }
        }
      } else if (p.phase === 'wait') {
        p.delay -= dt;
        if (p.delay <= 0) { p.phase = 'out'; p.t = 0; }
      } else if (p.phase === 'out') {
        p.t += dt;
        p.ext = p.def.maxExt * smooth(p.t / p.tOut);
        if (p.t >= p.tOut) { p.phase = 'hold'; p.t = 0; p.ext = p.def.maxExt; }
      } else if (p.phase === 'hold') {
        p.t += dt;
        if (p.t >= 0.12) { p.phase = 'back'; p.t = 0; }
      } else if (p.phase === 'back') {
        p.t += dt;
        p.ext = p.def.maxExt * (1 - smooth(p.t / p.tBack));
        if (p.t >= p.tBack) { p.phase = 'idle'; p.t = 0; p.ext = 0; }
      }
      this._place(p);
    }

    const phys = this.physics;
    const act = phys.active;
    // conveyors
    for (const b of this.belts) {
      const v = E.conveyorSpeed(this.level(b.def.id));
      b.speed = v;
      if (v <= 0) continue;
      for (const idx of act) {
        const s = phys.slots[idx];
        const p = s.body.translation();
        if (p.x < b.def.x0 || p.x > b.def.x1 || p.y < b.def.top - 0.05 || p.y > b.def.top + 0.55) continue;
        const lv = s.body.linvel();
        const dv = b.def.dir * v - lv.x;
        s.body.applyImpulse({ x: MASS[s.type] * dv * 0.3, y: 0, z: 0 }, true);
      }
    }
    // air blowers
    for (const f of this.fans) {
      const force = E.blowerForce(this.level(f.def.id));
      f.on = force > 0;
      if (!f.on) continue;
      const len = f.def.x1 - f.def.x;
      for (const idx of act) {
        const s = phys.slots[idx];
        const p = s.body.translation();
        if (p.x < f.def.x || p.x > f.def.x1 || p.y < f.def.y0 || p.y > f.def.y1) continue;
        const fall = 1 - (p.x - f.def.x) / len;
        s.body.applyImpulse({ x: MASS[s.type] * force * (0.3 + 0.7 * fall) * dt, y: MASS[s.type] * force * 0.12 * dt, z: 0 }, true);
      }
    }
    // magnets
    for (const m of this.magnets) {
      const force = E.magnetForce(this.level(m.def.id));
      m.on = force > 0;
      if (!m.on) continue;
      for (const idx of act) {
        const s = phys.slots[idx];
        const p = s.body.translation();
        const dx = m.def.tx - p.x, dy = m.def.ty - p.y;
        const d = Math.hypot(dx, dy);
        if (d > m.def.r || d < 0.05) continue;
        const k = (1 - d / m.def.r) * force * dt * MASS[s.type];
        s.body.applyImpulse({ x: (dx / d) * k, y: (dy / d) * k, z: 0 }, true);
      }
    }
    // launchers
    for (const l of this.launchers) {
      if (l.cd > 0) l.cd -= dt;
      if (l.anim > 0) l.anim -= dt;
      const par = E.launcherParams(this.level(l.def.id));
      if (!par.active || l.cd > 0) continue;
      for (const idx of act) {
        const s = phys.slots[idx];
        const p = s.body.translation();
        if (p.x < l.def.x0 || p.x > l.def.x1 || p.y < l.def.top - 0.05 || p.y > l.def.top + 0.6) continue;
        const m = MASS[s.type] * par.power * 0.25;
        s.body.applyImpulse({ x: l.def.dir * m * 1.6, y: m * 1.5, z: 0 }, true);
        l.cd = par.cooldown;
        l.anim = 0.3;
        if (this.onLaunch) this.onLaunch(p.x, p.y);
        break;
      }
    }
    // multiplier gates
    for (const g of this.gates) {
      if (g.flash > 0) g.flash -= dt;
      for (const idx of act) {
        const s = phys.slots[idx];
        if (s.gated) continue;
        const p = s.body.translation();
        if (p.x > g.def.x0 && p.x < g.def.x1 && p.y > g.def.y0 && p.y < g.def.y1) {
          s.gated = true;
          s.mult *= 2;
          g.flash = 0.4;
          if (this.onGate) this.onGate(p.x, p.y);
        }
      }
    }
  }

  // ---- anti-jam monitoring (once per frame) ----------------------------------------
  scan(dt) {
    if (this.globalCd > 0) this.globalCd -= dt;
    if (this.manualCd > 0) this.manualCd = Math.max(0, this.manualCd - dt);
    const def = this.def;
    if (!def) return;
    const phys = this.physics;
    let stuck = 0;
    let target = null;
    // with CURSOR AUTO PUSH COIN running, the pointer gets the first chance; the built-in rescue only steps in much later
    const cs = this.getState && this.getState().cursor;
    const need = cs && cs.owned && cs.on ? JAM.time + ECON.cursor.stuckSeconds + 5 : JAM.time;
    for (const idx of phys.active) {
      const s = phys.slots[idx];
      if (s.grace > 0) s.grace -= dt;
      const p = s.body.translation();
      let zone = null;
      for (const z of def.jam) {
        if (p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1) { zone = z; break; }
      }
      if (!zone || s.grace > 0) { s.lowT = 0; continue; }
      const lv = s.body.linvel();
      const av = s.body.angvel();
      const slow = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z < JAM.speed * JAM.speed && av.x * av.x + av.y * av.y + av.z * av.z < JAM.spin * JAM.spin;
      s.lowT = slow ? s.lowT + dt : 0;
      if (s.lowT > need) {
        stuck++;
        if (!target) target = { idx, zone, p };
      }
    }
    this.stuckCount = stuck;
    if (!target || this.globalCd > 0) return;
    this._assist(target);
  }

  _assist({ idx, zone, p }) {
    const s = this.physics.slots[idx];
    let did = false;
    if (zone.slab !== undefined) {
      const top = this.def.tops[zone.slab];
      const pis = this.pistons.find((q) => Math.abs(q.def.top - top) < 0.01);
      if (pis && pis.phase === 'idle' && pis.cool <= 0) did = this.fire(pis, 'auto');
    }
    if (!did) {
      // air burst: a small physical impulse that frees a coin wedged on a lip or in the hopper
      const lvl = 1 + 0.5 * s.helped;
      const side = zone.slab !== undefined ? (zone.x0 > 0 ? 1 : -1) * 0 + (zone.x0 < 0 ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
      const m = MASS[s.type];
      if (zone.slab !== undefined) s.body.applyImpulse({ x: (zone.x0 < 0 ? -1 : 1) * m * 1.4 * lvl, y: m * 0.8, z: 0 }, true);
      else s.body.applyImpulse({ x: side * m * 1.6 * lvl, y: m * 2.2 * lvl, z: 0 }, true);
      this.stats.auto++;
      this.stats.puffs++;
      if (this.onFire) this.onFire('auto', null);
      if (this.onPuff) this.onPuff(p.x, p.y);
    }
    s.helped++;
    s.grace = JAM.grace;
    s.lowT = 0;
    this.globalCd = JAM.globalCooldown;
  }

  // ---- manual "assist" button: one extra stroke on every piston + a gentle board shake ------
  manual() {
    if (this.manualCd > 0) return { ok: false, wait: this.manualCd };
    let n = 0;
    this.pistons.forEach((p, i) => { if (this.fire(p, 'manual', i * 0.18)) n++; });
    // shake: small random impulses on every coin in play (player-triggered, so it may touch resting coins)
    for (const idx of this.physics.active) {
      const s = this.physics.slots[idx];
      const m = MASS[s.type];
      s.body.applyImpulse({ x: (Math.random() - 0.5) * m * 1.6, y: m * (0.7 + Math.random() * 0.7), z: 0 }, true);
      s.lowT = 0;
    }
    this.manualCd = JAM.manualCooldown;
    if (this.onShake) this.onShake();
    return { ok: true, pistons: n };
  }

  get manualProgress() {
    return 1 - this.manualCd / JAM.manualCooldown;
  }
}
