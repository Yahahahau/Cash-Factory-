// Themed back wall: one full-screen plane whose shader draws each theme's background and its ambient
// effect (panel grid + light beam, caustics + bubbles, neon grid + stars, bokeh, lab light bands +
// bubbles, sun rays + dust). Two themes are blended with an upward wipe during a stage transition.
// Ambient effects cost one draw call; only Steel Works adds three slow gear meshes behind the machine.
import * as THREE from 'three';
import { SLAB_Z } from '../layout.js';
import { gearGeo } from './props.js';

const VERT = /* glsl */ `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vW;
uniform float uT, uMix, uFlash, uQ;
uniform vec3 aEdge, aMid, aGlow, aPat; uniform float aMode;
uniform vec3 bEdge, bMid, bGlow, bPat; uniform float bMode;
uniform vec3 uFlashCol;

float h1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// rising round particles in columns of cells: returns (disc, ring)
vec2 cellDots(vec2 p, float cell, float speed, float seed, float rMin, float rMax){
  float col = floor(p.x / cell);
  float sp = speed * (0.6 + 0.8 * h1(vec2(col, seed)));
  vec2 q = vec2(p.x, p.y - uT * sp);
  vec2 id = floor(q / cell);
  vec2 f = fract(q / cell) - 0.5;
  float r = h1(id + seed);
  if (r < 0.55) return vec2(0.0);
  vec2 o = (vec2(h1(id + seed + 3.1), h1(id + seed + 7.7)) - 0.5) * 0.5;
  float rad = mix(rMin, rMax, h1(id + seed + 1.3));
  float d = length(f - o) * cell;
  float disc = 1.0 - smoothstep(rad * 0.7, rad, d);
  float ring = smoothstep(rad * 0.55, rad * 0.85, d) * (1.0 - smoothstep(rad * 0.85, rad, d));
  return vec2(disc, ring);
}
float gridLine(float v, float w){ float d = abs(fract(v) - 0.5); return smoothstep(0.5 - w, 0.5, d); }

vec3 theme(float mode, vec3 edge, vec3 mid, vec3 glow, vec3 pat, vec2 p){
  float t = clamp(abs(p.x) / 3.0, 0.0, 1.0);
  float k = smoothstep(0.05, 1.0, pow(t, 0.85));
  float up = clamp(p.y / 15.0, 0.0, 1.0);
  vec3 c = mix(mid, edge, k);
  c *= 0.88 + 0.14 * up;
  int m = int(mode + 0.5);
  if (m == 0) {
    // steel works: large wall panels and a slow sweeping light beam
    float g = max(gridLine(p.x / 3.0 + 0.5, 0.008), gridLine(p.y / 3.0, 0.008));
    c = mix(c, c * 0.9, g * (1.0 - k * 0.6));
    float beam = exp(-pow((p.x * 0.8 + p.y * 0.45 - 6.0 - sin(uT * 0.12) * 4.0) / 1.6, 2.0));
    c += glow * beam * 0.09 * (1.0 - k);
  } else if (m == 1) {
    // tide pool: animated caustics brighter towards the surface + drifting bubbles
    vec2 q = p * 1.1;
    float w = 0.0;
    for (int i = 0; i < 3; i++) {
      q += vec2(sin(q.y * 1.6 + uT * 0.55 + float(i)), cos(q.x * 1.4 - uT * 0.45 + float(i) * 1.3)) * 0.42;
      w += abs(sin(q.x + q.y));
    }
    float ca = pow(1.0 - clamp(w / 3.0, 0.0, 1.0), 3.0);
    c += glow * ca * 0.3 * (0.3 + 0.7 * up) * (1.0 - k * 0.5);
    vec2 b = cellDots(p, 0.9, 0.35, 2.0, 0.05, 0.13) * uQ;
    c += pat * (b.y * 0.45 + b.x * 0.06);
  } else if (m == 2) {
    // neon arcade: glowing floor grid fading upwards + twinkling stars
    float fade = 1.0 - smoothstep(1.0, 9.0, p.y);
    float gx = gridLine(p.x / 0.75, 0.035), gy = gridLine((p.y + uT * 0.25) / 0.75, 0.035);
    c += glow * max(gx, gy) * 0.32 * fade * (1.0 - k * 0.4);
    vec2 cell = floor(p / 0.55);
    float s = h1(cell);
    vec2 f = fract(p / 0.55) - 0.5 - (vec2(h1(cell + 4.0), h1(cell + 9.0)) - 0.5) * 0.6;
    float tw = 0.5 + 0.5 * sin(uT * (1.5 + s * 3.0) + s * 40.0);
    float star = step(0.88, s) * (1.0 - smoothstep(0.0, 0.07, length(f))) * tw * (1.0 - fade * 0.7);
    c += pat * star * 0.9 * uQ;
  } else if (m == 3) {
    // candy works: soft drifting bokeh + very faint candy stripes
    float st = smoothstep(0.45, 0.5, abs(fract((p.x + p.y) * 0.35) - 0.5));
    c = mix(c, c * 1.04, st);
    vec2 b = cellDots(p + vec2(0.0, 0.0), 1.3, 0.18, 5.0, 0.12, 0.3);
    vec2 b2 = cellDots(p + vec2(0.6, 0.3), 0.8, 0.1, 9.0, 0.06, 0.16) * uQ;
    c += pat * (b.x * 0.16 + b2.x * 0.12) * (1.0 - k * 0.5);
  } else if (m == 4) {
    // bio lab: vertical light bands with bubbles rising inside them
    float band = pow(0.5 + 0.5 * cos(p.x * 2.1), 6.0);
    c += glow * band * 0.1 * (1.0 - k * 0.6);
    vec2 b = cellDots(p, 0.6, 0.9, 13.0, 0.04, 0.09) * uQ;
    c += pat * (b.y * 0.5 + b.x * 0.05) * (0.3 + band);
  } else {
    // sun workshop: slow sun rays from the upper left + floating dust
    vec2 o = p - vec2(-5.0, 19.0);
    float a = atan(o.y, o.x);
    float rays = pow(0.5 + 0.5 * sin(a * 18.0 + sin(uT * 0.2) * 0.6), 4.0);
    float fall = exp(-length(o) * 0.07);
    c += glow * rays * fall * 0.35 * (1.0 - k * 0.5);
    vec2 d = cellDots(p + vec2(sin(p.y * 0.7 + uT * 0.3) * 0.2, 0.0), 0.5, 0.06, 21.0, 0.015, 0.035) * uQ;
    c += glow * d.x * 0.35;
  }
  c += (h1(floor(p * 14.0)) - 0.5) * 0.01;
  return c;
}

void main(){
  vec2 p = vW.xy;
  vec3 ca = theme(aMode, aEdge, aMid, aGlow, aPat, p);
  vec3 col = ca;
  if (uMix > 0.0) {
    vec3 cb = theme(bMode, bEdge, bMid, bGlow, bPat, p);
    float s = clamp((p.y + p.x * 0.35) / 18.0 + 0.1, 0.0, 1.0);
    float edge = uMix * 1.3 - 0.15;
    float m = 1.0 - smoothstep(edge - 0.1, edge, s);
    col = mix(ca, cb, m);
    float line = exp(-pow((s - edge + 0.04) / 0.025, 2.0)) * step(0.001, uMix) * step(uMix, 0.999);
    col += bGlow * line * 0.55;
  }
  col += uFlashCol * uFlash * 0.45;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export class Backdrop {
  constructor(scene, M) {
    const C = (v) => new THREE.Color(v);
    this.u = {
      uT: { value: 0 }, uMix: { value: 0 }, uFlash: { value: 0 }, uQ: { value: 1 }, uFlashCol: { value: C(0xffffff) },
      aEdge: { value: C(0) }, aMid: { value: C(0) }, aGlow: { value: C(0) }, aPat: { value: C(0) }, aMode: { value: 0 },
      bEdge: { value: C(0) }, bMid: { value: C(0) }, bGlow: { value: C(0) }, bPat: { value: C(0) }, bMode: { value: 0 },
    };
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u }));
    bg.position.set(0, 8, -SLAB_Z - 0.3);
    scene.add(bg);
    this.plane = bg;
    // transparent shadow catcher just in front of the back wall: platforms and coins cast soft shadows on it
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.24 }));
    sh.position.set(0, 8, -SLAB_Z - 0.29);
    sh.receiveShadow = true;
    scene.add(sh);
    this.catcher = sh;

    // Steel Works gears (behind the machine, slowly turning, meshing)
    this.gearMat = new THREE.MeshBasicMaterial({ color: 0x6e7688 }); // unlit: reads as part of the back wall
    this.gears = new THREE.Group();
    const spec = [[-2.2, 12.9, 1.1, 1], [-0.35, 12.55, 0.78, -1.41], [2.3, 7.4, 0.9, 1], [-1.9, 7.9, 0.6, -1.3]];
    this.gearList = spec.map(([x, y, r, sp]) => {
      const g = new THREE.Mesh(gearGeo(), this.gearMat);
      g.scale.setScalar(r);
      g.position.set(x, y, -SLAB_Z - 0.26);
      g.userData = { sp, base: r };
      this.gears.add(g);
      return g;
    });
    this.gears.visible = false;
    scene.add(this.gears);
    this.a = null; this.b = null; this.gearW = 0; this._tmpC = new THREE.Color();
  }

  _put(prefix, th) {
    const u = this.u;
    u[prefix + 'Edge'].value.set(th.bg.edge); u[prefix + 'Mid'].value.set(th.bg.mid); u[prefix + 'Glow'].value.set(th.bg.glow); u[prefix + 'Pat'].value.set(th.bg.pattern);
    u[prefix + 'Mode'].value = th.bg.mode;
  }
  // instant switch
  setTheme(th) { this.a = th; this.b = null; this._put('a', th); this.u.uMix.value = 0; this._gearTarget(); }
  // start a crossfade towards `th` (drive with setMix 0..1, then call finish())
  beginBlend(th) { this.b = th; this._put('b', th); this.u.uMix.value = 0; }
  setMix(v) { this.u.uMix.value = v; }
  finish() { if (this.b) { this.a = this.b; this._put('a', this.b); this.b = null; } this.u.uMix.value = 0; }
  _gearTarget() { return (this.a && this.a.ambient === 'gears' ? 1 - this.u.uMix.value : 0) + (this.b && this.b.ambient === 'gears' ? this.u.uMix.value : 0); }

  setQuality(q) { this.u.uQ.value = q.shadows ? 1 : 0; }

  update(dt) {
    this.u.uT.value += dt;
    const w = this._gearTarget();
    this.gearW += (w - this.gearW) * Math.min(1, dt * 6);
    this.gears.visible = this.gearW > 0.01;
    if (this.gears.visible) {
      const th = this.a || this.b;
      if (th) this.gearMat.color.set(th.bg.mid).lerp(this._tmpC.set(th.bg.edge), 0.3);
      for (const g of this.gearList) {
        g.rotation.z += dt * 0.12 * g.userData.sp;
        g.scale.setScalar(g.userData.base * this.gearW);
      }
    }
  }
}
