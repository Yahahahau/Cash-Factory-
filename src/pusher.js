// Mechanical anti-jam pusher.
//
// Detection : a coin is "stuck" when it sits inside a JAM zone (a production passage where coins should always
//             be falling) and stays practically motionless (low linear AND angular speed) for JAM.time seconds.
//             Coins resting in the final collection bin are never monitored.
// Reaction  : the piston whose corridor is closest slides its plate through the peg field (kinematic body, so the
//             coins are pushed by genuine contact forces) and, at the end of the stroke, any coin that is still
//             motionless receives one small physical impulse. Gravity and normal physics do the rest.
//             Coins are never teleported, never deleted and never repositioned directly.
import { L, PISTONS, PISTON_PLATE, JAM, JAM_ZONES, SLOT_DEPTH } from './layout.js';
import { COLLISION_GROUPS } from './physics.js';

const smooth = (t) => {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};

// x of the rod's centre: its head (front) is `ext` metres in from the wall, the rod body runs back into the wall
export function rodCenter(def, ext) {
  const w = -def.dir; // +1 = mounted on the right wall
  const front = w * (PISTON_PLATE.restFront - ext);
  return front + w * PISTON_PLATE.rodHalf;
}

function zoneAt(x, y) {
  for (const z of JAM_ZONES) if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return z;
  return null;
}

export class Pusher {
  constructor(physics) {
    this.physics = physics;
    const R = physics.R;
    this.pistons = PISTONS.map((def) => {
      const body = physics.world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(rodCenter(def, 0), def.y, 0)
      );
      physics.world.createCollider(
        R.ColliderDesc.cuboid(PISTON_PLATE.rodHalf, PISTON_PLATE.halfY, SLOT_DEPTH / 2 - 0.005)
          .setFriction(0.3)
          .setRestitution(0.1)
          .setCollisionGroups(COLLISION_GROUPS.push),
        body
      );
      return { def, body, phase: 'idle', t: 0, dur: 0, stroke: 0, ext: 0, cool: 0, delay: 0, targets: [], kind: 'auto', nudged: false, flash: 0 };
    });
    this.acc = 0;
    this.globalCd = 0;
    this.manualCd = 0;
    this.stuckCount = 0; // coins currently flagged (for UI/debug)
    this.onFire = null; // (kind, piston) => void
    this.stats = { auto: 0, manual: 0, nudges: 0 };
    physics.beforeStep = (dt) => this.step(dt);
  }

  reset() {
    for (const p of this.pistons) {
      p.phase = 'idle'; p.t = 0; p.ext = 0; p.cool = 0; p.delay = 0; p.targets = [];
      p.body.setNextKinematicTranslation({ x: rodCenter(p.def, 0), y: p.def.y, z: 0 });
    }
    this.globalCd = 0;
  }

  // ---- animation / kinematics (runs in the fixed physics step) ----
  step(dt) {
    for (const p of this.pistons) {
      p.flash = Math.max(0, p.flash - dt * 2);
      if (p.phase === 'idle') { p.cool = Math.max(0, p.cool - dt); }
      else if (p.phase === 'wait') {
        p.delay -= dt;
        if (p.delay <= 0) this._begin(p);
      } else if (p.phase === 'extend') {
        p.t += dt;
        p.ext = p.stroke * smooth(p.t / p.dur);
        if (p.t >= p.dur) { p.phase = 'hold'; p.t = 0; p.dur = 0.14; }
      } else if (p.phase === 'hold') {
        p.t += dt;
        if (p.t >= p.dur) { p.phase = 'retract'; p.t = 0; p.dur = Math.max(0.35, p.dur0 * 1.25); }
      } else if (p.phase === 'retract') {
        p.t += dt;
        p.ext = p.stroke * (1 - smooth(p.t / p.dur));
        // the head has moved clear: any target that is *still* motionless gets one small impulse
        if (!p.nudged && p.t >= 0.3) { p.nudged = true; this._nudge(p); }
        if (p.t >= p.dur) { p.phase = 'idle'; p.ext = 0; p.cool = JAM.pistonCooldown; p.targets = []; }
      }
      p.body.setNextKinematicTranslation({ x: rodCenter(p.def, p.ext), y: p.def.y, z: 0 });
    }
  }

  _begin(p) {
    p.phase = 'extend';
    p.t = 0;
    p.dur = 0.3 + p.stroke * 0.3; // gentle: ~1.2 s for a full 3 m stroke (peak ~4 m/s)
    p.dur0 = p.dur;
    p.flash = 1;
    p.nudged = false;
    if (this.onFire) this.onFire(p.kind, p);
  }

  _fire(p, stroke, kind, targets, delay = 0) {
    if (p.phase !== 'idle') return false;
    p.stroke = Math.max(1.2, Math.min(p.def.maxStroke, stroke));
    p.kind = kind;
    p.targets = targets;
    p.phase = 'wait';
    p.delay = delay;
    p.t = 0;
    if (kind === 'auto') this.stats.auto++; else this.stats.manual++;
    if (delay <= 0) this._begin(p);
    return true;
  }

  // one small real impulse for coins still motionless when the plate has reached them
  _nudge(p) {
    const dir = p.def.dir;
    for (const idx of p.targets) {
      const s = this.physics.slots[idx];
      if (!s || s.state !== 1) continue;
      const pos = s.body.translation();
      if (!zoneAt(pos.x, pos.y)) continue;
      const v = s.body.linvel();
      if (Math.hypot(v.x, v.y, v.z) > 0.45) continue; // already moving: leave it to the physics
      const m = s.body.mass();
      s.body.applyImpulse({ x: dir * m * 0.9, y: m * 0.55, z: (Math.random() - 0.5) * m * 0.3 }, true);
      s.body.applyTorqueImpulse({ x: 0, y: 0, z: -dir * m * 0.012 }, true);
      s.grace = JAM.grace;
      s.lowT = 0;
      this.stats.nudges++;
    }
  }

  // ---- detection (called every game frame; works on a 10 Hz cadence) ----
  scan(dt) {
    this.acc += dt;
    if (this.acc < 0.1) return;
    const d = this.acc;
    this.acc = 0;
    this.globalCd = Math.max(0, this.globalCd - d);
    this.manualCd = Math.max(0, this.manualCd - d);

    const stuck = [];
    for (const idx of this.physics.active) {
      const s = this.physics.slots[idx];
      if (s.grace > 0) { s.grace -= d; s.lowT = 0; continue; }
      const p = s.body.translation();
      if (!zoneAt(p.x, p.y)) { s.lowT = 0; continue; }
      const v = s.body.linvel();
      const w = s.body.angvel();
      const still = Math.hypot(v.x, v.y, v.z) < JAM.speed && Math.hypot(w.x, w.y, w.z) < JAM.spin;
      if (still) {
        s.lowT += d;
        if (s.lowT >= JAM.time) stuck.push({ idx, x: p.x, y: p.y });
      } else s.lowT = 0;
    }
    this.stuckCount = stuck.length;
    if (!stuck.length || this.globalCd > 0) return;

    // group stuck coins by their closest available piston
    const groups = new Map();
    for (const c of stuck) {
      let best = null;
      let bd = JAM.fallbackReach;
      for (const p of this.pistons) {
        if (p.phase !== 'idle' || p.cool > 0) continue;
        const dy = Math.abs(p.def.y - c.y);
        if (dy < bd) { bd = dy; best = p; }
      }
      if (!best) continue;
      if (!groups.has(best)) groups.set(best, []);
      groups.get(best).push(c);
    }
    let fired = false;
    for (const [p, list] of groups) {
      const dir = p.def.dir;
      let need = 0;
      for (const c of list) need = Math.max(need, dir > 0 ? c.x + 3.01 : 3.01 - c.x);
      if (this._fire(p, need + 0.15, 'auto', list.map((c) => c.idx))) {
        fired = true;
        for (const c of list) this.physics.slots[c.idx].lowT = 0;
      }
    }
    if (fired) this.globalCd = JAM.globalCooldown;
  }

  // manual assist: one extra push cycle through every corridor (staggered, no force beyond the normal stroke)
  manual() {
    if (this.manualCd > 0) return { ok: false, wait: this.manualCd };
    let n = 0;
    this.pistons.forEach((p, i) => {
      if (p.phase !== 'idle') return;
      const near = [];
      for (const idx of this.physics.active) {
        const pos = this.physics.slots[idx].body.translation();
        if (Math.abs(pos.y - p.def.y) <= 0.5 && zoneAt(pos.x, pos.y)) near.push(idx);
      }
      if (this._fire(p, p.def.maxStroke, 'manual', near, i * 0.16)) n++;
    });
    if (!n) return { ok: false, wait: 1 };
    this.manualCd = JAM.manualCooldown;
    return { ok: true };
  }

  get manualProgress() {
    return 1 - this.manualCd / JAM.manualCooldown;
  }
}
