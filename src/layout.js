// Shared geometry for physics + visuals (world units). Playfield is a thin vertical "pachinko" box
// seen from the front; physics is 2.5D (z locked) so stacking is stable and cheap.

export const L = {
  innerHalfW: 3.0, // inner half width between walls
  wallHalfW: 0.28,
  wallTop: 11.6,
  nozzleY: 10.25,
  nozzleXs: [0, -1.65, 1.65], // [main, automation #1, automation #2]
  binTop: 3.45, // objects below this y are "in the collection bin"
  exit: { x: 2.45, y: 0.9 }, // where the collector grabs objects
  hood: { x: 3.2, y: 1.45 }, // vacuum hood (visual endpoint of the suction animation)
  floor: { y: 0.62, halfLen: 3.2, ang: -0.055, thick: 0.3 },
  paddle: { x: 0, y: 5.05, halfLen: 1.05, maxAng: 0.55 },
};

// staggered peg rows
export const PEGS = [];
[
  { y: 9.0, xs: [-2.4, -1.2, 0, 1.2, 2.4] },
  { y: 8.2, xs: [-1.8, -0.6, 0.6, 1.8] },
  { y: 7.4, xs: [-2.4, -1.2, 0, 1.2, 2.4] },
  { y: 6.6, xs: [-1.8, -0.6, 0.6, 1.8] },
].forEach((r) => r.xs.forEach((x) => PEGS.push({ x, y: r.y })));
export const PEG_R = 0.16;

// slanted funnel plates above the bin: from the wall inwards and down
export const DEFLECTORS = [
  { x: -2.25, y: 4.0, halfLen: 0.95, ang: -0.42, thick: 0.16 },
  { x: 2.25, y: 4.0, halfLen: 0.95, ang: 0.42, thick: 0.16 },
];

export const OBJ_R = 0.27;
