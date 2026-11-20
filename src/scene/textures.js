// Procedural, seamlessly tiling surface textures (colour, normal and roughness maps) drawn on canvases.
// Every surface is generated from one height field, so the colour detail, the lighting relief (normal map)
// and the shine (roughness map) always line up. Textures are cached and shared between stages.
import * as THREE from 'three';

const SIZE = 256; // texels per tile
const cache = new Map();

// ---------- seeded value noise (tileable) ----------
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const w = (a) => ((a % period) + period) % period;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(w(xi), w(yi), seed), b = hash(w(xi + 1), w(yi), seed), c = hash(w(xi), w(yi + 1), seed), d = hash(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, period, seed, oct = 4) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += amp * vnoise(x * f, y * f, period * f, seed + o * 17); n += amp; amp *= 0.5; f *= 2; }
  return s / n;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// ---------- surface recipes: f(u,v) in tile space [0,1) -> { h (height 0..1), c (0..1 shade), r (roughness 0..1) }
const RECIPES = {
  // brushed steel panels with recessed seams and raised rivets (1 tile = 2 world units, 2x2 panels)
  steel(u, v) {
    const pu = u, pv = v;
    const seam = Math.min(pu, 1 - pu, pv, 1 - pv);
    let h = smooth(0.0, 0.012, seam) * 0.9;
    const brush = fbm(u * 2, v * 48, 2, 3, 3);
    const cloud = fbm(u * 3, v * 3, 3, 4, 3);
    let c = 0.86 + (brush - 0.5) * 0.08 + (cloud - 0.5) * 0.06;
    // rivets near panel corners
    for (const [ru, rv] of [[0.035, 0.035], [0.965, 0.035], [0.035, 0.965], [0.965, 0.965]]) {
      const d = Math.hypot(pu - ru, pv - rv);
      if (d < 0.016) { h = Math.max(h, 1.0 - (d / 0.016) ** 2 * 0.35); c = 0.97 - d * 4; }
    }
    if (seam < 0.006) c *= 0.7;
    return { h, c, r: seam < 0.008 ? 0.8 : 0.45 + (brush - 0.5) * 0.12 };
  },
  // glazed ceramic tiles 0.5 world units (4x4 per tile), grout lines, tile-to-tile shade variation
  tile(u, v) {
    const N = 4, tu = u * N, tv = v * N, iu = Math.floor(tu), iv = Math.floor(tv), fu = tu - iu, fv = tv - iv;
    const e = Math.min(fu, 1 - fu, fv, 1 - fv);
    const h = smooth(0.02, 0.08, e);
    const var1 = hash(iu % N, iv % N, 9) - 0.5;
    const glaze = fbm(u * 6, v * 6, 6, 11, 3) - 0.5;
    const grout = e < 0.025;
    return { h, c: grout ? 0.55 : 0.9 + var1 * 0.1 + glaze * 0.05, r: grout ? 0.9 : 0.22 + glaze * 0.1 };
  },
  // arcade panelling: soft hexagon relief
  hex(u, v) {
    const s = 10, gx = u * s, gy = v * s; // 10 cells per tile (period-safe: even row count)
    const row = Math.floor(gy);
    let best = 9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const rr = row + dy, oo = ((rr % 2) + 2) % 2 ? 0.5 : 0;
      const px = Math.floor(gx - oo) + dx + 0.5 + oo, py = rr + 0.5;
      best = Math.min(best, Math.hypot(gx - px, (gy - py) * 0.92));
    }
    const h = (1 - smooth(0.42, 0.5, best)) * 0.6;
    const n = fbm(u * 8, v * 8, 8, 5, 2) - 0.5;
    return { h, c: 0.9 + h * 0.06 + n * 0.03, r: 0.4 + (0.6 - h) * 0.2 };
  },
  // candy: glossy plastic with a soft quilted diamond pattern
  quilt(u, v) {
    const s = 4, a = (u + v) * s, b = (u - v) * s;
    const fa = a - Math.floor(a), fb = b - Math.floor(b);
    const e = Math.min(fa, 1 - fa, fb, 1 - fb);
    const h = smooth(0.0, 0.3, e);
    const stitch = e < 0.03 && Math.floor((fa + fb) * 20) % 2 === 0;
    return { h, c: 0.86 + h * 0.12 - (stitch ? 0.12 : 0), r: 0.18 + (1 - h) * 0.15 };
  },
  // laboratory: smooth painted plaster with horizontal cladding lines every 0.5 units
  plaster(u, v) {
    const N = 4, fv = (v * N) % 1;
    const line = Math.min(fv, 1 - fv);
    const h = smooth(0.0, 0.04, line) * 0.8 + fbm(u * 16, v * 16, 16, 21, 3) * 0.12;
    const n = fbm(u * 5, v * 5, 5, 23, 4) - 0.5;
    return { h, c: 0.86 + n * 0.08 - (line < 0.01 ? 0.18 : 0), r: 0.7 + n * 0.1 };
  },
  // workshop: vertical wooden planks (0.4 units) with grain and gaps
  wood(u, v) {
    const N = 5, pu = u * N, ip = Math.floor(pu), fp = pu - ip;
    const gap = Math.min(fp, 1 - fp);
    const sh = hash(ip % N, 1, 31) - 0.5;
    const warp = fbm(u * 2 + ip * 7.1, v * 2, 2, 41 + ip, 3);
    const grain = Math.sin((fp * 9 + warp * 2.2) * Math.PI * 2) * 0.5 + 0.5;
    const fine = fbm(u * 40, v * 3, 40, 47, 2);
    const knotD = Math.hypot((fp - 0.5) * 2, ((v * 2 + hash(ip, 2, 7)) % 1 - 0.5) * 4);
    const knot = knotD < 0.18 ? (1 - knotD / 0.18) : 0;
    const h = smooth(0.0, 0.05, gap) * (0.85 + grain * 0.1) - knot * 0.1;
    const c = 0.8 + sh * 0.14 + (grain - 0.5) * 0.08 + (fine - 0.5) * 0.08 - knot * 0.2 - (gap < 0.02 ? 0.35 : 0);
    return { h, c, r: 0.62 + (grain - 0.5) * 0.1 };
  },
  // clean painted edge / top surfaces (very fine orange peel)
  paint(u, v) {
    const n = fbm(u * 24, v * 24, 24, 51, 3);
    return { h: n * 0.4, c: 0.95 + (n - 0.5) * 0.05, r: 0.5 + (n - 0.5) * 0.1 };
  },
  // rubber belt tread: ridges across the travel direction
  tread(u, v) {
    const N = 6, f = (u * N) % 1;
    const ridge = smooth(0.15, 0.3, f) * (1 - smooth(0.55, 0.7, f));
    const n = fbm(u * 12, v * 12, 12, 61, 2) - 0.5;
    return { h: ridge, c: 0.55 + ridge * 0.35 + n * 0.05, r: 0.85 - ridge * 0.15 };
  },
};

function build(kind) {
  const f = RECIPES[kind];
  const H = new Float32Array(SIZE * SIZE), C = new Float32Array(SIZE * SIZE), R = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const s = f(x / SIZE, y / SIZE);
    const i = y * SIZE + x;
    H[i] = s.h; C[i] = clamp01(s.c); R[i] = clamp01(s.r);
  }
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = SIZE; return c; };
  const cm = mk(), cn = mk(), cr = mk();
  const im = cm.getContext('2d').createImageData(SIZE, SIZE), inn = cn.getContext('2d').createImageData(SIZE, SIZE), ir = cr.getContext('2d').createImageData(SIZE, SIZE);
  const strength = 3.2;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x, o = i * 4;
    const v = Math.round(C[i] * 255);
    im.data[o] = im.data[o + 1] = im.data[o + 2] = v; im.data[o + 3] = 255;
    const hl = H[y * SIZE + ((x - 1 + SIZE) % SIZE)], hr = H[y * SIZE + ((x + 1) % SIZE)];
    const hu = H[((y - 1 + SIZE) % SIZE) * SIZE + x], hd = H[((y + 1) % SIZE) * SIZE + x];
    let nx = -(hr - hl) * strength, ny = (hd - hu) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    inn.data[o] = Math.round((nx * 0.5 + 0.5) * 255); inn.data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255); inn.data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255); inn.data[o + 3] = 255;
    const rv = Math.round(R[i] * 255);
    ir.data[o] = ir.data[o + 1] = ir.data[o + 2] = rv; ir.data[o + 3] = 255;
  }
  cm.getContext('2d').putImageData(im, 0, 0); cn.getContext('2d').putImageData(inn, 0, 0); cr.getContext('2d').putImageData(ir, 0, 0);
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(cm, true), normalMap: tex(cn, false), roughnessMap: tex(cr, false) };
}

// world units covered by one tile of each recipe
export const TILE = { steel: 2, tile: 2, hex: 2, quilt: 2, plaster: 2, wood: 2, paint: 1, tread: 0.45 * 6 };

export function surface(kind) {
  if (!cache.has(kind)) {
    const set = build(kind);
    for (const t of Object.values(set)) t.repeat.set(1 / TILE[kind], 1 / TILE[kind]); // world-unit UVs -> one tile per TILE units
    cache.set(kind, set);
  }
  return cache.get(kind);
}

// a texture set with its own repeat / offset (for scrolling belts) that shares the canvas images
export function surfaceInstance(kind, repeatU, repeatV) {
  const base = surface(kind);
  const out = {};
  for (const k of ['map', 'normalMap', 'roughnessMap']) {
    const t = base[k].clone();
    t.repeat.set(repeatU, repeatV);
    t.needsUpdate = true;
    out[k] = t;
  }
  return out;
}

export function disposeSurfaces() {
  for (const s of cache.values()) for (const t of Object.values(s)) t.dispose();
  cache.clear();
}
