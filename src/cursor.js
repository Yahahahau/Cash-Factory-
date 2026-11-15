// CURSOR AUTO PUSH COIN: a small in-game pointer assistant. It never touches the real OS pointer.
//  * detection : coins that stay almost motionless inside a watched passage (platform lips / hopper) for ECON.cursor.stuckSeconds
//  * targeting : the obstruction that blocks the most coins, never the same one twice in a row
//  * motion    : its own human-like movement controller (min-jerk bell-shaped speed, curved paths, endpoint scatter, overshoot,
//                micro corrections, pauses) - no linear tween / constant speed
//  * physics   : a kinematic helper collider (coins only) strokes the coin; the coin is moved by real contact forces
// All logic is plain ES2015 without DOM access: the host supplies projection + sprite callbacks (also used by headless tests).
import { ECON } from './economy.js';

const cfg = () => ECON.cursor;
export const STATUS = ['READY', 'DETECTING', 'APPROACHING', 'PUSHING', 'ASSISTING', 'RETURNING', 'IDLE'];

// ---------- human motion model ----------
const minJerk = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (10 - 15 * u + 6 * u * u));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export class HumanMotion {
  constructor(rng = Math.random) { this.rng = rng; }
  gauss() { const r = this.rng; return Math.sqrt(-2 * Math.log(1 - r() * 0.999999)) * Math.cos(2 * Math.PI * r()); }
  range(a, b) { return a + (b - a) * this.rng(); }

  // Fitts-like duration for one ballistic movement
  duration(D, speed = 1) {
    const T = (0.17 + 0.115 * Math.log2(D / 26 + 1)) * (1 + (this.rng() - 0.5) * 0.34) / speed;
    return Math.max(0.16, Math.min(1.7, T));
  }

  // returns {segs,total}. opts: {delay, overshoot (probability), correct (bool), speed, scatter}
  plan(from, to, o = {}) {
    const segs = [];
    let t = 0;
    const push = (kind, dur, p0, c, p1) => { segs.push({ kind, t0: t, dur, p0, c, p1 }); t += dur; };
    const D = dist(from, to);
    const delay = o.delay !== undefined ? o.delay : this.range(0.07, 0.19);
    if (delay > 0) push('pause', delay, from, from, from);
    if (D < 1.5) return { segs, total: t, end: from };
    const ux = (to.x - from.x) / D, uy = (to.y - from.y) / D;
    // where the ballistic movement actually lands: scatter grows with distance, sometimes it overshoots
    const sc = o.scatter !== undefined ? o.scatter : Math.min(9, Math.max(1.2, D * 0.035));
    let over = 0;
    if (o.correct !== false && this.rng() < (o.overshoot !== undefined ? o.overshoot : 0.35)) over = D * this.range(0.03, 0.08);
    const land = o.correct === false ? to : { x: to.x + ux * over + this.gauss() * sc, y: to.y + uy * over + this.gauss() * sc };
    const curve = D * this.range(0.04, 0.14) * (this.rng() < 0.5 ? -1 : 1);
    const mid = { x: lerp(from.x, land.x, 0.5) - uy * curve, y: lerp(from.y, land.y, 0.5) + ux * curve };
    push('primary', this.duration(D, o.speed || 1), from, mid, land);
    let cur = land, guard = 0;
    while (o.correct !== false && dist(cur, to) > 0.4 && guard++ < 4) {
      push('pause', this.range(0.05, 0.14), cur, cur, cur);
      const d = dist(cur, to);
      const goal = d > 6 && guard < 3 ? { x: lerp(cur.x, to.x, this.range(0.85, 1)), y: lerp(cur.y, to.y, this.range(0.85, 1)) } : to;
      const cm = { x: lerp(cur.x, goal.x, 0.5) + this.gauss() * 0.6, y: lerp(cur.y, goal.y, 0.5) + this.gauss() * 0.6 };
      push('corr', Math.max(0.08, 0.1 + 0.05 * Math.log2(d / 4 + 1)), cur, cm, goal);
      cur = goal;
    }
    return { segs, total: t, end: cur };
  }
}

export class Track {
  constructor(plan) { this.plan = plan; this.t = 0; this.pos = plan.segs.length ? { ...plan.segs[0].p0 } : { x: 0, y: 0 }; this.phase = 'PREPARATION'; this.done = plan.segs.length === 0; }
  advance(dt) {
    this.t += dt;
    const segs = this.plan.segs;
    if (this.t >= this.plan.total) { const last = segs[segs.length - 1]; this.pos = { ...last.p1 }; this.done = true; this.phase = 'HIDDEN'; return this; }
    let s = segs[0];
    for (let i = 0; i < segs.length; i++) if (this.t >= segs[i].t0) s = segs[i];
    const u = (this.t - s.t0) / s.dur;
    if (s.kind === 'pause') { this.pos = { ...s.p0 }; this.phase = s.t0 === 0 ? 'PREPARATION' : 'PAUSE'; return this; }
    const k = minJerk(u), a = 1 - k;
    // quadratic bezier evaluated at the min-jerk parameter: bell shaped speed, curved path
    this.pos = { x: a * a * s.p0.x + 2 * a * k * s.c.x + k * k * s.p1.x, y: a * a * s.p0.y + 2 * a * k * s.c.y + k * k * s.p1.y };
    this.phase = s.kind === 'corr' ? 'MICRO CORRECTION' : u < 0.18 ? 'INITIAL MOVEMENT' : u < 0.7 ? 'FAST TRAVEL' : 'TARGET APPROACH';
    return this;
  }
}

// ---------- the assistant ----------
export class CursorAssistant {
  // host: {physics, getDef(), project(x,y)->{x,y} (scene css px), getSize()->{w,h}, getState()->{owned,on}, onSprite(s), onStatus(name), rng?}
  constructor(host) {
    this.h = host;
    this.rng = host.rng || Math.random;
    this.motion = new HumanMotion(this.rng);
    this.now = 0;
    this.scanAcc = 0;
    this.cool = 0;
    this.mode = 'idle';
    this.status = 'IDLE';
    this.task = null;
    this.stroke = null;
    this.pos = { x: -100, y: -100 };
    this.visible = false;
    this.sprite = 'arrow';
    this.phase = 'HIDDEN';
    this.stats = { tasks: 0, freed: 0, failed: 0, cancelled: 0, strokes: 0 };
    this.stuckCount = 0;
  }

  _status(s) { if (s !== this.status) { this.status = s; this.h.onStatus && this.h.onStatus(s); } }
  _out() { this.h.onSprite && this.h.onSprite({ visible: this.visible, x: this.pos.x, y: this.pos.y, sprite: this.sprite, phase: this.phase }); }

  // ----- detection -----
  _zoneOf(p) {
    const def = this.h.getDef();
    if (!def) return null;
    for (const z of def.jam) if (p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1) return z;
    return null;
  }

  _scan() {
    const c = cfg(), ph = this.h.physics;
    let stuck = 0;
    for (const idx of ph.active) {
      const s = ph.slots[idx];
      const p = s.body.translation();
      const z = this._zoneOf(p);
      if (!z) { s.cSince = -1; continue; }
      const lv = s.body.linvel(), av = s.body.angvel();
      const slow = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z < c.linSpeed * c.linSpeed && av.x * av.x + av.y * av.y + av.z * av.z < c.angSpeed * c.angSpeed;
      if (!slow) { s.cSince = -1; continue; }
      if (s.cSince < 0) s.cSince = this.now;
      if (this.now - s.cSince >= c.stuckSeconds && s.cIgn <= this.now) stuck++;
    }
    this.stuckCount = stuck;
  }

  _pick() {
    const c = cfg(), ph = this.h.physics;
    let best = null;
    for (const idx of ph.active) {
      const s = ph.slots[idx];
      if (s.cSince < 0 || this.now - s.cSince < c.stuckSeconds || s.cIgn > this.now) continue;
      const p = s.body.translation();
      const z = this._zoneOf(p);
      if (!z) continue;
      // blockage score: how many other coins queue behind / above this one
      let behind = 0;
      for (const j of ph.active) {
        if (j === idx) continue;
        const q = ph.slots[j].body.translation();
        if (Math.abs(q.x - p.x) < 0.9 && q.y > p.y - 0.05 && q.y < p.y + 1.1) behind++;
      }
      const score = (z.slab === undefined ? 3 : 2) + Math.min(6, behind) * 1.5 + Math.min(3, (this.now - s.cSince - c.stuckSeconds) * 0.2);
      if (!best || score > best.score) best = { idx, zone: z, score };
    }
    return best;
  }

  // push direction + stroke geometry for a target, from the coin's current position
  _geometry(idx, zone, attempt) {
    const p = this.h.physics.slots[idx].body.translation();
    let dx, dy;
    if (zone.slab !== undefined) { dx = zone.x0 >= 0 ? 1 : -1; dy = 0.04; } // towards the platform's free end
    else { dx = 1; dy = -0.35; } // hopper: down the funnel plate towards the gap
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    const lift = [0, 0.1, -0.04][attempt % 3];
    let back = 0.56;
    // never start the stroke inside another coin (that would shove it violently): back off along the stroke line
    for (let k = 0; k < 4; k++) {
      const sx = p.x - dx * back, sy = p.y - dy * back + lift;
      let clear = true;
      for (const j of this.h.physics.active) {
        if (j === idx) continue;
        const q = this.h.physics.slots[j].body.translation();
        if (Math.hypot(q.x - sx, q.y - sy) < 0.48) { clear = false; break; }
      }
      if (clear) break;
      back += 0.3;
    }
    const top = zone.slab !== undefined ? this.h.getDef().tops[zone.slab] : -Infinity;
    const start = { x: p.x - dx * back, y: Math.max(p.y - dy * back + lift, top + 0.24) };
    const end = { x: p.x + dx * 0.5, y: Math.max(p.y + dy * 0.5 + lift, top + 0.24) };
    return { dx, dy, start, end, pos: { x: p.x, y: p.y } };
  }

  _resolved(idx, zone) {
    const s = this.h.physics.slots[idx];
    if (s.state !== 1) return true;
    const p = s.body.translation();
    if (!this._zoneOf(p)) return true;
    const lv = s.body.linvel();
    return Math.hypot(lv.x, lv.y) > cfg().resolveSpeed;
  }

  // ----- task flow -----
  _begin(t) {
    this.task = { idx: t.idx, zone: t.zone, attempt: 0, geo: null, p0: this.h.physics.slots[t.idx].body.translation() };
    this.task.p0 = { x: this.task.p0.x, y: this.task.p0.y };
    this.stats.tasks++;
    this.mode = 'prep';
    this.timer = this.motion.range(0.25, 0.6); // preparation pause: the pointer is still off screen
    this._status('DETECTING');
    this.visible = false;
    this.phase = 'PREPARATION';
  }

  _edgeEntry(target) {
    const { w, h } = this.h.getSize();
    const m = 44;
    const d = [target.x, w - target.x, target.y, h - target.y];
    const k = d.indexOf(Math.min(...d));
    const j = this.motion.range(-90, 90);
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    if (k === 0) return { x: -m, y: cl(target.y + j, 12, h - 12) };
    if (k === 1) return { x: w + m, y: cl(target.y + j, 12, h - 12) };
    if (k === 2) return { x: cl(target.x + j, 12, w - 12), y: -m };
    return { x: cl(target.x + j, 12, w - 12), y: h + m };
  }

  _startMove(to, o, next) {
    this.track = new Track(this.motion.plan(this.pos, to, o));
    this.next = next;
    this.mode = 'move';
  }

  _approach() {
    const t = this.task;
    t.geo = this._geometry(t.idx, t.zone, t.attempt);
    const target = this.h.project(t.geo.start.x, t.geo.start.y);
    if (!this.visible) {
      this.pos = this._edgeEntry(target);
      this.visible = true;
      this.sprite = 'arrow';
    }
    this._status('APPROACHING');
    this._startMove(target, { delay: t.attempt === 0 ? this.motion.range(0.08, 0.2) : 0.05, speed: t.attempt === 0 ? 1 : 1.25 }, () => {
      this.mode = 'hover';
      this.timer = this.motion.range(0.12, 0.28);
      this.phase = 'POSITIONING';
    });
  }

  _startStroke() {
    const t = this.task, ph = this.h.physics, c = cfg();
    t.geo = this._geometry(t.idx, t.zone, t.attempt); // coin may have moved while we hovered
    const g = t.geo;
    const L = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);
    const vmax = c.strokeMaxSpeed * (1 + 0.2 * t.attempt);
    this.stroke = { t: 0, dur: Math.max(0.42, (1.875 * L) / vmax), from: g.start, to: g.end, done: false, started: false };
    this.mode = 'stroke';
    this.sprite = 'hand';
    this._status('PUSHING');
    ph.setHelper(true, g.start.x, g.start.y);
    ph.slots[t.idx].body.wakeUp();
    this.stats.strokes++;
  }

  // fixed physics step: advance the stroke in physics time so the push is independent of the frame rate
  stepHelper(dt) {
    const s = this.stroke;
    if (!s || s.done || this.mode !== 'stroke') return;
    s.t += dt;
    const u = Math.min(1, s.t / s.dur), k = minJerk(u);
    const x = lerp(s.from.x, s.to.x, k), y = lerp(s.from.y, s.to.y, k);
    this.h.physics.moveHelper(x, y);
    if (u >= 1) { s.done = true; }
  }

  _helperPos() {
    const h = this.h.physics.helper;
    return h && h.on ? { x: h.x, y: h.y } : null;
  }

  _startExit(cancelled) {
    this.h.physics.helper && this.h.physics.setHelper(false);
    this.stroke = null;
    if (cancelled) this.stats.cancelled++;
    if (!this.visible) { this._finish(); return; }
    const { w, h } = this.h.getSize();
    const p = this.pos;
    const d = [p.x, w - p.x, p.y, h - p.y];
    const k = d.indexOf(Math.min(...d));
    const m = 56, j = this.motion.range(-40, 40);
    const to = k === 0 ? { x: -m, y: p.y + j } : k === 1 ? { x: w + m, y: p.y + j } : k === 2 ? { x: p.x + j, y: -m } : { x: p.x + j, y: h + m };
    this.sprite = 'arrow';
    this._status('RETURNING');
    this._startMove(to, { delay: this.motion.range(0.1, 0.25), correct: false, speed: 1.15 }, () => this._finish());
    this.task = this.task && this.task.keep ? this.task : null;
  }

  _finish() {
    this.visible = false;
    this.mode = 'idle';
    this.task = null;
    this.phase = 'HIDDEN';
    this._status('READY');
  }

  cancel() {
    this.h.physics.helper && this.h.physics.setHelper(false);
    this.stroke = null;
    this.task = null;
    this.visible = false;
    this.mode = 'idle';
    this.phase = 'HIDDEN';
    this._out();
  }

  // ----- per frame -----
  update(dt) {
    const c = cfg();
    const st = this.h.getState();
    const enabled = st.owned && st.on;
    this.now += dt;
    this.scanAcc += dt;
    if (this.scanAcc >= c.scanInterval) { this.scanAcc = 0; if (enabled || this.mode !== 'idle') this._scan(); }

    if (!enabled && this.mode !== 'idle' && this.mode !== 'exit' && !(this.mode === 'move' && this.status === 'RETURNING')) this._startExit(true);

    const t = this.task;
    switch (this.mode) {
      case 'idle':
        if (!enabled) { this._status('IDLE'); this.visible = false; }
        else {
          this._status(this.now < this.cool ? 'IDLE' : 'READY');
          if (this.now >= this.cool && this.stuckCount > 0) { const pick = this._pick(); if (pick) this._begin(pick); }
        }
        break;
      case 'prep':
        this.timer -= dt;
        if (this._resolved(t.idx, t.zone)) { this._startExit(true); break; }
        if (this.timer <= 0) this._approach();
        break;
      case 'move': {
        const was = this.status;
        this.track.advance(dt);
        this.pos = this.track.pos;
        this.phase = this.track.phase;
        if (this.track.done) { const n = this.next; this.next = null; n && n(); break; }
        if (was === 'APPROACHING' && t && this._resolved(t.idx, t.zone)) this._startExit(true);
        break;
      }
      case 'hover':
        this.timer -= dt;
        if (this._resolved(t.idx, t.zone)) { this._startExit(true); break; }
        if (this.timer <= 0) this._startStroke();
        break;
      case 'stroke': {
        const hp = this._helperPos();
        if (hp) this.pos = this.h.project(hp.x, hp.y);
        this.phase = 'CONTACT';
        if (this.stroke.done) {
          this.h.physics.setHelper(false);
          this.mode = 'observe';
          this.timer = c.observeSeconds;
          this._status('ASSISTING');
          this.phase = 'VERIFYING';
          this.sprite = 'arrow';
        }
        break;
      }
      case 'observe': {
        this.timer -= dt;
        const s = this.h.physics.slots[t.idx];
        let freed = s.state !== 1;
        if (!freed) {
          const p = s.body.translation();
          const d = Math.hypot(p.x - t.p0.x, p.y - t.p0.y);
          freed = !this._zoneOf(p) || d >= c.successDisplacement;
        }
        if (freed) {
          s.cIgn = this.now + c.ignoreAfterAssist; s.cSince = -1;
          this.stats.freed++;
          this.cool = this.now + c.taskCooldown;
          this._startExit(false);
        } else if (this.timer <= 0) {
          t.attempt++;
          s.cSince = this.now - c.stuckSeconds; // still stuck: keep it eligible
          if (t.attempt >= c.maxAttempts) {
            s.cIgn = this.now + c.ignoreAfterFail; s.cSince = -1;
            this.stats.failed++;
            this.cool = this.now + c.failCooldown;
            this._startExit(false);
          } else {
            // withdraw a little, recalculate a better contact position and try again
            const back = { x: this.pos.x - t.geo.dx * 38, y: this.pos.y - t.geo.dy * 38 + 10 };
            this._status('APPROACHING');
            this._startMove(back, { delay: 0.12, speed: 1.3, overshoot: 0 }, () => this._approach());
          }
        }
        break;
      }
      default: break;
    }
    this._out();
  }

  get active() { return this.mode !== 'idle'; }
}
