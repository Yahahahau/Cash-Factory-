// Reusable animation definitions + a tiny dt-driven timeline. Every animation is data: a duration,
// an easing and an "apply" that writes into a target. Stage themes pick them by name (themes.js).
// Nothing here touches physics or game state; it only moves visuals.

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: (t) => 1 - (1 - t) ** 4,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inBack: (t, s = 1.6) => t * t * ((s + 1) * t - s),
  outBack: (t, s = 1.6) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) * 0.6 + 1),
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

// ---------- timeline ----------
export class Timeline {
  constructor() { this.t = 0; this.items = []; this.end = 0; }
  // run fn(k) for k in 0..1 (eased) from `at` for `dur` seconds; fn(1) is guaranteed on completion
  add(at, dur, fn, ease = Ease.linear) { this.items.push({ at, dur: Math.max(1e-4, dur), fn, ease, done: false, started: false }); this.end = Math.max(this.end, at + dur); return this; }
  // one-shot callback at time `at`
  call(at, fn) { this.items.push({ at, dur: 0, fn, once: true, done: false }); this.end = Math.max(this.end, at); return this; }
  update(dt) {
    this.t += dt;
    for (const it of this.items) {
      if (it.done || this.t < it.at) continue;
      if (it.once) { it.done = true; it.fn(); continue; }
      const k = Math.min(1, (this.t - it.at) / it.dur);
      it.fn(it.ease(k), k);
      if (k >= 1) it.done = true;
    }
  }
  get finished() { return this.t >= this.end && this.items.every((i) => i.done); }
  finish() { this.t = 1e9; this.update(0); } // jumps every item (including ones added while finishing) to its end state
}

// ---------- house part entrance / exit styles (target: Vector4 (sx, sy, dx, dy) of a part) ----------
// each returns { dur, stagger, run(v, k) } where k is 0..1 raw progress
const lerp = (a, b, k) => a + (b - a) * k;
export const PART_ENTER = {
  extrude: { dur: 0.55, stagger: 0.11, run: (v, k) => v.set(Math.max(0, Ease.outBack(k, 1.3)), 1, 0, 0) },
  rise: { dur: 0.6, stagger: 0.1, run: (v, k) => { const e = Ease.outCubic(k); v.set(1, Math.max(0.001, e), 0, lerp(-0.5, 0, e)); } },
  // grows straight up from its anchor (the base piece standing on the floor)
  grow: { dur: 0.6, stagger: 0.1, run: (v, k) => v.set(1, Math.max(0.001, Ease.outBack(k, 1.1)), 0, 0) },
  zip: { dur: 0.7, stagger: 0.08, run: (v, k) => v.set(Math.max(0, Ease.outElastic(k)), 1, 0, 0) },
  pop: { dur: 0.5, stagger: 0.09, run: (v, k) => { const e = Math.max(0.001, Ease.outBack(k, 2.2)); v.set(e, e, 0, 0); } },
  slam: {
    dur: 0.6, stagger: 0.12,
    run: (v, k) => {
      if (k < 0.4) { v.set(Math.max(0.001, Ease.inQuad(k / 0.4)), 1, 0, 0); return; }
      const q = (k - 0.4) / 0.6;
      v.set(1, 1 - 0.14 * Math.sin(q * Math.PI) * (1 - q), 0, 0);
    },
  },
};
export const PART_EXIT = {
  retract: { dur: 0.42, stagger: 0.06, run: (v, k) => v.set(Math.max(0.001, 1 - Ease.inBack(k, 1.2)), 1, 0, 0) },
  sink: { dur: 0.45, stagger: 0.06, run: (v, k) => { const e = Ease.inCubic(k); v.set(1, Math.max(0.001, 1 - e), 0, -0.5 * e); } },
  lower: { dur: 0.45, stagger: 0.06, run: (v, k) => v.set(1, Math.max(0.001, 1 - Ease.inCubic(k)), 0, 0) },
  squash: { dur: 0.4, stagger: 0.05, run: (v, k) => { const e = Ease.inBack(k, 1.4); v.set(Math.max(0.001, 1 - e * 0.3), Math.max(0.001, 1 - e), 0, 0); } },
};

// ---------- object animations (target: Object3D) ----------
export const OBJ = {
  popIn: { dur: 0.42, run: (o, k) => o.scale.setScalar(Math.max(0.0001, Ease.outBack(k, 1.9))) },
  growUp: { dur: 0.5, run: (o, k) => o.scale.set(1, Math.max(0.0001, Ease.outCubic(k)), 1) },
  shrinkOut: { dur: 0.3, run: (o, k) => o.scale.setScalar(Math.max(0.0001, 1 - Ease.inBack(k, 1.4))) },
  sinkDown: { dur: 0.35, run: (o, k) => o.scale.set(1, Math.max(0.0001, 1 - Ease.inCubic(k)), 1) },
};

// ---------- celebration flavours (stage complete): particle recipes in world space ----------
export const CELEBRATE = {
  sparkBurst: (emit, accent) => { emit(0, 9, 1, 36, { color: [accent, 0xffffff, 0xffe066], speed: 5.2, life: 1.0, gravity: 5, size: 0.14, up: 0.9 }); },
  bubbleBurst: (emit, accent) => { for (let i = 0; i < 4; i++) emit(-2 + i * 1.3, 2, 0.8, 8, { color: [accent, 0xffffff], speed: 1.6, life: 1.6, gravity: -3, size: 0.13, up: 0.6, spread: 0.6 }); },
  confetti: (emit, accent) => { for (let i = 0; i < 5; i++) emit(-2.4 + i * 1.2, 14, 1, 8, { color: [accent, 0xff6fb0, 0x7de8ff, 0xffffff], speed: 2.5, life: 2.0, gravity: 2.2, size: 0.12, up: 0.1 }); },
};

// ---------- the full stage transition (exit -> swap -> enter) ----------
export const TRANSITION = {
  celebrate: 0.0, // flash + particles + light pulse
  exitAt: 0.05,
  swapAt: 0.62, // old geometry disposed, new one built (parts at their start pose)
  blendAt: 0.55, blendDur: 0.95, // backdrop wipe
  lightAt: 0.45, lightDur: 1.0,
  enterAt: 0.72,
};
