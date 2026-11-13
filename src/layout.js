// Shared geometry for physics + visuals (world units). The playfield is a shallow vertical slot seen from
// the front: real 3D rigid bodies (coins can tilt, roll and tumble) inside a slot slightly narrower than a
// coin's diameter, so coins can never lie flat and the composition stays readable as a 2.5D game.

export const SLOT_DEPTH = 0.4; // free depth between the invisible front and back glass plates

// Coin / token definitions. radius + thickness drive BOTH the rendered mesh and the Rapier cylinder collider,
// so they can never drift apart. Edit these numbers to resize coins.
export const COIN_TYPES = [
  { key: 'silver', radius: 0.27, thickness: 0.11, segments: 28, face: 'ring', edge: 0xb9c3d3, faceColor: 0xdfe7f2, metal: 0.85, rough: 0.34 },
  { key: 'gold', radius: 0.28, thickness: 0.12, segments: 28, face: 'star', edge: 0xc88a12, faceColor: 0xffc82e, metal: 0.9, rough: 0.3 },
  { key: 'medal', radius: 0.33, thickness: 0.15, segments: 30, face: 'crown', edge: 0xb85a12, faceColor: 0xff9e1a, metal: 0.88, rough: 0.32 },
  { key: 'gem', radius: 0.3, thickness: 0.18, segments: 6, face: 'gem', edge: 0x2a9fb0, faceColor: 0x66f7ff, metal: 0.35, rough: 0.2 },
];
// hexagonal gem token: the collider radius is the hexagon's mean radius (between inscribed and circumscribed)
export const GEM_COLLIDER_SCALE = 0.93;

export const L = {
  innerHalfW: 3.0, // inner half width between walls
  wallHalfW: 0.28,
  wallTop: 11.6,
  nozzleY: 10.25,
  nozzleXs: [0, -1.65, 1.65], // [main, automation #1, automation #2]
  binTop: 3.45, // objects below this y are "in the collection bin"
  exit: { x: 2.45, y: 0.9 }, // where the collector grabs objects
  hood: { x: 3.2, y: 1.45 }, // vacuum hood (visual endpoint of the suction animation)
  // thick collider (tunnelling-proof); the visual belt is a thin slab placed on its top surface
  floor: { y: 0.32, halfLen: 3.2, ang: -0.055, thick: 0.9, visThick: 0.3 },
  paddle: { x: 0, y: 5.05, halfLen: 1.05, maxAng: 0.55 },
};

// staggered peg rows
export const PEGS = [];
[
  { y: 9.0, xs: [-1.2, 0, 1.2] }, // no peg next to the walls: a gap narrower than a coin would trap it
  { y: 8.2, xs: [-1.8, -0.6, 0.6, 1.8] },
  { y: 7.4, xs: [-1.2, 0, 1.2] },
  { y: 6.6, xs: [-1.8, -0.6, 0.6, 1.8] },
].forEach((r) => r.xs.forEach((x) => PEGS.push({ x, y: r.y })));
export const PEG_R = 0.16;

// slanted funnel plates above the bin: from the wall inwards and down
export const DEFLECTORS = [
  { x: -2.25, y: 4.0, halfLen: 0.95, ang: -0.42, thick: 0.3 },
  { x: 2.25, y: 4.0, halfLen: 0.95, ang: 0.42, thick: 0.3 },
];
export const DEFLECTOR_VIS_THICK = 0.16;

// ---------------- anti-jam pusher ----------------
// Jam zones: the production passages. A coin that is nearly motionless in one of these is blocked, because
// coins here should always be falling. The final collection bin (y < binTop) is NOT a jam zone: coins rest there.
export const JAM_ZONES = [
  { name: 'peg field', x0: -3.0, x1: 3.0, y0: 5.75, y1: 9.7 },
  { name: 'funnel', x0: -3.0, x1: 3.0, y0: 3.55, y1: 5.75 },
];

// Piston corridors sit exactly between the peg rows so the plate slides between pegs.
// dir: +1 = pushes to the right (mounted on the left wall), -1 = pushes to the left.
export const PISTONS = [
  { id: 'A', y: 8.6, dir: 1, maxStroke: 3.0 },
  { id: 'B', y: 7.8, dir: -1, maxStroke: 3.0 },
  { id: 'C', y: 7.0, dir: 1, maxStroke: 3.0 },
  { id: 'D', y: 6.1, dir: -1, maxStroke: 3.0 },
];
// plate half-height + coin radius (~0.43) is just over half the corridor spacing (0.4), so every coin in
// the peg field touches at least one plate when it sweeps through
// the piston is a solid rod from the wall to the pushing head: nothing can drop in behind the head and be
// squeezed against the wall when it retracts. rodHalf is the collider half-length (mostly hidden inside the wall).
export const PISTON_PLATE = { halfX: 0.15, halfY: 0.15, wallX: 3.0, restFront: 3.01, rodHalf: 1.65 };

export const JAM = {
  speed: 0.1, // m/s (linear) below which a coin counts as motionless
  spin: 0.5, // rad/s angular speed below which a coin counts as motionless
  time: 1.4, // seconds of continuous stillness inside a jam zone before a coin is "stuck"
  grace: 3.0, // seconds a nudged coin is left alone
  pistonCooldown: 3.5, // per-piston rest after a cycle
  globalCooldown: 1.2, // minimum gap between automatic activations
  manualCooldown: 7.0, // seconds before the "ช่วยดันเหรียญ" button can be used again
  reach: 0.55, // a plate physically touches coins within this vertical distance of its corridor
  fallbackReach: 2.4, // coins farther away (funnel) get a gentle nudge impulse from the nearest piston
};
