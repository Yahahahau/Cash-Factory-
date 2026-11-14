import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { IN_HALF, WALL_W, SLAB_Z, Z_HALF, VIEW_HALF_W, VIEW_TOP, COIN_TYPES, HEAD } from './layout.js';

const FONT_PIXEL = '"Press Start 2P", monospace';

// ---------- small canvas helpers ----------
function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = opts.nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// platform front: soft vertical light gradient + slim darker outline on the lower / side edges
function slabFrontTex() {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.5, '#eef3fc');
    gr.addColorStop(1, '#bfcbe4');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, 0, w, 2);
    g.fillStyle = 'rgba(70,86,128,0.55)'; g.fillRect(0, h - 3, w, 3);
    g.fillStyle = 'rgba(70,86,128,0.28)'; g.fillRect(0, 0, 2, h); g.fillRect(w - 2, 0, 2, h);
    g.fillStyle = 'rgba(70,86,128,0.05)';
    for (let i = 0; i < 40; i++) g.fillRect(((i * 37) % w) | 0, ((i * 19) % (h - 6)) | 0, 2, 2);
  });
}
function slabTopTex() {
  return canvasTex(32, 32, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(1, '#e3eaf7');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(70,86,128,0.35)'; g.fillRect(0, h - 2, w, 2);
  });
}
function slabSideTex() {
  return canvasTex(16, 16, (g, w, h) => {
    g.fillStyle = '#dbe3f3';
    g.fillRect(0, 0, w, h);
  });
}
function wallTex() {
  return canvasTex(64, 16, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#c4cfe6');
    gr.addColorStop(0.35, '#ffffff');
    gr.addColorStop(1, '#eaf0fb');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}
function beltTopTex() {
  return canvasTex(32, 16, (g, w, h) => {
    g.fillStyle = '#2a3146';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#58617f';
    for (let x = 0; x < w; x += 8) { g.fillRect(x, 0, 4, h); }
    g.fillStyle = '#7a86ab';
    for (let x = 0; x < w; x += 8) { g.fillRect(x, 0, 4, 2); }
  }, { repeat: true, nearest: true });
}
function hazardTex() {
  return canvasTex(32, 32, (g, w, h) => {
    g.fillStyle = '#ffd21f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1d24';
    for (let i = -h; i < w + h; i += 16) {
      g.beginPath(); g.moveTo(i, h); g.lineTo(i + 8, h); g.lineTo(i + 8 + h, 0); g.lineTo(i + h, 0); g.closePath(); g.fill();
    }
  }, { repeat: true, nearest: true });
}
function chevronTex() {
  return canvasTex(32, 32, (g, w, h) => {
    g.fillStyle = '#ff9e1a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff2b0'; g.lineWidth = 5; g.lineJoin = 'miter';
    for (let y = -4; y < h; y += 14) { g.beginPath(); g.moveTo(4, y + 12); g.lineTo(w / 2, y); g.lineTo(w - 4, y + 12); g.stroke(); }
  }, { nearest: true });
}
function labelTex(text, bg, fg) {
  return canvasTex(128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = `bold 40px ${FONT_PIXEL}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  }, { nearest: true });
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
      const k = Math.min(1, (p.life / p.max) * 1.6);
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

const BG_VERT = /* glsl */ `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
// horizontal "cylinder" shading: bright in the middle, dark at the walls; a touch lighter towards the top
const BG_FRAG = /* glsl */ `
precision highp float;
uniform vec3 cEdge; uniform vec3 cMid; uniform float lowRes;
varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  float t = clamp(abs(vW.x) / 3.0, 0.0, 1.0);
  float k = smoothstep(0.05, 1.0, pow(t, 0.85));
  vec3 c = mix(cMid, cEdge, k);
  c *= 0.9 + 0.12 * clamp(vW.y / 15.0, 0.0, 1.0);
  c += (h(floor(vW.xy * 14.0)) - 0.5) * 0.012;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

export class World {
  constructor(canvas, opts) {
    this.maxBodies = opts.maxBodies;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x10131f, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-4, 4, 8, -8, 0.1, 200);
    this._cy = VIEW_TOP / 2;
    this.t = 0;
    this.shake = 0;
    this.pulse = 0;
    this.pipeKick = 0;
    this.stageGroup = null;
    this._geos = [];
    this.vis = { pistons: [], belts: [], fans: [], magnets: [], launchers: [], gates: [], rollers: [], streaks: [] };

    const pm = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();

    this._lights();
    this._textures();
    this._background();
    this._coins();
    this.particles = new Particles(this.scene, opts.particles || 200);
    this.palCur = { edge: new THREE.Color(0x06080c), mid: new THREE.Color(0xcdd1d8), tint: new THREE.Color(0xffffff) };
    this.palTgt = { edge: new THREE.Color(0x06080c), mid: new THREE.Color(0xcdd1d8), tint: new THREE.Color(0xffffff) };
  }

  _lights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xaab2cc, 1.25));
    const d = new THREE.DirectionalLight(0xffffff, 1.7);
    d.position.set(-3.5, 15, 18);
    d.target.position.set(0, 7, 0);
    d.castShadow = true;
    d.shadow.mapSize.set(1024, 1024);
    const sc = d.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 11; sc.bottom = -10; sc.near = 1; sc.far = 50;
    d.shadow.bias = -0.0005;
    d.shadow.normalBias = 0.025;
    d.shadow.radius = 2;
    this.scene.add(d, d.target);
    this.sun = d;
  }

  setQuality(q) {
    const on = !!q.shadows;
    this.sun.castShadow = on;
    const size = q.shadowMap || 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    for (const m of this.objMeshes) m.castShadow = on;
  }

  _textures() {
    const T = (t) => t;
    this.tex = {
      front: T(slabFrontTex()), top: T(slabTopTex()), side: T(slabSideTex()), wall: T(wallTex()),
      belt: T(beltTopTex()), hazard: T(hazardTex()), chevron: T(chevronTex()),
    };
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.0, ...o });
    this.mats = {
      front: std({ map: this.tex.front }), top: std({ map: this.tex.top }), side: std({ map: this.tex.side }),
      wall: std({ map: this.tex.wall }),
      beltTop: std({ map: this.tex.belt, roughness: 0.9 }), beltBody: std({ color: 0x2a3146, roughness: 0.7 }),
      dark: std({ color: 0x1c2030, roughness: 0.6 }),
      metal: std({ color: 0xaab3c6, roughness: 0.35, metalness: 0.7, envMap: this.envMap }),
      metalDark: std({ color: 0x6b7388, roughness: 0.4, metalness: 0.7, envMap: this.envMap }),
      hazard: std({ map: this.tex.hazard, roughness: 0.6 }),
      green: std({ color: 0x36d65a, roughness: 0.45, metalness: 0.1, emissive: 0x0b3a14, emissiveIntensity: 0.6 }),
      greenDark: std({ color: 0x1f9a3c, roughness: 0.5 }),
      red: std({ color: 0xe23b3b, roughness: 0.45, emissive: 0x4a0808, emissiveIntensity: 0.5 }),
      orange: std({ map: this.tex.chevron, roughness: 0.6 }),
      glass: new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.28, depthWrite: false }),
      wind: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
    };
    this.tintMats = [this.mats.front, this.mats.top, this.mats.side, this.mats.wall];
  }

  _background() {
    this.bgU = { cEdge: { value: new THREE.Color(0x06080c) }, cMid: { value: new THREE.Color(0xcdd1d8) }, lowRes: { value: 0 } };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShaderMaterial({ vertexShader: BG_VERT, fragmentShader: BG_FRAG, uniforms: this.bgU, depthWrite: true })
    );
    bg.position.set(0, 8, -SLAB_Z - 0.3);
    this.scene.add(bg);
    // transparent shadow catcher in front of the gradient
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.2 }));
    sh.position.set(0, 8, -SLAB_Z - 0.29);
    sh.receiveShadow = true;
    this.scene.add(sh);
  }

  // ---- coins: thin cylinders (axis = local Y, same as the Rapier collider) ----
  _coinFaceTextures(c) {
    const N = 128;
    const mk = (bump) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = N;
      const g = cv.getContext('2d');
      const hex = (n) => '#' + n.toString(16).padStart(6, '0');
      const mid = N / 2;
      g.fillStyle = bump ? '#808080' : hex(c.faceColor);
      g.fillRect(0, 0, N, N);
      g.lineWidth = N * 0.08;
      g.strokeStyle = bump ? '#ffffff' : hex(c.edge);
      g.beginPath(); g.arc(mid, mid, N * 0.42, 0, Math.PI * 2); g.stroke();
      g.lineWidth = N * 0.02;
      g.strokeStyle = bump ? '#303030' : '#00000040';
      g.beginPath(); g.arc(mid, mid, N * 0.33, 0, Math.PI * 2); g.stroke();
      g.fillStyle = bump ? '#ffffff' : hex(c.edge);
      if (c.face === 'star') {
        g.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? N * 0.1 : N * 0.23, a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(mid + Math.cos(a) * r, mid + Math.sin(a) * r); }
        g.closePath(); g.fill();
      } else if (c.face === 'gem') {
        g.beginPath(); g.moveTo(mid, mid - N * 0.22); g.lineTo(mid + N * 0.19, mid); g.lineTo(mid, mid + N * 0.22); g.lineTo(mid - N * 0.19, mid); g.closePath(); g.fill();
      } else {
        g.font = `bold ${N * 0.4}px ${FONT_PIXEL}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('$', mid, mid + N * 0.02);
      }
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = bump ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    return { map: mk(false), bump: mk(true) };
  }

  _coins() {
    this.objMeshes = COIN_TYPES.map((c) => {
      const geo = new THREE.CylinderGeometry(c.radius, c.radius, c.thickness, c.segments, 1); // axis Y
      const faces = this._coinFaceTextures(c);
      const side = new THREE.MeshStandardMaterial({ color: c.edge, metalness: c.metal, roughness: c.rough + 0.1, envMap: this.envMap, envMapIntensity: 1.0 });
      const face = new THREE.MeshStandardMaterial({ map: faces.map, bumpMap: faces.bump, bumpScale: 2.0, metalness: c.metal, roughness: c.rough, envMap: this.envMap, envMapIntensity: 1.05 });
      if (c.key === 'rare') { face.emissive = new THREE.Color(0x0a6a78); face.emissiveIntensity = 0.8; }
      const im = new THREE.InstancedMesh(geo, [side, face, face], this.maxBodies);
      im.frustumCulled = false;
      im.count = 0;
      im.castShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, new THREE.Color(1, 1, 1));
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(im);
      return im;
    });
    this._white = new THREE.Color(1, 1, 1);
    this._gold = new THREE.Color(1.5, 1.2, 0.55);
  }

  // ---------- stage building ----------
  _box(w, h, d, mat, x, y, z, parent, shadow = true) {
    const geo = new THREE.BoxGeometry(w, h, d);
    this._geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  _cyl(r, h, seg, mat, parent, rotZ = 0, rotX = 0) {
    const geo = new THREE.CylinderGeometry(r, r, h, seg);
    if (rotZ) geo.rotateZ(rotZ);
    if (rotX) geo.rotateX(rotX);
    this._geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  setStage(def, animate) {
    if (this.stageGroup) {
      this.scene.remove(this.stageGroup);
      for (const g of this._geos) g.dispose();
      this._geos = [];
    }
    const g = new THREE.Group();
    this.stageGroup = g;
    this.scene.add(g);
    const V = (this.vis = { pistons: [], belts: [], fans: [], magnets: [], launchers: [], gates: [], rollers: [], streaks: [] });
    this.def = def;
    const pal = def.palette;
    this.palTgt.edge.set(pal.edge); this.palTgt.mid.set(pal.mid); this.palTgt.tint.set(pal.tint);
    if (!animate) { this.palCur.edge.copy(this.palTgt.edge); this.palCur.mid.copy(this.palTgt.mid); this.palCur.tint.copy(this.palTgt.tint); this._applyPalette(); }

    const M = this.mats;
    // side walls (thick light columns, outer edge of the screen)
    for (const s of [-1, 1]) {
      const wm = [M.side, M.side, M.top, M.side, M.wall, M.side];
      this._box(WALL_W, 18.4, SLAB_Z * 2 + 0.16, wm, s * (IN_HALF + WALL_W / 2), 7.6, 0.08, g);
    }
    // platforms, columns and belts
    for (const b of def.blocks) {
      const w = b.x1 - b.x0, h = b.y1 - b.y0, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      if (b.kind === 'belt') {
        const beltTop = M.beltTop.clone();
        beltTop.map = this.tex.belt.clone();
        beltTop.map.needsUpdate = true;
        beltTop.map.repeat.set(w / 0.45, 1);
        const mats = [M.beltBody, M.beltBody, beltTop, M.beltBody, M.beltBody, M.beltBody];
        this._box(w, h, SLAB_Z * 2, mats, cx, cy, 0, g);
        // end rollers
        for (const ex of [b.x0 + 0.05, b.x1 - 0.05]) {
          const r = this._cyl(h * 0.38, SLAB_Z * 2 + 0.02, 14, M.metalDark, g, 0, Math.PI / 2);
          r.position.set(ex, cy, 0);
        }
        // light cladding under the belt so it reads as a machine part of the same family
        this._box(w, 0.12, SLAB_Z * 2, [M.side, M.side, M.top, M.side, M.front, M.side], cx, b.y0 + 0.06, 0, g);
        V.belts.push({ map: beltTop.map, dir: b.side === 'L' ? 1 : -1 });
      } else {
        const mats = [M.side, M.side, M.top, M.side, M.front, M.side];
        this._box(w, h, SLAB_Z * 2, mats, cx, cy, 0, g);
      }
    }
    for (const p of def.plates) {
      const m = this._box(p.halfLen * 2, p.thick, SLAB_Z * 2, [M.side, M.side, M.top, M.side, M.front, M.side], p.cx, p.cy, 0, g);
      m.rotation.z = p.ang;
    }

    // dispenser pipe
    this.pipe = new THREE.Group();
    this.pipe.position.set(def.pipe.x, def.pipe.y, 0);
    const body = this._cyl(0.5, 3.2, 20, M.green, this.pipe);
    body.position.y = 1.6 + 0.16;
    const lip = this._cyl(0.68, 0.34, 20, M.green, this.pipe);
    lip.position.y = 0.17;
    const ring = this._cyl(0.7, 0.07, 20, M.greenDark, this.pipe);
    ring.position.y = 0.0;
    g.add(this.pipe);

    // grinder / collector in the pit
    const pit = def.pit;
    const pw = pit.x1 - pit.x0;
    this._box(pw, 0.9, 0.5, M.dark, (pit.x0 + pit.x1) / 2, 0.45, -0.25, g, false);
    const n = Math.max(3, Math.round(pw / 0.5));
    for (let i = 0; i < n; i++) {
      const x = pit.x0 + (pw * (i + 0.5)) / n;
      const roller = new THREE.Group();
      roller.position.set(x, 0.66, 0.0);
      const cyl = this._cyl(0.2, 0.9, 12, i % 2 ? M.dark : M.green, roller, 0, Math.PI / 2);
      cyl.castShadow = false;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const sp = new THREE.Mesh(this._coneGeo(), M.metal);
        sp.position.set(Math.cos(a) * 0.23, Math.sin(a) * 0.23, 0);
        sp.rotation.z = a - Math.PI / 2;
        roller.add(sp);
      }
      g.add(roller);
      V.rollers.push({ obj: roller, dir: i % 2 ? -1 : 1 });
    }
    // light rim in front of the grinder
    this._box(pw, 0.16, 0.12, M.metalDark, (pit.x0 + pit.x1) / 2, 0.08, 0.5, g, false);

    // pistons
    for (const pd of def.pistons) {
      const grp = new THREE.Group();
      g.add(grp);
      const wallSide = pd.dir > 0 ? -1 : 1;
      // hazard decal on the wall face + dark port
      const decal = this._box(0.5, 0.78, 0.06, M.hazard, wallSide * (IN_HALF + 0.3), pd.y, SLAB_Z + 0.1, grp);
      decal.castShadow = false;
      const port = this._box(0.05, HEAD.hy * 2 + 0.06, HEAD.hz * 2 + 0.04, M.dark, wallSide * IN_HALF, pd.y, 0, grp, false);
      const rod = this._box(1, HEAD.hy * 2 - 0.1, HEAD.hz * 2 - 0.16, M.metalDark, 0, pd.y, 0, grp);
      const head = this._box(HEAD.hw * 2, HEAD.hy * 2, HEAD.hz * 2, M.metal, 0, pd.y, 0, grp);
      const stripe = this._box(HEAD.hw * 2 + 0.01, HEAD.hy * 2 - 0.14, 0.1, M.hazard, 0, pd.y, HEAD.hz - 0.02, grp);
      stripe.castShadow = false;
      V.pistons.push({ def: pd, rod, head, stripe, port });
    }

    // fans (air blowers): red disc on the wall with a spinning propeller + wind streaks
    for (const fd of def.fans) {
      const fg = new THREE.Group();
      fg.position.set(-IN_HALF - 0.1, fd.y, SLAB_Z + 0.12);
      const disc = this._cyl(0.55, 0.14, 20, M.red, fg, 0, Math.PI / 2);
      const prop = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const blade = this._box(0.18, 0.62, 0.05, M.metal, 0, 0, 0.1, prop, false);
        blade.position.set(0, 0, 0.1);
        blade.rotation.z = (k / 3) * Math.PI * 2;
        blade.geometry.translate(0, 0.28, 0);
      }
      fg.add(prop);
      g.add(fg);
      const streaks = [];
      for (let k = 0; k < 9; k++) {
        const s = this._box(0.7, 0.03, 0.03, M.wind, 0, 0, 0, g, false);
        s.userData = { off: k / 9, row: (k * 0.6180339) % 1 };
        streaks.push(s);
      }
      V.fans.push({ def: fd, prop, streaks });
    }
    // magnets: red horseshoe on the column front
    for (const md of def.magnets) {
      const mg = new THREE.Group();
      mg.position.set(-0.05, md.y, SLAB_Z + 0.12);
      this._box(0.5, 0.14, 0.2, M.red, 0, 0.22, 0, mg);
      this._box(0.14, 0.5, 0.2, M.red, -0.18, 0, 0, mg);
      this._box(0.14, 0.5, 0.2, M.red, 0.18, 0, 0, mg);
      this._box(0.14, 0.14, 0.2, M.metal, -0.18, -0.3, 0, mg);
      this._box(0.14, 0.14, 0.2, M.metal, 0.18, -0.3, 0, mg);
      const glow = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.46, 24), new THREE.MeshBasicMaterial({ color: 0xff6a6a, transparent: true, opacity: 0.0, depthWrite: false }));
      glow.position.z = 0.15;
      mg.add(glow);
      g.add(mg);
      V.magnets.push({ def: md, glow, group: mg });
    }
    // launcher pads: chevron inlay on the platform lip
    for (const ld of def.launchers) {
      const padGeo = new THREE.PlaneGeometry(ld.x1 - ld.x0, SLAB_Z * 1.5);
      this._geos.push(padGeo);
      const pm = this.mats.orange.clone();
      pm.map = this.tex.chevron.clone();
      pm.map.needsUpdate = true;
      pm.map.wrapS = pm.map.wrapT = THREE.RepeatWrapping;
      pm.map.repeat.set((ld.x1 - ld.x0) / 0.3, 1);
      const pad = new THREE.Mesh(padGeo, pm);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set((ld.x0 + ld.x1) / 2, ld.top + 0.004, 0);
      pad.receiveShadow = true;
      g.add(pad);
      const spring = this._box(0.3, 0.2, 0.16, M.metal, (ld.x0 + ld.x1) / 2, ld.top - 0.35, SLAB_Z + 0.02, g);
      V.launchers.push({ def: ld, pad, mat: pm, spring });
    }
    // multiplier gates: two posts + translucent field with "x2"
    for (const gd of def.gates) {
      const gg = new THREE.Group();
      const w = gd.x1 - gd.x0, h = gd.y1 - gd.y0;
      this._box(0.1, h + 0.2, 0.14, M.greenDark, gd.x0, (gd.y0 + gd.y1) / 2, 0, gg);
      this._box(0.1, h + 0.2, 0.14, M.greenDark, gd.x1, (gd.y0 + gd.y1) / 2, 0, gg);
      const field = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.glass.clone());
      this._geos.push(field.geometry);
      field.position.set((gd.x0 + gd.x1) / 2, (gd.y0 + gd.y1) / 2, 0.4);
      gg.add(field);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), new THREE.MeshBasicMaterial({ map: labelTex('x2', '#1f9a3c', '#ffffff') }));
      this._geos.push(lab.geometry);
      lab.position.set((gd.x0 + gd.x1) / 2, gd.y1 + 0.3, 0.45);
      gg.add(lab);
      g.add(gg);
      V.gates.push({ def: gd, field });
    }
    this.pulse = 0;
  }

  _coneGeo() {
    if (!this._cone) this._cone = new THREE.ConeGeometry(0.07, 0.2, 5);
    return this._cone;
  }

  _applyPalette() {
    this.bgU.cEdge.value.copy(this.palCur.edge);
    this.bgU.cMid.value.copy(this.palCur.mid);
    for (const m of this.tintMats) m.color.copy(this.palCur.tint);
  }

  // ---------- camera ----------
  // orthographic frustum: whole machine (7.4 x 15.2) visible; slight downward pitch so platform tops and coin faces show depth
  fit(cssW, cssH, aspect) {
    const cam = this.camera;
    const needW = VIEW_HALF_W * 2 + 0.1;
    const needH = VIEW_TOP + 0.5;
    let W = needW, H = needW / aspect;
    if (H < needH) { H = needH; W = H * aspect; }
    cam.left = -W / 2; cam.right = W / 2; cam.top = H / 2; cam.bottom = -H / 2;
    cam.updateProjectionMatrix();
    this._cy = VIEW_TOP / 2 + 0.1;
    this._placeCam(0);
  }

  _placeCam(shakeAmt) {
    const pitch = 0.17, d = 60;
    const sx = (Math.random() - 0.5) * shakeAmt;
    const sy = (Math.random() - 0.5) * shakeAmt;
    const cy = this._cy;
    this.camera.position.set(sx, cy + Math.sin(pitch) * d + sy, Math.cos(pitch) * d);
    this.camera.lookAt(sx, cy + sy, 0);
    this.camera.updateMatrixWorld(true);
  }

  project(x, y, z, w, h) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  }

  unprojectToPlane(nx, ny) {
    const a = new THREE.Vector3(nx, ny, -1).unproject(this.camera);
    const b = new THREE.Vector3(nx, ny, 1).unproject(this.camera);
    const dir = b.sub(a);
    const t = -a.z / dir.z;
    return { x: a.x + dir.x * t, y: a.y + dir.y * t };
  }

  // ---------- per-frame ----------
  syncObjects(physics) {
    const counts = new Array(this.objMeshes.length).fill(0);
    const arrs = this.objMeshes.map((m) => m.instanceMatrix.array);
    const cols = this.objMeshes.map((m) => m.instanceColor.array);
    const put = (t, x, y, z, q, sc, gold) => {
      const i = counts[t]++;
      const arr = arrs[t];
      const o = i * 16;
      const x2 = q.x + q.x, y2 = q.y + q.y, z2 = q.z + q.z;
      const xx = q.x * x2, xy = q.x * y2, xz = q.x * z2, yy = q.y * y2, yz = q.y * z2, zz = q.z * z2, wx = q.w * x2, wy = q.w * y2, wz = q.w * z2;
      arr[o] = (1 - (yy + zz)) * sc; arr[o + 1] = (xy + wz) * sc; arr[o + 2] = (xz - wy) * sc; arr[o + 3] = 0;
      arr[o + 4] = (xy - wz) * sc; arr[o + 5] = (1 - (xx + zz)) * sc; arr[o + 6] = (yz + wx) * sc; arr[o + 7] = 0;
      arr[o + 8] = (xz + wy) * sc; arr[o + 9] = (yz - wx) * sc; arr[o + 10] = (1 - (xx + yy)) * sc; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
      const c = gold ? this._gold : this._white;
      cols[t][i * 3] = c.r; cols[t][i * 3 + 1] = c.g; cols[t][i * 3 + 2] = c.b;
    };
    for (const idx of physics.active) {
      const s = physics.slots[idx];
      const p = s.body.translation();
      put(s.type, p.x, p.y, p.z, s.body.rotation(), 1, s.mult > 1);
    }
    // coins being swallowed by the grinder: sink and shrink
    for (const idx of physics.sucking) {
      const s = physics.slots[idx];
      const k = Math.min(1, s.st);
      put(s.type, s.sx, s.sy - 0.45 * k, s.sz, s.q, 1 - 0.7 * k, s.mult > 1);
    }
    this.objMeshes.forEach((m, i) => {
      m.count = counts[i];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    });
  }

  update(dt, machines) {
    this.t += dt;
    const t = this.t;
    // palette fade
    const k = Math.min(1, dt * 2.2);
    this.palCur.edge.lerp(this.palTgt.edge, k);
    this.palCur.mid.lerp(this.palTgt.mid, k);
    this.palCur.tint.lerp(this.palTgt.tint, k);
    this._applyPalette();
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 4);
    if (this.pipeKick > 0) this.pipeKick = Math.max(0, this.pipeKick - dt * 6);
    if (this.pipe) this.pipe.scale.set(1 + 0.06 * this.pipeKick, 1 - 0.08 * this.pipeKick, 1 + 0.06 * this.pipeKick);

    const V = this.vis;
    if (machines) {
      // pistons
      V.pistons.forEach((v, i) => {
        const p = machines.pistons[i];
        if (!p) return;
        const d = v.def;
        const wallX = d.wall;
        const front = wallX + d.dir * p.ext;
        const headX = front - d.dir * HEAD.hw;
        v.head.position.x = headX;
        v.stripe.position.x = headX;
        const len = Math.max(0.01, Math.abs(headX - HEAD.hw * 0 - wallX) - HEAD.hw);
        v.rod.scale.x = Math.max(0.01, len + 0.4);
        v.rod.position.x = wallX + d.dir * (len / 2) - d.dir * 0.2;
      });
      V.belts.forEach((v, i) => {
        const b = machines.belts[i];
        if (b) v.map.offset.x -= v.dir * b.speed * dt * 0.6;
      });
      V.fans.forEach((v, i) => {
        const f = machines.fans[i];
        if (!f) return;
        v.prop.rotation.z -= dt * (f.on ? 14 : 1.2);
        const d = v.def;
        for (const s of v.streaks) {
          s.visible = f.on;
          if (!f.on) continue;
          const u = (s.userData.off + t * 0.75) % 1;
          s.position.set(d.x + 0.45 + u * (d.x1 - d.x - 0.4), d.y0 + 0.2 + s.userData.row * (d.y1 - d.y0 - 0.3), 0.3);
          s.scale.x = 0.6 + 0.8 * Math.sin(u * Math.PI);
          s.material.opacity = 0.55;
        }
      });
      V.magnets.forEach((v, i) => {
        const m = machines.magnets[i];
        const on = m && m.on;
        v.glow.material.opacity = on ? 0.25 + 0.25 * Math.sin(t * 5) : 0;
        v.glow.scale.setScalar(1 + (on ? ((t * 1.6) % 1) * 1.1 : 0));
      });
      V.launchers.forEach((v, i) => {
        const l = machines.launchers[i];
        if (!l) return;
        const a = Math.max(0, l.anim / 0.3);
        v.spring.scale.y = 1 + a * 1.4;
        v.mat.color.setScalar(1 + a * 0.6);
      });
      V.gates.forEach((v, i) => {
        const gt = machines.gates[i];
        v.field.material.opacity = 0.22 + (gt ? Math.max(0, gt.flash) * 1.2 : 0) + 0.05 * Math.sin(t * 3);
      });
    }
    for (const r of V.rollers) r.obj.rotation.z += dt * (3 + 6 * this.pulse) * r.dir;

    this.particles.update(dt);
    this.shake = Math.max(0, this.shake - dt * 3);
    this._placeCam(this.shake * 0.25);
  }

  dispose() {
    this.renderer.dispose();
  }
}
