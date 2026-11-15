// Adaptive, track-independent bass / transient follower. Pure signal processing (no DOM, no Web Audio objects):
//   dB spectrum -> weighted RMS of a low band (bins computed from sampleRate / fftSize) -> rolling min/max normalisation
//   -> transient (attack) detector -> attack / release envelope (delta-time smoothing) -> artwork scale.
// Nothing is configured per song: loudness, bass strength and dynamics are estimated continuously.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const k = (dt, tau) => 1 - Math.exp(-dt / tau); // delta-time smoothing coefficient (independent of the frame rate)

export const REACTIVE_DEFAULTS = {
  lowHz: 40, highHz: 220, // analysed band
  minScale: 1.0, maxScale: 1.1, // artwork scale limits
  attack: 0.03, release: 0.2, // envelope time constants (s)
  minRangeDb: 9, // never stretch a flat signal more than this (keeps constant noise from looking like music)
  hiRelease: 7, loRelease: 9, // rolling range memory (s)
  silenceDb: -95,
};

export class AudioReactive {
  constructor(opt = {}) {
    this.o = { ...REACTIVE_DEFAULTS, ...opt };
    this.lo = -120; this.hi = -120; this.slow = -120; this.warm = 0; this.init = true;
    this.bassDb = -120; this.norm = 0; this.trans = 0; this.drive = 0; this.env = 0; this.scale = 1;
    this.lastBins = [0, 0];
  }
  // a new track: forget the range quickly (fast adaptation for ~3 s) but keep the envelope so the art does not jump
  newTrack() { this.warm = 3; this.init = true; }
  reset() { this.init = true; this.warm = 0; this.norm = this.trans = this.drive = this.env = 0; this.scale = 1; }

  // bins for [lowHz, highHz] derived from the real analyser configuration
  bins(binHz, count) {
    const lo = Math.max(1, Math.round(this.o.lowHz / binHz));
    const hi = Math.min(count - 1, Math.max(lo + 1, Math.round(this.o.highHz / binHz)));
    this.lastBins = [lo, hi];
    return [lo, hi];
  }
  // weighted RMS (Hann weights: the middle of the band counts most) of the linear amplitudes, returned in dB
  bandDb(db, binHz) {
    const [lo, hi] = this.bins(binHz, db.length);
    let sw = 0, sp = 0;
    const span = hi - lo;
    for (let i = lo; i <= hi; i++) {
      const w = span > 0 ? 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - lo + 0.5)) / (span + 1)) : 1;
      const d = db[i] > -120 ? db[i] : -120; // -Infinity for digital silence
      const a = Math.pow(10, d / 20);
      sp += w * a * a; sw += w;
    }
    return 20 * Math.log10(Math.sqrt(sp / sw) + 1e-6);
  }

  // dt: seconds since the previous call; db: Float32Array from getFloatFrequencyData (null = no signal: just relax)
  update(dt, db, binHz) {
    const o = this.o;
    dt = clamp(dt, 0.001, 0.1);
    let drive = 0;
    if (db) {
      const x = this.bassDb = this.bandDb(db, binHz);
      if (this.init) { this.hi = this.lo = this.slow = x; this.init = false; } // first signal of a track: start the range estimate here
      const w = this.warm > 0; this.warm = Math.max(0, this.warm - dt);
      // rolling range: peak follower (fast up, slow down) and floor follower (fast down, slow up)
      this.hi += (x - this.hi) * k(dt, x > this.hi ? 0.04 : (w ? 1.2 : o.hiRelease));
      this.lo += (x - this.lo) * k(dt, x < this.lo ? 0.04 : (w ? 1.8 : o.loRelease));
      const range = Math.max(this.hi - this.lo, o.minRangeDb);
      this.norm = this.hi < o.silenceDb ? 0 : clamp((x - this.lo) / range, 0, 1);
      // attack energy: how far the band jumped above its own short-term average
      this.slow += (x - this.slow) * k(dt, 0.16);
      const flux = Math.max(0, x - this.slow);
      this.trans = this.hi < o.silenceDb ? 0 : clamp(flux / (range * 0.26), 0, 1);
      drive = clamp(0.4 * Math.pow(this.norm, 1.5) + 0.85 * this.trans, 0, 1);
    } else { this.norm *= 1 - k(dt, 0.3); this.trans = 0; }
    this.drive = drive;
    this.env += (drive - this.env) * k(dt, drive > this.env ? o.attack : o.release); // attack fast, release gradual
    if (this.env < 0.0005) this.env = 0;
    this.scale = o.minScale + (o.maxScale - o.minScale) * this.env;
    return this.scale;
  }
}
