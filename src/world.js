import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { VIEW_HALF_W, VIEW_TOP, COIN_TYPES } from './layout.js';
import { TIER_COLOR, COSMETICS, DEFAULT_EQUIP } from './content.js';
import { buildHouse, coinGeometry } from './scene/geometry.js';
import { MaterialLibrary } from './scene/materials.js';
import { themeFor } from './scene/themes.js';
import { Backdrop } from './scene/backdrop.js';
import { buildPipe, buildPiston, buildBelt, buildFan, windStreak, buildMagnet, buildLauncher, buildGate, buildGrinder } from './scene/props.js';
import { Timeline, Ease, PART_ENTER, PART_EXIT, OBJ, CELEBRATE, TRANSITION as T } from './scene/stage-anim.js';

const FONT_PIXEL = '"Press Start 2P", monospace';

class Particles {
  constructor(scene, max) {
    this.max = max;
    const geo = new THREE.IcosahedronGeometry(0.6, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.p = [];
    this.tmp = new THREE.Color();
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
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
        life: life * (0.8 + Math.random() * 0.4), max: life, g: gravity, size, rot: Math.random() * 6, spin: 2 + Math.random() * 5, col: cols[(Math.random() * cols.length) | 0],
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
    const drag = Math.exp(-dt * 0.8);
    for (const p of this.p) {
      p.vy -= p.g * dt;
      p.vx *= drag; p.vz *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += dt * p.spin;
      const k = Math.min(1, (p.life / p.max) * 1.6);
      const sz = p.size * k;
      this.pos.set(p.x, p.y, p.z);
      this.q.setFromEuler(this.e.set(p.rot, p.rot * 0.7, 0));
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
    this.flash = 0;
    this.lightPulse = 0;
    this.stage = null;
    this.theme = null;
    this.tl = null;
    this.onTransition = null; // (busy:boolean) => void, set by main to hide the price labels while platforms move
    this.quality = { shadows: true };

    const pm = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();

    this.lib = new MaterialLibrary(this.envMap);
    this.M = Object.assign(this.lib.m, { tex: this.lib.tex });
    this._lights();
    this.backdrop = new Backdrop(this.scene, this.M);
    this._coins();
    this.pipe = buildPipe(this.M);
    this.scene.add(this.pipe);
    this.particles = new Particles(this.scene, opts.particles || 200);
  }

  _lights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xaab2cc, 1.1);
    const d = new THREE.DirectionalLight(0xffffff, 1.9);
    d.position.set(-3.5, 15, 18);
    d.target.position.set(0, 7, 0);
    d.castShadow = true;
    d.shadow.mapSize.set(1024, 1024);
    const sc = d.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 11; sc.bottom = -10; sc.near = 1; sc.far = 50;
    d.shadow.bias = -0.0005;
    d.shadow.normalBias = 0.03;
    // fill / rim light from the upper right: lifts the shadowed sides and draws the bevels
    const f = new THREE.DirectionalLight(0x9fc3ff, 0.5);
    f.position.set(9, 10, 6);
    f.target.position.set(0, 7, 0);
    this.scene.add(this.hemi, d, d.target, f, f.target);
    this.sun = d;
    this.fill = f;
    this.light = { cur: null, from: null, to: null };
  }

  // machine parts + collections become visible on the 3D machine (shared materials, so every stage shows them)
  // piston -> piston heads, frame -> housings, tray -> grinder rollers, drive -> steel fittings, deck -> glowing
  // platform edges; pipe paint -> dispenser pipe. Stock tier keeps the original look.
  applyLook(st) {
    const M = this.M;
    if (!this._base) this._base = { steel: M.steel.color.getHex(), housing: M.housing.color.getHex(), grinder: M.grinderGreen.color.getHex(), dark: M.darkSteel.color.getHex() };
    const tier = (k) => (st.parts && st.parts[k]) || 0;
    const tint = (mat, base, t, emis) => {
      mat.color.setHex(t ? TIER_COLOR[t] : base);
      if (emis && mat.emissive) { mat.emissive.setHex(t >= 4 ? TIER_COLOR[t] : 0x000000); mat.emissiveIntensity = t >= 4 ? 0.12 : mat.emissiveIntensity; }
    };
    tint(M.steel, this._base.steel, tier('piston'), true);
    tint(M.housing, this._base.housing, tier('frame'));
    if (tier('frame')) M.housing.color.multiplyScalar(0.55); // housings stay darker than the moving parts
    M.grinderGreen.color.setHex(tier('tray') ? TIER_COLOR[tier('tray')] : this._base.grinder);
    tint(M.darkSteel, this._base.dark, tier('drive'));
    if (tier('drive')) M.darkSteel.color.multiplyScalar(0.7);
    this.deckTier = tier('deck');
    const pipe = COSMETICS[(st.perm.equip && st.perm.equip.pipe) || DEFAULT_EQUIP.pipe] || COSMETICS[DEFAULT_EQUIP.pipe];
    M.pipe.color.setHex(pipe.color);
    M.pipe.emissive.setHex(pipe.color).multiplyScalar(0.18);
    this._applyDeck();
  }
  _applyDeck() {
    if (!this.stage) return;
    const side = this.stage.houseMats[1];
    const t = this.deckTier || 0;
    side.userData.deckEmissive = t ? TIER_COLOR[t] : null;
    side.userData.deckI = t ? 0.06 + 0.035 * t : 0;
  }

  setQuality(q) {
    const on = !!q.shadows;
    this.quality = q;
    this.sun.castShadow = on;
    const size = q.shadowMap || 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    for (const m of this.objMeshes) m.castShadow = on;
    this.backdrop.setQuality(q);
    this.lib.setDetail(on);
    this.fill.visible = on;
  }

  // ---- coins: lathe profile (rim + recessed face), axis = local Y like the Rapier collider ----
  _coinFaceTextures(c) {
    const N = 128;
    const mk = (bump) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = N;
      const g = cv.getContext('2d');
      const hex = (n) => '#' + n.toString(16).padStart(6, '0');
      const mid = N / 2;
      if (bump) { g.fillStyle = '#808080'; g.fillRect(0, 0, N, N); }
      else {
        const gr = g.createRadialGradient(mid * 0.7, mid * 0.6, N * 0.05, mid, mid, N * 0.55);
        gr.addColorStop(0, hex(c.faceColor)); gr.addColorStop(1, hex(c.edge));
        g.fillStyle = hex(c.faceColor); g.fillRect(0, 0, N, N);
        g.globalAlpha = 0.35; g.fillStyle = gr; g.fillRect(0, 0, N, N); g.globalAlpha = 1;
      }
      g.lineWidth = N * 0.08;
      g.strokeStyle = bump ? '#ffffff' : hex(c.edge);
      g.beginPath(); g.arc(mid, mid, N * 0.42, 0, Math.PI * 2); g.stroke();
      // milled dots around the rim
      g.fillStyle = bump ? '#d0d0d0' : '#ffffff40';
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.beginPath(); g.arc(mid + Math.cos(a) * N * 0.36, mid + Math.sin(a) * N * 0.36, N * 0.012, 0, Math.PI * 2); g.fill(); }
      g.lineWidth = N * 0.02;
      g.strokeStyle = bump ? '#303030' : '#00000040';
      g.beginPath(); g.arc(mid, mid, N * 0.31, 0, Math.PI * 2); g.stroke();
      g.fillStyle = bump ? '#ffffff' : hex(c.edge);
      if (c.face === 'star') {
        g.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? N * 0.1 : N * 0.23, a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(mid + Math.cos(a) * r, mid + Math.sin(a) * r); }
        g.closePath(); g.fill();
      } else if (c.face === 'gem') {
        g.beginPath(); g.moveTo(mid, mid - N * 0.22); g.lineTo(mid + N * 0.19, mid); g.lineTo(mid, mid + N * 0.22); g.lineTo(mid - N * 0.19, mid); g.closePath(); g.fill();
        if (!bump) { g.fillStyle = '#ffffff90'; g.beginPath(); g.moveTo(mid, mid - N * 0.22); g.lineTo(mid + N * 0.08, mid - N * 0.04); g.lineTo(mid, mid); g.closePath(); g.fill(); }
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
      const geo = coinGeometry(c.radius, c.thickness, c.segments);
      const faces = this._coinFaceTextures(c);
      const side = new THREE.MeshStandardMaterial({ color: c.edge, metalness: c.metal, roughness: c.rough + 0.05, envMap: this.envMap, envMapIntensity: 1.1 });
      const face = new THREE.MeshStandardMaterial({ map: faces.map, bumpMap: faces.bump, bumpScale: 2.0, metalness: c.metal, roughness: c.rough, envMap: this.envMap, envMapIntensity: 1.1 });
      if (c.key === 'rare') { face.emissive = new THREE.Color(0x0a6a78); face.emissiveIntensity = 0.8; }
      const im = new THREE.InstancedMesh(geo, [side, face], this.maxBodies);
      im.frustumCulled = false;
      im.count = 0;
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, new THREE.Color(1, 1, 1));
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(im);
      return im;
    });
    this._white = new THREE.Color(1, 1, 1);
    this._gold = new THREE.Color(1.5, 1.2, 0.55);
  }

  // =============================================================================================
  // stage building
  // =============================================================================================
  _build(def, theme) {
    const M = this.M;
    const group = new THREE.Group();
    const geos = [], texs = [], mats = [];
    const S = { def, theme, group, geos, texs, mats, slots: [], props: [], pistons: [], belts: [], fans: [], magnets: [], launchers: [], gates: [], rollers: [], lamps: [] };

    // house: walls + floor + wall platforms + funnel plates, one seamless beveled mesh
    const house = buildHouse(def);
    geos.push(house.geometry);
    const hm = this.lib.house(theme);
    const mesh = new THREE.Mesh(house.geometry, hm);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.customDepthMaterial = this.lib.houseDepth();
    group.add(mesh);
    S.house = mesh; S.parts = house.parts; S.houseMats = hm;
    // entrance / exit slots (house parts + conveyors) by height: drives stagger order and prop timing
    house.parts.forEach((p, i) => { if (i > 0) S.slots.push({ part: i, top: p.top, side: p.side, kind: p.kind, props: [] }); });
    const slotFor = (top, side) => S.slots.find((s) => Math.abs(s.top - top) < 0.02 && (!side || s.side === side));

    // conveyors
    for (const b of def.blocks) {
      if (b.kind !== 'belt') continue;
      const bt = buildBelt(M, b, geos, texs);
      mats.push(bt.mat);
      group.add(bt.group);
      S.belts.push(bt);
      S.slots.push({ part: -1, top: b.y1, side: b.side === 'L' ? -1 : 1, kind: 'belt', props: [{ obj: bt.group, anim: 'popIn' }] });
    }
    // pistons
    for (const pd of def.pistons) {
      const p = buildPiston(M, pd, geos);
      group.add(p.group);
      S.pistons.push(p);
      const slot = pd.id === 'sweeper' ? S.slots.find((s) => s.kind === 'plate') : slotFor(pd.top);
      (slot ? slot.props : S.props).push({ obj: p.group, anim: 'popIn' });
    }
    // fans + wind streaks
    for (const fd of def.fans) {
      const f = buildFan(M, fd);
      group.add(f.group);
      f.streaks = [];
      for (let k = 0; k < 9; k++) { const s = windStreak(M); s.userData = { off: k / 9, row: (k * 0.6180339) % 1 }; s.visible = false; group.add(s); f.streaks.push(s); }
      S.fans.push(f);
      const slot = slotFor(fd.y0, -1);
      (slot ? slot.props : S.props).push({ obj: f.group, anim: 'popIn' });
    }
    // magnets on the pillar
    for (const md of def.magnets) {
      const m = buildMagnet(M, md);
      mats.push(m.glow.material);
      group.add(m.group);
      S.magnets.push(m);
      S.props.push({ obj: m.group, anim: 'popIn', late: true });
    }
    // launch pads
    for (const ld of def.launchers) {
      const l = buildLauncher(M, ld, geos);
      mats.push(l.mat); texs.push(l.mat.map);
      group.add(l.group);
      S.launchers.push(l);
      const slot = slotFor(ld.top);
      (slot ? slot.props : S.props).push({ obj: l.group, anim: 'popIn' });
    }
    // multiplier gates
    for (const gd of def.gates) {
      const g = buildGate(M, gd, geos);
      mats.push(g.field.material);
      group.add(g.group);
      S.gates.push(g);
      S.props.push({ obj: g.group, anim: 'growUp', late: true });
    }
    // grinder (identical on every stage: never animated, so the swap is invisible there)
    const gr = buildGrinder(M, def.pit, geos);
    group.add(gr.group);
    S.rollers = gr.rollers; S.lamps = gr.lamps;
    // ordering: top to bottom
    S.slots.sort((a, b) => b.top - a.top);
    return S;
  }

  _dispose(S) {
    if (!S) return;
    this.scene.remove(S.group);
    for (const g of S.geos) g.dispose();
    for (const t of S.texs) t.dispose();
    for (const m of S.mats) m.dispose();
  }

  _applyThemeInstant(theme) {
    this.backdrop.setTheme(theme);
    this._setLight(this._lightOf(theme));
    this.light.cur = this._lightOf(theme);
  }

  _lightOf(th) {
    const L = th.light;
    return { sky: new THREE.Color(L.sky), ground: new THREE.Color(L.ground), hemi: L.hemi, key: new THREE.Color(L.key), keyI: L.keyI, fill: new THREE.Color(L.fill), fillI: L.fillI };
  }
  _setLight(L) {
    this.hemi.color.copy(L.sky); this.hemi.groundColor.copy(L.ground); this.hemi.intensity = L.hemi;
    this.sun.color.copy(L.key); this.sun.intensity = L.keyI;
    this.fill.color.copy(L.fill); this.fill.intensity = L.fillI;
  }
  _lerpLight(a, b, k) {
    const c = (x, y) => x.clone().lerp(y, k), n = (x, y) => x + (y - x) * k;
    return { sky: c(a.sky, b.sky), ground: c(a.ground, b.ground), hemi: n(a.hemi, b.hemi), key: c(a.key, b.key), keyI: n(a.keyI, b.keyI), fill: c(a.fill, b.fill), fillI: n(a.fillI, b.fillI) };
  }

  setStage(def, animate) {
    const theme = themeFor(def.n);
    if (this.tl) { this.tl.finish(); this.tl = null; }
    if (!animate || !this.stage) {
      this._dispose(this.stage);
      this.lib.resetParts();
      this.stage = this._build(def, theme);
      this.scene.add(this.stage.group);
      this.pipe.position.set(def.pipe.x, def.pipe.y, 0);
      this.theme = theme;
      this._applyDeck();
      this._applyThemeInstant(theme);
      this.pulse = 0;
      if (this.onTransition) this.onTransition(false);
      return;
    }
    this._transition(def, theme);
  }

  // completed stage -> celebration -> old interior retracts into the walls -> swap -> new one grows out
  _transition(def, theme) {
    const tl = (this.tl = new Timeline());
    const old = this.stage, oldTheme = this.theme;
    const U = this.lib.uParts.value;
    const emit = (...a) => this.particles.emit(...a);
    if (this.onTransition) this.onTransition(true);

    tl.call(T.celebrate, () => {
      (CELEBRATE[oldTheme.anim.celebrate] || CELEBRATE.sparkBurst)(emit, oldTheme.accent);
      this.flash = 1; this.lightPulse = 1;
      this.backdrop.u.uFlashCol.value.set(oldTheme.accent).lerp(new THREE.Color(0xffffff), 0.5).multiplyScalar(0.55);
    });
    // exit, bottom to top, props first
    const ex = PART_EXIT[oldTheme.anim.exit] || PART_EXIT.retract;
    const outSlots = old.slots.slice().reverse();
    outSlots.forEach((s, i) => {
      const at = T.exitAt + i * ex.stagger;
      for (const pr of s.props) tl.add(at, OBJ.shrinkOut.dur, (_e, k) => OBJ.shrinkOut.run(pr.obj, k));
      const e2 = s.kind === 'base' ? PART_EXIT.lower : ex;
      if (s.part > 0) tl.add(at + 0.08, e2.dur, (_e, k) => e2.run(U[s.part], k));
    });
    for (const pr of old.props) tl.add(T.exitAt, OBJ.shrinkOut.dur, (_e, k) => OBJ.shrinkOut.run(pr.obj, k));

    // lights + backdrop
    const fromL = this.light.cur, toL = this._lightOf(theme);
    tl.add(T.lightAt, T.lightDur, (e) => { this.light.cur = this._lerpLight(fromL, toL, e); }, Ease.inOutSine);
    tl.call(T.blendAt, () => this.backdrop.beginBlend(theme));
    tl.add(T.blendAt, T.blendDur, (e) => this.backdrop.setMix(e), Ease.inOutCubic);
    tl.call(T.blendAt + T.blendDur + 0.01, () => this.backdrop.finish());

    // swap + entrance
    tl.call(T.swapAt, () => {
      this._dispose(old);
      const S = (this.stage = this._build(def, theme));
      this.theme = theme;
      this.scene.add(S.group);
      this.pipe.position.set(def.pipe.x, def.pipe.y, 0);
      this._applyDeck();
      // the new walls take over the old wall colours and blend to their own, so the re-skin is not a hard cut
      const [nf, ns] = S.houseMats;
      const fromF = new THREE.Color(oldTheme.surface.color), toF = new THREE.Color(theme.surface.color);
      const fromS = new THREE.Color(oldTheme.trim.color), toS = new THREE.Color(theme.trim.color);
      tl.add(T.swapAt, 0.8, (e) => { nf.color.copy(fromF).lerp(toF, e); ns.color.copy(fromS).lerp(toS, e); }, Ease.inOutSine);
      const en = PART_ENTER[theme.anim.enter] || PART_ENTER.extrude;
      this.lib.resetParts();
      let last = T.enterAt;
      S.slots.forEach((s, i) => {
        const at = T.enterAt + i * en.stagger;
        const e2 = s.kind === 'base' ? PART_ENTER.grow : en;
        if (s.part > 0) { e2.run(U[s.part], 0); tl.add(at, e2.dur, (_e, k) => e2.run(U[s.part], k)); }
        for (const pr of s.props) {
          const a = OBJ[pr.anim];
          a.run(pr.obj, 0);
          tl.add(at + en.dur * 0.55, a.dur, (_e, k) => a.run(pr.obj, k));
        }
        last = Math.max(last, at + en.dur);
      });
      for (const pr of S.props) {
        const a = OBJ[pr.anim];
        a.run(pr.obj, 0);
        tl.add(last - 0.1, a.dur, (_e, k) => a.run(pr.obj, k));
      }
      tl.call(last + 0.5, () => { this.lib.resetParts(); if (this.onTransition) this.onTransition(false); });
    });
  }

  // =============================================================================================
  // camera
  // =============================================================================================
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

  // =============================================================================================
  // per-frame
  // =============================================================================================
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
    if (this.tl) { this.tl.update(dt); if (this.tl.finished) this.tl = null; }
    this.backdrop.update(dt);

    // lighting: theme light + stage-complete pulse
    if (this.light.cur) {
      this._setLight(this.light.cur);
      if (this.lightPulse > 0) { this.sun.intensity *= 1 + 0.45 * this.lightPulse; this.hemi.intensity *= 1 + 0.25 * this.lightPulse; }
    }
    this.lightPulse = Math.max(0, this.lightPulse - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 2.0);
    this.backdrop.u.uFlash.value = Ease.outQuad(this.flash);

    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 4);
    if (this.pipeKick > 0) this.pipeKick = Math.max(0, this.pipeKick - dt * 6);
    this.pipe.scale.set(1 + 0.06 * this.pipeKick, 1 - 0.08 * this.pipeKick, 1 + 0.06 * this.pipeKick);

    const S = this.stage;
    if (!S) return;
    this._idle(t, dt);
    if (machines) {
      // pistons (positions in the piston group's local frame: x along the piston axis from the wall)
      S.pistons.forEach((v, i) => {
        const p = machines.pistons[i];
        if (!p) return;
        const d = v.def;
        const hs = p.ext - 0.14; // HEAD.hw
        v.head.position.set(d.dir * hs, 0, 0);
        const s0 = -0.2;
        const len = Math.max(0.01, hs - s0);
        v.rod.scale.x = len;
        v.rod.position.set((d.dir * (s0 + hs)) / 2, 0, 0);
      });
      S.belts.forEach((v, i) => {
        const b = machines.belts[i];
        if (!b) return;
        const du = v.dir * b.speed * dt * (1 / 0.9);
        for (const tx of v.texs) tx.offset.x -= du;
        for (const h of v.hubs) h.rotation.z -= v.dir * b.speed * dt * 4;
      });
      S.fans.forEach((v, i) => {
        const f = machines.fans[i];
        if (!f) return;
        v.prop.rotation.z -= dt * (f.on ? 14 : 1.2);
        const d = v.def;
        for (const s of v.streaks) {
          s.visible = f.on && !this.tl;
          if (!s.visible) continue;
          const u = (s.userData.off + t * 0.75) % 1;
          s.position.set(d.x + 0.45 + u * (d.x1 - d.x - 0.4), d.y0 + 0.2 + s.userData.row * (d.y1 - d.y0 - 0.3), 0.3);
          s.scale.x = 0.6 + 0.8 * Math.sin(u * Math.PI);
        }
      });
      S.magnets.forEach((v, i) => {
        const m = machines.magnets[i];
        const on = m && m.on;
        v.glow.material.opacity = on ? 0.3 + 0.25 * Math.sin(t * 5) : 0;
        v.glow.scale.setScalar(1 + (on ? ((t * 1.6) % 1) * 1.1 : 0));
      });
      S.launchers.forEach((v, i) => {
        const l = machines.launchers[i];
        if (!l) return;
        const a = Math.max(0, l.anim / 0.3);
        v.spring.scale.y = 1 + a * 1.2;
        v.mat.color.setScalar(1 + a * 0.6);
      });
      S.gates.forEach((v, i) => {
        const gt = machines.gates[i];
        v.u.uT.value = t;
        v.u.uFlash.value = gt ? Math.max(0, gt.flash) : 0;
      });
    }
    for (const r of S.rollers) r.obj.rotation.z += dt * (3 + 6 * this.pulse) * r.dir;

    this.particles.update(dt);
    this.shake = Math.max(0, this.shake - dt * 3);
    this._placeCam(this.shake * 0.25);
  }

  // stage-specific idle: only lights / emissive accents move, structure stays still
  _idle(t) {
    const th = this.theme;
    if (!th) return;
    const idle = th.anim.idle;
    const lamp = this.M.lamp;
    if (idle === 'machineHum') lamp.emissiveIntensity = 0.6 + 0.9 * (Math.sin(t * 3.2) > 0.2 ? 1 : 0.25) + 0.6 * this.pulse;
    else lamp.emissiveIntensity = 0.9 + 0.3 * Math.sin(t * 1.4) + 0.6 * this.pulse;
    const side = this.stage.houseMats[1];
    const base = this.stage.houseMats.baseEmissive || 0;
    const deck = side.userData.deckI || 0;
    if (deck && !th.trim.emissive) side.emissive.setHex(side.userData.deckEmissive);
    if (idle === 'neonPulse') side.emissiveIntensity = base * (0.65 + 0.35 * Math.sin(t * 1.7)) + this.flash * 0.3 + deck;
    else side.emissiveIntensity = base + this.flash * 0.15 + deck * (0.85 + 0.15 * Math.sin(t * 2.2));
    if (this.flash > 0 && !side.emissive.getHex()) side.emissive.set(th.accent);
  }

  dispose() {
    this._dispose(this.stage);
    this.renderer.dispose();
  }
}

