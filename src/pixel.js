// Retro pixel post-process, kept completely separate from the normal render path.
// ON : scene -> low-res nearest-filtered target (colour) -> upscale pass with a light dither; no outlines.
// OFF: renderer draws the scene straight to the canvas (smooth, full resolution).
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform vec2 rtSize;       // low-res target size (texels)
uniform float blockPx;     // size of one low-res pixel in canvas device pixels
uniform float levels;
varying vec2 vUv;

float bayer(vec2 p){
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
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
  vec3 col = texture2D(tColor, uv).rgb;
  // mild unsharp mask on the low-res image: crisper surfaces / coin faces, still no outlines
  vec2 px = 1.0 / rtSize;
  vec3 blur = 0.25 * (texture2D(tColor, uv + vec2(px.x, 0.0)).rgb + texture2D(tColor, uv - vec2(px.x, 0.0)).rgb
                    + texture2D(tColor, uv + vec2(0.0, px.y)).rgb + texture2D(tColor, uv - vec2(0.0, px.y)).rgb);
  col = clamp(col + (col - blur) * 0.55, 0.0, 1.0);
  // a touch more contrast and saturation so each model reads clearly
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.12);
  col = clamp((col - 0.5) * 1.07 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  // gentle palette quantisation + very light ordered dither (no outlines / edge detection)
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
        rtSize: { value: new THREE.Vector2(1, 1) },
        blockPx: { value: 3 },
        levels: { value: 96 },
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
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      samples: 4,
    });
    this.rt.texture.generateMipmaps = false;
    this.mat.uniforms.tColor.value = this.rt.texture;
    this.mat.uniforms.rtSize.value.set(w, h);
    this.mat.uniforms.blockPx.value = block;
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
