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
</div>
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
  let dragging = false, dragT = 0, shown = '', artScale = 1, W = 0, H = 0, dpr = 1;

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
    $('.lw-badge').hidden = lw.realAnalysis || lw.graph === 'none';
  };

  // ---- controls: all wired to the real engine ----
  $('#lwPlay').addEventListener('click', () => lw.toggle());
  $('#lwPrev').addEventListener('click', () => lw.prev());
  $('#lwNext').addEventListener('click', () => lw.next());
  $('#lwRep').addEventListener('click', () => lw.toggleRepeat());
  $('#lwMute').addEventListener('click', () => lw.toggleMute());
  $('#lwVol').addEventListener('input', (e) => lw.setVolume(e.target.value / 100));
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
  const peaks = new Array(N).fill(0), fall = new Array(N).fill(0);
  const rr = (x, y, w, h, r) => { // rounded-top bar
    r = Math.min(r, w / 2, h);
    g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h); g.closePath(); g.fill();
  };
  // Frequency bars: thin rounded columns in a Luna blue-to-cyan gradient, a soft floor reflection and small falling peak caps.
  const draw = () => {
    if (!W) return;
    g.clearRect(0, 0, W, H);
    const v = values(), playing = lw.status === 'playing', real = lw.realAnalysis;
    const floor = H * 0.8, maxH = floor - H * 0.08;
    const bw = W / N, gap = Math.max(1.5 * dpr, bw * 0.34), w = bw - gap;
    const gr = g.createLinearGradient(0, floor, 0, floor - maxH);
    gr.addColorStop(0, 'rgba(24,110,235,.55)'); gr.addColorStop(0.55, 'rgba(70,175,255,.75)'); gr.addColorStop(1, 'rgba(170,240,255,.95)');
    const rf = g.createLinearGradient(0, floor, 0, H); rf.addColorStop(0, 'rgba(90,180,255,.22)'); rf.addColorStop(1, 'rgba(90,180,255,0)');
    for (let i = 0; i < N; i++) {
      const tall = Math.max(2 * dpr, Math.pow(v[i], 1.05) * maxH);
      const x = i * bw + gap / 2;
      g.fillStyle = gr; rr(x, floor - tall, w, tall, w / 2);
      g.fillStyle = rf; g.fillRect(x, floor + 1, w, Math.min(H - floor, tall * 0.28)); // reflection
      // peak cap: rises with the bar, then falls slowly
      if (tall > peaks[i]) { peaks[i] = tall; fall[i] = 0; } else { fall[i] += 0.35 * dpr; peaks[i] = Math.max(tall, peaks[i] - fall[i]); }
      if (peaks[i] > 4 * dpr) { g.fillStyle = 'rgba(225,250,255,.9)'; g.fillRect(x, floor - peaks[i] - 3 * dpr, w, Math.max(1.5, dpr)); }
    }
    g.fillStyle = 'rgba(160,215,255,.35)'; g.fillRect(0, floor, W, Math.max(1, dpr)); // floor line
    const energy = real && playing ? lw.level.all : 0;
    if (energy > 0.02) { const rg = g.createRadialGradient(W * 0.5, floor, 0, W * 0.5, floor, W * 0.65); rg.addColorStop(0, `rgba(80,190,255,${Math.min(0.2, energy * 0.3)})`); rg.addColorStop(1, 'rgba(80,190,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
  };
  // Album art: scale comes straight from the engine's adaptive envelope (same analysis as the bars). Only the wrapper is
  // transformed (never the <img>), so layout and image styles stay untouched; it relaxes back to 1.0 when paused.
  let lastScale = 1;
  const pulse = () => {
    const sc = lw.artScale;
    if (Math.abs(sc - lastScale) < 0.0004 && !(sc === 1 && lastScale !== 1)) return;
    lastScale = sc;
    art.style.transform = sc <= 1.0004 ? '' : `scale(${sc.toFixed(4)})`;
  };
  // developer diagnostics: only with ?lwdebug=1 (or localStorage lunawave.debug = 1); never part of the normal UI
  let dbg = null, dbgT = 0;
  try { if (/[?&]lwdebug=1/.test(location.search) || localStorage.getItem('lunawave.debug') === '1') { dbg = document.createElement('pre'); dbg.className = 'lw-dbg'; root.appendChild(dbg); } } catch (e) { /* ignore */ }
  const debug = () => {
    if (!dbg) return; const n = performance.now(); if (n - dbgT < 120) return; dbgT = n;
    const d = lw.diag(); dbg.textContent = `ctx ${d.ctx} | ${d.track} ${d.status}${d.paused ? ' (paused)' : ''} live:${d.live}\nbass ${d.bassDb}dB norm ${d.norm} trans ${d.trans}\nenv ${d.env} scale ${d.scale} range ${d.range}dB bins ${d.bins}\nloops ${d.loops} (starts ${d.loopStarts})`;
  };
  const stopWatch = lw.watch(() => { draw(); pulse(); time(); debug(); });

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
