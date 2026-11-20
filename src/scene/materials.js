// Shared material library. Every distinct real-world material has one instance that all props share
// (metal reads as metal, rubber as rubber, painted plastic as plastic). The house (walls + platforms)
// gets a per-theme pair of materials with the "part growth" vertex hook used by stage animations.
import * as THREE from 'three';
import { surface } from './textures.js';

export const PART_N = 16;

// ---------- canvas decals ----------
function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function hazardTex() {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#ffcf1f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1d24';
    for (let i = -h; i < w + h; i += 32) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + 16, h); g.lineTo(i + 16 + h, 0); g.lineTo(i + h, 0); g.closePath(); g.fill(); }
    // light wear along the stripes
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 30; i++) g.fillRect((i * 23) % w, (i * 41) % h, 3, 1);
  }, { repeat: true });
}
export function chevronTex() {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffb43a'); gr.addColorStop(1, '#ff8a12');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff4c4'; g.lineWidth = 9; g.lineJoin = 'round'; g.lineCap = 'round';
    for (let y = -8; y < h; y += 28) { g.beginPath(); g.moveTo(10, y + 22); g.lineTo(w / 2, y + 2); g.lineTo(w - 10, y + 22); g.stroke(); }
  }, { repeat: true });
}
// soft streak used by the wind of the fans (alpha along its length)
export function streakTex() {
  return canvasTex(64, 8, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 2, w, h - 4);
  });
}

// ---------- vertex hook: per part scale / offset (stage entrance / exit) ----------
export function makePartUniform() {
  return { value: Array.from({ length: PART_N }, () => new THREE.Vector4(1, 1, 0, 0)) };
}
export function addPartHook(mat, uParts, key) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uParts = uParts;
    shader.vertexShader = `attribute vec3 aPart;\nuniform vec4 uParts[${PART_N}];\n` + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        { vec4 pS = uParts[int(aPart.x + 0.5)];
          objectNormal = normalize(objectNormal * vec3(max(pS.y, 0.001), max(pS.x, 0.001), max(pS.x * pS.y, 0.000001))); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 pq = uParts[int(aPart.x + 0.5)];
          transformed.x = aPart.y + (transformed.x - aPart.y) * pq.x + pq.z;
          transformed.y = aPart.z + (transformed.y - aPart.z) * pq.y + pq.w; }`);
  };
  mat.customProgramCacheKey = () => 'parts-' + key;
  return mat;
}

export class MaterialLibrary {
  constructor(envMap) {
    this.envMap = envMap;
    this.uParts = makePartUniform();
    this._house = new Map();
    this.tex = { hazard: hazardTex(), chevron: chevronTex(), streak: streakTex() };
    // image based reflections only where they matter (metals, glossy plastics): cheaper than a scene-wide environment
    const std = (o) => new THREE.MeshStandardMaterial(o.metalness > 0.3 ? { envMap, ...o } : o);
    const phys = (o) => new THREE.MeshPhysicalMaterial({ envMap, ...o });
    this.m = {
      chrome: std({ color: 0xe3e8f0, metalness: 1.0, roughness: 0.16, envMapIntensity: 1.25 }),
      steel: std({ color: 0xb4bccb, metalness: 0.85, roughness: 0.36, envMapIntensity: 1.0 }),
      darkSteel: std({ color: 0x5d6475, metalness: 0.8, roughness: 0.42, envMapIntensity: 1.0 }),
      housing: std({ color: 0x3b4253, metalness: 0.45, roughness: 0.5 }),
      brass: std({ color: 0xd8a842, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.0 }),
      rubber: std({ color: 0x24272f, metalness: 0.0, roughness: 0.92 }),
      interior: std({ color: 0x07080c, metalness: 0.0, roughness: 1.0 }),
      pipe: phys({ color: 0x2fc95b, metalness: 0.0, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.25, emissive: 0x0a3a14, emissiveIntensity: 0.35 }),
      pipeDark: phys({ color: 0x1a8a3a, metalness: 0.0, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
      red: phys({ color: 0xe0383a, metalness: 0.0, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2, emissive: 0x3a0606, emissiveIntensity: 0.4 }),
      redDark: std({ color: 0x8e1d22, metalness: 0.1, roughness: 0.5 }),
      hazard: std({ map: this.tex.hazard, metalness: 0.1, roughness: 0.55 }),
      grinderGreen: phys({ color: 0x36d65a, roughness: 0.35, clearcoat: 0.6, emissive: 0x0b3a14, emissiveIntensity: 0.5 }),
      emitter: std({ color: 0x7dffb0, emissive: 0x2bff88, emissiveIntensity: 0.9, roughness: 0.3 }),
      lamp: std({ color: 0xffd36a, emissive: 0xffa800, emissiveIntensity: 1.2, roughness: 0.4 }),
      wind: new THREE.MeshBasicMaterial({ map: this.tex.streak, color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }),
      decor: std({ color: 0x8f97a8, metalness: 0.6, roughness: 0.55 }),
    };
  }

  // walls + platforms for a theme: [faceMaterial, sideMaterial] (extrusion groups 0 = caps, 1 = sides)
  house(theme) {
    if (this._house.has(theme.key)) return this._house.get(theme.key);
    const s = surface(theme.surface.kind), sp = surface('paint');
    // the walls cover most of the screen: colour + normal map only (no roughness map, no reflections) to keep
    // the per-pixel cost low on phones; the relief and shade variation come from the shared height field
    const face = new THREE.MeshStandardMaterial({
      color: theme.surface.color, map: s.map, normalMap: s.normalMap,
      roughness: theme.surface.rough, metalness: theme.surface.metal,
      normalScale: new THREE.Vector2(theme.surface.normal, theme.surface.normal),
    });
    const side = new THREE.MeshStandardMaterial({
      color: theme.trim.color, map: sp.map,
      roughness: theme.trim.rough, metalness: theme.trim.metal,
      emissive: theme.trim.emissive || 0x000000, emissiveIntensity: theme.trim.emissiveI || 0,
    });
    face.userData.normalMap = s.normalMap;
    this._applyDetail(face);
    addPartHook(face, this.uParts, 'face-' + theme.key);
    addPartHook(side, this.uParts, 'side-' + theme.key);
    const pair = [face, side];
    pair.baseEmissive = theme.trim.emissiveI || 0;
    this._house.set(theme.key, pair);
    return pair;
  }

  houseDepth() {
    if (!this._depth) {
      this._depth = addPartHook(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), this.uParts, 'depth');
    }
    return this._depth;
  }

  // low quality: walls without normal maps (fewer texture reads on the largest surfaces)
  setDetail(high) {
    this.detail = high;
    for (const [face] of this._house.values()) this._applyDetail(face);
  }
  _applyDetail(face) {
    const want = this.detail === false ? null : face.userData.normalMap;
    if (face.normalMap !== want) { face.normalMap = want; face.needsUpdate = true; }
  }

  resetParts() { for (const v of this.uParts.value) v.set(1, 1, 0, 0); }
}
