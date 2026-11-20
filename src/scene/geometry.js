// Geometry builders for the visual overhaul. Pure THREE geometry, no materials.
// Physics never reads anything from here: colliders are still built from layout.js by physics.js.
import * as THREE from 'three';
import { IN_HALF, WALL_W, SLAB_Z } from '../layout.js';

export const HOUSE = {
  top: 17.2, // wall top (well above the view)
  bottom: -2.4, // wall / floor bottom (below the view on every aspect ratio)
  floor: 0.0, // floor surface height (the grinder pit sits on it)
  convex: 0.12, // radius of every outside corner of a platform / plate
  concave: 0.22, // radius of every fillet where a platform meets a wall
  floorFillet: 0.32,
  bevel: 0.055, // front / back edge bevel of the extrusion
  depth: SLAB_Z * 2, // total depth (collider depth of the platforms)
};

// ---------------------------------------------------------------------------------------------
// Rounded polygon. points: [{x,y,part}] in order. Every corner gets an arc tangent to both edges,
// which works the same for convex corners (rounded edge) and concave corners (fillet), so two
// connected sections always blend with one continuous curve and never with an overlapping seam.
// Returns { pts:[{x,y,part}] } (the dense outline) so the caller can make a Shape and map parts.
// ---------------------------------------------------------------------------------------------
export function roundOutline(points, radiusFor, seg = 6) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const A = points[(i - 1 + n) % n], P = points[i], B = points[(i + 1) % n];
    const ax = A.x - P.x, ay = A.y - P.y, bx = B.x - P.x, by = B.y - P.y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    let r = la > 1e-6 && lb > 1e-6 ? radiusFor(P, i, (P.x - A.x) * (B.y - P.y) - (P.y - A.y) * (B.x - P.x) < 0) : 0;
    const d1x = ax / la, d1y = ay / la, d2x = bx / lb, d2y = by / lb;
    const cos = Math.max(-1, Math.min(1, d1x * d2x + d1y * d2y));
    const theta = Math.acos(cos);
    if (!r || theta < 1e-3 || Math.PI - theta < 1e-3) { out.push({ x: P.x, y: P.y, part: P.part }); continue; }
    let t = r / Math.tan(theta / 2);
    const tMax = 0.5 * Math.min(la, lb) * (P.fullA ? 2 : 1);
    if (t > tMax) { t = tMax; r = t * Math.tan(theta / 2); }
    const t1x = P.x + d1x * t, t1y = P.y + d1y * t, t2x = P.x + d2x * t, t2y = P.y + d2y * t;
    let bxs = d1x + d2x, bys = d1y + d2y; const bl = Math.hypot(bxs, bys); bxs /= bl; bys /= bl;
    const h = r / Math.sin(theta / 2);
    const cx = P.x + bxs * h, cy = P.y + bys * h;
    let a1 = Math.atan2(t1y - cy, t1x - cx), a2 = Math.atan2(t2y - cy, t2x - cx);
    let da = a2 - a1;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const steps = Math.max(2, Math.ceil(seg * Math.abs(da) / (Math.PI / 2)));
    for (let k = 0; k <= steps; k++) {
      const a = a1 + (da * k) / steps;
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, part: P.part });
    }
  }
  return out;
}

export function shapeFrom(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i].x, pts[i].y);
  s.closePath();
  return s;
}

// convex polygon clipped to the half plane x >= xw (Sutherland-Hodgman, one edge)
function clipX(poly, xw) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ain = a.x >= xw, bin = b.x >= xw;
    if (ain) out.push(a);
    if (ain !== bin) { const t = (xw - a.x) / (b.x - a.x); out.push({ x: xw, y: a.y + (b.y - a.y) * t }); }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The "house": both side walls, the floor and every platform / funnel plate attached to a wall,
// as ONE outline extruded with a bevel. Platforms grow out of the walls through a fillet, so the
// joins are a single continuous surface (no boxes pushed into each other, no seam, no z-fighting).
// Each platform is a "part": a vertex attribute (part id + anchor on the wall) lets the vertex
// shader extend / retract it from the wall for the stage entrance and exit animations.
// ---------------------------------------------------------------------------------------------
export function buildHouse(def) {
  const W = IN_HALF, O = IN_HALF + WALL_W, H = HOUSE;
  const parts = [{ kind: 'house', anchorX: 0, anchorY: 0, side: 0, order: -1 }];
  const pts = [];
  const add = (x, y, part, extra) => pts.push({ x, y, part, ...extra });

  // collect protrusions per wall
  const left = [], right = [];
  for (const b of def.blocks) {
    if (b.kind !== 'slab') continue;
    const item = { kind: 'slab', b, top: b.y1, bottom: b.y0 };
    (b.side === 'L' ? left : right).push(item);
  }
  for (const p of def.plates) {
    const c = Math.cos(p.ang), s = Math.sin(p.ang), hl = p.halfLen + 0.4, ht = p.thick / 2;
    // the plate's wall end is extended into the wall, then clipped at the wall face
    const ox = p.cx - c * 0.4, oy = p.cy - s * 0.4;
    const corners = [[-hl, ht], [p.halfLen, ht], [p.halfLen, -ht], [-hl, -ht]].map(([u, v]) => ({ x: ox + c * (u + 0.4) - s * v, y: oy + s * (u + 0.4) + c * v }));
    const poly = clipX(corners, -W);
    const ys = poly.filter((q) => Math.abs(q.x + W) < 1e-6).map((q) => q.y);
    left.push({ kind: 'plate', poly, top: Math.max(...ys), bottom: Math.min(...ys) });
  }
  left.sort((a, b) => b.top - a.top);
  right.sort((a, b) => a.bottom - b.bottom);
  let order = 0;
  const newPart = (side, item) => {
    parts.push({ kind: item.kind, side, anchorX: side * W, anchorY: (item.top + item.bottom) / 2, order: order++, top: item.top, block: item.b });
    return parts.length - 1;
  };

  // outer top-left, down the left inner face
  add(-O, H.top, 0); add(-W, H.top, 0);
  for (const it of left) {
    const id = newPart(-1, it);
    if (it.kind === 'slab') {
      add(-W, it.top, id); add(it.b.x1, it.top, id); add(it.b.x1, it.bottom, id); add(-W, it.bottom, id);
    } else {
      // clockwise from the upper wall point
      const poly = it.poly.slice();
      const isWall = (q) => Math.abs(q.x + W) < 1e-6;
      let start = poly.findIndex((q, i) => isWall(q) && Math.abs(q.y - it.top) < 1e-6);
      const seq = [];
      // clockwise == decreasing signed area; choose direction that leaves the wall to the right (+x first)
      const nxt = poly[(start + 1) % poly.length];
      const dir = isWall(nxt) ? -1 : 1;
      for (let k = 0; k < poly.length; k++) seq.push(poly[(start + dir * k + poly.length * 2) % poly.length]);
      for (const q of seq) add(q.x, q.y, id);
    }
  }
  // floor (the left / right floor corners are generous fillets)
  add(-W, H.floor, 0, { floor: true });
  // the support column and the lowest right platform are one "base" piece standing on the floor: it is
  // part of the same outline (fillets at the floor and under the platform) with an enclosed room below
  const col = def.blocks.find((b) => b.kind === 'column');
  const base = col ? right.find((it) => Math.abs(it.bottom - col.y1) < 1e-6 && Math.abs(it.b.x0 - col.x0) < 1e-6) : null;
  let holePts = null;
  if (base) {
    parts.push({ kind: 'base', side: 1, anchorX: W, anchorY: H.floor, order: order++, top: base.top, block: base.b });
    const id = parts.length - 1;
    add(col.x0, H.floor, id, { floor: true });
    add(base.b.x0, base.top, id); add(W, base.top, id);
    holePts = [
      { x: col.x1, y: H.floor, part: id, r: H.floorFillet * 0.8 }, { x: W, y: H.floor, part: id, r: H.floorFillet * 0.8 },
      { x: W, y: base.bottom, part: id, r: H.concave }, { x: col.x1, y: base.bottom, part: id, r: H.concave },
    ];
  } else add(W, H.floor, 0, { floor: true });
  // up the right inner face
  for (const it of right) {
    if (it === base) continue;
    const id = newPart(1, it);
    add(W, it.bottom, id); add(it.b.x0, it.bottom, id); add(it.b.x0, it.top, id); add(W, it.top, id);
  }
  add(W, H.top, 0); add(O, H.top, 0); add(O, H.bottom, 0); add(-O, H.bottom, 0);

  const outline = roundOutline(pts, (P, i, convex) => {
    if (P.y >= H.top - 1e-6 || P.y <= H.bottom + 1e-6) return 0; // off screen
    if (P.floor) return H.floorFillet;
    if (Math.abs(Math.abs(P.x) - W) < 1e-6 && P.part) return H.concave; // fillet into the wall
    return convex ? H.convex : H.concave;
  });

  const shape = shapeFrom(outline);
  let all = outline;
  if (holePts) {
    const hole = roundOutline(holePts, (P) => P.r);
    const path = new THREE.Path();
    path.moveTo(hole[0].x, hole[0].y);
    for (let i = 1; i < hole.length; i++) path.lineTo(hole[i].x, hole[i].y);
    path.closePath();
    shape.holes.push(path);
    all = outline.concat(hole);
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: H.depth - 2 * H.bevel,
    bevelEnabled: true,
    bevelThickness: H.bevel,
    bevelSize: H.bevel,
    bevelOffset: -H.bevel, // keep the side faces exactly on the outline (= the colliders)
    bevelSegments: 3,
    curveSegments: 1,
  });
  geo.translate(0, 0, -(H.depth / 2 - H.bevel));
  assignParts(geo, all, parts);
  geo.computeBoundingSphere();
  return { geometry: geo, parts };
}

// nearest outline point decides the part of every extruded vertex (a vertex is at most one bevel
// width away from the outline point it was generated from)
function assignParts(geo, outline, parts) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const a = new Float32Array(n * 3);
  // bucket the outline on a coarse grid for speed
  const cell = 0.5, grid = new Map();
  const key = (x, y) => ((Math.floor(x / cell) + 1000) << 12) | (Math.floor(y / cell) + 1000);
  outline.forEach((p, i) => { const k = key(p.x, p.y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  for (let v = 0; v < n; v++) {
    const x = pos.getX(v), y = pos.getY(v);
    let best = -1, bd = Infinity;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const list = grid.get(((cx + dx + 1000) << 12) | (cy + dy + 1000));
      if (!list) continue;
      for (const i of list) { const p = outline[i]; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    const part = best >= 0 ? outline[best].part : 0;
    const P = parts[part] || parts[0];
    a[v * 3] = part; a[v * 3 + 1] = P.anchorX; a[v * 3 + 2] = P.anchorY;
  }
  geo.setAttribute('aPart', new THREE.BufferAttribute(a, 3));
}

// ---------------------------------------------------------------------------------------------
// Coins: lathe profile with a raised rim, a recessed face and rounded edges. Same radius and
// thickness as the Rapier cylinder. Groups: 0 = rim band (edge material), 1 = both faces.
// ---------------------------------------------------------------------------------------------
export function coinGeometry(r, t, segments) {
  segments = segments > 12 ? Math.min(segments, 22) : segments; // round coins: 22 sides are plenty at coin size
  const h = t / 2, bev = Math.min(t * 0.32, r * 0.1), rimIn = r * 0.8, rec = t * 0.14;
  // profile from the top centre, over the rim, down the edge, mirrored for the bottom
  const prof = [];
  const P = (x, y, g, smooth = false) => prof.push({ x, y, g, smooth });
  // 11 profile segments: recessed face, raised rim, rounded edge (2 steps per quarter), side, mirrored
  P(0, h - rec, 1); P(rimIn, h - rec, 1); P(rimIn + r * 0.05, h, 1); P(r - bev, h, 1, true);
  P(r - bev * 0.29, h - bev * 0.29, 0, true);
  P(r, h - bev, 0, true);
  P(r, -h + bev, 0, true);
  P(r - bev * 0.29, -h + bev * 0.29, 0, true);
  P(r - bev, -h, 1, true); P(rimIn + r * 0.05, -h, 1); P(rimIn, -h + rec, 1); P(0, -h + rec, 1);
  const pos = [], nor = [], uv = [], idx = [[], []];
  const segN = (i) => { const a = prof[i], b = prof[i + 1]; const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; }; // outward
  let base = 0;
  for (let i = 0; i < prof.length - 1; i++) {
    const a = prof[i], b = prof[i + 1];
    const g = a.g === 1 && b.g === 1 ? 1 : 0;
    const n0 = segN(i);
    const nA = a.smooth && i > 0 ? avg(segN(i - 1), n0) : n0;
    const nB = b.smooth && i + 1 < prof.length - 1 ? avg(n0, segN(i + 1)) : n0;
    for (let s = 0; s <= segments; s++) {
      const th = (s / segments) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      for (const [q, nn] of [[a, nA], [b, nB]]) {
        pos.push(q.x * c, q.y, -q.x * sn);
        nor.push(nn[0] * c, nn[1], -nn[0] * sn);
        if (g === 1) uv.push(0.5 + (q.x * c) / (2 * r), 0.5 + (q.y > 0 ? 1 : -1) * (q.x * sn) / (2 * r));
        else uv.push(s / segments, (q.y + h) / t);
      }
    }
    for (let s = 0; s < segments; s++) {
      const v0 = base + s * 2, v1 = v0 + 1, v2 = v0 + 2, v3 = v0 + 3;
      idx[g].push(v0, v1, v2, v2, v1, v3);
    }
    base += (segments + 1) * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex([...idx[0], ...idx[1]]);
  geo.addGroup(0, idx[0].length, 0);
  geo.addGroup(idx[0].length, idx[1].length, 1);
  return geo;
}
function avg(a, b) { const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1; return [x / l, y / l]; }

// ---------------------------------------------------------------------------------------------
// small shape helpers
// ---------------------------------------------------------------------------------------------
export function roundedRectShape(w, h, r) {
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  const s = new THREE.Shape();
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// rounded box via a beveled extrusion (front/back bevel + rounded outline) centred on the origin
export function roundedBox(w, h, d, r = 0.06, bevel = 0.03, seg = 3) {
  bevel = Math.min(bevel, d / 2 - 0.001);
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), {
    depth: d - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: seg,
  });
  g.translate(0, 0, -(d / 2 - bevel));
  return g;
}

export function stadiumShape(len, h) {
  const r = h / 2, s = new THREE.Shape();
  s.moveTo(-len / 2 + r, -r); s.lineTo(len / 2 - r, -r); s.absarc(len / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-len / 2 + r, r); s.absarc(-len / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  return s;
}

export function gearShape(rOut, rIn, teeth, hole = 0) {
  const s = new THREE.Shape();
  const N = teeth * 4;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k = i % 4;
    const r = k === 1 || k === 2 ? rOut : rIn;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  if (hole) { const p = new THREE.Path(); p.absarc(0, 0, hole, 0, Math.PI * 2, true); s.holes.push(p); }
  return s;
}
