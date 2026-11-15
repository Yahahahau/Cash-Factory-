// LunaWave Music Player engine. One HTMLAudioElement, one (optional) Web Audio analysis chain, one visualizer loop.
// It is independent from the game: no physics / pause-manager hooks, so the Start Menu, the Flying Ball session and
// game pauses never restart or reset the song. Only an explicit Pause stops it.
import { TRACKS } from './music-library.js';

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
    this._freq = null; this._time = null;
    // analysis results (0..1)
    this.level = { bass: 0, mid: 0, high: 0, all: 0 };
    this.beat = 0; // decaying beat pulse
    this._avgBass = 0; this._prevBass = 0;
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
  _emit(what) { for (const f of this.listeners.slice()) { try { f(what, this); } catch (e) { /* a broken view must never stop the music */ } } }

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
  _graph() {
    if (this.graph !== 'none') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.graph = 'failed'; return; }
    try {
      this.ctx = new AC();
      const src = this.ctx.createMediaElementSource(this._el());
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.78;
      this.gain = this.ctx.createGain();
      src.connect(this.analyser); this.analyser.connect(this.gain); this.gain.connect(this.ctx.destination);
      this._freq = new Uint8Array(this.analyser.frequencyBinCount);
      this._time = new Uint8Array(this.analyser.fftSize);
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
    a.src = t.src; // same element: the previous track is replaced, never played twice
    a.load();
    this._loadTimer = setTimeout(() => { if (this.status === 'loading') this._fail('Loading took too long.'); }, LOAD_TIMEOUT);
    this._save();
    this._emit('track');
  }
  _start() {
    const a = this._el();
    this._graph();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const p = a.play();
    if (p && p.catch) p.catch((e) => { if (e && e.name === 'NotAllowedError') { this.status = 'paused'; this._emit('status'); } else if (!(e && e.name === 'AbortError')) this._fail('Could not play this track.'); });
  }
  play() {
    this.started = true;
    if (this.loadedId !== this.track.id || !this.audio || this.status === 'error') this._load(this.index);
    else { this.status = this.audio.readyState >= 3 ? this.status : 'loading'; }
    this._start();
    this._emit('status');
  }
  pause() { if (this.audio) this.audio.pause(); if (this.status !== 'error') this.status = 'paused'; this._emit('status'); }
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

  // ---- analysis: one central loop, runs only while playing and at least one view is watching ----
  watch(fn) { this.watchers.push(fn); this._startLoop(); return () => { this.watchers = this.watchers.filter((f) => f !== fn); }; }
  _startLoop() {
    if (this.raf || !this.watchers.length || this.status !== 'playing') return;
    const tick = () => {
      this.raf = 0;
      if (!this.watchers.length || this.status !== 'playing') { this._decay(); for (const w of this.watchers.slice()) w(this); return; }
      this._sample();
      for (const w of this.watchers.slice()) w(this);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  _decay() { this.beat *= 0.8; for (const k in this.level) this.level[k] *= 0.82; }
  _sample() {
    if (!this.analyser) { this._decay(); return; }
    this.analyser.getByteFrequencyData(this._freq);
    this.analyser.getByteTimeDomainData(this._time);
    const f = this._freq, n = f.length;
    const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += f[i]; return s / (b - a) / 255; };
    // bin width = sampleRate / fftSize (~43 Hz): bass < ~260 Hz, mid < ~2.6 kHz, high above
    const bass = avg(1, 7), mid = avg(7, 60), high = avg(60, Math.min(n, 260));
    const L = this.level;
    const sm = (o, v) => (v > o ? o + (v - o) * 0.6 : o + (v - o) * 0.18);
    L.bass = sm(L.bass, bass); L.mid = sm(L.mid, mid); L.high = sm(L.high, high); L.all = (L.bass + L.mid + L.high) / 3;
    // beat = bass transient above its running average (a stronger transient gives a stronger pulse, quiet music a gentle one)
    const rise = Math.max(0, bass - this._prevBass);
    this._avgBass += (bass - this._avgBass) * 0.04;
    const over = bass - this._avgBass * 1.12;
    if (over > 0.02 && rise > 0.012) this.beat = Math.max(this.beat, clamp(over * 3.2 + rise * 3, 0.15, 1));
    else this.beat *= 0.86;
    this._prevBass = bass;
  }
  frequency() { return this.analyser ? this._freq : null; }
  waveform() { return this.analyser ? this._time : null; }
}
