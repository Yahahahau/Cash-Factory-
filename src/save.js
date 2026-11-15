// Save / load with localStorage. Falls back to memory when storage is blocked (some WebViews / iframes).
// v2 schema = coin-pusher game (the old factory-tycoon v1 save is ignored).
import { newState, MACHINES, MACHINE_TYPES, GLOBALS, ECON } from './economy.js';

export const SAVE_KEY = 'pixelCashFactory.save.v2';
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
  const s = newState();
  if (!raw || typeof raw !== 'object') return s;
  s.cash = num(raw.cash, s.cash);
  s.gems = Math.floor(num(raw.gems, 0));
  s.stage = Math.floor(num(raw.stage, 1, 1, 9999));
  s.progress = Math.floor(num(raw.progress, 0));
  for (const k of Object.keys(GLOBALS)) s.levels[k] = Math.floor(num(raw.levels && raw.levels[k], 0, 0, GLOBALS[k].max));
  for (const id of Object.keys(MACHINES)) s.machines[id] = Math.floor(num(raw.machines && raw.machines[id], 0, 0, MACHINE_TYPES[MACHINES[id].type].max));
  for (const k of Object.keys(s.stats)) s.stats[k] = num(raw.stats && raw.stats[k], 0);
  const st = raw.settings || {};
  s.settings.pixel = typeof st.pixel === 'boolean' ? st.pixel : true;
  s.settings.sfx = num(st.sfx, 0.7, 0, 1);
  s.settings.music = num(st.music, 0.35, 0, 1);
  s.settings.quality = ['low', 'medium', 'high'].includes(st.quality) ? st.quality : 'high';
  // v3 fields (a v2 save simply lacks them and keeps the defaults: run 1, no boost)
  s.run = Math.floor(num(raw.run, 1, 1, 99999));
  s.priceTier = Math.floor(num(raw.priceTier, 0, 0, 60));
  s.runStats.earned = num(raw.runStats && raw.runStats.earned, 0);
  s.runStats.coins = num(raw.runStats && raw.runStats.coins, 0);
  const pm = raw.perm || {};
  s.perm.points = Math.floor(num(pm.points, 0));
  s.perm.bestStage = Math.floor(num(pm.bestStage, s.stage, 1, 9999));
  s.perm.runsCompleted = Math.floor(num(pm.runsCompleted, 0));
  s.perm.bestRunEarned = num(pm.bestRunEarned, 0);
  for (const k of ['unlocks', 'achievements', 'cosmetics']) s.perm[k] = Array.isArray(pm[k]) ? pm[k].filter((x) => typeof x === 'string').slice(0, 64) : [];
  const horizon = Date.now() + 24 * 3600000;
  const bo = raw.boost || {};
  const maxMult = Math.max(...ECON.mini.rewards.map((r) => r.mult));
  const bm = num(bo.mult, 1, 1, maxMult);
  const bu = typeof bo.until === 'number' && isFinite(bo.until) && bo.until > 0 && bo.until <= horizon ? bo.until : 0;
  s.boost = bm > 1 && bu ? { mult: bm, until: bu } : { mult: 1, until: 0 };
  const cu = raw.cursor || {};
  s.cursor = { owned: cu.owned === true, on: cu.on !== false };
  s.cooldownUntil = num(raw.cooldownUntil, 0, 0, horizon + 3600000);
  const mi = raw.mini || {};
  for (const k of ['best', 'plays', 'wins', 'fails', 'gates', 'bestMult']) s.mini[k] = Math.floor(num(mi[k], 0));
  const se = mi.session;
  s.mini.session = se && typeof se.id === 'string' ? { id: se.id.slice(0, 40), objective: Math.floor(num(se.objective, 10, 1, 100)), t0: num(se.t0, 0) } : null;
  void ECON;
  s.lastSaved = num(raw.lastSaved, Date.now(), 0, Date.now() + 60000);
  return s;
}

export function serialize(state) {
  return JSON.stringify({ v: 3, ...state });
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
