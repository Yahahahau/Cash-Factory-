// Save / load with localStorage. Falls back to memory when storage is blocked (some WebViews / iframes).
import { newState, GRADES } from './economy.js';

export const SAVE_KEY = 'pixelCashFactory.save.v1';
let memoryCopy = null;

function getStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const s = window.localStorage;
    s.setItem('__pcf_t', '1');
    s.removeItem('__pcf_t');
    return s;
  } catch {
    return null;
  }
}

export function storageAvailable() {
  return !!getStorage();
}

const num = (v, d = 0, min = 0, max = Number.MAX_VALUE) =>
  typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : d;

export function sanitize(raw) {
  const base = newState();
  if (!raw || typeof raw !== 'object') return base;
  const s = base;
  s.money = num(raw.money, 0);
  s.grade = Math.floor(num(raw.grade, 1, 1, GRADES.length));
  const cap = GRADES[s.grade - 1].levelCap;
  for (const k of ['production', 'value', 'storage', 'efficiency']) {
    s.levels[k] = Math.floor(num(raw.levels && raw.levels[k], 0, 0, cap));
  }
  s.levels.automation = Math.floor(num(raw.levels && raw.levels.automation, 0, 0, Math.min(5, s.grade)));
  for (const k of Object.keys(s.stats)) s.stats[k] = num(raw.stats && raw.stats[k], 0);
  s.unlocked = Array.isArray(raw.unlocked) ? raw.unlocked.filter((x) => typeof x === 'string').slice(0, 64) : [];
  for (let g = 1; g <= s.grade; g++) if (!s.unlocked.includes('grade' + g)) s.unlocked.push('grade' + g);
  const st = raw.settings || {};
  s.settings.pixel = typeof st.pixel === 'boolean' ? st.pixel : true;
  s.settings.sfx = num(st.sfx, 0.7, 0, 1);
  s.settings.music = num(st.music, 0.35, 0, 1);
  s.settings.quality = ['low', 'medium', 'high'].includes(st.quality) ? st.quality : 'high';
  s.lastSaved = num(raw.lastSaved, Date.now(), 0, Date.now() + 60000);
  return s;
}

export function serialize(state) {
  return JSON.stringify({ v: 1, ...state });
}

export function save(state) {
  state.lastSaved = Date.now();
  const json = serialize(state);
  memoryCopy = json;
  const st = getStorage();
  if (!st) return false;
  try {
    st.setItem(SAVE_KEY, json);
    return true;
  } catch {
    return false;
  }
}

export function load() {
  let json = null;
  const st = getStorage();
  if (st) {
    try { json = st.getItem(SAVE_KEY); } catch { json = null; }
  }
  if (!json) json = memoryCopy;
  if (!json) return { state: newState(), fresh: true };
  try {
    return { state: sanitize(JSON.parse(json)), fresh: false };
  } catch {
    return { state: newState(), fresh: true };
  }
}

export function wipe() {
  memoryCopy = null;
  const st = getStorage();
  if (st) { try { st.removeItem(SAVE_KEY); } catch { /* ignore */ } }
}
