// Handcrafted pixel sprites for the original blue flying ball ("Bloop"). Drawn procedurally into 1:1 pixels so every
// canvas (mini-game, floating button, reward screen) shows exactly the same character. No external assets.

const C = { o: '#10265c', b: '#3fcfff', l: '#bff6ff', d: '#1a8fe0', w: '#ffffff', k: '#0b1330', p: '#ff8fb0', y: '#ffd23f', s: '#e8f6ff' };

const WING = [
  ['o......', 'owo....', 'owwoo..', '.owwwo.', '..owwwo', '...ooo.'], // up
  ['.......', '.oooo..', 'owwwwoo', '.owwwwo', '..ooooo', '.......'], // mid
  ['...ooo.', '..owwwo', '.owwwo.', 'owwoo..', 'owo....', 'o......'], // down
];
export const BALL_SIZE = 12;
export const WING_FRAMES = 3;

function px(ctx, x, y, col) {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, 1, 1);
}

// draw the 12x12 ball with its top-left at (x, y). frame 0..2 picks the wing pose; blink closes the eye.
export function drawBall(ctx, x, y, frame = 1, opts = {}) {
  x = Math.round(x); y = Math.round(y);
  const wf = WING[((frame % 3) + 3) % 3];
  const wy = frame === 0 ? y - 1 : frame === 1 ? y + 2 : y + 4;
  for (let j = 0; j < wf.length; j++) for (let i = 0; i < 7; i++) {
    const ch = wf[j][i];
    if (ch === 'o') px(ctx, x - 6 + i, wy + j, C.o);
    else if (ch === 'w') px(ctx, x - 6 + i, wy + j, j >= 3 ? C.s : C.w);
  }
  for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
    const d = Math.hypot(i - 5.5, j - 5.5);
    if (d > 5.9) continue;
    let col;
    if (d >= 4.9) col = C.o;
    else if (Math.hypot(i - 3.4, j - 3.2) < 1.9) col = C.l;
    else if (j + i > 12 || d > 4.1) col = C.d;
    else col = C.b;
    px(ctx, x + i, y + j, col);
  }
  // face: big eye, cheek and a tiny smile
  const blink = !!opts.blink;
  if (blink) { px(ctx, x + 6, y + 5, C.k); px(ctx, x + 7, y + 5, C.k); px(ctx, x + 8, y + 5, C.k); }
  else {
    for (let j = 3; j < 6; j++) for (let i = 6; i < 9; i++) px(ctx, x + i, y + j, C.w);
    px(ctx, x + 7, y + 4, C.k); px(ctx, x + 8, y + 4, C.k); px(ctx, x + 7, y + 5, C.k); px(ctx, x + 8, y + 5, C.k);
    px(ctx, x + 7, y + 4, C.k);
  }
  px(ctx, x + 4, y + 7, C.p);
  px(ctx, x + 7, y + 8, C.k); px(ctx, x + 8, y + 8, C.k); px(ctx, x + 9, y + 7, C.k);
}

// render the ball into a fresh canvas element (used by the floating button and screens)
export function ballCanvas(frame = 1, blink = false) {
  const c = document.createElement('canvas');
  c.width = 20; c.height = 16;
  c.className = 'pxcanvas';
  drawBall(c.getContext('2d'), 7, 3, frame, { blink });
  return c;
}
export function paintBall(canvas, frame, blink) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBall(ctx, 7, 3, frame, { blink });
}
