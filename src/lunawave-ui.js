// LunaWave Music Player: the Start Menu row. A pure view over the LunaWave engine: it is built when the menu opens and
// torn down when it closes; the music itself never depends on it.
import { icon } from './icons.js';
import { NO_COMPOSER } from './music-library.js';
import { esc } from './xp.js';

const fmt = (t) => { if (!isFinite(t) || t < 0) return '--:--'; t = Math.floor(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const ico = (n, s = 16) => icon(n, s);

export function mountLunaWave(slot, lw) {
  slot.innerHTML = `<div class="lw" aria-label="LunaWave Music Player">
    <canvas class="lw-vis" aria-hidden="true"></canvas>
    <div class="lw-head"><span class="lw-app">${ico('music', 16)}<b>LunaWave Music Player</b></span>
      <span class="lw-badge" hidden title="Real-time audio analysis is not available in this browser">basic mode</span>
      <button class="lw-b lw-sm" id="lwViz" aria-label="Visualizer style" title="Visualizer: line / bars"></button></div>
    <div class="lw-main">
      <div class="lw-art"><img class="lw-img" alt="" draggable="false"><span class="lw-ph">${ico('music', 28)}</span></div>
      <div class="lw-info"><div class="lw-title"></div><div class="lw-comp"></div><div class="lw-stat"></div></div>
    </div>
    <div class="lw-seek"><span class="lw-t0">0:00</span><div class="lw-bar" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0"><i class="lw-fill"></i><b class="lw-knob"></b></div><span class="lw-t1">--:--</span></div>
    <div class="lw-ctl">
      <button class="lw-b" id="lwPrev" aria-label="Previous track" title="Previous">${ico('prev')}</button>
      <button class="lw-b lw-play" id="lwPlay" aria-label="Play" title="Play / Pause"></button>
      <button class="lw-b" id="lwNext" aria-label="Next track" title="Next">${ico('next')}</button>
      <button class="lw-b" id="lwRep" aria-label="Repeat one" aria-pressed="false" title="Repeat one">${ico('repeat1')}</button>
      <span class="lw-vol"><button class="lw-b lw-sm" id="lwMute" aria-label="Mute" title="Mute"></button><input id="lwVol" class="xprange" type="range" min="0" max="100" aria-label="Volume"></span>
    </div></div>`;
  const $ = (s) => slot.querySelector(s);
  const root = $('.lw'), cv = $('.lw-vis'), g = cv.getContext('2d');
  const img = $('.lw-img'), art = $('.lw-art');
  const bar = $('.lw-bar'), fill = $('.lw-fill'), knob = $('.lw-knob');
  let dragging = false, dragT = 0, shown = '', artScale = 1, mix = lw.vizMode === 'bars' ? 1 : 0, W = 0, H = 0, dpr = 1;

  // ---- text / artwork (always updated together on a track change) ----
  const track = () => {
    const t = lw.track;
    $('.lw-title').textContent = t.title; $('.lw-title').title = t.title;
    const who = (t.composer || NO_COMPOSER);
    $('.lw-comp').innerHTML = `<span>${esc(who)}</span>${t.artist ? `<em> · ${esc(t.artist)}</em>` : ''}`;
    $('.lw-comp').title = (t.composer ? 'Composer: ' + t.composer : NO_COMPOSER) + (t.artist ? ' | Artist: ' + t.artist : '');
    if (shown !== t.id) {
      shown = t.id;
      img.classList.remove('in'); img.removeAttribute('src'); art.classList.remove('has');
      if (t.cover) {
        const want = t.id;
        img.onload = () => { if (shown === want) { art.classList.add('has'); void img.offsetWidth; img.classList.add('in'); } };
        img.onerror = () => { if (shown === want) art.classList.remove('has'); };
        img.src = t.cover;
      }
    }
    status(); time();
  };
  const status = () => {
    const st = lw.status;
    $('.lw-stat').textContent = (lw.index + 1) + '/' + lw.tracks.length + ' · ' + ({ idle: 'Stopped', loading: 'Loading...', playing: 'Playing', paused: 'Paused', error: lw.error || 'Error' }[st]);
    $('.lw-stat').classList.toggle('err', st === 'error');
    const p = $('#lwPlay'); const playing = st === 'playing' || st === 'loading';
    p.innerHTML = ico(playing ? 'pause' : 'play', 18); p.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    root.classList.toggle('lw-on', st === 'playing');
    $('#lwRep').classList.toggle('on', lw.repeat); $('#lwRep').setAttribute('aria-pressed', String(lw.repeat));
    draw();
  };
  const time = () => {
    const d = lw.duration, pos = dragging ? dragT : lw.position;
    $('.lw-t0').textContent = fmt(pos); $('.lw-t1').textContent = d > 0 ? fmt(d) : '--:--';
    const f = d > 0 ? Math.min(1, pos / d) : 0;
    fill.style.width = (f * 100) + '%'; knob.style.left = (f * 100) + '%';
    bar.setAttribute('aria-valuenow', String(Math.floor(pos))); bar.setAttribute('aria-valuemax', String(Math.floor(d)));
    bar.classList.toggle('off', !(d > 0));
  };
  const vol = () => {
    $('#lwVol').value = Math.round(lw.volume * 100);
    $('#lwMute').innerHTML = ico(lw.muted || lw.volume === 0 ? 'mute' : 'vol');
    $('#lwMute').classList.toggle('on', lw.muted);
  };
  const viz = () => {
    $('#lwViz').innerHTML = ico(lw.vizMode === 'bars' ? 'bars' : 'wave');
    $('.lw-badge').hidden = lw.realAnalysis || lw.graph === 'none';
  };

  // ---- controls: all wired to the real engine ----
  $('#lwPlay').addEventListener('click', () => lw.toggle());
  $('#lwPrev').addEventListener('click', () => lw.prev());
  $('#lwNext').addEventListener('click', () => lw.next());
  $('#lwRep').addEventListener('click', () => lw.toggleRepeat());
  $('#lwMute').addEventListener('click', () => lw.toggleMute());
  $('#lwVol').addEventListener('input', (e) => lw.setVolume(e.target.value / 100));
  $('#lwViz').addEventListener('click', () => lw.setViz(lw.vizMode === 'line' ? 'bars' : 'line'));
  const posFrom = (e) => { const r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * lw.duration; };
  bar.addEventListener('pointerdown', (e) => { if (!(lw.duration > 0)) return; dragging = true; dragT = posFrom(e); bar.setPointerCapture(e.pointerId); time(); });
  bar.addEventListener('pointermove', (e) => { if (dragging) { dragT = posFrom(e); time(); } });
  const endDrag = (e) => { if (!dragging) return; dragging = false; lw.seek(posFrom(e)); time(); };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', () => { dragging = false; time(); });
  bar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { lw.seek(lw.position + 5); e.preventDefault(); } else if (e.key === 'ArrowLeft') { lw.seek(lw.position - 5); e.preventDefault(); }
  });

  // ---- visualizer: drawn behind the whole panel, dim and calm so the text stays readable ----
  const size = () => {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    root.classList.toggle('lw-narrow', r.width < 250);
    draw();
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : null;
  ro && ro.observe(root);
  const N = 56;
  const bins = (f) => { // log-spaced spectrum values 0..1 (null analyser -> fallback)
    const out = new Array(N);
    const n = f.length, max = Math.min(n, 300);
    for (let i = 0; i < N; i++) {
      const a = Math.floor(Math.pow(i / N, 1.7) * max) + 1, b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / N, 1.7) * max) + 1);
      let s = 0; for (let k = a; k < b; k++) s += f[k];
      out[i] = s / (b - a) / 255;
    }
    return out;
  };
  let prevVals = new Array(N).fill(0), tph = 0;
  const values = () => {
    const f = lw.frequency(), playing = lw.status === 'playing';
    let v;
    if (f && lw.realAnalysis) v = bins(f);
    else { // clearly a fallback: a calm animation driven only by the playback state, not by the audio
      tph += 0.02; v = new Array(N);
      for (let i = 0; i < N; i++) v[i] = playing ? 0.12 + 0.1 * (Math.sin(tph * 1.3 + i * 0.35) * 0.5 + 0.5) * (1 - i / N) : 0;
    }
    for (let i = 0; i < N; i++) { const t = v[i]; prevVals[i] += (t - prevVals[i]) * (t > prevVals[i] ? 0.55 : 0.2); }
    return prevVals;
  };
  const draw = () => {
    if (!W) return;
    g.clearRect(0, 0, W, H);
    const v = values(), playing = lw.status === 'playing';
    const target = lw.vizMode === 'bars' ? 1 : 0; mix += (target - mix) * 0.18;
    const real = lw.realAnalysis;
    const energy = real ? lw.level.all : 0;
    const base = H * 0.5;
    const tint = (a) => `rgba(120,215,255,${a})`;
    // --- bars (bottom-anchored, thin, rounded) ---
    if (mix > 0.02) {
      const bw = W / N, gap = Math.max(1, bw * 0.38);
      const gr = g.createLinearGradient(0, H, 0, H * 0.15); gr.addColorStop(0, `rgba(38,140,255,${0.5 * mix})`); gr.addColorStop(1, `rgba(140,235,255,${0.8 * mix})`);
      g.fillStyle = gr;
      for (let i = 0; i < N; i++) {
        const h = Math.max(2 * dpr, Math.pow(v[i], 0.9) * H * 0.78);
        g.fillRect(i * bw + gap / 2, H - h, bw - gap, h);
      }
    }
    // --- luminous lines: spectrum mirrored around the middle + the live waveform ---
    if (mix < 0.98) {
      const A = 1 - mix, amp = H * 0.4;
      const line = (fn, w, col, blur) => {
        g.beginPath();
        for (let i = 0; i <= N; i++) {
          const x = (i / N) * W, y = fn(Math.min(i, N - 1));
          if (i === 0) g.moveTo(x, y); else { const px = ((i - 0.5) / N) * W; g.quadraticCurveTo(((i - 1) / N) * W, fn(Math.max(0, i - 1)), px, (y + fn(Math.max(0, i - 1))) / 2); }
        }
        g.lineWidth = w * dpr; g.strokeStyle = col; g.globalAlpha = A; g.stroke();
        void blur;
      };
      const peak = (i) => Math.pow(v[i], 0.85) * amp * (0.5 + 0.5 * Math.sin(Math.PI * (i / N) * 0.9 + 0.2));
      // glow pass (wide, faint) then crisp pass
      line((i) => base - peak(i) - 1, 5, tint(0.12), 0); line((i) => base - peak(i) - 1, 1.2, tint(0.85), 0);
      line((i) => base + peak(i) * 0.7 + 1, 4, 'rgba(70,160,255,.1)', 0); line((i) => base + peak(i) * 0.7 + 1, 1, 'rgba(90,175,255,.55)', 0);
      const t = real ? lw.waveform() : null;
      if (t) {
        g.beginPath();
        const step = Math.floor(t.length / 120) || 1;
        for (let i = 0, k = 0; i < t.length; i += step, k++) {
          const x = (i / t.length) * W, y = base + ((t[i] - 128) / 128) * H * 0.3;
          if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.lineWidth = 1 * dpr; g.strokeStyle = 'rgba(210,245,255,.5)'; g.globalAlpha = A; g.stroke();
      } else if (!real || !playing) {
        g.beginPath(); g.moveTo(0, base); g.lineTo(W, base); g.lineWidth = dpr; g.strokeStyle = tint(0.25); g.globalAlpha = A; g.stroke();
      }
    }
    g.globalAlpha = 1;
    // soft light that breathes with the overall energy
    if (energy > 0.02) { const rg = g.createRadialGradient(W * 0.2, H * 0.5, 0, W * 0.2, H * 0.5, W * 0.7); rg.addColorStop(0, `rgba(80,190,255,${Math.min(0.22, energy * 0.35)})`); rg.addColorStop(1, 'rgba(80,190,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
  };
  // album art beat pulse: only from real audio analysis, small, centred, no rotation
  const pulse = () => {
    if (!lw.realAnalysis || lw.status !== 'playing') { if (artScale !== 1) { artScale += (1 - artScale) * 0.3; if (Math.abs(artScale - 1) < 0.002) artScale = 1; art.style.transform = artScale === 1 ? '' : `scale(${artScale})`; } return; }
    const tgt = 1 + Math.min(1, lw.beat) * 0.09;
    artScale += (tgt - artScale) * (tgt > artScale ? 0.6 : 0.22);
    art.style.transform = `scale(${artScale.toFixed(3)})`;
  };
  const stopWatch = lw.watch(() => { draw(); pulse(); time(); });

  const off = lw.on((what) => {
    if (what === 'track') track();
    else if (what === 'status' || what === 'repeat') { status(); viz(); }
    else if (what === 'time' || what === 'meta') time();
    else if (what === 'volume') vol();
    else if (what === 'viz') viz();
  });
  track(); vol(); viz(); size();
  return () => { off(); stopWatch(); ro && ro.disconnect(); slot.innerHTML = ''; };
}
