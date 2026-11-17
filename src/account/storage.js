// Storage helpers that survive restricted environments (iframes with blocked / partitioned storage, private modes).
// Every access is wrapped: nothing here can throw into the game.
const mem = new Map();

function store(kind) {
  try {
    const s = kind === 'session' ? window.sessionStorage : window.localStorage;
    const k = '__pcf_probe';
    s.setItem(k, '1'); s.removeItem(k);
    return s;
  } catch { return null; }
}

export const REMEMBER_KEY = 'pcf.auth.remember';
export function getRemember() { const l = store('local'); try { return !(l && l.getItem(REMEMBER_KEY) === '0'); } catch { return true; } }
export function setRemember(on) { const l = store('local'); try { l && l.setItem(REMEMBER_KEY, on ? '1' : '0'); } catch { /* ignore */ } }
export function storageStatus() {
  const l = !!store('local'), s = !!store('session');
  return { local: l, session: s, persistent: l && getRemember() };
}

// storage adapter handed to supabase-js: localStorage when "remember me" is on, sessionStorage when it is off, memory as the last resort
export const authStorage = {
  getItem(k) {
    for (const kind of ['local', 'session']) { const s = store(kind); try { const v = s && s.getItem(k); if (v != null) return v; } catch { /* ignore */ } }
    return mem.has(k) ? mem.get(k) : null;
  },
  setItem(k, v) {
    mem.set(k, v);
    const keep = getRemember() ? 'local' : 'session', other = keep === 'local' ? 'session' : 'local';
    const a = store(keep), b = store(other);
    try { b && b.removeItem(k); } catch { /* ignore */ }
    try { a && a.setItem(k, v); } catch { /* ignore */ }
  },
  removeItem(k) {
    mem.delete(k);
    for (const kind of ['local', 'session']) { const s = store(kind); try { s && s.removeItem(k); } catch { /* ignore */ } }
  },
};

// small JSON records (per-device sync metadata, local backups)
export function readJSON(key, fallback = null) {
  try { const l = store('local'); const raw = l ? l.getItem(key) : mem.get(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
export function writeJSON(key, value) {
  const raw = JSON.stringify(value);
  mem.set(key, raw);
  const l = store('local');
  try { l && l.setItem(key, raw); return !!l; } catch { return false; }
}
export function removeKey(key) { mem.delete(key); const l = store('local'); try { l && l.removeItem(key); } catch { /* ignore */ } }

export function deviceId() {
  let d = readJSON('pcf.device.v1');
  if (!d || typeof d.id !== 'string') {
    let id;
    try { id = crypto.randomUUID(); } catch { id = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
    d = { id };
    writeJSON('pcf.device.v1', d);
  }
  return d.id;
}
