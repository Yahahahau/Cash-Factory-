// Headless physics + game-loop tests (Rapier runs in Node). Run: npm run test:physics
import assert from 'node:assert/strict';
import { loadRapier, Physics, colliderSize, COLLIDER_ROT } from '../src/physics.js';
import { Pusher } from '../src/pusher.js';
import { Game } from '../src/game.js';
import * as E from '../src/economy.js';
import { L, COIN_TYPES, SLOT_DEPTH, JAM } from '../src/layout.js';

// seeded PRNG so every run is reproducible
let seed = 12345;
Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; // seeded
await loadRapier();
const STEP = 1 / 60;
let passed = 0;
const ok = (name, extra = '') => { passed++; console.log('ok  ', name, extra); };

function rig(max = 90) {
  const physics = new Physics(max);
  const pusher = new Pusher(physics);
  return { physics, pusher };
}
function run(physics, pusher, seconds, each) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) {
    physics.step(STEP);
    pusher.scan(STEP);
    if (each) each(i * STEP);
  }
}
const floorTopAt = (x) => L.floor.y + L.floor.thick / 2 + Math.tan(L.floor.ang) * x; // approx
const axisZ = (q) => Math.abs(1 - 2 * (q.x * q.x + q.y * q.y)); // |n.z| of the coin axis

// ---------------------------------------------------------------- 1. collider == mesh dimensions
{
  const { physics } = rig(8);
  COIN_TYPES.forEach((c, t) => {
    const idx = physics.spawn(0, 12, t, 1);
    const col = physics.slots[idx].collider;
    const cs = colliderSize(t);
    assert.ok(Math.abs(col.radius() - cs.radius) < 1e-5, 'radius');
    assert.ok(Math.abs(col.halfHeight() - c.thickness / 2) < 1e-5, 'thickness');
    const expectR = c.segments === 6 ? c.radius * 0.93 : c.radius;
    assert.ok(Math.abs(cs.radius - expectR) < 1e-9);
    physics.slots[idx].body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    const r = col.rotation(); // world rotation of the collider with an identity body = its local rotation
    assert.ok(Math.abs(r.x - COLLIDER_ROT.x) < 1e-6 && Math.abs(r.w - COLLIDER_ROT.w) < 1e-6, 'local rotation axis Y->Z');
    assert.equal(col.shapeType(), physics.R.ShapeType.Cylinder);
  });
  ok('collider radius/thickness/axis match the coin models; shape is a Rapier cylinder');
}

// ---------------------------------------------------------------- 2. axis really is Z (contact height on a ledge)
{
  const { physics, pusher } = rig(4);
  const ledgeTop = 12.5;
  physics.world.createCollider(physics.R.ColliderDesc.cuboid(1.5, 0.1, 1).setTranslation(0, ledgeTop - 0.1, 0));
  const idx = physics.spawn(0, ledgeTop + 0.3, 0, 1);
  const s = physics.slots[idx];
  s.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  s.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  s.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  let minY = 99;
  run(physics, pusher, 0.5, () => { minY = Math.min(minY, s.body.translation().y); });
  const r = COIN_TYPES[0].radius, h = COIN_TYPES[0].thickness / 2;
  assert.ok(Math.abs(minY - (ledgeTop + r)) < 0.03, `rim contact at radius (got ${(minY - ledgeTop).toFixed(3)}, radius ${r}, half-thickness ${h})`);
  ok('coin stands on its rim (axis Z): contact height = radius', `(${(minY - ledgeTop).toFixed(3)} ~ ${r})`);
}

// ---------------------------------------------------------------- 3. single coin falls through the machine
{
  const { physics, pusher } = rig(6);
  const idx = physics.spawn(0.05, L.nozzleY, 0, 1);
  const s = physics.slots[idx];
  let minY = 99, prev = s.body.translation(), maxStep = 0, maxZ = 0;
  run(physics, pusher, 12, () => {
    const p = s.body.translation();
    minY = Math.min(minY, p.y);
    maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.y - prev.y));
    maxZ = Math.max(maxZ, Math.abs(p.z));
    prev = { ...p };
  });
  const p = s.body.translation();
  assert.ok(p.y < L.binTop, 'reached the bin');
  assert.ok(minY > floorTopAt(p.x) - 0.12, `never below the floor (min ${minY.toFixed(2)})`);
  assert.ok(Math.abs(p.x) < 3.0 && maxZ < SLOT_DEPTH / 2 + 0.02, 'inside walls and slot');
  assert.ok(maxStep < 0.4, 'continuous motion, no teleport');
  ok('single coin falls through pegs and funnel into the bin', `(rest y=${p.y.toFixed(2)}, max step ${maxStep.toFixed(2)})`);
}

// ---------------------------------------------------------------- 4. many coins: stacking, no tunnelling, no escape
{
  const { physics, pusher } = rig(110);
  let spawned = 0, worstBelow = 99, outside = 0, maxZ = 0;
  const xs = L.nozzleXs;
  run(physics, pusher, 40, (t) => {
    if (t < 20 && Math.floor(t / 0.15) >= spawned && physics.freeCount > 0) {
      physics.spawn(xs[spawned % 3] + (Math.random() - 0.5) * 0.3, L.nozzleY, spawned % 4 === 3 ? 1 : spawned % 11 === 0 ? 2 : 0, 1);
      spawned++;
    }
    for (const idx of physics.active) {
      const p = physics.slots[idx].body.translation();
      worstBelow = Math.min(worstBelow, p.y - floorTopAt(p.x));
      if (Math.abs(p.x) > 3.05) outside++;
      const sl = physics.slots[idx];
      const nz = axisZ(sl.body.rotation());
      const c = COIN_TYPES[sl.type];
      const halfExt = c.radius * Math.sqrt(Math.max(0, 1 - nz * nz)) + (c.thickness / 2) * nz;
      maxZ = Math.max(maxZ, Math.abs(p.z) + halfExt - SLOT_DEPTH / 2);
    }
  });
  let inBin = 0, moving = 0;
  for (const idx of physics.active) {
    const s = physics.slots[idx];
    const p = s.body.translation();
    if (p.y < L.binTop) inBin++;
    const v = s.body.linvel();
    if (Math.hypot(v.x, v.y) > 0.5) moving++;
  }
  assert.equal(outside, 0, 'no coin outside the walls');
  assert.ok(worstBelow > -0.15, `no coin under the floor (worst ${worstBelow.toFixed(2)})`);
  assert.ok(maxZ < 0.3, `coins never get through the glass (worst transient overshoot ${maxZ.toFixed(3)})`);
  let settledOver = 0;
  for (const idx of physics.active) {
    const sl = physics.slots[idx];
    const nz = axisZ(sl.body.rotation());
    const c = COIN_TYPES[sl.type];
    settledOver = Math.max(settledOver, Math.abs(sl.body.translation().z) + c.radius * Math.sqrt(Math.max(0, 1 - nz * nz)) + (c.thickness / 2) * nz - SLOT_DEPTH / 2);
  }
  assert.ok(settledOver < 0.06, `settled coins sit inside the slot (overshoot ${settledOver.toFixed(3)})`);
  assert.ok(physics.active.length === spawned, 'no coin deleted');
  assert.ok(inBin >= spawned * 0.8, `most coins reached the bin (${inBin}/${spawned})`);
  assert.ok(moving < 4, `pile settles (${moving} still moving)`);
  ok('multi-coin stacking is stable', `(${spawned} coins, ${inBin} in bin, worst floor clearance ${worstBelow.toFixed(2)}, auto pushes ${pusher.stats.auto})`);
}

// ---------------------------------------------------------------- 5. different orientations
{
  const { physics, pusher } = rig(20);
  const tilts = [0, 0.3, 0.6, 0.9, 1.1];
  const idxs = tilts.map((a, i) => {
    const idx = physics.spawn(-2.2 + i * 0.5, 12.8, i % 2 ? 1 : 0, 1);
    const s = physics.slots[idx];
    s.body.setRotation({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) }, true);
    s.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    s.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    return idx;
  });
  let worstSettled = 0;
  run(physics, pusher, 9, (t) => {
    if (t < 1.5) return; // the glass plates straighten steep coins first
    for (const idx of idxs) {
      const s = physics.slots[idx];
      const c = COIN_TYPES[s.type];
      const nz = axisZ(s.body.rotation());
      const ext = Math.abs(s.body.translation().z) + c.radius * Math.sqrt(Math.max(0, 1 - nz * nz)) + (c.thickness / 2) * nz;
      worstSettled = Math.max(worstSettled, ext - SLOT_DEPTH / 2);
    }
  });
  assert.ok(worstSettled < 0.1, `tilted coins end up inside the slot (overshoot ${worstSettled.toFixed(3)})`);
  const yy = idxs.map((i) => physics.slots[i].body.translation()).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  for (const idx of idxs) assert.ok(physics.slots[idx].body.translation().y < 5, 'every coin kept falling ' + yy.join(' | '));
  ok('coins dropped at 0-63 degree tilts collide with the glass and keep falling', `(overshoot ${worstSettled.toFixed(3)})`);
}

// ---------------------------------------------------------------- helpers for jam rig
function buildJamRig(physics, x = 0) {
  // a narrow passage in the peg field at the corridor of piston D (y = 6.1, pushes from the right):
  // two short ledges leave a 0.44 gap, narrower than the 0.54 coin, so the coin sits across the gap
  const R = physics.R;
  const top = 5.84;
  for (const sx of [-1, 1]) physics.world.createCollider(R.ColliderDesc.cuboid(0.39, 0.06, 0.8).setTranslation(x + sx * 0.61, top - 0.06, 0).setFriction(0.6));
  const idx = physics.spawn(x, top + 0.3, 0, 1);
  const s = physics.slots[idx];
  s.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  s.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  s.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  return idx;
}

// ---------------------------------------------------------------- 6. a coin that is genuinely stuck gets pushed by the automatic pusher
{
  const { physics, pusher } = rig(10);
  const idx = buildJamRig(physics);
  const s = physics.slots[idx];
  let fired = null, flaggedAt = null, prev = s.body.translation(), maxStep = 0, maxSpeed = 0, t0 = 0;
  pusher.onFire = (kind, p) => { if (fired === null) fired = { kind, id: p.def.id, t: t0 }; };
  // phase A: before the stuck time elapses nothing may move
  run(physics, pusher, JAM.time - 0.4, (t) => { t0 = t; });
  assert.equal(pusher.stats.auto, 0, 'does not fire before the stuck time');
  const yRest = s.body.translation().y;
  run(physics, pusher, 18, (t) => {
    t0 = JAM.time - 0.4 + t;
    const p = s.body.translation();
    maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.y - prev.y));
    const v = s.body.linvel();
    maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y, v.z));
    if (flaggedAt === null && pusher.stuckCount > 0) flaggedAt = t0;
    prev = { ...p };
  });
  const p = s.body.translation();
  assert.ok(Math.abs(yRest - 6.0) < 0.12, `coin was resting across the gap (y=${yRest.toFixed(2)})`);
  assert.ok(fired && fired.kind === 'auto', 'automatic pusher fired');
  assert.ok(fired.t >= JAM.time - 0.2, `fired only after the coin was still for ~${JAM.time}s (t=${fired.t.toFixed(2)})`);
  assert.equal(fired.id, 'D', 'the piston whose corridor matches the coin fired');
  assert.ok(p.y < L.binTop, `coin fell into the bin after the push (y=${p.y.toFixed(2)})`);
  assert.equal(physics.slots[idx].state, 1, 'coin still exists (not deleted)');
  assert.ok(maxStep < 0.45, `no teleport (max step ${maxStep.toFixed(2)})`);
  assert.ok(maxSpeed < 16, `not launched (max speed ${maxSpeed.toFixed(1)})`);
  assert.equal(pusher.stats.auto, 1, 'one activation only (no repeated pushing)');
  ok('stuck coin: detected after stillness, pusher D fired once, coin fell to the bin', `(fired at ${fired.t.toFixed(1)}s, max speed ${maxSpeed.toFixed(1)}, max step ${maxStep.toFixed(2)})`);
}

// ---------------------------------------------------------------- 7. coins resting in the collection bin are ignored
{
  const { physics, pusher } = rig(40);
  for (let i = 0; i < 14; i++) physics.spawn(-1.5 + (i % 5) * 0.7, 1.4 + Math.floor(i / 5) * 0.7, i % 2, 1);
  run(physics, pusher, 14);
  assert.equal(pusher.stats.auto, 0, 'no activation for settled coins in the bin');
  assert.ok(pusher.pistons.every((p) => p.phase === 'idle' && p.ext === 0));
  ok('coins resting in the final collection area never trigger the pusher');
}

// ---------------------------------------------------------------- 8. manual assist
{
  const { physics, pusher } = rig(10);
  const idx = buildJamRig(physics);
  const s = physics.slots[idx];
  run(physics, pusher, 0.5);
  const first = pusher.manual();
  assert.equal(first.ok, true, 'manual push accepted');
  const second = pusher.manual();
  assert.equal(second.ok, false, 'cooldown blocks a second press');
  assert.ok(second.wait > JAM.manualCooldown - 1, 'cooldown reported');
  let maxExt = 0, tFall = null;
  run(physics, pusher, 25, (t) => {
    for (const p of pusher.pistons) maxExt = Math.max(maxExt, p.ext);
    if (tFall === null && s.body.translation().y < L.binTop) tFall = t;
  });
  assert.ok(maxExt > 2.4, `plates extended (${maxExt.toFixed(2)})`);
  assert.ok(tFall !== null && tFall < 5, `the manual push alone freed the coin (fell after ${tFall && tFall.toFixed(1)}s)`);
  assert.ok(pusher.pistons.every((p) => p.phase === 'idle' && p.ext === 0), 'all plates returned home');
  assert.equal(pusher.stats.auto, 0, 'no automatic push was needed after the manual one');
  assert.equal(pusher.stats.manual, 4, 'one cycle through every corridor');
  run(physics, pusher, JAM.manualCooldown, null);
  assert.equal(pusher.manual().ok, true, 'usable again after the cooldown');
  ok('manual assist: one cycle, cooldown enforced, coin freed', `(stroke ${maxExt.toFixed(2)})`);
}

// ---------------------------------------------------------------- 9. collection + money through the real Game loop
{
  const { physics, pusher } = rig(130);
  const state = E.newState();
  state.levels.production = 6; state.levels.efficiency = 6; state.levels.value = 4; state.levels.storage = 3;
  const calls = { collect: 0, float: 0 };
  const world = { project: () => ({ x: 0, y: 0 }), particles: { emit() {} }, pulse: 0 };
  const audio = { collect() { calls.collect++; }, tap() {} };
  const ui = { floatText() { calls.float++; }, toast() {} };
  const game = new Game({ state, physics, world, audio, ui, pusher });
  game.setQuality({ limit: 110, rate: 11 });
  const dt = 1 / 60;
  const secs = 120;
  let moneyAt30 = 0;
  for (let i = 0; i < secs * 60; i++) {
    game.update(dt);
    if (i === 30 * 60) moneyAt30 = state.money;
  }
  const expected = E.incomePerSec(state);
  const measured = (state.money - moneyAt30) / (secs - 30);
  const ratio = measured / expected;
  assert.ok(state.money > 0 && calls.collect > 50, 'money earned from collected coins');
  assert.ok(ratio > 0.6 && ratio < 1.25, `measured income ${measured.toFixed(1)}/s vs formula ${expected.toFixed(1)}/s (ratio ${ratio.toFixed(2)})`);
  const bodiesLogical = physics.active.reduce((a, i) => a + physics.slots[i].n, 0) + physics.sucking.reduce((a, i) => a + physics.slots[i].n, 0);
  assert.ok(Math.abs(bodiesLogical - game.stored) < 1e-6, 'storage accounting matches bodies in the machine');
  assert.ok(Math.abs(state.stats.objectsProduced - state.stats.objectsCollected - game.stored) < 1e-4, 'produced = collected + stored');
  assert.ok(game.stored <= E.capacity(state) + 5, 'capacity respected');
  ok('collection + money through the Game loop', `(money ${E.fmtMoney(state.money)}, ratio ${ratio.toFixed(2)}, auto pushes ${pusher.stats.auto})`);
}

console.log(`\n${passed} physics tests passed`);
process.exit(0);
