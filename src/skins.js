// Nine-slice pixel-art skins. Each skin is a tiny 12x12 sprite with stepped (not rounded) corners, drawn once into a
// canvas and exported as a data URL; CSS then scales it with `border-image` + `image-rendering: pixelated`
// (slice = 4 source pixels, so panels of any size keep crisp pixel corners and edges).

const N = 12;
const SKINS = {
  navy: { out: '#070b1c', hi: '#4a68b8', f1: '#223466', f2: '#1a2a56', lo: '#0f1938' },
  dark: { out: '#04060f', hi: '#16224a', f1: '#0c1330', f2: '#0a1028', lo: '#060a1c' },
  grey: { out: '#15171c', hi: '#8e94a0', f1: '#626872', f2: '#4d525b', lo: '#31353c' },
  blue: { out: '#0a1c4a', hi: '#9fc8ff', f1: '#3d86ff', f2: '#2563d8', lo: '#173f94' },
  gold: { out: '#3c2200', hi: '#fff2a8', f1: '#ffd23f', f2: '#f0a820', lo: '#b06a00' },
  green: { out: '#06240f', hi: '#c0ffd8', f1: '#3fe08a', f2: '#1f9d5c', lo: '#0f6a38' },
  red: { out: '#30050e', hi: '#ffb4c0', f1: '#ff5470', f2: '#c42a48', lo: '#7a1228' },
  brown: { out: '#1e1405', hi: '#b89438', f1: '#7a5c1a', f2: '#5e4510', lo: '#3a2a08' },
};

function pixel(x, y, k) {
  const l = x, r = N - 1 - x, t = y, b = N - 1 - y;
  const cx = Math.min(l, r), cy = Math.min(t, b);
  if (cx + cy <= 1) return null; // cut corner -> stepped silhouette
  if (Math.min(cx, cy) === 0 || (cx === 1 && cy === 1)) return k.out;
  if (t === 1 || l === 1) return k.hi;
  if (b === 1 || r === 1) return k.lo;
  return y < N / 2 ? k.f1 : k.f2;
}

export function buildSkins() {
  const out = {};
  for (const [name, k] of Object.entries(SKINS)) {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const col = pixel(x, y, k);
      if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
    }
    out[name] = c.toDataURL('image/png');
  }
  return out;
}

export function installSkins() {
  const sk = buildSkins();
  const root = document.documentElement.style;
  for (const [name, url] of Object.entries(sk)) root.setProperty('--sk-' + name, `url("${url}")`);
  document.documentElement.classList.add('skins');
  return sk;
}
