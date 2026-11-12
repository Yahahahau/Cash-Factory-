// Retro pixel post-process, kept completely separate from the normal render path.
// ON : scene -> low-res nearest-filtered target (colour + depth) -> upscale pass with depth outlines + light dither.
// OFF: renderer draws the scene straight to the canvas (smooth, full resolution).
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 rtSize;       // low-res target size (texels)
uniform float blockPx;     // size of one low-res pixel in canvas device pixels
uniform float camNear;
uniform float camFar;
uniform float levels;
varying vec2 vUv;

float lin(float d){
  float z = d * 2.0 - 1.0;
  return (2.0 * camNear * camFar) / (camFar + camNear - z * (camFar - camNear));
}
float bayer(vec2 p){
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  // 4x4 Bayer matrix without arrays (GLSL ES 1.0 friendly)
  float v = 0.0;
  if(i<0.5) v=0.0; else if(i<1.5) v=8.0; else if(i<2.5) v=2.0; else if(i<3.5) v=10.0;
  else if(i<4.5) v=12.0; else if(i<5.5) v=4.0; else if(i<6.5) v=14.0; else if(i<7.5) v=6.0;
  else if(i<8.5) v=3.0; else if(i<9.5) v=11.0; else if(i<10.5) v=1.0; else if(i<11.5) v=9.0;
  else if(i<12.5) v=15.0; else if(i<13.5) v=7.0; else if(i<14.5) v=13.0; else v=5.0;
  return v / 16.0 - 0.5;
}
void main(){
  vec2 texel = floor(gl_FragCoord.xy / blockPx);
  vec2 uv = (texel + 0.5) / rtSize;
  vec2 px = 1.0 / rtSize;
  vec3 col = texture2D(tColor, uv).rgb;
  float d0 = lin(texture2D(tDepth, uv).r);
  float edge = 0.0;
  float dr = lin(texture2D(tDepth, uv + vec2(px.x, 0.0)).r);
  float dl = lin(texture2D(tDepth, uv - vec2(px.x, 0.0)).r);
  float du = lin(texture2D(tDepth, uv + vec2(0.0, px.y)).r);
  float dd = lin(texture2D(tDepth, uv - vec2(0.0, px.y)).r);
  float thr = d0 * 0.0085;
  // this pixel is the foreground side of a depth step -> outline it
  if (dr - d0 > thr || dl - d0 > thr || du - d0 > thr || dd - d0 > thr) edge = 1.0;
  col = mix(col, col * 0.28, edge);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  vec3 c = gl_FragColor.rgb;
  float dth = bayer(texel) / levels;
  c = floor((c + dth) * levels + 0.5) / levels;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export class PixelPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.rt = null;
    this.targetRows = 320;
    this.block = 3;
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.Camera();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        rtSize: { value: new THREE.Vector2(1, 1) },
        blockPx: { value: 3 },
        camNear: { value: camera.near },
        camFar: { value: camera.far },
        levels: { value: 40 },
      },
    });
    const quad = new THREE.Mesh(geo, this.mat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  // canvasW/H are drawing-buffer pixels (device pixels)
  resize(canvasW, canvasH, targetRows) {
    this.targetRows = targetRows;
    const block = Math.max(2, Math.round(canvasH / targetRows));
    this.block = block;
    const w = Math.ceil(canvasW / block);
    const h = Math.ceil(canvasH / block);
    if (this.rt) this.rt.dispose();
    const depth = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    depth.minFilter = depth.magFilter = THREE.NearestFilter;
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture: depth,
      depthBuffer: true,
      samples: 0,
    });
    this.rt.texture.generateMipmaps = false;
    this.mat.uniforms.tColor.value = this.rt.texture;
    this.mat.uniforms.tDepth.value = depth;
    this.mat.uniforms.rtSize.value.set(w, h);
    this.mat.uniforms.blockPx.value = block;
    this.mat.uniforms.camNear.value = this.camera.near;
    this.mat.uniforms.camFar.value = this.camera.far;
    return { w, h, block };
  }

  get aspect() {
    return this.rt ? this.rt.width / this.rt.height : 1;
  }

  render() {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  dispose() {
    if (this.rt) this.rt.dispose();
    this.mat.dispose();
  }
}
