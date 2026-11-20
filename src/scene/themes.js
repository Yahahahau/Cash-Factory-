// Stage presentation themes. One theme per palette slot (stage n uses THEMES[(n - 1) % 6]), so stages
// 1..6 each have their own identity and later stages cycle through them. Everything a stage looks like
// is data here: surfaces, colours, lighting, backdrop, ambient effect and which animations it uses.
// Gameplay never reads this file.

export const THEMES = [
  {
    key: 'steelworks', name: 'Steel Works',
    surface: { kind: 'steel', color: 0xb3bac7, rough: 0.6, metal: 0.25, normal: 0.9 },
    trim: { color: 0xdfe3ea, rough: 0.5, metal: 0.2 },
    accent: 0xffc533,
    bg: { mode: 0, edge: 0x0b0d12, mid: 0xc9ced8, glow: 0xffd56a, pattern: 0x8f97a8 },
    light: { sky: 0xffffff, ground: 0x9aa3b8, hemi: 1.05, key: 0xfff6e8, keyI: 2.0, fill: 0x9fc3ff, fillI: 0.55, exposure: 1.0 },
    ambient: 'gears',
    anim: { enter: 'extrude', exit: 'retract', idle: 'machineHum', celebrate: 'sparkBurst' },
  },
  {
    key: 'tidepool', name: 'Tide Pool',
    surface: { kind: 'tile', color: 0x9fcaf2, rough: 0.35, metal: 0.0, normal: 1.0 },
    trim: { color: 0xe3f0ff, rough: 0.35, metal: 0.0 },
    accent: 0x6fe3ff,
    bg: { mode: 1, edge: 0x0e2a78, mid: 0x5e8fe6, glow: 0xa8e8ff, pattern: 0xbfe6ff },
    light: { sky: 0xe8f3ff, ground: 0x51608f, hemi: 1.1, key: 0xffffff, keyI: 1.8, fill: 0x6fd7ff, fillI: 0.7, exposure: 1.0 },
    ambient: 'caustics',
    anim: { enter: 'rise', exit: 'sink', idle: 'gentleSway', celebrate: 'bubbleBurst' },
  },
  {
    key: 'neonarcade', name: 'Neon Arcade',
    surface: { kind: 'hex', color: 0xc4b2f4, rough: 0.55, metal: 0.1, normal: 0.55 },
    trim: { color: 0xece4ff, rough: 0.3, metal: 0.1, emissive: 0x9a5cff, emissiveI: 0.22 },
    accent: 0xff5ce1,
    bg: { mode: 2, edge: 0x1d0f52, mid: 0x8a6be0, glow: 0xff7be8, pattern: 0xc8a8ff },
    light: { sky: 0xf2eaff, ground: 0x4a3784, hemi: 1.0, key: 0xffffff, keyI: 1.85, fill: 0xff7be8, fillI: 0.75, exposure: 1.0 },
    ambient: 'starfield',
    anim: { enter: 'zip', exit: 'retract', idle: 'neonPulse', celebrate: 'sparkBurst' },
  },
  {
    key: 'candyworks', name: 'Candy Works',
    surface: { kind: 'quilt', color: 0xf7b3cf, rough: 0.35, metal: 0.0, normal: 1.0 },
    trim: { color: 0xffe8f1, rough: 0.25, metal: 0.0 },
    accent: 0xffe45c,
    bg: { mode: 3, edge: 0x6a1f40, mid: 0xe68fb0, glow: 0xfff0a0, pattern: 0xffc6dc },
    light: { sky: 0xfff4f8, ground: 0x93506e, hemi: 1.1, key: 0xfff8f0, keyI: 1.8, fill: 0xffb3d4, fillI: 0.6, exposure: 1.0 },
    ambient: 'bokeh',
    anim: { enter: 'pop', exit: 'squash', idle: 'gentleSway', celebrate: 'confetti' },
  },
  {
    key: 'biolab', name: 'Bio Lab',
    surface: { kind: 'plaster', color: 0xa9e6d8, rough: 0.85, metal: 0.0, normal: 0.8 },
    trim: { color: 0xdcf3ee, rough: 0.4, metal: 0.25 },
    accent: 0x7dffcf,
    bg: { mode: 4, edge: 0x063e47, mid: 0x55c6ba, glow: 0xb7ffe9, pattern: 0xa6f2e4 },
    light: { sky: 0xf0fffb, ground: 0x2f6f73, hemi: 1.1, key: 0xffffff, keyI: 1.8, fill: 0x7dffcf, fillI: 0.6, exposure: 1.0 },
    ambient: 'bubbles',
    anim: { enter: 'rise', exit: 'sink', idle: 'machineHum', celebrate: 'bubbleBurst' },
  },
  {
    key: 'sunworkshop', name: 'Sun Workshop',
    surface: { kind: 'wood', color: 0xdcae7c, rough: 0.7, metal: 0.0, normal: 1.0 },
    trim: { color: 0xf3dcc0, rough: 0.6, metal: 0.0 },
    accent: 0xffb13d,
    bg: { mode: 5, edge: 0x6a2a0c, mid: 0xf0a560, glow: 0xffe2a0, pattern: 0xffd39a },
    light: { sky: 0xfff2dc, ground: 0x8a5532, hemi: 1.05, key: 0xffe8c4, keyI: 2.0, fill: 0xffb36a, fillI: 0.55, exposure: 1.0 },
    ambient: 'sunrays',
    anim: { enter: 'slam', exit: 'retract', idle: 'gentleSway', celebrate: 'sparkBurst' },
  },
];

export function themeFor(stageN) {
  return THEMES[(Math.max(1, stageN | 0) - 1) % THEMES.length];
}
