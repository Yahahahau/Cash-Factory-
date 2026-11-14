// Shared geometry for physics + visuals (world units). The playfield is a tall portrait machine seen from the
// front by an orthographic camera. Everything is real 3D: coins are thin cylinders that lie flat on platforms,
// tip over, roll and push each other inside a shallow slot (|z| < Z_HALF) closed by invisible glass plates.

export const Z_HALF = 0.45; // half depth of the playable slot
export const IN_HALF = 3.0; // inner half width (between the two side walls)
export const WALL_W = 0.7; // visible wall thickness (view half width = IN_HALF + WALL_W)
export const VIEW_HALF_W = IN_HALF + WALL_W;
export const VIEW_TOP = 15.2;
export const SLAB_T = 0.9; // platform thickness
export const SLAB_Z = 0.62; // platform half depth (visual + collider)
export const PIT_COLLECT_Y = 1.0; // coins below this height inside the pit are swallowed by the grinder

// Coin definitions. radius + thickness drive BOTH the rendered mesh and the Rapier cylinder collider
// (cylinder axis = local Y for both), so they can never drift apart. Edit these numbers to resize coins.
export const COIN_TYPES = [
  { key: 'bronze', radius: 0.26, thickness: 0.1, segments: 26, face: 'ring', edge: 0x9a4a12, faceColor: 0xe0873a, metal: 0.8, rough: 0.36 },
  { key: 'silver', radius: 0.26, thickness: 0.1, segments: 26, face: 'ring', edge: 0x9aa6bb, faceColor: 0xe8eef8, metal: 0.85, rough: 0.3 },
  { key: 'gold', radius: 0.28, thickness: 0.11, segments: 28, face: 'star', edge: 0xc88a12, faceColor: 0xffd23a, metal: 0.9, rough: 0.28 },
  { key: 'rare', radius: 0.28, thickness: 0.13, segments: 8, face: 'gem', edge: 0x1f8fa6, faceColor: 0x74f6ff, metal: 0.4, rough: 0.18 },
];
export const RARE_COLLIDER_SCALE = 0.95; // octagon: collider uses the mean radius

// piston parts (collider == visual)
export const HEAD = { hy: 0.3, hz: 0.44, hw: 0.14 };

// background / material palettes, one per stage (cycled)
export const PALETTES = [
  { name: 'เทา', edge: 0x050607, mid: 0xd9dce2, tint: 0xffffff, accent: 0xffd23f },
  { name: 'น้ำเงิน', edge: 0x16358f, mid: 0x6f93e6, tint: 0xeef4ff, accent: 0xffd23f },
  { name: 'ม่วง', edge: 0x40298f, mid: 0x9a7de0, tint: 0xf4eeff, accent: 0xffd23f },
  { name: 'ชมพู', edge: 0x80304e, mid: 0xe68fb0, tint: 0xfff0f6, accent: 0xfff06a },
  { name: 'เขียวน้ำทะเล', edge: 0x0b5560, mid: 0x5cd0c4, tint: 0xeafffb, accent: 0xffe066 },
  { name: 'ส้ม', edge: 0x7e3510, mid: 0xf0a560, tint: 0xfff3e4, accent: 0xfff06a },
];

const LETTERS = 'ABCDEF';

// Stage layouts: alternating platforms attached to the left / right wall, each with a wall piston (or belt)
// pushing coins off its free end onto the next platform; the last platform drops coins into the grinder pit.
function zigzag(n, tops, o = {}) {
  const def = {
    n,
    blocks: [], // {x0,x1,y0,y1,kind:'slab'|'belt'|'column'}
    plates: [], // rotated funnel plates {cx,cy,halfLen,ang,thick}
    pistons: [],
    belts: [],
    fans: [],
    magnets: [],
    launchers: [],
    gates: [],
    labels: [], // {id,x,y}
    jam: [], // {name,x0,x1,y0,y1,slab?}
    pipe: { x: -1.9, y: 14.1 },
    spawn: { x: -1.9, y: 13.7 },
    pit: { x0: -IN_HALF, x1: -0.4, collectY: PIT_COLLECT_Y },
    tops,
  };
  tops.forEach((top, i) => {
    const left = i % 2 === 0;
    const x0 = left ? -IN_HALF : -0.4;
    const x1 = left ? 0.9 : IN_HALF;
    const isBelt = (o.belts || []).includes(i);
    def.blocks.push({ x0, x1, y0: top - SLAB_T, y1: top, kind: isBelt ? 'belt' : 'slab', side: left ? 'L' : 'R', top });
    const id = isBelt ? 'conv' + (o.belts.indexOf(i) + 1) : 'pusher' + LETTERS[i];
    const lx = left ? -1.85 : 1.85;
    def.labels.push({ id, x: lx, y: top - 0.45 });
    if (isBelt) {
      def.belts.push({ id, x0, x1, top, dir: left ? 1 : -1, side: left ? 'L' : 'R' });
    } else {
      const wall = left ? -IN_HALF : IN_HALF;
      const dir = left ? 1 : -1;
      const reach = left ? x1 + 0.2 : x0 - 0.2;
      def.pistons.push({ id, side: left ? 'L' : 'R', dir, wall, top, y: top + HEAD.hy + 0.01, maxExt: Math.abs(reach - wall) });
    }
    // the free end of every platform is a lip where coins can teeter: watched by the anti-jam system
    def.jam.push({ name: 'lip' + i, x0: left ? 0.15 : -1.05, x1: left ? 1.05 : -0.15, y0: top - 0.05, y1: top + 0.7, slab: i });
  });
  const last = tops[tops.length - 1];
  def.blocks.push({ x0: -0.4, x1: 0.3, y0: 0, y1: last - SLAB_T, kind: 'column' });
  if (o.hopper) {
    // funnel into the grinder: slot between the plate end and the column is only 0.7 wide
    const x0 = -IN_HALF, y0 = 3.2, x1 = -1.5, y1 = 1.9;
    const dx = x1 - x0, dy = y1 - y0;
    const ang = Math.atan2(dy, dx);
    def.plates.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 - 0.2, halfLen: Math.hypot(dx, dy) / 2, ang, thick: 0.4 });
    // wall sweeper: a piston lying along the funnel plate that sweeps the pile towards the gap and pulls back into the
    // wall on a steady rhythm (independent of upgrades), so the hopper can never silt up
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const off = HEAD.hy + 0.1;
    def.pistons.push({ id: 'sweeper', side: 'L', dir: 1, wall: x0, y: y0 + ny * off, top: y0, ang, maxExt: Math.hypot(dx, dy) - 0.5, rhythm: 3.4 });
    void nx;
    def.jam.push({ name: 'hopper', x0: -1.9, x1: -0.4, y0: PIT_COLLECT_Y + 0.15, y1: 3.0 });
  }
  if (o.fan !== undefined) {
    const top = tops[o.fan];
    def.fans.push({ id: 'fan1', side: 'L', x: -IN_HALF, y: top + 1.15, dir: 1, x1: 1.6, y0: top, y1: top + 1.7 });
    def.labels.push({ id: 'fan1', x: 0.0, y: top - 0.45 });
  }
  if (o.magnet) {
    def.magnets.push({ id: 'magnet1', x: -0.45, y: 3.3, tx: -0.95, ty: 1.2, r: 2.0 });
    def.labels.push({ id: 'magnet1', x: -1.55, y: 4.3 });
  }
  if (o.launcher !== undefined) {
    const i = o.launcher;
    const top = tops[i];
    const left = i % 2 === 0;
    def.launchers.push({ id: 'launch1', dir: left ? 1 : -1, x: left ? 0.62 : -0.12, top, x0: left ? 0.3 : -0.4, x1: left ? 0.9 : 0.0 });
    def.labels.push({ id: 'launch1', x: left ? 1.9 : -1.9, y: top - 0.45 + (left ? 0.0 : 0.0) + 0.0 });
    // move the pusher label of that platform out of the way
    const pl = def.labels.find((l) => l.id === 'pusher' + LETTERS[i]);
    if (pl) pl.y -= 0.0;
    const ll = def.labels.find((l) => l.id === 'launch1');
    ll.y = top - 0.45;
    ll.x = left ? 0.55 : -0.2;
  }
  if (o.gate !== undefined) {
    const next = tops[o.gate];
    def.gates.push({ id: 'gate1', x0: 0.55, x1: 1.75, y0: next + 1.0, y1: next + 1.75 });
  }
  return def;
}

const STAGES = {
  1: () => zigzag(1, [10.6, 6.0]),
  2: () => zigzag(2, [11.9, 9.4, 6.9, 4.4], { hopper: true }),
  3: () => zigzag(3, [12.0, 9.5, 7.0, 4.5], { hopper: true, belts: [2], fan: 0, magnet: true }),
  4: () => zigzag(4, [12.0, 9.5, 7.0, 4.5], { hopper: true, belts: [1], launcher: 2, magnet: true }),
  5: () => zigzag(5, [12.2, 9.8, 7.4, 5.0], { hopper: true, belts: [1], fan: 0, launcher: 2, magnet: true, gate: 3 }),
};

// stage n >= 6 reuses layouts 3..5 with new colours and bigger targets
export function layoutIndex(n) {
  return n <= 5 ? n : 3 + ((n - 3) % 3);
}

const cache = new Map();
export function getStage(n) {
  const li = layoutIndex(n);
  const key = li;
  if (!cache.has(key)) cache.set(key, STAGES[li]());
  const base = cache.get(key);
  return { ...base, n, palette: PALETTES[(n - 1) % PALETTES.length] };
}

// every machine id that can ever appear (ids are global: levels persist across stages)
export const MACHINE_IDS = ['pusherA', 'pusherB', 'pusherC', 'pusherD', 'conv1', 'fan1', 'magnet1', 'launch1'];

export const JAM = {
  speed: 0.12, // m/s linear below which a coin counts as motionless
  spin: 0.6, // rad/s angular
  time: 1.5, // seconds of continuous stillness inside a jam zone before a coin is "stuck"
  grace: 3.5, // seconds a helped coin is left alone
  pistonCooldown: 3.0,
  globalCooldown: 1.2,
  manualCooldown: 8.0, // "ช่วยดัน" button
};
