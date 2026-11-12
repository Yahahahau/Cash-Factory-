import RAPIER from '@dimforge/rapier3d-compat';
import { L, PEGS, PEG_R, DEFLECTORS, OBJ_R } from './layout.js';

const ROT_X90 = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }; // cylinder axis Y -> Z
const OBJ_HH = 0.1;
const PARK = { x: 0, y: -50, z: 0 };

export async function loadRapier() {
  await RAPIER.init();
  return RAPIER;
}

export class Physics {
  constructor(maxBodies) {
    this.max = maxBodies;
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 });
    this.world.timestep = 1 / 60;
    try { this.world.integrationParameters.numSolverIterations = 4; } catch { /* older API */ }
    this.time = 0;
    this.slots = [];
    this.free = [];
    this.active = []; // slot indices in play (state 1)
    this.sucking = []; // slot indices being pulled into the collector (state 2)
    this._buildStatic();
    this._buildPool();
  }

  _fixed(desc) {
    return this.world.createCollider(desc);
  }

  _buildStatic() {
    const R = RAPIER;
    const w = L.innerHalfW;
    // walls
    for (const sx of [-1, 1]) {
      this._fixed(
        R.ColliderDesc.cuboid(L.wallHalfW, 7, 0.6)
          .setTranslation(sx * (w + L.wallHalfW), 7, 0)
          .setFriction(0.1)
          .setRestitution(0.3)
      );
    }
    // floor (slightly sloped towards the exit on the right)
    const f = L.floor;
    this._fixed(
      R.ColliderDesc.cuboid(f.halfLen, f.thick / 2, 0.6)
        .setTranslation(0, f.y, 0)
        .setRotation({ x: 0, y: 0, z: Math.sin(f.ang / 2), w: Math.cos(f.ang / 2) })
        .setFriction(0.6)
        .setRestitution(0.25)
    );
    // pegs
    for (const p of PEGS) {
      this._fixed(
        R.ColliderDesc.cylinder(0.5, PEG_R).setTranslation(p.x, p.y, 0).setRotation(ROT_X90).setRestitution(0.45).setFriction(0.15)
      );
    }
    // funnel plates
    for (const d of DEFLECTORS) {
      this._fixed(
        R.ColliderDesc.cuboid(d.halfLen, d.thick / 2, 0.6)
          .setTranslation(d.x, d.y, 0)
          .setRotation({ x: 0, y: 0, z: Math.sin(d.ang / 2), w: Math.cos(d.ang / 2) })
          .setFriction(0.2)
          .setRestitution(0.3)
      );
    }
    // swinging paddle (kinematic)
    const p = L.paddle;
    this.paddle = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, 0));
    this.world.createCollider(R.ColliderDesc.cuboid(p.halfLen, 0.09, 0.5).setFriction(0.25).setRestitution(0.5), this.paddle);
    this.paddleAngle = 0;
  }

  _buildPool() {
    const R = RAPIER;
    for (let i = 0; i < this.max; i++) {
      const body = this.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(PARK.x, PARK.y, PARK.z)
          .enabledTranslations(true, true, false)
          .enabledRotations(false, false, true)
          .setLinearDamping(0.05)
          .setAngularDamping(0.4)
          .setCanSleep(true)
      );
      const collider = this.world.createCollider(
        R.ColliderDesc.cylinder(OBJ_HH, OBJ_R * 0.96).setRotation(ROT_X90).setRestitution(0.38).setFriction(0.45).setDensity(1),
        body
      );
      body.setEnabled(false);
      this.slots.push({ body, collider, state: 0, type: 0, n: 1, zj: 0, born: 0, sx: 0, sy: 0, st: 0, ang: 0 });
      this.free.push(i);
    }
  }

  get freeCount() {
    return this.free.length;
  }

  spawn(x, y, type, n) {
    const idx = this.free.pop();
    if (idx === undefined) return -1;
    const s = this.slots[idx];
    s.state = 1;
    s.type = type;
    s.n = n;
    s.zj = (Math.random() - 0.5) * 0.24;
    s.born = this.time;
    const a = Math.random() * Math.PI;
    s.body.setEnabled(true);
    s.body.setTranslation({ x, y, z: 0 }, true);
    s.body.setRotation({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) }, true);
    s.body.setLinvel({ x: (Math.random() - 0.5) * 1.2, y: -2, z: 0 }, true);
    s.body.setAngvel({ x: 0, y: 0, z: (Math.random() - 0.5) * 6 }, true);
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

  // switch an object to a non-physical "being sucked" state (kept in `sucking` list by caller)
  beginSuck(idx) {
    const s = this.slots[idx];
    const p = s.body.translation();
    s.sx = p.x;
    s.sy = p.y;
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
    this.world.step();
    // recycle anything that escaped the playfield
    const out = [];
    for (const idx of this.active) {
      const p = this.slots[idx].body.translation();
      if (p.y < -1.5 || Math.abs(p.x) > 4.2 || p.y > 14) out.push(idx);
    }
    return out;
  }

  pos(idx) {
    return this.slots[idx].body.translation();
  }

  angle(idx) {
    const q = this.slots[idx].body.rotation();
    return 2 * Math.atan2(q.z, q.w);
  }

  // nearest active object in the bin to (x,y); returns idx or -1
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

export { OBJ_R };
