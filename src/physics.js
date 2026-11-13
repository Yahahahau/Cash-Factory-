import RAPIER from '@dimforge/rapier3d-compat';
import { L, PEGS, PEG_R, DEFLECTORS, DEFLECTOR_VIS_THICK, COIN_TYPES, GEM_COLLIDER_SCALE, SLOT_DEPTH } from './layout.js';

// Rapier cylinders have their axis along local Y. Coin meshes are built with their axis along Z
// (geometry.rotateX(90deg)), so every coin collider gets this same local rotation.
export const COLLIDER_ROT = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
const PARK = { x: 0, y: -50, z: 0 };

// collision groups (membership << 16 | filter): coins hit everything; static parts only hit coins;
// pusher plates only hit coins (they glide between the pegs).
const G_COIN = 0x0001;
const G_STATIC = 0x0002;
const G_PUSH = 0x0004;
const GROUPS = {
  coin: (G_COIN << 16) | (G_COIN | G_STATIC | G_PUSH),
  static: (G_STATIC << 16) | G_COIN,
  push: (G_PUSH << 16) | G_COIN,
};

export const COLLISION_GROUPS = GROUPS;

export async function loadRapier() {
  await RAPIER.init();
  return RAPIER;
}

// collider dimensions for a coin type (shared by physics and, via layout.js, by the renderer)
export function colliderSize(type) {
  const c = COIN_TYPES[type];
  const r = c.segments === 6 ? c.radius * GEM_COLLIDER_SCALE : c.radius;
  return { radius: r, halfHeight: c.thickness / 2 };
}

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
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 });
    this.world.timestep = 1 / 60;
    try { this.world.integrationParameters.numSolverIterations = 8; } catch { /* older API */ }
    this.time = 0;
    this.slots = [];
    this.free = [];
    this.active = []; // slot indices in play (state 1)
    this.sucking = []; // slot indices being pulled into the collector (state 2)
    this.beforeStep = null; // hook: (dt) => void, used by the pusher to drive its kinematic plates
    this._buildStatic();
    this._buildPool();
  }

  _fixed(desc) {
    return this.world.createCollider(desc.setCollisionGroups(GROUPS.static));
  }

  _buildStatic() {
    const R = RAPIER;
    const w = L.innerHalfW;
    const zq = (a) => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });
    // side walls
    for (const sx of [-1, 1]) {
      this._fixed(R.ColliderDesc.cuboid(L.wallHalfW, 7.5, 1.0).setTranslation(sx * (w + L.wallHalfW), 7.2, 0).setFriction(0.1).setRestitution(0.3));
    }
    // invisible front/back glass keeps coins inside the slot (this is what makes the game 2.5D)
    for (const sz of [-1, 1]) {
      this._fixed(R.ColliderDesc.cuboid(3.4, 7.7, 0.5).setTranslation(0, 7.2, sz * (SLOT_DEPTH / 2 + 0.5)).setFriction(0.05).setRestitution(0.1));
    }
    // floor: thick collider, sloped towards the exit on the right
    const f = L.floor;
    this._fixed(
      R.ColliderDesc.cuboid(f.halfLen, f.thick / 2, 0.8).setTranslation(0, f.y, 0).setRotation(zq(f.ang)).setFriction(0.6).setRestitution(0.25)
    );
    // pegs: full-depth cylinders along Z
    for (const p of PEGS) {
      this._fixed(R.ColliderDesc.cylinder(0.5, PEG_R).setTranslation(p.x, p.y, 0).setRotation(COLLIDER_ROT).setRestitution(0.45).setFriction(0.15));
    }
    // funnel plates (collider thicker than the visual; shifted down so the top surfaces coincide)
    for (const d of DEFLECTORS) {
      const off = (d.thick - DEFLECTOR_VIS_THICK) / 2;
      this._fixed(
        R.ColliderDesc.cuboid(d.halfLen, d.thick / 2, 0.8)
          .setTranslation(d.x + Math.sin(d.ang) * off, d.y - Math.cos(d.ang) * off, 0)
          .setRotation(zq(d.ang))
          .setFriction(0.2)
          .setRestitution(0.3)
      );
    }
    // swinging paddle (kinematic)
    const p = L.paddle;
    this.paddle = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, 0));
    this.world.createCollider(R.ColliderDesc.cuboid(p.halfLen, 0.12, SLOT_DEPTH / 2 + 0.1).setFriction(0.25).setRestitution(0.5).setCollisionGroups(GROUPS.static), this.paddle);
    this.paddleAngle = 0;
  }

  _buildPool() {
    const R = RAPIER;
    const t0 = colliderSize(0);
    for (let i = 0; i < this.max; i++) {
      const body = this.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(PARK.x, PARK.y, PARK.z)
          .setLinearDamping(0.05)
          .setAngularDamping(0.35)
          .setCcdEnabled(true) // thin coins vs thin plates: never tunnel
          .setCanSleep(true)
      );
      const collider = this.world.createCollider(
        R.ColliderDesc.cylinder(t0.halfHeight, t0.radius).setRotation(COLLIDER_ROT).setRestitution(0.35).setFriction(0.45).setDensity(1).setCollisionGroups(GROUPS.coin),
        body
      );
      body.setEnabled(false);
      this.slots.push({ body, collider, state: 0, type: 0, shape: 0, n: 1, born: 0, sx: 0, sy: 0, st: 0, q: null, lowT: 0 });
      this.free.push(i);
    }
  }

  get freeCount() {
    return this.free.length;
  }

  // spawn a coin at (x, y) with a random orientation (mostly facing the camera, slightly tilted)
  spawn(x, y, type, n) {
    const idx = this.free.pop();
    if (idx === undefined) return -1;
    const s = this.slots[idx];
    s.state = 1;
    s.type = type;
    s.n = n;
    s.born = this.time;
    s.lowT = 0;
    s.grace = 0;
    if (s.shape !== type) {
      const cs = colliderSize(type);
      s.collider.setRadius(cs.radius);
      s.collider.setHalfHeight(cs.halfHeight);
      s.shape = type;
    }
    let q = qAxis(0, 0, 1, Math.random() * Math.PI * 2);
    q = qMul(q, qAxis(1, 0, 0, (Math.random() - 0.5) * 0.7));
    q = qMul(q, qAxis(0, 1, 0, (Math.random() - 0.5) * 0.7));
    s.body.setEnabled(true);
    s.body.setTranslation({ x, y, z: (Math.random() - 0.5) * 0.06 }, true);
    s.body.setRotation(q, true);
    s.body.setLinvel({ x: (Math.random() - 0.5) * 1.2, y: -2, z: 0 }, true);
    s.body.setAngvel({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 6 }, true);
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

  // hand a coin over to the collector animation (the coin leaves the simulation, it is *collected*)
  beginSuck(idx) {
    const s = this.slots[idx];
    const p = s.body.translation();
    const q = s.body.rotation();
    s.sx = p.x;
    s.sy = p.y;
    s.sz = p.z;
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

  step(dt) {
    this.time += dt;
    this.paddleAngle = Math.sin(this.time * 1.7) * L.paddle.maxAng;
    const a = this.paddleAngle;
    this.paddle.setNextKinematicRotation({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });
    if (this.beforeStep) this.beforeStep(dt);
    this.world.step();
    // recycle anything that escaped the playfield (safety net; should never happen)
    const out = [];
    for (const idx of this.active) {
      const p = this.slots[idx].body.translation();
      if (p.y < -1.5 || Math.abs(p.x) > 4.2 || p.y > 14 || Math.abs(p.z) > 0.6) out.push(idx);
    }
    return out;
  }

  // nearest active object to (x,y); returns idx or -1
  nearest(x, y, binOnly, maxDist = Infinity) {
    let best = -1;
    let bd = maxDist * maxDist;
    for (const idx of this.active) {
      const p = this.slots[idx].body.translation();
      if (binOnly && p.y > L.binTop) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = idx;
      }
    }
    return best;
  }

  clear() {
    for (const idx of [...this.active]) this.release(idx);
    for (const idx of [...this.sucking]) this.releaseSucked(idx);
  }
}
