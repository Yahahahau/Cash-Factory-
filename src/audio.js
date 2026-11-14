// Procedural chiptune audio (WebAudio). No audio files, nothing to download.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.sfxVol = 0.7;
    this.musicVol = 0.35;
    this.lastCollect = 0;
    this.step = 0;
    this.nextNote = 0;
    this.timer = null;
    this.paused = false;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.setVolumes(this.sfxVol, this.musicVol);
      this.nextNote = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this._schedule(), 120);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setVolumes(sfx, music) {
    this.sfxVol = sfx;
    this.musicVol = music;
    if (!this.ctx) return;
    this.sfxBus.gain.value = sfx * 0.55;
    this.musicBus.gain.value = music * 0.28;
  }

  setPaused(p) {
    this.paused = p;
    if (!this.ctx) return;
    if (p) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
  }

  _tone(bus, t, freq, dur, type, vol, slideTo) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _ok() {
    return this.ctx && this.ctx.state === 'running' && this.sfxVol > 0;
  }

  collect(type) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    if (t - this.lastCollect < 0.055) return;
    this.lastCollect = t;
    const base = [988, 1175, 784, 1568][type] || 988;
    this._tone(this.sfxBus, t, base, 0.09, 'square', 0.18, base * 1.5);
    this._tone(this.sfxBus, t + 0.045, base * 1.5, 0.12, 'triangle', 0.14);
  }

  buy() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    [523, 659, 784].forEach((f, i) => this._tone(this.sfxBus, t + i * 0.06, f, 0.14, 'square', 0.2));
  }

  deny() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this._tone(this.sfxBus, t, 180, 0.16, 'sawtooth', 0.18, 110);
  }

  tap() {
    if (!this._ok()) return;
    this._tone(this.sfxBus, this.ctx.currentTime, 660, 0.06, 'square', 0.12, 880);
  }

  drop() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this._tone(this.sfxBus, t, 440, 0.07, 'square', 0.14, 300);
    this._tone(this.sfxBus, t + 0.05, 330, 0.09, 'triangle', 0.12, 220);
  }

  clunk() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this._tone(this.sfxBus, t, 120, 0.12, 'square', 0.16, 70);
    this._tone(this.sfxBus, t + 0.05, 90, 0.1, 'triangle', 0.14, 60);
  }

  grade() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => {
      this._tone(this.sfxBus, t + i * 0.09, f, 0.3, 'square', 0.2);
      this._tone(this.sfxBus, t + i * 0.09, f / 2, 0.3, 'triangle', 0.16);
    });
  }

  welcome() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    [659, 784, 988, 1319].forEach((f, i) => this._tone(this.sfxBus, t + i * 0.1, f, 0.2, 'triangle', 0.22));
  }

  _schedule() {
    if (!this.ctx || this.ctx.state !== 'running' || this.musicVol <= 0 || this.paused) {
      if (this.ctx) this.nextNote = Math.max(this.nextNote, this.ctx.currentTime + 0.05);
      return;
    }
    const spb = 0.19; // seconds per 8th note
    const bass = [130.81, 130.81, 196.0, 196.0, 174.61, 174.61, 196.0, 164.81]; // C C G G F F G E
    const lead = [
      [523, 659, 784, 659], [523, 659, 784, 988], [587, 698, 880, 698], [523, 659, 784, 659],
      [440, 523, 659, 523], [440, 523, 659, 784], [494, 587, 784, 587], [523, 659, 784, 1047],
    ];
    while (this.nextNote < this.ctx.currentTime + 0.4) {
      const s = this.step % 32;
      const bar = (s / 4) | 0;
      const beat = s % 4;
      if (beat === 0) this._tone(this.musicBus, this.nextNote, bass[bar], spb * 3.2, 'triangle', 0.5);
      this._tone(this.musicBus, this.nextNote, lead[bar][beat], spb * 0.9, 'square', 0.16);
      this.step++;
      this.nextNote += spb;
    }
  }
}
