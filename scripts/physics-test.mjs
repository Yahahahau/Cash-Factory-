// Headless physics / gameplay tests (Rapier WASM in Node). Run: npm run test:physics
import { loadRapier, Physics, colliderSize } from '../src/physics.js';
import { Machines } from '../src/machines.js';
import { Game } from '../src/game.js';
import { getStage, COIN_TYPES, JAM, SLAB_T } from '../src/layout.js';
import * as E from '../src/economy.js';

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
Math.random = rnd;

const R = await loadRapier();
let pass = 0, fail = 0;
const ok = (name, cond, info = '') => { (cond ? pass++ : fail++); console.log((cond ? 'ok   ' : 'FAIL ') + name + (info ? ' (' + info + ')' : '')); };

function rig(stageN, levels = {}) {
  const state = E.newState();
  state.stage = stageN;
  Object.assign(state.machines, levels);
  const phys = new Physics(130);
  const machines = new Machines(phys, () => state);
  const def = getStage(stageN);
  phys.buildStage(def);
  machines.setStage(def);
  return { state, phys, machines, def };
}
function run(r, seconds, each) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    const res = r.phys.step(1 / 60);
    for (const idx of res.collected) r.phys.release(idx);
    if (r.onCollect) for (const idx of res.collected) r.onCollect(idx);
    r.machines.scan(1 / 60);
    if (each) each(i);
  }
}
const pos = (r, idx) => r.phys.slots[idx].body.translation();

// 1. collider == model
{
  let good = true;
  const r = rig(1);
  for (let t = 0; t < COIN_TYPES.length; t++) {
    const idx = r.phys.spawn(0, 14, t, 1);
    const c = r.phys.slots[idx].collider;
    const cs = colliderSize(t);
    const isCyl = c.shapeType() === R.ShapeType.Cylinder;
    good = good && isCyl && Math.abs(c.radius() - cs.radius) < 1e-4 && Math.abs(c.halfHeight() - cs.halfHeight) < 1e-4 && Math.abs(cs.halfHeight * 2 - COIN_TYPES[t].thickness) < 1e-6;
  }
  ok('every coin collider is a Rapier cylinder with the rendered radius / thickness', good);
}

// 2. single coin: falls, lands on the platform on its face (axis ~vertical) at the right height
{
  const r = rig(1);
  const idx = r.phys.spawn(-1.9, 13.7, 1, 1);
  const top = r.def.blocks[0].top;
  run(r, 4);
  const p = pos(r, idx);
  const q = r.phys.slots[idx].body.rotation();
  // coin axis (local Y) in world: y component
  const ay = 1 - 2 * (q.x * q.x + q.z * q.z);
  const c = COIN_TYPES[1];
  const flat = Math.abs(ay) > 0.9;
  const restY = p.y - top;
  ok('single coin lands on the platform', restY > 0 && restY < c.radius + 0.05, 'rest height ' + restY.toFixed(3) + ' axis.y ' + ay.toFixed(2) + (flat ? ' flat' : ' on edge'));
}

// 3. stacking: many coins on a platform never sink into it, and settle (sleep)
{
  const r = rig(1);
  r.machines.def.jam = []; // pure collision test: no anti-jam strokes
  const top = r.def.blocks[0].top;
  const ids = [];
  for (let i = 0; i < 40; i++) ids.push(r.phys.spawn(-2.2 + rnd() * 1.6, 11.2 + (i % 8) * 0.55, i % 4, 1));
  let worst = 9;
  run(r, 8, () => { for (const i of ids) { const p = pos(r, i); if (p.x > -3 && p.x < 0.9 && p.y < top + 0.9) worst = Math.min(worst, p.y - top); } });
  const sleeping = ids.filter((i) => r.phys.slots[i].body.isSleeping()).length;
  ok('40 coins stack on a platform without sinking through it', worst > 0.0, 'lowest centre above surface ' + worst.toFixed(3) + ', sleeping ' + sleeping + '/40');
}

// 4. different impact angles: tilted coins land and settle, none escape the slot
{
  const r = rig(1);
  const top = r.def.blocks[0].top;
  r.machines.def.jam = [];
  let maxZ = 0;
  const ids = [];
  for (let i = 0; i < 24; i++) ids.push(r.phys.spawn(-2.5 + (i % 6) * 0.5, 12 + Math.floor(i / 6) * 0.7, 2, 1));
  run(r, 6, () => { for (const i of ids) maxZ = Math.max(maxZ, Math.abs(pos(r, i).z)); });
  const onPlat = ids.filter((i) => { const p = pos(r, i); return p.y > top && p.y < top + 1.2; }).length;
  ok('coins dropped at random tilts stay inside the 2.5D slot and land', maxZ < 0.5 && onPlat >= 20, 'max |z| ' + maxZ.toFixed(2) + ', landed ' + onPlat);
}

// 5. pusher moves a pile off the platform edge; coins fall to the next platform / grinder
{
  const r = rig(1, { pusherA: 3, pusherB: 3 });
  let collected = 0;
  r.onCollect = () => { collected++; };
  for (let i = 0; i < 10; i++) r.phys.spawn(-2.3 + rnd() * 1.2, 11.5 + i * 0.5, 0, 1);
  run(r, 40);
  ok('wall pistons push coins platform to platform down into the grinder', collected >= 8, 'collected ' + collected + '/10');
}

// 6. coins resting elsewhere on a platform are never touched by the anti-jam system
{
  const r = rig(1, { pusherA: 0, pusherB: 0 });
  const top = r.def.blocks[0].top;
  const idx = r.phys.spawn(-1.5, top + 0.25, 0, 1);
  run(r, 12);
  const p = pos(r, idx);
  ok('settled coins outside jam zones stay put (no automatic pushes)', r.machines.stats.auto === 0 && p.x < -0.8 && p.y > top, 'auto pushes ' + r.machines.stats.auto + ', x ' + p.x.toFixed(2));
}

// 7. stuck coin on the platform lip: detected after stillness, piston strokes, coin falls (no teleport)
{
  const r = rig(1, { pusherA: 0, pusherB: 0 });
  const top = r.def.blocks[0].top;
  const idx = r.phys.spawn(0.5, top + 0.2, 0, 1);
  // make it rest flat and still on the lip
  const s = r.phys.slots[idx];
  s.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  s.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  s.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  let teleport = 0, last = pos(r, idx), t0 = -1;
  run(r, 14, (i) => {
    const p = pos(r, idx);
    if (Math.hypot(p.x - last.x, p.y - last.y) > 0.6) teleport++;
    last = p;
    if (t0 < 0 && r.machines.stats.auto > 0) t0 = i / 60;
  });
  const p = pos(r, idx);
  ok('stuck coin on a lip is freed by a piston stroke and falls', r.machines.stats.auto >= 1 && p.y < top - 0.5 && teleport === 0, 'fired at ' + t0.toFixed(1) + 's, final y ' + p.y.toFixed(2) + ', jumps ' + teleport);
}

// 8. narrow passage: coin resting on a ledge inside the hopper gets an air-burst impulse and drops out
{
  const r = rig(2, {});
  const def = r.def;
  const hop = def.jam.find((z) => z.name === 'hopper');
  // temporary static ledge
  r.phys.world.createCollider(R.ColliderDesc.cuboid(0.3, 0.05, 0.6).setTranslation(-0.85, 2.6, 0).setCollisionGroups((2 << 16) | 1));
  const idx = r.phys.spawn(-0.85, 2.95, 1, 1);
  const s = r.phys.slots[idx];
  s.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  s.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  let jumps = 0, last = pos(r, idx);
  run(r, 12, () => { const p = pos(r, idx); if (p.y > -10 && Math.hypot(p.x - last.x, p.y - last.y) > 0.6) jumps++; last = p; });
  const p = pos(r, idx);
  ok('coin stuck in the hopper is freed by an air burst (real impulse) and falls', r.machines.stats.puffs >= 1 && p.y < 2.3 && jumps === 0, 'puffs ' + r.machines.stats.puffs + ', y ' + p.y.toFixed(2));
}

// 9. manual button: pistons stroke, cooldown enforced
{
  const r = rig(1, {});
  const a = r.machines.manual();
  const b = r.machines.manual();
  let maxExt = 0;
  run(r, 4, () => { for (const p of r.machines.pistons) maxExt = Math.max(maxExt, p.ext); });
  ok('manual push: one cycle on every piston, cooldown blocks a second press', a.ok && !b.ok && r.machines.stats.manual === 2 && maxExt > 2.5, 'max extension ' + maxExt.toFixed(2));
}

// 10. conveyor carries coins
{
  const r = rig(3, { conv1: 4 });
  const belt = r.def.belts[0];
  const idx = r.phys.spawn((belt.x0 + belt.x1) / 2, belt.top + 0.2, 0, 1);
  const x0 = pos(r, idx).x;
  run(r, 2);
  const dx = (pos(r, idx).x - x0) * belt.dir;
  ok('conveyor belt moves a coin along its direction', dx > 0.4, 'moved ' + dx.toFixed(2));
}

// 11. full game loop: money, progress, stage completion
{
  const state = E.newState();
  state.machines.pusherA = 6; state.machines.pusherB = 6;
  state.levels.rate = 6;
  const phys = new Physics(130);
  const machines = new Machines(phys, () => state);
  let stageSetups = 0;
  const world = { pipeKick: 0, pulse: 0, particles: { emit() {} }, project: () => ({ x: 0, y: 0 }), setStage() { stageSetups++; } };
  const audio = { collect() {}, grade() {}, drop() {}, tap() {}, buy() {}, clunk() {} };
  let banners = 0;
  const ui = { floatText() {}, stageBanner() { banners++; }, setStage() {} };
  const game = new Game({ state, physics: phys, machines, world, audio, ui });
  game.setQuality({ limit: 100 });
  game.loadStage(false);
  const cash0 = state.cash;
  for (let i = 0; i < 60 * 40; i++) game.update(1 / 60);
  ok('full loop: coins are collected and pay cash / progress', state.stats.coinsCollected > 15 && state.cash > cash0 + 15, 'collected ' + state.stats.coinsCollected + ', cash ' + Math.floor(state.cash) + ', progress ' + state.progress + ', stage ' + state.stage);
  state.machines.pusherC = 6; state.machines.pusherD = 6;
  state.stage = 1; state.progress = E.stageTarget(1) - 1;
  const gems0 = state.gems, b0 = banners;
  for (let i = 0; i < 60 * 30 && state.stage === 1; i++) game.update(1 / 60);
  ok('stage completes: reward, next stage layout rebuilt, progress reset', state.stage === 2 && state.gems > gems0 && banners === b0 + 1 && stageSetups >= 2 && state.progress < 3 && game.stageDef.n === 2 && game.stageDef.pistons.length === 4, 'stage ' + state.stage + ', gems ' + state.gems + ', pistons ' + game.stageDef.pistons.length);
  for (let i = 0; i < 60 * 60; i++) game.update(1 / 60);
  ok('stage 2 (4 platforms + hopper) also delivers coins to the grinder', state.progress > 5, 'progress ' + state.progress);
  ok('no coin escaped the machine in the full run', game.escaped === 0, 'escaped ' + game.escaped);
  // manual drop button
  game.stageBusy = 0;
  const before = phys.active.length;
  game.charges = 2;
  const dropped = game.drop();
  ok('manual drop spawns a coin with the same physics and spends a charge', dropped && phys.active.length === before + 1 && game.charges === 1);
}

console.log(`\n${pass} physics tests passed${fail ? ', ' + fail + ' FAILED' : ''}`);
process.exit(fail ? 1 : 0);
