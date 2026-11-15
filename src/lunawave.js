// LunaWave Music Player engine. One HTMLAudioElement, one (optional) Web Audio analysis chain, one visualizer loop.
// It is independent from the game: no physics / pause-manager hooks, so the Start Menu, the Flying Ball session and
// game pauses never restart or reset the song. Only an explicit Pause stops it.
import { TRACKS } from './music-library.js';
import { AudioReactive } from './audio-reactive.js';

const KEY = 'pixelCashFactory.lunawave.v1';
const LOAD_TIMEOUT = 15000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class LunaWave {
  constructor(tracks = TRACKS) {
    this.tracks = tracks;
    this.index = 0;
    this.repeat = false;
    this.volume = 0.7;
    this.muted = false;
    this.vizMode = 'bars'; // frequency bars only
    this.started = false; // true once the player was used this session
    this.userPaused = false; // an explicit Pause stops auto-start / auto-resume
    this.status = 'idle'; // idle | loading | playing | paused | error
    this.error = '';
    this.loadedId = null;
    this.audio = null;
    this.ctx = null; this.analyser = null; this.gain = null; this.graph = 'none'; // none | web | failed
    this.listeners = [];
    this.watchers = [];
    this.raf = 0;
    this.errStreak = 0;
    this._loadTimer = 0;
    this._freq = null; this._db = null;
    this.level = { bass: 0, mid: 0, high: 0, all: 0 }; // spectrum summary for the bars
    this.react = new AudioReactive(); // adaptive bass / transient envelope -> artwork scale
    this.artScale = 1;
    this.live = true; // false while the analyser data is frozen (suspended / interrupted context)
    this._same = 0; this._sig = 0; this._lastResume = 0; this._t = 0;
    this.loopsRunning = 0; this.loopStarts = 0;
    this._restore();
  }

  get track() { return this.tracks[this.index]; }
  get realAnalysis() { return this.graph === 'web'; }
  get position() { return this.audio && this.loadedId === this.track.id ? this.audio.currentTime || 0 : 0; }
  get duration() {
    const d = this.audio && this.loadedId === this.track.id ? this.audio.duration : NaN;
    return isFinite(d) && d > 0 ? d : (this.track.duration || 0);
  }
  get playing() { return this.status === 'playing'; }

  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }
  _emit(what) { if (what === 'status' || what === 'track') this._startLoop(); for (const f of this.listeners.slice()) { try { f(what, this); } catch (e) { /* a broken view must never stop the music */ } } }

  _restore() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!j) return;
      const i = this.tracks.findIndex((t) => t.id === j.track);
      if (i >= 0) this.index = i;
      this.repeat = !!j.repeat;
      if (typeof j.volume === 'number') this.volume = clamp(j.volume, 0, 1);
      this.muted = !!j.muted;
    } catch (e) { /* storage unavailable */ }
  }
  _save() {
    try { localStorage.setItem(KEY, JSON.stringify({ track: this.track.id, repeat: this.repeat, volume: this.volume, muted: this.muted, viz: this.vizMode })); } catch (e) { /* ignore */ }
  }

  // ---- the single audio element (created on first use, never duplicated) ----
  _el() {
    if (this.audio) return this.audio;
    const a = new Audio();
    a.preload = 'none';
    a.addEventListener('playing', () => { clearTimeout(this._loadTimer); this.errStreak = 0; this.status = 'playing'; this.error = ''; this._startLoop(); this._emit('status'); });
    a.addEventListener('pause', () => { if (this.status === 'playing') { this.status = 'paused'; this._emit('status'); } });
    a.addEventListener('waiting', () => { if (this.status === 'playing') { this.status = 'loading'; this._emit('status'); } });
    a.addEventListener('canplay', () => { clearTimeout(this._loadTimer); if (this.status === 'loading' && !a.paused) { this.status = 'playing'; this._emit('status'); } });
    a.addEventListener('loadedmetadata', () => this._emit('meta'));
    a.addEventListener('durationchange', () => this._emit('meta'));
    a.addEventListener('timeupdate', () => this._emit('time'));
    a.addEventListener('ended', () => this._ended());
    a.addEventListener('error', () => this._fail('Could not play this track.'));
    this.audio = a;
    this._applyVolume();
    return a;
  }

  // Web Audio chain, created once from a user gesture: element -> source -> analyser -> gain -> destination
  // `gesture`: called from a user interaction. Without one a new AudioContext starts suspended, and routing the element
  // through it would make the music silent, so in that case the plain element plays and the graph is built at the first gesture.
  _graph(gesture = true) {
    if (this.graph !== 'none') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.graph = 'failed'; return; }
    try {
      this.ctx = new AC();
      if (!gesture && this.ctx.state !== 'running') { this.ctx.close && this.ctx.close().catch(() => {}); this.ctx = null; return; }
      const src = this.ctx.createMediaElementSource(this._el());
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048; // ~21 Hz bins at 44.1 kHz: enough resolution for the 40-220 Hz band
      this.analyser.smoothingTimeConstant = 0.6;
      this.analyser.minDecibels = -100; this.analyser.maxDecibels = -25;
      this.gain = this.ctx.createGain();
      src.connect(this.analyser); this.analyser.connect(this.gain); this.gain.connect(this.ctx.destination);
      this._freq = new Uint8Array(this.analyser.frequencyBinCount);
      this._db = new Float32Array(this.analyser.frequencyBinCount);
      this.ctx.addEventListener && this.ctx.addEventListener('statechange', () => this._ctxState());
      this.graph = 'web';
      this._applyVolume();
    } catch (e) {
      // the element may already be bound or the API unsupported: keep plain element playback, analysis unavailable
      this.graph = 'failed'; this.analyser = null;
    }
  }
  _applyVolume() {
    const v = this.muted ? 0 : this.volume;
    if (this.gain) { this.gain.gain.value = v; if (this.audio) this.audio.volume = 1; }
    else if (this.audio) this.audio.volume = v;
  }

  // ---- transport ----
  _load(i) {
    this.index = (i + this.tracks.length) % this.tracks.length;
    const t = this.track, a = this._el();
    clearTimeout(this._loadTimer);
    this.status = 'loading'; this.error = '';
    this.loadedId = t.id;
    this.react.newTrack();
    a.src = t.src; // same element: the previous track is replaced, never played twice
    a.load();
    this._loadTimer = setTimeout(() => { if (this.status === 'loading') this._fail('Loading took too long.'); }, LOAD_TIMEOUT);
    this._save();
    this._emit('track');
  }
  _start(gesture = true) {
    const a = this._el();
    this._graph(gesture);
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const p = a.play();
    if (p && p.catch) p.catch((e) => { if (e && e.name === 'NotAllowedError') { this.status = 'paused'; this._emit('status'); } else if (!(e && e.name === 'AbortError')) this._fail('Could not play this track.'); });
  }
  play(gesture = true) {
    this.started = true; this.userPaused = false;
    if (this.loadedId !== this.track.id || !this.audio || this.status === 'error') this._load(this.index);
    else { this.status = this.audio.readyState >= 3 ? this.status : 'loading'; }
    this._start(gesture);
    this._emit('status');
  }
  pause() {
    this.userPaused = true; if (this.audio) this.audio.pause(); if (this.status !== 'error') this.status = 'paused'; this._emit('status'); }
  // start by itself when the game opens; if the browser blocks audio until a tap, the first interaction starts it
  autoStart() {
    const ev = ['pointerdown', 'keydown', 'touchend'];
    const done = () => { for (const e of ev) window.removeEventListener(e, onGesture, true); };
    const onGesture = () => {
      if (this.userPaused) { done(); return; }
      if (this.status !== 'playing' && this.status !== 'loading') this.play(true);
      else { this._graph(true); this._wake(); this.audio && this.audio.paused && this._start(true); }
      if (this.status === 'playing' && (!this.ctx || this.ctx.state === 'running')) done();
    };
    for (const e of ev) window.addEventListener(e, onGesture, true);
    try { this.play(false); } catch (e) { /* wait for the first interaction */ }
  }
  toggle() { (this.status === 'playing' || this.status === 'loading') ? this.pause() : this.play(); }
  select(i, autoplay = true) { this._load(i); if (autoplay) this._start(); }
  // boundary policy: the playlist loops. Previous restarts the track when it is already past 3 s.
  next() { this.select(this.index + 1, true); }
  prev() { if (this.position > 3) this.seek(0); else this.select(this.index - 1, true); }
  toggleRepeat() { this.repeat = !this.repeat; this._save(); this._emit('repeat'); }
  seek(t) {
    if (!this.audio || this.loadedId !== this.track.id) return;
    const d = this.duration;
    this.audio.currentTime = clamp(t, 0, d > 0 ? Math.max(0, d - 0.05) : 0);
    this._emit('time');
  }
  setVolume(v) { this.volume = clamp(v, 0, 1); if (this.volume > 0) this.muted = false; this._applyVolume(); this._save(); this._emit('volume'); }
  setViz(m) { this.vizMode = m; this._save(); this._emit('viz'); }
  toggleMute() { this.muted = !this.muted; this._applyVolume(); this._save(); this._emit('volume'); }

  _ended() {
    if (this.repeat) { this.audio.currentTime = 0; this._start(); return; }
    this.next();
  }
  // a failing file never leaves the player stuck: show the error, try the next track, give up after a full lap
  _fail(msg) {
    clearTimeout(this._loadTimer);
    this.errStreak++;
    this.status = 'error'; this.error = msg;
    this._emit('status');
    if (this.errStreak < this.tracks.length) setTimeout(() => { if (this.status === 'error') this.select(this.index + 1, true); }, 1200);
  }

  // ---- analysis: ONE central loop (shared by the bars and the artwork); runs while playing and a view is watching ----
  watch(fn) { this.watchers.push(fn); this._startLoop(); return () => { this.watchers = this.watchers.filter((f) => f !== fn); }; }
  _ctxState() {
    // suspended / interrupted (iOS) / closed: treat analyser data as not live and try to bring the context back
    if (this.ctx && this.ctx.state !== 'running') this.live = false;
    if (this.ctx && this.ctx.state === 'running') this._same = 0;
    this._emit('ctx');
  }
  _wake() {
    const now = performance.now();
    if (!this.ctx || this.ctx.state === 'running' || now - this._lastResume < 1000) return;
    this._lastResume = now;
    if (this.ctx.state === 'closed') { console.warn('[LunaWave] AudioContext closed: visualizer unavailable'); this.graph = 'failed'; return; }
    this.ctx.resume().catch((e) => console.warn('[LunaWave] resume rejected', e && e.name));
  }
  _wantLoop() { return this.watchers.length > 0 && (this.status === 'playing' || this.status === 'loading' || this.react.env > 0.001 || this.artScale > 1.0005); }
  _startLoop() {
    if (this.raf || !this._wantLoop()) return;
    this.loopStarts++; this.loopsRunning++; this._t = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.1, Math.max(0.001, (now - this._t) / 1000)); this._t = now;
      this._sample(dt);
      for (const w of this.watchers.slice()) w(this);
      if (this._wantLoop()) this.raf = requestAnimationFrame(tick);
      else { this.raf = 0; this.loopsRunning--; }
    };
    this.raf = requestAnimationFrame(tick);
  }
  _sample(dt) {
    const playing = this.status === 'playing' && this.audio && !this.audio.paused;
    const L = this.level;
    if (!this.analyser || !playing) { // paused / ended / no analysis: the envelope relaxes smoothly back to scale 1
      this.react.update(dt, null, 0); this.artScale = this.react.scale;
      for (const key in L) L[key] *= 1 - Math.min(1, dt * 6);
      return;
    }
    if (this.ctx.state !== 'running') { this.live = false; this._wake(); this.react.update(dt, null, 0); this.artScale = this.react.scale; return; }
    this.analyser.getByteFrequencyData(this._freq);
    this.analyser.getFloatFrequencyData(this._db);
    // frozen data check: a suspended analyser keeps returning the same numbers (digital silence is -Infinity everywhere and not "stale")
    const f = this._freq, n = f.length;
    const d = this._db;
    let sig = 0, loud = false;
    for (let i = 1; i < 64; i++) { if (d[i] > -120) { sig += d[i] * (1 + (i & 7)); loud = true; } }
    if (sig === this._sig && loud) this._same += dt; else { this._same = 0; this.live = true; }
    this._sig = sig;
    if (this._same > 0.5) { this.live = false; this._wake(); }
    if (!this.live) { this.react.update(dt, null, 0); this.artScale = this.react.scale; return; }
    const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += f[i]; return s / (b - a) / 255; };
    const bw = this.ctx.sampleRate / this.analyser.fftSize; // Hz per bin
    const at = (hz) => Math.min(n - 1, Math.max(1, Math.round(hz / bw)));
    const bass = avg(at(40), at(260) + 1), mid = avg(at(260), at(2600)), high = avg(at(2600), at(11000));
    const sm = (o, v) => (v > o ? o + (v - o) * 0.6 : o + (v - o) * 0.18);
    L.bass = sm(L.bass, bass); L.mid = sm(L.mid, mid); L.high = sm(L.high, high); L.all = (L.bass + L.mid + L.high) / 3;
    this.artScale = this.react.update(dt, this._db, bw);
  }
  frequency() { return this.analyser ? this._freq : null; }
  diag() {
    const r = this.react;
    return { ctx: this.ctx ? this.ctx.state : 'none', track: this.track.id, status: this.status, paused: this.audio ? this.audio.paused : true, live: this.live,
      bassDb: +r.bassDb.toFixed(1), norm: +r.norm.toFixed(3), trans: +r.trans.toFixed(3), env: +r.env.toFixed(3), scale: +this.artScale.toFixed(4),
      bins: r.lastBins.join('-'), loops: this.loopsRunning, loopStarts: this.loopStarts, range: +(r.hi - r.lo).toFixed(1) };
  }
}
