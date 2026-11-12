// Iframe / WebView integration: size reporting, host messages and live auto-update.
//
// Update flow: every deploy writes version.json {version}. The running game polls it; when it differs
// from the build it is running, the game saves, tells the host, and reloads itself onto the new build.
/* global __BUILD_ID__ */

export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
const POLL_MS = 45000;
const MAX_TRIES = 2;

export const inIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

function postHost(msg) {
  if (!inIframe) return;
  try { window.parent.postMessage({ source: 'pixel-cash-factory', ...msg }, '*'); } catch { /* ignore */ }
}

export class Embed {
  constructor({ onPause, onResume, onQuality, onBeforeReload, onUpdateAvailable }) {
    this.cb = { onPause, onResume, onQuality, onBeforeReload, onUpdateAvailable };
    this.latest = BUILD_ID;
    this.checking = false;
    this.timer = null;
    window.addEventListener('message', (e) => this._onMessage(e));
  }

  start(size) {
    postHost({ type: 'pcf:ready', version: BUILD_ID, aspect: 430 / 870, width: size.w, height: size.h });
    this.timer = setInterval(() => this.check(), POLL_MS);
    window.addEventListener('online', () => this.check());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
    setTimeout(() => this.check(), 4000);
  }

  reportSize(w, h) {
    postHost({ type: 'pcf:resize', width: w, height: h, aspect: w / Math.max(1, h) });
  }

  _onMessage(e) {
    const d = e.data;
    if (!d || typeof d !== 'object' || (d.target && d.target !== 'pixel-cash-factory')) return;
    switch (d.type) {
      case 'pcf:pause': this.cb.onPause && this.cb.onPause(); break;
      case 'pcf:resume': this.cb.onResume && this.cb.onResume(); break;
      case 'pcf:setQuality': if (['low', 'medium', 'high'].includes(d.value)) this.cb.onQuality && this.cb.onQuality(d.value); break;
      case 'pcf:checkUpdate': this.check(true); break;
      case 'pcf:reload': this.reload(this.latest); break;
      default: break;
    }
  }

  async check(force = false) {
    if (this.checking || BUILD_ID.startsWith('dev')) return;
    this.checking = true;
    try {
      const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      if (j && j.version && j.version !== BUILD_ID) {
        this.latest = j.version;
        const key = 'pcf.reloadTries.' + j.version;
        let tries = 0;
        try { tries = Number(sessionStorage.getItem(key) || 0); } catch { /* ignore */ }
        if (tries < MAX_TRIES || force) {
          this.cb.onUpdateAvailable && this.cb.onUpdateAvailable(j.version);
          postHost({ type: 'pcf:updateAvailable', from: BUILD_ID, to: j.version });
          setTimeout(() => this.reload(j.version), 2800);
        }
      }
    } catch { /* offline: try again later */ } finally {
      this.checking = false;
    }
  }

  reload(version) {
    try { this.cb.onBeforeReload && this.cb.onBeforeReload(); } catch { /* ignore */ }
    const key = 'pcf.reloadTries.' + version;
    try { sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) || 0) + 1)); } catch { /* ignore */ }
    postHost({ type: 'pcf:reloading', to: version });
    // new query string => the HTML is fetched fresh even when an intermediate cache still holds index.html
    const u = new URL(window.location.href);
    u.searchParams.set('v', version);
    window.location.replace(u.toString());
  }
}
