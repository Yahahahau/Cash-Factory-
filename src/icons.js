// Tiny pixel-art icons drawn from text bitmaps -> data URLs (crisp, no image files).
const PAL = {
  k: '#1b1f36', w: '#ffffff', y: '#ffd23f', o: '#ff9e1a', g: '#7dff8a', G: '#2fae5a', b: '#66b8ff',
  B: '#2f6fd0', r: '#ff5470', s: '#c8d4e3', S: '#7c88a6', p: '#c58cff', c: '#66f7ff',
};

const BITMAPS = {
  prod: [
    '...kkkk...',
    '..kssssk..',
    '.kssSSssk.',
    'kssSkkSssk',
    'ksSkwwkSsk',
    'ksSkwwkSsk',
    'kssSkkSssk',
    '.kssSSssk.',
    '..kssssk..',
    '...kkkk...',
  ],
  value: [
    '...kkkk...',
    '..kyyyyk..',
    '.kywyoyyk.',
    'kywyoyyoyk',
    'kyyyoyyoyk',
    'kyyyoyyoyk',
    'kyyoyyyoyk',
    '.kyoyyoyk.',
    '..kooook..',
    '...kkkk...',
  ],
  store: [
    '..........',
    '.kkkkkkkk.',
    'kbbbbbbbbk',
    'kbwwwwwwbk',
    'kBBBBBBBBk',
    'kbbkkkkbbk',
    'kbbkSSkbbk',
    'kbbkkkkbbk',
    'kBBBBBBBBk',
    '.kkkkkkkk.',
  ],
  eff: [
    '.rr....rr.',
    'rrrr..rrrr',
    'rwrr..rrwr',
    'rrrr..rrrr',
    'ssss..ssss',
    'ssss..ssss',
    'sSSs..sSSs',
    '.sSSssSSs.',
    '..sSSSSs..',
    '...ssss...',
  ],
  auto: [
    '....kk....',
    '...kccK...',
    '..kkkkkk..',
    '.kssssssk.',
    '.ksckkcsk.',
    '.ksssssSk.',
    '.kskkkkSk.',
    '..kssSSk..',
    '.kk.kk.kk.',
    '.kk....kk.',
  ],
  gem: [
    '..........',
    '..kkkkkk..',
    '.kcwccbbk.',
    'kcwcccbbBk',
    'kcccccbBBk',
    '.kccbbBBk.',
    '..kcbBBk..',
    '...kbBk...',
    '....kk....',
    '..........',
  ],
  lock: [
    '..........',
    '...kkkk...',
    '..kSkkSk..',
    '..kk..kk..',
    '.kkkkkkkk.',
    '.kyyyyyyk.',
    '.kyykkyyk.',
    '.kyykkyyk.',
    '.kyyyyyyk.',
    '..kkkkkk..',
  ],
};

const cache = {};

export function iconURL(name, scale = 4) {
  const key = name + scale;
  if (cache[key]) return cache[key];
  const rows = BITMAPS[name] || BITMAPS.gem;
  const c = document.createElement('canvas');
  c.width = rows[0].length * scale;
  c.height = rows.length * scale;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || !PAL[ch]) continue;
      g.fillStyle = PAL[ch];
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  cache[key] = c.toDataURL();
  return cache[key];
}
