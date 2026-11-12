import * as THREE from 'three';
import { L, PEGS, PEG_R, DEFLECTORS, OBJ_R } from './layout.js';
import { GRADES } from './economy.js';

const FONT_PIXEL = '"Press Start 2P", monospace';

function pixelTexture(canvas, repeat, smoothMin = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = smoothMin ? THREE.LinearFilter : THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function makePattern(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  if (kind === 'panel') {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = 'rgba(0,0,0,0.10)';
    for (let i = 0; i < 16; i += 2) { g.fillRect(i, i, 2, 2); g.fillRect((i + 8) % 16, i, 2, 2); }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, 0, 16, 1);
    g.fillRect(0, 0, 1, 16);
  } else if (kind === 'wall') {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(0, 7, 16, 1); g.fillRect(0, 15, 16, 1);
    g.fillRect(3, 0, 1, 7); g.fillRect(11, 8, 1, 7);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(0, 0, 16, 1); g.fillRect(0, 8, 16, 1);
  } else if (kind === 'belt') {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = 0; x < 16; x += 4) g.fillRect(x, 0, 2, 16);
  }
  return c;
}

function gradientMap() {
  const d = new Uint8Array([70, 150, 215, 255]);
  const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

class Particles {
  constructor(scene, max) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.p = [];
    this.tmp = new THREE.Color();
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.pos = new THREE.Vector3();
  }

  emit(x, y, z, count, o = {}) {
    const { color = 0xffe066, speed = 3, life = 0.7, gravity = 8, size = 0.12, up = 0.5, spread = 1 } = o;
    const cols = Array.isArray(color) ? color : [color];
    for (let i = 0; i < count && this.p.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.p.push({
        x, y, z: z + (Math.random() - 0.5) * 0.3,
        vx: Math.cos(a) * sp * spread, vy: Math.sin(a) * sp * 0.6 + speed * up, vz: (Math.random() - 0.3) * sp * 0.4,
        life, max: life, g: gravity, size, rot: Math.random() * 6, col: cols[(Math.random() * cols.length) | 0],
      });
    }
  }

  update(dt) {
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const p = this.p[i];
      p.life -= dt;
      if (p.life <= 0) { this.p[i] = this.p[this.p.length - 1]; this.p.pop(); }
    }
    for (const p of this.p) {
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += dt * 4;
      const k = Math.min(1, p.life / p.max * 1.6);
      const sz = p.size * k;
      this.pos.set(p.x, p.y, p.z);
      this.q.setFromAxisAngle(this.s.set(0, 0, 1), p.rot);
      this.s.set(sz, sz, sz);
      this.m.compose(this.pos, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.tmp.set(p.col);
      this.mesh.setColorAt(n, this.tmp);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class World {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.maxBodies = opts.maxBodies;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setClearColor(0x14182b, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x14182b, 38, 80);
    this.camera = new THREE.PerspectiveCamera(32, 0.5, 0.5, 120);
    this.gm = gradientMap();
    this.pal = {
      body: new THREE.Color(GRADES[0].body), accent: new THREE.Color(GRADES[0].accent),
      trim: new THREE.Color(GRADES[0].trim), light: new THREE.Color(GRADES[0].light),
    };
    this.palTarget = {
      body: new THREE.Color(GRADES[0].body), accent: new THREE.Color(GRADES[0].accent),
      trim: new THREE.Color(GRADES[0].trim), light: new THREE.Color(GRADES[0].light),
    };
    this.t = 0;
    this.shake = 0;
    this.pop = 0;
    this.grade = 1;
    this.nozzleCount = 1;
    this.pulse = 0; // collection activity 0..1 for the pipe animation
    this.smokeT = 0;
    this.sparkT = 0;
    this.machine = new THREE.Group();
    this.scene.add(this.machine);
    this._mats();
    this._build();
    this.particles = new Particles(this.scene, opts.particles || 180);
    this._lights();
    this.setGrade(1, false);
    this._camDist = 24;
    this._cy = 6.1;
    this._shakeOff = new THREE.Vector3();
  }

  tm(color, extra = {}) {
    return new THREE.MeshToonMaterial({ color, gradientMap: this.gm, ...extra });
  }

  _mats() {
    const panelTex = pixelTexture(makePattern('panel'), [3, 6]);
    const wallTex = pixelTexture(makePattern('wall'), [10, 12]);
    this.beltTex = pixelTexture(makePattern('belt'), [8, 1]);
    this.m = {
      body: this.tm(0xffffff, { color: this.pal.body.clone() }),
      panel: this.tm(0xffffff, { map: panelTex, color: this.pal.body.clone().multiplyScalar(0.55) }),
      accent: this.tm(this.pal.accent.clone()),
      trim: this.tm(this.pal.trim.clone()),
      dark: this.tm(0x23283f),
      wall: this.tm(0xffffff, { map: wallTex, color: new THREE.Color(0x2a3152) }),
      belt: this.tm(0xffffff, { map: this.beltTex, color: 0x4b5168 }),
      glow: new THREE.MeshBasicMaterial({ color: 0xfff2a0 }),
      peg: this.tm(0xe6ecfa),
      copper: this.tm(0xd9833b),
      gold: this.tm(0xffc82e),
      cyan: new THREE.MeshBasicMaterial({ color: 0x66f7ff }),
    };
  }

  _box(w, h, d, mat, x, y, z, parent = this.machine) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  _signTexture(text, w, h, font, fg, bg) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, 0, w, 2);
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 1);
    return c;
  }

  _build() {
    const M = this.m;
    // --- backdrop wall + floor
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 50), M.wall);
    wall.position.set(0, 10, -4);
    this.scene.add(wall);
    const ground = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 14), this.tm(0x1c2038));
    ground.position.set(0, -1.2, 2);
    this.scene.add(ground);

    // --- main frame
    this._box(6.7, 11.9, 0.3, M.panel, 0, 5.75, -0.55);
    for (const sx of [-1, 1]) {
      this._box(0.56, 12.1, 1.3, M.body, sx * 3.28, 5.8, 0);
      this._box(0.12, 12.1, 0.14, M.trim, sx * 3.0, 5.8, 0.68);
      this._box(0.16, 12.1, 0.16, M.accent, sx * 3.56, 5.8, 0.62);
    }
    // base / conveyor housing
    this._box(7.9, 1.0, 1.7, M.body, 0, -0.1, 0.1);
    this._box(7.9, 0.14, 1.74, M.accent, 0, 0.42, 0.1);
    this.baseSign = this._box(3.6, 0.72, 0.05, new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, -0.1, 0.97);
    // sloped belt (visual)
    const f = L.floor;
    this.belt = new THREE.Mesh(new THREE.BoxGeometry(f.halfLen * 2, f.thick, 1.2), M.belt);
    this.belt.position.set(0, f.y, 0);
    this.belt.rotation.z = f.ang;
    this.machine.add(this.belt);
    // deflectors
    for (const d of DEFLECTORS) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(d.halfLen * 2, d.thick, 1.2), M.trim);
      b.position.set(d.x, d.y, 0); b.rotation.z = d.ang;
      this.machine.add(b);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(d.halfLen * 2, 0.05, 1.22), M.accent);
      stripe.position.set(d.x, d.y + 0.07, 0); stripe.rotation.z = d.ang;
      this.machine.add(stripe);
    }
    // pegs
    const pegGeo = new THREE.CylinderGeometry(PEG_R, PEG_R, 1.2, 10);
    pegGeo.rotateX(Math.PI / 2);
    this.pegs = new THREE.InstancedMesh(pegGeo, M.peg, PEGS.length);
    const mt = new THREE.Matrix4();
    PEGS.forEach((p, i) => { mt.makeTranslation(p.x, p.y, 0); this.pegs.setMatrixAt(i, mt); });
    this.machine.add(this.pegs);
    // paddle
    this.paddle = new THREE.Group();
    this.paddle.position.set(L.paddle.x, L.paddle.y, 0);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(L.paddle.halfLen * 2, 0.18, 1.0), M.copper);
    this.paddle.add(bar);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.1, 10).rotateX(Math.PI / 2), M.trim);
    this.paddle.add(hub);
    for (const sx of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 1.02), M.accent);
      cap.position.x = sx * L.paddle.halfLen;
      this.paddle.add(cap);
    }
    this.machine.add(this.paddle);

    // --- top housing + sign + nozzles
    this._box(7.4, 1.25, 1.5, M.body, 0, 11.65, 0);
    this._box(7.6, 0.18, 1.6, M.accent, 0, 10.98, 0);
    this._box(7.6, 0.18, 1.6, M.trim, 0, 12.32, 0);
    this.signMat = new THREE.MeshBasicMaterial({ map: null });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.8), this.signMat);
    sign.position.set(0, 11.7, 0.77);
    this.machine.add(sign);
    this.nozzles = [];
    L.nozzleXs.forEach((x, i) => {
      const g = new THREE.Group();
      g.position.set(x, 10.9, 0);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 12), M.trim);
      pipe.position.y = 0.25; g.add(pipe);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.22, 0.6, 12), M.accent);
      cone.position.y = -0.25; g.add(cone);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), M.glow);
      glow.position.y = -0.58; g.add(glow);
      g.userData = { glow, scale: i === 0 ? 1 : 0, target: i === 0 ? 1 : 0 };
      g.scale.setScalar(g.userData.scale || 0.0001);
      this.machine.add(g);
      this.nozzles.push(g);
    });
    // blinking lamps
    this.lamps = [];
    for (let i = 0; i < 7; i++) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.12), new THREE.MeshBasicMaterial({ color: 0xff5470 }));
      lamp.position.set(-3.1 + i * 1.03, 12.32, 0.8);
      this.machine.add(lamp);
      this.lamps.push(lamp);
    }
    // gears
    this.gears = [];
    for (const sx of [-1, 1]) {
      const gear = new THREE.Group();
      gear.position.set(sx * 3.55, 9.9, 0.85);
      gear.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.22, 12).rotateX(Math.PI / 2), M.copper));
      for (let k = 0; k < 8; k++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), M.copper);
        const a = (k / 8) * Math.PI * 2;
        tooth.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
        tooth.rotation.z = a;
        gear.add(tooth);
      }
      gear.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8).rotateX(Math.PI / 2), M.dark));
      gear.userData.dir = sx;
      this.machine.add(gear);
      this.gears.push(gear);
    }

    // --- collector hood + pipe on the right
    this.hood = new THREE.Group();
    this.hood.position.set(L.hood.x, L.hood.y, 0.1);
    this.hood.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.38, 0.8, 12).rotateZ(Math.PI / 2), M.trim));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.07, 6, 14).rotateY(Math.PI / 2), M.glow);
    ring.position.x = -0.42;
    this.hood.add(ring);
    this.hoodRing = ring;
    this.machine.add(this.hood);
    this._box(0.42, 7.4, 0.42, M.trim, 3.78, 5.2, 0.1);
    this.pulses = [];
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), M.glow);
      p.position.set(3.78, 1.6, 0.34);
      p.userData.k = i / 6;
      this.machine.add(p);
      this.pulses.push(p);
    }
    // money tank top-right
    this._box(0.9, 0.9, 0.9, M.gold, 3.78, 9.1, 0.1);

    // --- grade-specific features
    this.features = { 2: new THREE.Group(), 3: new THREE.Group(), 4: new THREE.Group(), 5: new THREE.Group(), 6: new THREE.Group() };
    for (const k of Object.keys(this.features)) { this.features[k].visible = false; this.machine.add(this.features[k]); }
    // g2 copper pipes along both inner sides + lights
    for (const sx of [-1, 1]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 8), M.copper);
      pipe.position.set(sx * 3.02, 5.8, 0.55);
      this.features[2].add(pipe);
      for (const y of [2.2, 5.0, 8.0]) {
        const j = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.2, 8), M.trim);
        j.position.set(sx * 3.02, y, 0.55);
        this.features[2].add(j);
      }
    }
    // g3 smokestack
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 2.0, 10), M.dark);
    stack.position.set(-2.5, 13.2, -0.1);
    const stackTop = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.22, 10), M.accent);
    stackTop.position.set(-2.5, 14.25, -0.1);
    this.features[3].add(stack, stackTop);
    // g4 gold trim + spotlights
    for (const sx of [-1, 1]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.1, 12.2, 0.1), M.gold);
      trim.position.set(sx * 3.58, 5.8, 0.72);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), M.gold);
      lamp.position.set(sx * 3.1, 12.65, 0.2);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.15, 6, 14, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      cone.position.set(sx * 2.2, 10, 0.9);
      cone.rotation.z = sx * 0.4;
      cone.userData.sx = sx;
      this.features[4].add(trim, lamp, cone);
      (this.spots = this.spots || []).push(cone);
    }
    // g5 energy beams
    this.beams = [];
    for (const sx of [-1, 1]) {
      const beam = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 11.2),
        new THREE.MeshBasicMaterial({ color: 0x66fff0, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      beam.position.set(sx * 2.7, 5.8, -0.35);
      this.features[5].add(beam);
      this.beams.push(beam);
    }
    // g6 crown
    this.crown = new THREE.Group();
    this.crown.position.set(0, 13.0, 0.2);
    this.crown.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.6), M.gold));
    for (let i = -2; i <= 2; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, i % 2 === 0 ? 0.95 : 0.65, 4), M.gold);
      spike.position.set(i * 0.55, 0.65, 0);
      spike.rotation.y = Math.PI / 4;
      this.crown.add(spike);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), i % 2 ? M.cyan : new THREE.MeshBasicMaterial({ color: 0xff6ad5 }));
      gem.position.set(i * 0.55, 0.0, 0.32);
      this.crown.add(gem);
    }
    this.features[6].add(this.crown);

    // --- falling objects (instanced, one mesh per type)
    const geos = [
      new THREE.CylinderGeometry(OBJ_R, OBJ_R, 0.11, 16).rotateX(Math.PI / 2),
      new THREE.CylinderGeometry(OBJ_R, OBJ_R, 0.15, 16).rotateX(Math.PI / 2),
      new THREE.BoxGeometry(0.5, 0.3, 0.22),
      new THREE.OctahedronGeometry(0.3),
    ];
    const mats = [
      this.tm(0xdfe7f2),
      this.tm(0xffc82e, { emissive: 0x6b4300, emissiveIntensity: 0.6 }),
      this.tm(0xff9e1a, { emissive: 0x6b2c00, emissiveIntensity: 0.55 }),
      new THREE.MeshBasicMaterial({ color: 0x66f7ff }),
    ];
    this.objMeshes = geos.map((g, i) => {
      const im = new THREE.InstancedMesh(g, mats[i], this.maxBodies);
      im.frustumCulled = false;
      im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(im);
      return im;
    });
    // little rim on the coins (second smaller disc) for a minted look
    this.coinRim = new THREE.InstancedMesh(new THREE.CylinderGeometry(OBJ_R * 0.62, OBJ_R * 0.62, 0.135, 12).rotateX(Math.PI / 2), this.tm(0xaab6c8), this.maxBodies);
    this.coinRim.frustumCulled = false; this.coinRim.count = 0; this.coinRim.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.coinRim);
    this._typeCount = [0, 0, 0, 0];
    this.refreshTextures();
  }

  _lights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5078, 1.55));
    const key = new THREE.DirectionalLight(0xfff2d8, 2.2);
    key.position.set(-6, 14, 18);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8ab4ff, 0.6);
    fill.position.set(8, 4, 10);
    this.scene.add(fill);
  }

  refreshTextures() {
    const sign = this._signTexture('PIXEL CASH', 256, 40, `22px ${FONT_PIXEL}`, '#ffe066', '#1b1f36');
    if (this.signMat.map) this.signMat.map.dispose();
    this.signMat.map = pixelTexture(sign);
    this.signMat.needsUpdate = true;
    this.updateGradePlate();
  }

  updateGradePlate() {
    const c = this._signTexture(`GRADE ${this.grade}`, 192, 40, `bold 18px ${FONT_PIXEL}`, '#ffe066', '#1b1f36');
    const mat = this.baseSign.material;
    if (mat.map) mat.map.dispose();
    mat.map = pixelTexture(c, null, true);
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  }

  setGrade(g, animate) {
    const prev = this.grade;
    this.grade = g;
    const def = GRADES[g - 1];
    this.palTarget.body.set(def.body);
    this.palTarget.accent.set(def.accent);
    this.palTarget.trim.set(def.trim);
    this.palTarget.light.set(def.light);
    if (!animate) for (const k of Object.keys(this.pal)) this.pal[k].copy(this.palTarget[k]);
    for (const k of Object.keys(this.features)) {
      const on = g >= Number(k);
      const grp = this.features[k];
      if (on && !grp.visible && animate) { grp.userData.pop = 0; }
      grp.visible = on;
      if (!animate) grp.scale.setScalar(1);
    }
    this.updateGradePlate();
    if (animate && g !== prev) {
      this.shake = 1;
      this.pop = 1;
      this.particles.emit(0, 8, 1.2, 70, { color: [0xffe066, 0xff6ad5, 0x66f7ff, 0xffffff, 0x7dff8a], speed: 7, life: 1.3, gravity: 6, size: 0.2, up: 1.4 });
    }
  }

  setNozzles(n, animate = true) {
    this.nozzleCount = n;
    this.nozzles.forEach((g, i) => {
      g.userData.target = i < n ? 1 : 0;
      if (!animate) { g.userData.scale = g.userData.target; g.scale.setScalar(Math.max(0.0001, g.userData.scale)); }
    });
  }

  nozzleX(i) {
    return L.nozzleXs[i];
  }

  // keep the whole playfield visible for any viewport, leaving room under the HUD overlay
  fit(cssW, cssH, aspect, hudFrac = 0) {
    const cam = this.camera;
    cam.aspect = aspect;
    const fov = THREE.MathUtils.degToRad(cam.fov);
    const t = Math.tan(fov / 2);
    hudFrac = Math.max(0, Math.min(0.45, hudFrac));
    const needH = 15.4; // machine height incl. crown/smokestack + base (world units)
    const needW = 9.6; // incl. side pipe
    const dV = needH / (1 - hudFrac) / 2 / t;
    const dH = needW / 2 / (t * aspect);
    this._camDist = Math.max(dV, dH);
    const visH = 2 * this._camDist * t;
    this._cy = 6.1 + (visH * hudFrac) / 2; // looking higher pushes the machine below the HUD
    cam.updateProjectionMatrix();
    this._placeCam(0);
  }

  _placeCam(shakeAmt) {
    const d = this._camDist;
    const pitch = 0.1;
    const cy = this._cy;
    const sx = (Math.random() - 0.5) * shakeAmt;
    const sy = (Math.random() - 0.5) * shakeAmt;
    this.camera.position.set(sx, cy + Math.sin(pitch) * d * 0.5 + sy, Math.cos(pitch) * d);
    this.camera.lookAt(0, cy, 0);
  }

  project(x, y, z, w, h) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  }

  unprojectToPlane(nx, ny) {
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(this.camera);
    const dir = v.sub(this.camera.position).normalize();
    const t = -this.camera.position.z / dir.z;
    return { x: this.camera.position.x + dir.x * t, y: this.camera.position.y + dir.y * t };
  }

  // write instance matrices for active objects
  syncObjects(physics) {
    const counts = [0, 0, 0, 0];
    const arrs = this.objMeshes.map((m) => m.instanceMatrix.array);
    const rim = this.coinRim.instanceMatrix.array;
    let rc = 0;
    const put = (arr, i, x, y, z, a) => {
      const c = Math.cos(a), s = Math.sin(a), o = i * 16;
      arr[o] = c; arr[o + 1] = s; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = -s; arr[o + 5] = c; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = 1; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
    };
    for (const idx of physics.active) {
      const s = physics.slots[idx];
      const p = s.body.translation();
      const q = s.body.rotation();
      const a = 2 * Math.atan2(q.z, q.w);
      put(arrs[s.type], counts[s.type]++, p.x, p.y, s.zj, a);
      if (s.type === 0) put(rim, rc++, p.x, p.y, s.zj, a);
    }
    // objects being sucked into the collector: arc to the hood, shrinking
    for (const idx of physics.sucking) {
      const s = physics.slots[idx];
      const k = Math.min(1, s.st);
      const e = k * k * (3 - 2 * k);
      const x = s.sx + (L.hood.x - s.sx) * e;
      const y = s.sy + (L.hood.y - s.sy) * e + Math.sin(k * Math.PI) * 0.5;
      const sc = 1 - 0.55 * e;
      const t = s.type;
      const o = counts[t]++;
      put(arrs[t], o, x, y, 0.15, s.st * 14);
      const m = arrs[t];
      for (let r = 0; r < 3; r++) { m[o * 16 + r * 4] *= sc; m[o * 16 + r * 4 + 1] *= sc; m[o * 16 + r * 4 + 2] *= sc; }
    }
    this.objMeshes.forEach((m, i) => { m.count = counts[i]; m.instanceMatrix.needsUpdate = true; });
    this.coinRim.count = rc;
    this.coinRim.instanceMatrix.needsUpdate = true;
  }

  update(dt, physics, state) {
    this.t += dt;
    // palette easing
    const k = 1 - Math.pow(0.0008, dt);
    for (const key of Object.keys(this.pal)) this.pal[key].lerp(this.palTarget[key], k);
    this.m.body.color.copy(this.pal.body);
    this.m.panel.color.copy(this.pal.body).multiplyScalar(0.5);
    this.m.accent.color.copy(this.pal.accent);
    this.m.trim.color.copy(this.pal.trim);
    // mechanical parts
    this.paddle.rotation.z = physics.paddleAngle;
    this.beltTex.offset.x -= dt * 0.55 * (0.4 + this.pulse);
    for (const g of this.gears) g.rotation.z += dt * 1.2 * g.userData.dir;
    this.lamps.forEach((l, i) => {
      const on = Math.sin(this.t * 4 + i * 0.9) > (this.grade >= 2 ? -0.2 : 0.6);
      l.material.color.setHex(on ? [0xff5470, 0xffe066, 0x66f7ff][i % 3] : 0x40283a);
    });
    // nozzles pop in
    for (const g of this.nozzles) {
      const u = g.userData;
      u.scale += (u.target - u.scale) * Math.min(1, dt * 9);
      g.scale.setScalar(Math.max(0.0001, u.scale));
      u.glow.material.color.setHex(0xfff2a0);
    }
    // feature pop-in
    for (const key of Object.keys(this.features)) {
      const grp = this.features[key];
      if (grp.visible && grp.userData.pop !== undefined && grp.userData.pop < 1) {
        grp.userData.pop = Math.min(1, grp.userData.pop + dt * 2.2);
        const p = grp.userData.pop;
        grp.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.18 - (1 - p) * 0.6 * (1 - p));
      }
    }
    // collector ring + pipe pulses
    this.pulse = Math.max(0, this.pulse - dt * 2.2);
    this.hoodRing.scale.setScalar(1 + this.pulse * 0.25);
    this.hoodRing.material.color.setHex(this.pulse > 0.15 ? 0xffffff : 0xfff2a0);
    this.pulses.forEach((p) => {
      p.userData.k = (p.userData.k + dt * (0.25 + this.pulse * 1.2)) % 1;
      p.position.y = 1.7 + p.userData.k * 7.0;
      p.scale.setScalar(0.4 + 0.6 * (1 - Math.abs(p.userData.k - 0.5) * 2));
    });
    // grade effects
    if (this.grade >= 3) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.32;
        this.particles.emit(-2.5, 14.4, -0.1, 1, { color: [0xdfe3ee, 0xb7bdd0], speed: 0.9, life: 1.9, gravity: -0.6, size: 0.48, up: 1.2, spread: 0.2 });
      }
    }
    if (this.grade >= 4 && this.spots) this.spots.forEach((s, i) => { s.rotation.z = s.userData.sx * (0.4 + Math.sin(this.t * 0.9 + i * 2) * 0.16); });
    if (this.grade >= 5) this.beams.forEach((b, i) => { b.material.opacity = 0.14 + 0.1 * Math.sin(this.t * 2.2 + i * 1.7); });
    if (this.grade >= 5) {
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        this.sparkT = this.grade >= 6 ? 0.07 : 0.16;
        const x = (Math.random() - 0.5) * 5.6;
        this.particles.emit(x, 9 + Math.random() * 2, 0.9, 1, { color: this.grade >= 6 ? [0xfff6a8, 0xffc82e, 0xffffff] : [0x66fff0, 0xff6ad5, 0xffffff], speed: 0.8, life: 0.9, gravity: this.grade >= 6 ? 3 : 0.5, size: 0.12, up: 0.1 });
      }
    }
    if (this.grade >= 6) this.crown.position.y = 13.0 + Math.sin(this.t * 2) * 0.12;
    // machine pop + camera shake
    this.pop = Math.max(0, this.pop - dt * 2.4);
    const sc = 1 + Math.sin(this.pop * Math.PI) * 0.035;
    this.machine.scale.set(sc, sc, sc);
    this.machine.position.y = (1 - sc) * 5.5;
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this._placeCam(this.shake * 0.45);
    this.particles.update(dt);
  }

  dispose() {
    this.renderer.dispose();
  }
}
