// FLYING BALL mini-game: original tap-to-fly arcade game (Canvas 2D, pixel art, independent of the 3D renderer).
// `FlyCore` is pure game logic (also used by the tests). `FlyView` is the DOM/canvas screen and is loaded lazily.
import { drawBall, BALL_SIZE } from './sprites.js';

export const FLY = { W: 120, H: 208, GROUND: 18, BX: 34, R: 4.6, G: 520, FLAP: -150, MAXV: 240, SPEED0: 44, SPEEDMAX: 66, GAP0: 52, GAPMIN: 42, SPACING: 72, PIPEW: 16, FIRST: 96 };
const SUB = 1 / 120;

export class FlyCore {
  constructor(objective, rnd = Math.random) {
    this.rnd = rnd;
    this.onEvent = null;
    this.reset(objective);
  }

  reset(objective) {
    this.objective = objective;
    this.state = 'ready'; // ready -> play -> dead | won
    this.score = 0;
    this.t = 0; // seconds of real flight (from the first flap)
    this.y = FLY.H * 0.42;
    this.vy = 0;
    this.pipes = [];
    this.lastCenter = FLY.H * 0.4;
    this.nextX = FLY.W + FLY.FIRST - FLY.SPACING;
    this.scroll = 0;
    this.wing = 0;
    this.wingT = 0;
    this.squash = 0; // + = stretched (flap), - = squashed (hit)
    this.flapped = 0;
    this._acc = 0;
    this._fill();
  }

  get speed() {
    return Math.min(FLY.SPEEDMAX, FLY.SPEED0 + this.score * 1.8);
  }
  get gap() {
    return Math.max(FLY.GAPMIN, FLY.GAP0 - this.score * 0.8);
  }

  _fill() {
    while (this.nextX < FLY.W + 24) {
      this.nextX += FLY.SPACING;
      const gap = this.gap;
      const lo = 16 + gap / 2, hi = FLY.H - FLY.GROUND - 16 - gap / 2;
      let c = this.lastCenter + (this.rnd() * 2 - 1) * 52;
      c = Math.max(lo, Math.min(hi, c));
      this.lastCenter = c;
      this.pipes.push({ x: this.nextX, c, gap, passed: false });
    }
  }

  flap() {
    if (this.state === 'ready') this.state = 'play';
    if (this.state !== 'play') return false;
    this.vy = FLY.FLAP;
    this.squash = 1;
    this.flapped++;
    this.wingT = 0.25;
    this._emit('flap');
    return true;
  }

  _emit(e) {
    if (this.onEvent) this.onEvent(e);
  }

  update(dt) {
    this._acc += Math.min(dt, 0.1);
    while (this._acc >= SUB) { this._acc -= SUB; this._step(SUB); }
    this.squash += (0 - this.squash) * Math.min(1, dt * 10);
    this.wingT = Math.max(0, this.wingT - dt);
    this._wa = (this._wa || 0) + dt * (this.wingT > 0 ? 24 : this.state === 'play' ? 8 : 6);
    this.wing = Math.floor(this._wa) % 3;
  }

  _step(h) {
    if (this.state === 'ready') {
      this.y = FLY.H * 0.42 + Math.sin(performance_now() * 0.004) * 3;
      this.scroll += 30 * h;
      return;
    }
    if (this.state === 'dead') {
      this.vy = Math.min(FLY.MAXV, this.vy + FLY.G * h);
      this.y = Math.min(FLY.H - FLY.GROUND - FLY.R, this.y + this.vy * h);
      return;
    }
    if (this.state === 'won') {
      this.scroll += this.speed * h * 0.5;
      this.y += (FLY.H * 0.42 - this.y) * Math.min(1, h * 4);
      this.vy = 0;
      return;
    }
    this.t += h;
    const sp = this.speed;
    this.scroll += sp * h;
    this.vy = Math.min(FLY.MAXV, this.vy + FLY.G * h);
    this.y += this.vy * h;
    if (this.y < FLY.R) { this.y = FLY.R; if (this.vy < 0) this.vy = 0; }
    for (const p of this.pipes) p.x -= sp * h;
    while (this.pipes.length && this.pipes[0].x + FLY.PIPEW < -4) this.pipes.shift();
    this.nextX -= sp * h;
    this._fill();
    // ground
    if (this.y + FLY.R >= FLY.H - FLY.GROUND) { this.y = FLY.H - FLY.GROUND - FLY.R; this._die(); return; }
    for (const p of this.pipes) {
      if (!p.passed && p.x + FLY.PIPEW < FLY.BX - FLY.R) {
        p.passed = true;
        this.score++;
        this._emit('score');
        if (this.score >= this.objective) { this.state = 'won'; this._emit('won'); return; }
      }
      if (this._hit(p)) { this._die(); return; }
    }
  }

  _hit(p) {
    if (p.x > FLY.BX + FLY.R || p.x + FLY.PIPEW < FLY.BX - FLY.R) return false;
    const top = p.c - p.gap / 2, bot = p.c + p.gap / 2;
    const near = (x, y, x0, y0, x1, y1) => {
      const cx = Math.max(x0, Math.min(x, x1)), cy = Math.max(y0, Math.min(y, y1));
      return (x - cx) ** 2 + (y - cy) ** 2 < FLY.R * FLY.R;
    };
    // pipe bodies + 2px wider caps next to the gap
    return (
      near(FLY.BX, this.y, p.x, -50, p.x + FLY.PIPEW, top) ||
      near(FLY.BX, this.y, p.x, bot, p.x + FLY.PIPEW, FLY.H) ||
      near(FLY.BX, this.y, p.x - 2, top - 6, p.x + FLY.PIPEW + 2, top) ||
      near(FLY.BX, this.y, p.x - 2, bot, p.x + FLY.PIPEW + 2, bot + 6)
    );
  }

  _die() {
    this.state = 'dead';
    this.vy = -90;
    this.squash = -1;
    this._emit('dead');
  }
}
const performance_now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ---------------------------------------------------------------------------------------------------------------------
const SKY = ['#4fc3f7', '#72d3fb', '#97e0fd', '#bdecfe'];

export class FlyView {
  // opts: { objective, best, audio, onFinish(result) , onRetry() -> objective|null, onClose() }
  constructor(host, opts) {
    this.o = opts;
    this.host = host;
    this.core = new FlyCore(opts.objective);
    this.core.onEvent = (e) => this._event(e);
    this.settled = false;
    this.paused = false;
    this.over = false;
    this.shake = 0;
    this._build();
    this._bind();
    this.showIntro();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this._frame(t));
  }

  _build() {
    const wm = this.o.wm;
    this.win = wm.open({
      id: 'fly', title: 'Flying Ball', icon: 'ball', width: 380, height: 'calc(100% - 8px)', fill: true, cls: 'tall', task: true,
      html: `<div class="fly-body">
        <div class="fly-bar"><button class="xpbtn touch" id="mPause" aria-label="Pause" style="min-width:0"><span>Pause</span></button>
          <div class="sc"><b id="mScore">0</b><small id="mObj"></small></div>
          <button class="xpbtn touch" id="mRetryTop" aria-label="Retry" style="min-width:0"><span>Retry</span></button></div>
        <div class="fly-stage" id="mStage"><canvas id="mCanvas" width="${FLY.W}" height="${FLY.H}"></canvas><div class="fly-ov hidden" id="mOv"></div></div></div>`,
      onClose: () => { if (!this.dead) this.close(); },
      onMinimize: () => this.togglePause(true),
      onResize: () => requestAnimationFrame(() => this._fit()),
    });
    const el = this.win.body;
    this.el = el;
    this.canvas = el.querySelector('#mCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.ov = el.querySelector('#mOv');
    this.scoreEl = el.querySelector('#mScore');
    this.objEl = el.querySelector('#mObj');
    this.stageEl = el.querySelector('#mStage');
    this._fit();
    this._ro = new ResizeObserver(() => this._fit());
    this._ro.observe(this.stageEl);
    this._updHud();
  }

  // integer pixel scale so the art stays perfectly crisp
  _fit() {
    const r = this.stageEl.getBoundingClientRect();
    const k = Math.max(1, Math.floor(Math.min(r.width / FLY.W, r.height / FLY.H)));
    this.canvas.style.width = FLY.W * k + 'px';
    this.canvas.style.height = FLY.H * k + 'px';
    this.k = k;
  }

  _bind() {
    const tap = (e) => {
      if (e.target.closest('.fly-ov button')) return;
      if (this.over || this.paused) return;
      e.preventDefault();
      this.core.flap();
      if (this.ov.dataset.mode === 'intro') this.hideOv();
    };
    this.stageEl.addEventListener('pointerdown', tap);
    this._key = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); tap({ target: document.body, preventDefault() {} }); }
    };
    window.addEventListener('keydown', this._key);
    this.el.querySelector('#mPause').addEventListener('click', () => this.togglePause());
    this.el.querySelector('#mRetryTop').addEventListener('click', () => this.manualRetry());
    this._vis = () => { if (document.hidden && this.core.state === 'play') this.togglePause(true); };
    document.addEventListener('visibilitychange', this._vis);
  }

  _event(e) {
    const a = this.o.audio;
    if (e === 'flap') a && a.tap && a.tap();
    else if (e === 'score') { a && a.collect && a.collect(1); this._updHud(); this.bump = 1; }
    else if (e === 'dead') { a && a.deny && a.deny(); this.shake = 1; this._finish(false); }
    else if (e === 'won') { a && a.grade && a.grade(); this._finish(true); }
  }

  _updHud() {
    this.scoreEl.textContent = String(this.core.score);
    this.objEl.textContent = `Gates ${this.core.score} / ${this.core.objective}`;
  }

  _result() {
    return { score: this.core.score, durationMs: Math.round(this.core.t * 1000) };
  }

  _finish(win) {
    if (this.settled) return;
    this.settled = true;
    this.over = true;
    const res = this._result();
    this.res = this.o.onFinish(res); // economy verifies + settles the persisted session
    this._updHud();
    if (win) this.showWin();
    else setTimeout(() => this.showOver(), 650);
  }

  showIntro() {
    this.ov.dataset.mode = 'intro';
    this.ov.innerHTML = `<div class="fly-msg"><div class="xp-title"><span class="xp-ttl">Mission</span></div><div class="mb">
      <div class="xph">Fly through ${this.core.objective} gates</div>
      <div class="xps">Tap the screen to flap. Avoid the crystal pillars. Win to roll a profit multiplier (x2 to x256).</div>
      <div class="xpkv"><span>Best score</span><b>${this.o.best}</b></div>
      <div class="xp-btnrow center"><button class="xpbtn def touch" id="mGo"><span>Tap to start</span></button></div></div></div>`;
    this.ov.classList.remove('hidden');
    this.ov.querySelector('#mGo').addEventListener('click', () => { this.core.flap(); this.hideOv(); });
  }

  hideOv() {
    this.ov.classList.add('hidden');
    this.ov.dataset.mode = '';
  }

  showOver() {
    if (!this.el.isConnected) return;
    this.ov.dataset.mode = 'over';
    const c = this.core;
    this.ov.innerHTML = `<div class="fly-msg"><div class="xp-title"><span class="xp-ttl">Game Over</span></div><div class="mb">
      <div class="xph" style="color:var(--warn)">The ball crashed!</div>
      <div class="xpkv"><span>Score</span><b>${c.score} / ${c.objective}</b></div>
      <div class="xpkv"><span>Best</span><b>${Math.max(this.o.best, c.score)}</b></div>
      <div class="xps">No reward this time. Try again with no cooldown.</div>
      <div class="xp-btnrow center"><button class="xpbtn def touch" id="mRetry"><span>Retry</span></button><button class="xpbtn touch" id="mExit"><span>Exit</span></button></div></div></div>`;
    this.ov.classList.remove('hidden');
    this.ov.querySelector('#mRetry').addEventListener('click', () => this.retry());
    this.ov.querySelector('#mExit').addEventListener('click', () => this.close());
  }

  showWin() {
    this.ov.dataset.mode = 'won';
    this.ov.innerHTML = `<div class="fly-msg"><div class="xp-title"><span class="xp-ttl">Mission Complete</span></div><div class="mb"><div class="xph" style="color:var(--money)">Mission complete!</div><div class="xps">Rolling your reward...</div><div class="xpprog indet"><i></i></div></div></div>`;
    this.ov.classList.remove('hidden');
    setTimeout(() => this.close(true), 900);
  }

  manualRetry() {
    if (this.over && this.ov.dataset.mode === 'won') return;
    if (!this.settled) { this.settled = true; this.o.onFinish({ ...this._result(), abandoned: true }); }
    this.paused = false;
    this.retry();
  }

  retry() {
    const obj = this.o.onRetry ? this.o.onRetry() : null;
    if (!obj) { this.close(); return; }
    this.core.reset(obj);
    this.settled = false;
    this.over = false;
    this.o.best = Math.max(this.o.best, this.res && this.res.best ? this.res.best : this.o.best);
    this._updHud();
    this.showIntro();
  }

  togglePause(force) {
    if (this.over) return;
    this.paused = force !== undefined ? !!force : !this.paused;
    if (this.paused) {
      this.ov.dataset.mode = 'pause';
      this.ov.innerHTML = `<div class="fly-msg"><div class="xp-title"><span class="xp-ttl">Paused</span></div><div class="mb">
        <div class="xph">Game paused</div>
        <div class="xp-btnrow center"><button class="xpbtn def touch" id="mResume"><span>Resume</span></button><button class="xpbtn touch" id="mRestart"><span>Restart</span></button></div></div></div>`;
      this.ov.classList.remove('hidden');
      this.ov.querySelector('#mResume').addEventListener('click', () => this.togglePause(false));
      this.ov.querySelector('#mRestart').addEventListener('click', () => this.manualRetry());
    } else this.hideOv();
    this.last = performance.now();
  }

  close(won) {
    if (!this.settled) { this.settled = true; this.o.onFinish({ ...this._result(), abandoned: true }); }
    this.destroy();
    this.o.onClose && this.o.onClose(!!won);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._key);
    document.removeEventListener('visibilitychange', this._vis);
    this._ro && this._ro.disconnect();
    this.dead = true;
    if (!this.win.closed) this.win.close(true);
  }

  _frame(now) {
    if (this.dead) return;
    this.raf = requestAnimationFrame((t) => this._frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused && !this.over && this.core.state === 'play' && this.o.wm.active && this.o.wm.active !== this.win) this.togglePause(true);
    if (!this.paused) this.core.update(dt);
    this.shake = Math.max(0, this.shake - dt * 4);
    this.bump = Math.max(0, (this.bump || 0) - dt * 6);
    this.scoreEl.style.transform = `scale(${1 + this.bump * 0.35})`;
    this.draw();
  }

  draw() {
    const c = this.core, g = this.ctx, W = FLY.W, H = FLY.H, GY = H - FLY.GROUND;
    g.save();
    if (this.shake > 0.02) g.translate(Math.round((Math.random() - 0.5) * 4 * this.shake), Math.round((Math.random() - 0.5) * 4 * this.shake));
    // sky bands with a 2-row checker dither on each seam
    const bandH = Math.ceil(GY / SKY.length);
    for (let i = 0; i < SKY.length; i++) { g.fillStyle = SKY[i]; g.fillRect(0, i * bandH, W, bandH + 1); }
    for (let i = 1; i < SKY.length; i++) {
      g.fillStyle = SKY[i];
      for (let x = 0; x < W; x += 2) g.fillRect(x + (i % 2), i * bandH - 2, 1, 1), g.fillRect(x + 1 - (i % 2), i * bandH - 4, 1, 1);
    }
    // clouds + hills (parallax)
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 57 - c.scroll * 0.18) % (W + 40) + (W + 40)) % (W + 40) - 20, cy = 24 + ((i * 41) % 90);
      g.fillRect(cx, cy, 20, 4); g.fillRect(cx + 4, cy - 3, 12, 3); g.fillRect(cx + 2, cy + 4, 14, 2);
    }
    g.fillStyle = '#5fb8e8';
    for (let x = 0; x < W; x += 2) {
      const h = 14 + Math.floor(8 * Math.sin((x + c.scroll * 0.35) * 0.06) + 5 * Math.sin((x + c.scroll * 0.35) * 0.17));
      g.fillRect(x, GY - h, 2, h);
    }
    // pipes: crystal pillars
    for (const p of c.pipes) {
      const x = Math.round(p.x), top = Math.round(p.c - p.gap / 2), bot = Math.round(p.c + p.gap / 2);
      this._pillar(x, 0, FLY.PIPEW, top, true);
      this._pillar(x, bot, FLY.PIPEW, GY - bot, false);
    }
    // ground
    g.fillStyle = '#c8a55a'; g.fillRect(0, GY, W, FLY.GROUND);
    g.fillStyle = '#7bd35a'; g.fillRect(0, GY, W, 4);
    g.fillStyle = '#4faa3a'; g.fillRect(0, GY + 4, W, 2);
    g.fillStyle = '#a8864a';
    const off = Math.floor(c.scroll) % 8;
    for (let x = -off; x < W; x += 8) g.fillRect(x, GY + 9, 4, 2), g.fillRect(x + 4, GY + 14, 4, 2);
    g.fillStyle = '#5a3d12'; g.fillRect(0, H - 2, W, 2);
    // ball with squash / bounce feedback
    const sq = c.squash;
    const sx = 1 - sq * 0.16, sy = 1 + sq * 0.2;
    const bw = Math.round(BALL_SIZE * sx), bh = Math.round(BALL_SIZE * sy);
    if (!this._spr) { this._spr = document.createElement('canvas'); this._spr.width = 24; this._spr.height = 18; }
    const sg = this._spr.getContext('2d');
    sg.clearRect(0, 0, 24, 18);
    drawBall(sg, 8, 3, c.state === 'dead' ? 1 : c.wing, { blink: c.state === 'dead' || (Math.floor(performance.now() / 1700) % 3 === 0 && performance.now() % 1700 < 120) });
    const dx = Math.round(FLY.BX - bw / 2), dy = Math.round(c.y - bh / 2);
    g.imageSmoothingEnabled = false;
    g.drawImage(this._spr, 1, 1, 19, 15, Math.round(FLY.BX - 13 * sx), Math.round(c.y - 8 * sy), Math.round(19 * sx), Math.round(15 * sy));
    if (c.state === 'dead') { g.fillStyle = '#ffffff'; g.fillRect(dx - 2, dy - 4, 2, 2); g.fillRect(dx + 14, dy - 3, 2, 2); }
    g.restore();
  }

  _pillar(x, y, w, h, flip) {
    if (h <= 0) return;
    const g = this.ctx;
    g.fillStyle = '#0a1f52'; g.fillRect(x, y, w, h);
    g.fillStyle = '#2f7fe8'; g.fillRect(x + 1, y, w - 2, h);
    g.fillStyle = '#8fc6ff'; g.fillRect(x + 2, y, 3, h);
    g.fillStyle = '#1b4fb0'; g.fillRect(x + w - 5, y, 3, h);
    g.fillStyle = '#d6ecff';
    for (let yy = (flip ? h % 10 : 4) + y; yy < y + h; yy += 10) g.fillRect(x + 3, yy, 1, 3);
    // cap at the gap edge
    const cy = flip ? y + h - 6 : y;
    g.fillStyle = '#0a1f52'; g.fillRect(x - 2, cy, w + 4, 6);
    g.fillStyle = '#4a98ff'; g.fillRect(x - 1, cy + 1, w + 2, 4);
    g.fillStyle = '#bfe0ff'; g.fillRect(x - 1, cy + 1, w + 2, 1);
    g.fillStyle = '#1b4fb0'; g.fillRect(x - 1, cy + 4, w + 2, 1);
  }
}
