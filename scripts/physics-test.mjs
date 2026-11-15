// Headless physics / gameplay tests (Rapier WASM in Node). Run: npm run test:physics
import { loadRapier, Physics, colliderSize } from '../src/physics.js';
import { Machines } from '../src/machines.js';
import { Game } from '../src/game.js';
import { getStage, COIN_TYPES, JAM, SLAB_T } from '../src/layout.js';
import * as E from '../src/economy.js';
import { CursorAssistant, HumanMotion, Track } from '../src/cursor.js';

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
  ok('stage completes: reward, next stage layout rebuilt, progress reset', state.stage === 2 && state.gems > gems0 && banners === b0 + 1 && stageSetups >= 2 && state.progress < 3 && game.stageDef.n === 2 && game.stageDef.pistons.filter((q) => q.id !== 'sweeper').length === 4, 'stage ' + state.stage + ', gems ' + state.gems + ', pistons ' + game.stageDef.pistons.length);
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


// 12. stress: maxed machines + very high Coin/s must not silt up the hopper (the sweeper pulls back into the wall rhythmically)
{
  const r = rig(3, { pusherA: 12, pusherB: 12, pusherD: 12, conv1: 10, fan1: 10, magnet1: 10 });
  let collected = 0, peak = 0, hopperPeak = 0;
  r.onCollect = () => { collected++; };
  const hop = r.def.jam.find((z) => z.name === 'hopper');
  run(r, 90, (i) => {
    if (i % 8 === 0 && r.phys.active.length < 110) r.phys.spawn(-1.9 + (rnd() - 0.5) * 0.2, 13.7, rnd() < 0.8 ? 0 : 1, 1);
    if (i % 30 === 0) {
      let n = 0;
      for (const idx of r.phys.active) { const p = pos(r, idx); if (p.x > -3 && p.x < -0.3 && p.y > 1.0 && p.y < 4.2) n++; }
      hopperPeak = Math.max(hopperPeak, n);
      peak = Math.max(peak, r.phys.active.length);
    }
  });
  let leftIn = 0;
  for (const idx of r.phys.active) { const p = pos(r, idx); if (p.x > -3 && p.x < -0.3 && p.y > 1.0 && p.y < 4.2) leftIn++; }
  ok('maxed machines at ~7.5 coins/s: hopper never silts up and coins keep flowing', collected > 300 && hopperPeak < 40, 'collected ' + collected + ', coins in hopper now ' + leftIn + ' (peak ' + hopperPeak + ')');
}

// 13. CURSOR AUTO PUSH COIN: detection, human motion, physical assistance, exit, cancel, failure
function cursorRig(stageN, on = true) {
  const r = rig(stageN);
  r.cs = { owned: true, on };
  r.log = [];
  r.cur = new CursorAssistant({
    physics: r.phys,
    getDef: () => r.def,
    project: (x, y) => ({ x: 200 + x * 60, y: 800 - y * 50 }),
    getSize: () => ({ w: 400, h: 800 }),
    getState: () => r.cs,
    onSprite: (s) => { r.sprite = s; },
    onStatus: (st) => r.log.push(st),
  });
  r.phys.helperUpdate = (dt) => r.cur.stepHelper(dt);
  return r;
}
function cursorRun(r, seconds, each) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    r.phys.step(1 / 60);
    r.cur.update(1 / 60);
    if (each) each(i);
  }
}
{
  // A. a coin resting on the lip of platform 0 (free end, nothing pushing it) is genuinely stuck -> the cursor frees it by contact
  const r = cursorRig(1);
  const top = r.def.tops[0];
  const idx = r.phys.spawn(0.5, top + 0.2, 0, 1, 0, 0);
  let maxV = 0, wasVisible = false, sawEntryOffscreen = false, maxActive = 0, hand = false, prevPos = null, maxJump = 0;
  const startPhase = [];
  cursorRun(r, 3.0);
  ok('stuck detector: a coin that has just landed is NOT stuck yet', r.cur.stats.tasks === 0 && r.sprite && !r.sprite.visible);
  cursorRun(r, 25, () => {
    const lv = r.phys.slots[idx].body.linvel();
    if (r.phys.slots[idx].body.translation().y > top - 0.1) maxV = Math.max(maxV, Math.hypot(lv.x, lv.y)); // while still on the platform (afterwards it just falls)
    const s = r.sprite;
    if (s.visible) {
      if (!wasVisible && (s.x < 0 || s.x > 400 || s.y < 0 || s.y > 800)) sawEntryOffscreen = true;
      wasVisible = true;
      if (s.sprite === 'hand') hand = true;
      if (prevPos) maxJump = Math.max(maxJump, Math.hypot(s.x - prevPos.x, s.y - prevPos.y));
      prevPos = { x: s.x, y: s.y };
    } else prevPos = null;
  });
  const p = pos(r, idx);
  ok('cursor: stuck coin detected, approached, pushed and freed through physics', r.cur.stats.freed >= 1 && (p.y < top - 0.3 || r.phys.slots[idx].state !== 1), `freed ${r.cur.stats.freed}, coin y ${p.y.toFixed(2)} (platform top ${top})`);
  ok('cursor: enters from outside the scene (no pop-in) and uses the hand sprite while pushing', sawEntryOffscreen && hand);
  ok('cursor: leaves the scene and hides completely; helper collider removed', r.sprite && !r.sprite.visible && !r.phys.helper.on && !r.cur.active, r.log.join('>'));
  ok('cursor: pointer never teleports (no jump larger than a fast human flick per frame)', maxJump < 75, 'max ' + maxJump.toFixed(1) + ' px/frame');
  ok('physical help is gentle: coin speed stays below a launch', maxV < 7, 'max ' + maxV.toFixed(2) + ' m/s');
  ok('status flow covers DETECTING, APPROACHING, PUSHING, ASSISTING, RETURNING and ends READY', ['DETECTING', 'APPROACHING', 'PUSHING', 'ASSISTING', 'RETURNING'].every((s) => r.log.includes(s)) && r.log[r.log.length - 1] === 'READY');
}
{
  // B. coins that rest where they are supposed to rest (middle of a platform) never trigger the assistant
  const r = cursorRig(1);
  const top = r.def.tops[0];
  r.phys.spawn(-2.0, top + 0.2, 0, 1, 0, 0);
  r.phys.spawn(-1.2, top + 0.2, 1, 1, 0, 0);
  cursorRun(r, 20);
  ok('cursor ignores naturally resting / stacked coins', r.cur.stats.tasks === 0 && !r.sprite.visible, 'tasks ' + r.cur.stats.tasks);
}
{
  // C. disabled assistant never acts; switching it off mid task makes it leave
  const r = cursorRig(1, false);
  r.phys.spawn(0.5, r.def.tops[0] + 0.2, 0, 1, 0, 0);
  cursorRun(r, 12);
  ok('cursor OFF: no activity at all', r.cur.stats.tasks === 0 && !r.sprite.visible);
  r.cs.on = true;
  let off = false;
  cursorRun(r, 14, () => { if (!off && r.cur.mode === 'move' && r.cur.status === 'APPROACHING') { r.cs.on = false; off = true; } });
  ok('cursor switched OFF while working: abandons the task and exits', off && !r.cur.active && !r.sprite.visible && r.cur.stats.cancelled >= 1);
}
{
  // D. the obstruction resolves before the cursor arrives -> cancel and exit naturally, no stroke
  const r = cursorRig(1);
  const idx = r.phys.spawn(0.5, r.def.tops[0] + 0.2, 0, 1, 0, 0);
  let kicked = false;
  cursorRun(r, 20, () => {
    if (!kicked && r.cur.mode === 'move' && r.cur.status === 'APPROACHING') { r.phys.slots[idx].body.applyImpulse({ x: 0.06, y: 0.05, z: 0 }, true); kicked = true; }
  });
  ok('coin freed before contact: task cancelled, no push, pointer leaves', kicked && r.cur.stats.cancelled >= 1 && r.cur.stats.strokes === 0 && !r.cur.active && !r.sprite.visible, 'strokes ' + r.cur.stats.strokes);
}
{
  // E. an obstruction that cannot be freed: limited attempts, graceful exit, cooldown, never an endless loop
  const r = cursorRig(1);
  const idx = r.phys.spawn(0.5, r.def.tops[0] + 0.2, 0, 1, 0, 0);
  cursorRun(r, 1);
  r.phys.slots[idx].body.setBodyType(R.RigidBodyType.Fixed, true); // welded in place: nothing can move it
  let guard = 0;
  while (r.cur.stats.failed < 1 && guard++ < 60 * 40) cursorRun(r, 1 / 60);
  cursorRun(r, 6);
  const c = E.ECON.cursor;
  ok('unfreeable coin: stops after maxAttempts, exits, and is left alone for a cooldown', r.cur.stats.failed === 1 && r.cur.stats.strokes <= c.maxAttempts && r.cur.stats.tasks === 1 && !r.cur.active, `tasks ${r.cur.stats.tasks} strokes ${r.cur.stats.strokes} failed ${r.cur.stats.failed}`);
  cursorRun(r, 60);
  ok('unfreeable coin: later retries are rate limited (no endless loop)', r.cur.stats.tasks <= 4 && r.cur.stats.strokes <= 3 * 4, `tasks ${r.cur.stats.tasks}`);
}
{
  // F. several stuck coins: only one assistant at a time, the blocking coin with the most coins behind it is served first
  const r = cursorRig(2);
  const top = r.def.tops[0];
  const ids = [];
  for (const x of [0.45, 0.2, -0.05, -0.3]) ids.push(r.phys.spawn(x, top + 0.2, 0, 1, 0, 0));
  r.phys.spawn(-1.5, top + 0.2, 0, 1, 0, 0);
  let maxConc = 0;
  cursorRun(r, 60, () => { maxConc = Math.max(maxConc, r.cur.active ? 1 : 0); });
  ok('several stuck coins: handled one task at a time, at least one freed', r.cur.stats.freed >= 1 && maxConc <= 1, `freed ${r.cur.stats.freed} tasks ${r.cur.stats.tasks}`);
}
{
  // G. human motion model: bell-shaped speed, curved paths, varied durations, corrections, exact arrival
  const hm = new HumanMotion(rnd);
  let curved = 0, corr = 0, over = 0, bell = 0;
  const durs = [];
  for (let i = 0; i < 60; i++) {
    const from = { x: -40, y: 100 + rnd() * 500 }, to = { x: 150 + rnd() * 200, y: 100 + rnd() * 600 };
    const plan = hm.plan(from, to);
    durs.push(plan.total);
    if (plan.segs.some((s) => s.kind === 'corr')) corr++;
    const tr = new Track(plan);
    let prev = { ...from }, vmax = 0, vsum = 0, n = 0, dev = 0, firstV = 0, lastV = 0;
    const D = Math.hypot(to.x - from.x, to.y - from.y);
    const dt = 1 / 120;
    for (let t = 0; t < plan.total + dt; t += dt) {
      tr.advance(dt);
      const v = Math.hypot(tr.pos.x - prev.x, tr.pos.y - prev.y) / dt;
      if (tr.phase === 'FAST TRAVEL' || tr.phase === 'INITIAL MOVEMENT' || tr.phase === 'TARGET APPROACH') { vmax = Math.max(vmax, v); vsum += v; n++; }
      const cr = Math.abs((to.x - from.x) * (from.y - tr.pos.y) - (from.x - tr.pos.x) * (to.y - from.y)) / D;
      dev = Math.max(dev, cr);
      if (tr.pos.x > to.x + D * 0.02) over++;
      prev = { ...tr.pos };
    }
    if (dev > D * 0.015) curved++;
    if (vmax > 1.4 * (vsum / n)) bell++;
    if (Math.hypot(tr.pos.x - to.x, tr.pos.y - to.y) > 0.6) ok('motion ends exactly on the target', false);
  }
  const mean = durs.reduce((a, b) => a + b, 0) / durs.length;
  const sd = Math.sqrt(durs.reduce((a, b) => a + (b - mean) ** 2, 0) / durs.length);
  ok('human motion: bell shaped speed (peak well above mean) on most moves', bell >= 54, bell + '/60');
  ok('human motion: paths are curved, not straight lines', curved >= 54, curved + '/60');
  ok('human motion: durations vary between moves; micro corrections happen', sd > 0.03 && corr >= 20, `sd ${sd.toFixed(3)} corrections ${corr}/60`);
}

console.log(`\n${pass} physics tests passed${fail ? ', ' + fail + ' FAILED' : ''}`);
process.exit(fail ? 1 : 0);
