import RAPIER from '@dimforge/rapier3d-compat';
import { IN_HALF, WALL_W, Z_HALF, SLAB_Z, COIN_TYPES, RARE_COLLIDER_SCALE } from './layout.js';

const PARK = { x: 0, y: -50, z: 0 };

// collision groups (membership << 16 | filter): coins hit everything; static parts and pistons only hit coins.
const G_COIN = 1, G_STATIC = 2, G_PUSH = 4;
export const GROUPS = {
  coin: (G_COIN << 16) | (G_COIN | G_STATIC | G_PUSH),
  static: (G_STATIC << 16) | G_COIN,
  push: (G_PUSH << 16) | G_COIN,
};

export async function loadRapier() {
  await RAPIER.init();
  return RAPIER;
}

// collider size for a coin type (the rendered mesh uses the same COIN_TYPES numbers)
export function colliderSize(type) {
  const c = COIN_TYPES[type];
  const r = c.segments <= 8 ? c.radius * RARE_COLLIDER_SCALE : c.radius;
  return { radius: r, halfHeight: c.thickness / 2 };
}

const zq = (a) => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });
function qMul(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}
const qAxis = (ax, ay, az, ang) => {
  const s = Math.sin(ang / 2);
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(ang / 2) };
};

export class Physics {
  constructor(maxBodies) {
    this.max = maxBodies;
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -18, z: 0 });
    this.world.timestep = 1 / 60;
    try { this.world.integrationParameters.numSolverIterations = 8; } catch { /* older API */ }
    this.time = 0;
    this.slots = [];
    this.free = [];
    this.active = []; // slot indices in play (state 1)
    this.sucking = []; // slot indices being swallowed by the grinder (state 2, visual only)
    this.beforeStep = null; // hook (dt): machines drive pistons / apply forces
    this.helperUpdate = null; // hook (dt): the cursor assistant moves its kinematic helper collider each fixed step
    this.helper = null;
    this.stage = null;
    this.statics = [];
    this._buildPool();
  }

  _fixed(desc) {
    const c = this.world.createCollider(desc.setCollisionGroups(GROUPS.static));
    this.statics.push(c);
    return c;
  }

  // (re)build every static collider for a stage layout
  buildStage(def) {
    for (const c of this.statics) this.world.removeCollider(c, false);
    this.statics = [];
    this.stage = def;
    const R = RAPIER;
    const cy = 7.6;
    // side walls
    for (const sx of [-1, 1]) {
      this._fixed(R.ColliderDesc.cuboid(WALL_W / 2, 9, 1.0).setTranslation(sx * (IN_HALF + WALL_W / 2), cy, 0).setFriction(0.1).setRestitution(0.3));
    }
    // invisible front/back glass keeps coins inside the shallow slot (this is what makes it 2.5D)
    for (const sz of [-1, 1]) {
      this._fixed(R.ColliderDesc.cuboid(4, 9, 0.5).setTranslation(0, cy, sz * (Z_HALF + 0.5)).setFriction(0.03).setRestitution(0.1));
    }
    // platforms / columns / belts
    for (const b of def.blocks) {
      const hx = (b.x1 - b.x0) / 2, hy = (b.y1 - b.y0) / 2;
      this._fixed(
        R.ColliderDesc.cuboid(hx, hy, SLAB_Z).setTranslation((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0).setFriction(b.kind === 'belt' ? 0.9 : 0.6).setRestitution(0.18)
      );
    }
    for (const p of def.plates) {
      this._fixed(R.ColliderDesc.cuboid(p.halfLen, p.thick / 2, SLAB_Z).setTranslation(p.cx, p.cy, 0).setRotation(zq(p.ang)).setFriction(0.25).setRestitution(0.25));
    }
    // grinder pit floor
    this._fixed(R.ColliderDesc.cuboid(2.0, 0.3, SLAB_Z).setTranslation(-1.2, -0.3, 0).setFriction(0.5).setRestitution(0.1));
  }

  _buildPool() {
    const R = RAPIER;
    const t0 = colliderSize(0);
    for (let i = 0; i < this.max; i++) {
      const body = this.world.createRigidBody(
        R.RigidBodyDesc.dynamic().setTranslation(PARK.x, PARK.y, PARK.z).setLinearDamping(0.05).setAngularDamping(0.35).setCcdEnabled(true).setCanSleep(true)
      );
      const collider = this.world.createCollider(
        R.ColliderDesc.cylinder(t0.halfHeight, t0.radius).setRestitution(0.3).setFriction(0.5).setDensity(1).setCollisionGroups(GROUPS.coin),
        body
      );
      body.setEnabled(false);
      this.slots.push({ body, collider, state: 0, type: 0, shape: 0, mult: 1, born: 0, sx: 0, sy: 0, sz: 0, st: 0, q: null, lowT: 0, grace: 0, helped: 0, cSince: -1, cIgn: 0 });
      this.free.push(i);
    }
  }

  get freeCount() {
    return this.free.length;
  }

  // drop a coin at (x, y) with a random orientation (cylinder axis starts near vertical: it lands flat or on its edge)
  spawn(x, y, type, mult = 1, vx = 0, vy = -2) {
    const idx = this.free.pop();
    if (idx === undefined) return -1;
    const s = this.slots[idx];
    s.state = 1;
    s.type = type;
    s.mult = mult;
    s.born = this.time;
    s.lowT = 0;
    s.grace = 0;
    s.helped = 0;
    s.cSince = -1;
    s.cIgn = 0;
    s.gated = false;
    if (s.shape !== type) {
      const cs = colliderSize(type);
      s.collider.setRadius(cs.radius);
      s.collider.setHalfHeight(cs.halfHeight);
      s.shape = type;
    }
    // random tilt (up to ~70°) about X and Z plus a free spin about Y: every coin looks different and tumbles differently
    let q = qAxis(0, 1, 0, Math.random() * Math.PI * 2);
    q = qMul(q, qAxis(1, 0, 0, (Math.random() - 0.5) * 2.4));
    q = qMul(q, qAxis(0, 0, 1, (Math.random() - 0.5) * 2.4));
    s.body.setEnabled(true);
    s.body.setTranslation({ x, y, z: (Math.random() - 0.5) * 0.12 }, true);
    s.body.setRotation(q, true);
    s.body.setLinvel({ x: vx + (Math.random() - 0.5) * 0.8, y: vy, z: 0 }, true);
    s.body.setAngvel({ x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 5, z: (Math.random() - 0.5) * 5 }, true);
    this.active.push(idx);
    return idx;
  }

  release(idx) {
    const s = this.slots[idx];
    if (s.state === 0) return;
    s.state = 0;
    s.body.setEnabled(false);
    s.body.setTranslation(PARK, false);
    const i = this.active.indexOf(idx);
    if (i >= 0) this.active.splice(i, 1);
    this.free.push(idx);
  }

  // coin reached the grinder: it leaves the simulation (it was *collected*, not teleported)
  beginSuck(idx) {
    const s = this.slots[idx];
    const p = s.body.translation();
    const q = s.body.rotation();
    s.sx = p.x; s.sy = p.y; s.sz = p.z;
    s.q = { x: q.x, y: q.y, z: q.z, w: q.w };
    s.st = 0;
    s.state = 2;
    s.body.setEnabled(false);
    const i = this.active.indexOf(idx);
    if (i >= 0) this.active.splice(i, 1);
    this.sucking.push(idx);
  }

  releaseSucked(idx) {
    const s = this.slots[idx];
    s.state = 0;
    s.body.setTranslation(PARK, false);
    const i = this.sucking.indexOf(idx);
    if (i >= 0) this.sucking.splice(i, 1);
    this.free.push(idx);
  }

  // Small kinematic collider that belongs to the cursor assistant. It only exists while a stroke is running and collides with
  // coins only, so coins are moved by genuine contact forces (never by editing their positions).
  setHelper(on, x = 0, y = 0) {
    if (!this.helper) {
      const R = RAPIER;
      const body = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(PARK.x, PARK.y, PARK.z));
      const collider = this.world.createCollider(R.ColliderDesc.cuboid(0.1, 0.2, 0.4).setCollisionGroups(GROUPS.push).setFriction(0.3).setRestitution(0.05), body);
      body.setEnabled(false);
      this.helper = { body, collider, on: false };
    }
    const h = this.helper;
    if (on) {
      h.body.setEnabled(true);
      h.body.setTranslation({ x, y, z: 0 }, true);
      h.body.setNextKinematicTranslation({ x, y, z: 0 });
    } else {
      h.body.setEnabled(false);
      h.body.setTranslation(PARK, false);
    }
    h.on = on;
    h.x = x; h.y = y;
  }

  moveHelper(x, y) {
    const h = this.helper;
    if (!h || !h.on) return;
    h.body.setNextKinematicTranslation({ x, y, z: 0 });
    h.x = x; h.y = y;
  }

  // one fixed step; returns the slots that reached the grinder and the ones that escaped the machine (safety net)
  step(dt) {
    this.time += dt;
    if (this.beforeStep) this.beforeStep(dt);
    if (this.helperUpdate) this.helperUpdate(dt);
    this.world.step();
    const collected = [];
    const escaped = [];
    const pit = this.stage ? this.stage.pit : null;
    for (const idx of this.active) {
      const p = this.slots[idx].body.translation();
      if (pit && p.y < pit.collectY && p.x > pit.x0 - 0.1 && p.x < pit.x1 + 0.4) collected.push(idx);
      else if (p.y < -1.5 || Math.abs(p.x) > IN_HALF + WALL_W || p.y > 17 || Math.abs(p.z) > SLAB_Z + 0.1) escaped.push(idx);
    }
    return { collected, escaped };
  }

  // nearest active coin to (x,y) within maxDist; returns idx or -1
  nearest(x, y, maxDist = Infinity) {
    let best = -1;
    let bd = maxDist * maxDist;
    for (const idx of this.active) {
      const p = this.slots[idx].body.translation();
      const dx = p.x - x, dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = idx; }
    }
    return best;
  }

  clear() {
    for (const idx of [...this.active]) this.release(idx);
    for (const idx of [...this.sucking]) this.releaseSucked(idx);
  }
}
