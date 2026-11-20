// Machine / prop models. Each builder returns a group positioned on its anchor (so entrance animations
// can scale it about a sensible pivot) plus the handles the per-frame update needs. Shared geometries are
// created once (never per stage); per-stage geometries are pushed to `geos` so they are disposed on swap.
// Visual only: colliders still come from layout.js / physics.js / machines.js and are never touched here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { IN_HALF, SLAB_Z, HEAD } from '../layout.js';
import { roundedBox, stadiumShape, gearShape } from './geometry.js';
import { surfaceInstance } from './textures.js';

const shared = new Map();
function once(key, fn) { if (!shared.has(key)) shared.set(key, fn()); return shared.get(key); }
export function disposeShared() { for (const g of shared.values()) g.dispose(); shared.clear(); }

function mesh(geo, mat, shadow = true, receive = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow; m.receiveShadow = receive;
  return m;
}
// a ring of bolt heads, merged into one geometry
function boltGeo() {
  return once('bolt', () => { const g = new THREE.CylinderGeometry(0.035, 0.04, 0.03, 8); g.rotateX(Math.PI / 2); return g; });
}
function bolts(positions, z, mat) {
  const parts = positions.map(([x, y]) => boltGeo().clone().translate(x, y, z));
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return { mesh: mesh(g, mat, false), geo: g };
}

// ---------------------------------------------------------------------------------------------
// Coin dispenser pipe: lathe body with a flared, rounded mouth, a dark interior, a clamp band and bolts
// ---------------------------------------------------------------------------------------------
export function buildPipe(M) {
  const g = new THREE.Group();
  const body = once('pipeBody', () => {
    const p = [
      [0.4, 0.0], [0.58, 0.0], [0.66, 0.03], [0.69, 0.1], [0.69, 0.26], [0.66, 0.33], [0.58, 0.36], [0.52, 0.4],
      [0.5, 0.48], [0.5, 1.12], [0.535, 1.15], [0.535, 1.33], [0.5, 1.36], [0.5, 4.2],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(p, 28);
  });
  const inner = once('pipeInner', () => new THREE.CylinderGeometry(0.4, 0.4, 4.2, 24, 1, true).translate(0, 2.1, 0));
  g.add(mesh(body, M.pipe));
  const inside = mesh(inner, M.interior, false, false);
  inside.material = M.interiorBack || (M.interiorBack = Object.assign(M.interior.clone(), { side: THREE.BackSide }));
  g.add(inside);
  const cap = once('pipeCap', () => new THREE.CircleGeometry(0.4, 24).rotateX(Math.PI / 2).translate(0, 0.9, 0));
  g.add(mesh(cap, M.interiorBack, false, false));
  const boltG = once('pipeBolts', () => {
    const parts = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; parts.push(boltGeo().clone().rotateX(-Math.PI / 2).translate(Math.cos(a) * 0.6, 0.37, Math.sin(a) * 0.6)); }
    const m = mergeGeometries(parts); parts.forEach((q) => q.dispose()); return m;
  });
  g.add(mesh(boltG, M.chrome, false));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Wall piston: housing in the wall, hazard mounting plate on the wall face, chrome rod, steel head with
// a rubber push pad. Group origin = the wall point, rotated with the piston axis (sweeper is tilted).
// ---------------------------------------------------------------------------------------------
export function buildPiston(M, pd, geos) {
  const grp = new THREE.Group();
  const ang = pd.ang || 0;
  grp.position.set(pd.wall, pd.y, 0);
  grp.rotation.z = ang;
  const dir = pd.dir;
  const hy = HEAD.hy, hz = HEAD.hz, hw = HEAD.hw;
  // housing sticking out of the wall face (front is behind the wall's front surface)
  const housing = mesh(once('pHousing', () => roundedBox(0.56, hy * 2 + 0.26, hz * 2 + 0.12, 0.08, 0.04)), M.housing);
  housing.position.set(-dir * 0.16, 0, 0);
  if (dir < 0) housing.rotation.y = Math.PI;
  grp.add(housing);
  const port = mesh(once('pPort', () => roundedBox(0.04, hy * 2 - 0.02, hz * 2 - 0.08, 0.04, 0.01)), M.interior, false);
  port.position.set(dir * 0.121, 0, 0);
  grp.add(port);
  // hazard mounting plate on the visible wall face, with bolts
  if (!ang) {
    const plate = mesh(once('pPlate', () => roundedBox(0.46, 0.84, 0.05, 0.07, 0.02)), M.hazard, false);
    plate.position.set(-dir * 0.36, 0, SLAB_Z + 0.02);
    grp.add(plate);
    const b = bolts([[-0.16, 0.34], [0.16, 0.34], [-0.16, -0.34], [0.16, -0.34]], SLAB_Z + 0.055, M.chrome);
    b.mesh.position.x = -dir * 0.36;
    geos.push(b.geo);
    grp.add(b.mesh);
  }
  // chrome rod (unit length along +x, scaled per frame)
  const rod = mesh(once('pRod', () => new THREE.CylinderGeometry(0.1, 0.1, 1, 16).rotateZ(Math.PI / 2)), M.chrome);
  grp.add(rod);
  // head: steel block + rubber pad on the pushing side + hazard face (exactly the collider box overall)
  const head = new THREE.Group();
  const block = mesh(once('pHead', () => roundedBox(hw * 2 - 0.06, hy * 2, hz * 2, 0.07, 0.04)), M.steel);
  block.position.x = -dir * 0.03;
  head.add(block);
  const pad = mesh(once('pPad', () => roundedBox(0.07, hy * 2 - 0.06, hz * 2 - 0.06, 0.03, 0.02)), M.rubber);
  pad.position.x = dir * (hw - 0.035);
  head.add(pad);
  const face = mesh(once('pFace', () => roundedBox(hw * 2 - 0.12, hy * 2 - 0.12, 0.03, 0.03, 0.01)), M.hazard, false);
  face.position.set(-dir * 0.03, 0, hz - 0.005);
  head.add(face);
  grp.add(head);
  return { group: grp, rod, head, def: pd };
}

// ---------------------------------------------------------------------------------------------
// Conveyor: motor housing on the wall end, rounded belt loop with a scrolling rubber tread, chrome hubs
// ---------------------------------------------------------------------------------------------
export function buildBelt(M, b, geos, texList) {
  const grp = new THREE.Group();
  const left = b.side === 'L';
  const wallX = left ? b.x0 : b.x1;
  grp.position.set(wallX, b.y1, 0);
  const s = left ? 1 : -1;
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const motorW = 0.42, loopH = h * 0.62, loopLen = w - motorW + 0.1;
  const depth = SLAB_Z * 2 - 0.1;
  // belt loop
  const tex = surfaceInstance('tread', 1 / 0.9, 1); // 6 ridges every 0.9 world units along the travel direction
  for (const t of Object.values(tex)) texList.push(t);
  const tread = new THREE.MeshStandardMaterial({ color: 0x3a3f4d, map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap, roughness: 1, metalness: 0.05 });
  const loopGeo = new THREE.ExtrudeGeometry(stadiumShape(loopLen, loopH), { depth: depth - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelOffset: -0.02, bevelSegments: 2, curveSegments: 10 });
  loopGeo.translate(0, 0, -(depth / 2 - 0.02));
  geos.push(loopGeo);
  const loop = mesh(loopGeo, [M.darkSteel, tread]);
  loop.position.set(s * (motorW - 0.1 + loopLen / 2), -loopH / 2, 0);
  grp.add(loop);
  // hubs on the front face, rotating with the belt
  const hubs = [];
  const hubG = once('beltHub', () => {
    const parts = [new THREE.CylinderGeometry(loopH * 0.36, loopH * 0.36, 0.06, 20).rotateX(Math.PI / 2)];
    for (let k = 0; k < 4; k++) parts.push(new THREE.BoxGeometry(loopH * 0.62, 0.05, 0.03).rotateZ((k * Math.PI) / 4).translate(0, 0, 0.035));
    const m = mergeGeometries(parts); parts.forEach((q) => q.dispose()); return m;
  });
  for (const ex of [-1, 1]) {
    const hub = mesh(hubG, M.chrome, false);
    hub.position.set(loop.position.x + ex * (loopLen / 2 - loopH / 2), -loopH / 2, depth / 2 + 0.01);
    grp.add(hub); hubs.push(hub);
  }
  // motor housing with a hazard top strip (its top is flush with the belt surface)
  const motor = mesh(once('beltMotor' + h, () => roundedBox(motorW, h, SLAB_Z * 2, 0.08, 0.05)), M.housing);
  motor.position.set(s * (motorW / 2), -h / 2, 0);
  grp.add(motor);
  const stripe = mesh(once('beltStripe', () => roundedBox(motorW - 0.08, 0.1, 0.03, 0.03, 0.01)), M.hazard, false);
  stripe.position.set(s * (motorW / 2), -0.12, SLAB_Z + 0.005);
  grp.add(stripe);
  const lamp = mesh(once('beltLamp', () => new THREE.SphereGeometry(0.06, 12, 8)), M.lamp, false);
  lamp.position.set(s * (motorW / 2), -h + 0.2, SLAB_Z + 0.02);
  grp.add(lamp);
  return { group: grp, texs: Object.values(tex), dir: left ? 1 : -1, hubs, lamp, mat: tread };
}

// ---------------------------------------------------------------------------------------------
// Air blower on the left wall face: red housing ring, back plate, pitched blades, chrome hub and grille
// ---------------------------------------------------------------------------------------------
export function buildFan(M, fd) {
  const grp = new THREE.Group();
  grp.position.set(-IN_HALF - 0.1, fd.y, SLAB_Z + 0.1);
  grp.add(mesh(once('fanBack', () => new THREE.CylinderGeometry(0.5, 0.5, 0.06, 28).rotateX(Math.PI / 2)), M.housing));
  const ring = mesh(once('fanRing', () => new THREE.TorusGeometry(0.5, 0.075, 10, 32)), M.red);
  ring.position.z = 0.06; grp.add(ring);
  const prop = new THREE.Group();
  prop.position.z = 0.08;
  const blade = once('fanBlade', () => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.05, 0.08); sh.quadraticCurveTo(-0.16, 0.26, -0.07, 0.4); sh.quadraticCurveTo(0.06, 0.44, 0.1, 0.3); sh.quadraticCurveTo(0.08, 0.16, 0.05, 0.08); sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 5 });
  });
  for (let k = 0; k < 4; k++) {
    const piv = new THREE.Group(); piv.rotation.z = (k / 4) * Math.PI * 2;
    const bl = mesh(blade, M.steel, false); bl.rotation.y = 0.45; piv.add(bl); prop.add(piv);
  }
  const hub = mesh(once('fanHub', () => new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2)), M.chrome, false);
  hub.position.z = 0.03; prop.add(hub);
  grp.add(prop);
  const grille = mesh(once('fanGrille', () => {
    const parts = [new THREE.TorusGeometry(0.3, 0.012, 4, 28), new THREE.TorusGeometry(0.16, 0.012, 4, 20)];
    for (let k = 0; k < 4; k++) parts.push(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 4).rotateZ((k * Math.PI) / 4));
    const m = mergeGeometries(parts); parts.forEach((q) => q.dispose()); return m;
  }), M.chrome, false);
  grille.position.z = 0.15; grp.add(grille);
  return { group: grp, prop, def: fd };
}
export function windStreak(M) {
  const m = new THREE.Mesh(once('wind', () => new THREE.PlaneGeometry(0.8, 0.06)), M.wind);
  m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Horseshoe magnet: a real swept U (tube) with chrome pole tips on a mounting plate
// ---------------------------------------------------------------------------------------------
export function buildMagnet(M, md) {
  const grp = new THREE.Group();
  grp.position.set(-0.05, md.y, SLAB_Z + 0.06);
  const u = once('magU', () => {
    const pts = [];
    for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(-0.17, -0.26 + (i / 6) * 0.3, 0));
    for (let i = 1; i < 16; i++) { const a = Math.PI - (i / 16) * Math.PI; pts.push(new THREE.Vector3(Math.cos(a) * 0.17, 0.04 + Math.sin(a) * 0.17, 0)); }
    for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(0.17, 0.04 - (i / 6) * 0.3, 0));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 32, 0.075, 10, false);
  });
  grp.add(mesh(u, M.red));
  const tip = once('magTip', () => new THREE.CylinderGeometry(0.085, 0.085, 0.12, 14));
  for (const x of [-0.17, 0.17]) { const t = mesh(tip, M.chrome); t.position.set(x, -0.3, 0); grp.add(t); }
  const plate = mesh(once('magPlate', () => roundedBox(0.56, 0.62, 0.05, 0.08, 0.02)), M.housing, false);
  plate.position.set(0, -0.03, -0.1); grp.add(plate);
  const glow = new THREE.Mesh(once('magGlow', () => new THREE.RingGeometry(0.4, 0.46, 32)), new THREE.MeshBasicMaterial({ color: 0xff6a6a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.z = 0.12; glow.renderOrder = 2;
  grp.add(glow);
  return { group: grp, glow, def: md };
}

// ---------------------------------------------------------------------------------------------
// Launch pad: chevron plate on the platform top + coil spring in a window on the platform front
// ---------------------------------------------------------------------------------------------
export function buildLauncher(M, ld, geos) {
  const grp = new THREE.Group();
  const cx = (ld.x0 + ld.x1) / 2;
  grp.position.set(cx, ld.top, 0);
  const pw = ld.x1 - ld.x0 - 0.14;
  const padMat = new THREE.MeshStandardMaterial({ map: M.tex.chevron.clone(), roughness: 0.5, metalness: 0.1 });
  padMat.map.needsUpdate = true; padMat.map.wrapS = padMat.map.wrapT = THREE.RepeatWrapping; padMat.map.repeat.set(pw / 0.3, 1);
  const padGeo = roundedBox(pw, SLAB_Z * 1.4, 0.03, 0.05, 0.012);
  padGeo.rotateX(-Math.PI / 2);
  geos.push(padGeo);
  const pad = mesh(padGeo, [padMat, M.darkSteel], false);
  pad.position.set(ld.dir > 0 ? -0.07 : 0.07, 0.012, 0);
  grp.add(pad);
  const frame = mesh(once('lFrame', () => roundedBox(0.42, 0.5, 0.04, 0.06, 0.015)), M.darkSteel, false);
  frame.position.set(0, -0.4, SLAB_Z + 0.015);
  grp.add(frame);
  const spring = new THREE.Group();
  spring.position.set(0, -0.6, SLAB_Z + 0.06);
  const coil = mesh(once('lCoil', () => {
    const pts = []; for (let i = 0; i <= 80; i++) { const a = (i / 80) * Math.PI * 2 * 5; pts.push(new THREE.Vector3(Math.cos(a) * 0.1, (i / 80) * 0.3, Math.sin(a) * 0.04)); }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.018, 5, false);
  }), M.chrome, false);
  spring.add(coil);
  const cap = mesh(once('lCap', () => roundedBox(0.28, 0.05, 0.08, 0.02, 0.01)), M.steel, false);
  cap.position.y = 0.32; spring.add(cap);
  grp.add(spring);
  return { group: grp, mat: padMat, spring, def: ld };
}

// ---------------------------------------------------------------------------------------------
// Multiplier gate: capsule posts with glowing emitters and an energy field (scanlines + edge glow)
// ---------------------------------------------------------------------------------------------
const FIELD_V = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const FIELD_F = `precision highp float; varying vec2 vUv; uniform float uT; uniform float uFlash; uniform vec3 uCol;
void main(){
  float edge = smoothstep(0.42, 0.5, abs(vUv.x - 0.5));
  float scan = 0.5 + 0.5 * sin((vUv.y * 46.0 - uT * 3.0));
  float band = smoothstep(0.0, 0.08, fract(vUv.y * 2.0 - uT * 0.35)) * (1.0 - smoothstep(0.08, 0.2, fract(vUv.y * 2.0 - uT * 0.35)));
  float a = 0.1 + 0.08 * scan + 0.5 * edge + 0.25 * band + uFlash * 0.8;
  gl_FragColor = vec4(uCol * (0.8 + uFlash), clamp(a, 0.0, 1.0));
}`;
export function buildGate(M, gd, geos) {
  const grp = new THREE.Group();
  const w = gd.x1 - gd.x0, h = gd.y1 - gd.y0, cx = (gd.x0 + gd.x1) / 2, cy = (gd.y0 + gd.y1) / 2;
  grp.position.set(cx, cy, 0.4);
  const postGeo = new THREE.CapsuleGeometry(0.055, Math.max(0.1, h - 0.11), 4, 10);
  geos.push(postGeo);
  for (const x of [-w / 2, w / 2]) {
    const p = mesh(postGeo, M.darkSteel); p.position.x = x; grp.add(p);
    for (const y of [-h / 2 + 0.06, h / 2 - 0.06]) {
      const e = mesh(once('gEmit', () => new THREE.SphereGeometry(0.075, 14, 10)), M.emitter, false);
      e.position.set(x, y, 0); grp.add(e);
    }
  }
  const fg = new THREE.PlaneGeometry(w - 0.08, h - 0.1);
  geos.push(fg);
  const u = { uT: { value: 0 }, uFlash: { value: 0 }, uCol: { value: new THREE.Color(0x7dffb0) } };
  const field = new THREE.Mesh(fg, new THREE.ShaderMaterial({ vertexShader: FIELD_V, fragmentShader: FIELD_F, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  field.renderOrder = 2;
  grp.add(field);
  return { group: grp, u, field, def: gd };
}

// ---------------------------------------------------------------------------------------------
// Grinder in the pit: rounded housing, toothed rollers (one merged geometry each), hazard lip, lamps
// ---------------------------------------------------------------------------------------------
export function buildGrinder(M, pit, geos) {
  const grp = new THREE.Group();
  const pw = pit.x1 - pit.x0, cx = (pit.x0 + pit.x1) / 2;
  grp.position.set(cx, 0, 0);
  const hg = roundedBox(pw, 0.9, 0.5, 0.1, 0.04);
  geos.push(hg);
  const housing = mesh(hg, M.housing, false);
  housing.position.set(0, 0.45, -0.25);
  grp.add(housing);
  const lipG = roundedBox(pw, 0.16, 0.14, 0.05, 0.03);
  geos.push(lipG);
  const lip = mesh(lipG, M.hazard, false);
  lip.position.set(0, 0.08, 0.5);
  grp.add(lip);
  const rollerG = once('roller', () => {
    const parts = [new THREE.CylinderGeometry(0.2, 0.2, 0.9, 16).rotateX(Math.PI / 2)];
    for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + row * 0.5;
      parts.push(new THREE.ConeGeometry(0.06, 0.16, 6).rotateZ(a - Math.PI / 2).translate(Math.cos(a) * 0.24, Math.sin(a) * 0.24, (row - 1) * 0.28));
    }
    const m = mergeGeometries(parts); parts.forEach((q) => q.dispose()); return m;
  });
  const rollers = [];
  const n = Math.max(3, Math.round(pw / 0.5));
  for (let i = 0; i < n; i++) {
    const r = mesh(rollerG, i % 2 ? M.darkSteel : M.grinderGreen, false);
    r.position.set(-pw / 2 + (pw * (i + 0.5)) / n, 0.66, 0);
    grp.add(r);
    rollers.push({ obj: r, dir: i % 2 ? -1 : 1 });
  }
  const lamps = [];
  for (const x of [-pw / 2 + 0.12, pw / 2 - 0.12]) {
    const l = mesh(once('gLamp', () => new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), M.lamp, false);
    l.position.set(x, 0.16, 0.56);
    grp.add(l); lamps.push(l);
  }
  return { group: grp, rollers, lamps };
}

// ---------------------------------------------------------------------------------------------
// Backdrop gear (Steel Works ambient), shared geometry
// ---------------------------------------------------------------------------------------------
export function gearGeo() {
  return once('gear', () => new THREE.ExtrudeGeometry(gearShape(1, 0.84, 14, 0.25), { depth: 0.04, bevelEnabled: false, curveSegments: 4 }));
}
