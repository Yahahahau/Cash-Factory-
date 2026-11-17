// Pure functions (no DOM, no network): what goes to the cloud, how two saves are compared and what to do about it.
import { sanitize } from '../save.js';

export const SAVE_VERSION = 3; // matches save.js serialize() `v`
export const PAYLOAD_FORMAT = 1;

// The cloud copy holds progression only. Device preferences (graphics, volumes), the transient Flying Ball session and the local
// write timestamp are deliberately NOT synchronised.
export function toCloudPayload(state, build = 'dev') {
  const { settings, lastSaved, ...rest } = state; // eslint-disable-line no-unused-vars
  const body = JSON.parse(JSON.stringify(rest));
  if (body.mini) body.mini.session = null;
  return { format: PAYLOAD_FORMAT, build: String(build).slice(0, 32), state: body };
}

// Validates a payload that came from the server. Returns a sanitized game state (through the same sanitizer as local saves) or null.
export function fromCloudPayload(row) {
  if (!row || typeof row !== 'object') return null;
  const data = row.save_data;
  if (!data || typeof data !== 'object' || data.format !== PAYLOAD_FORMAT || !data.state || typeof data.state !== 'object') return null;
  const ver = Number(row.save_version);
  if (!Number.isInteger(ver) || ver < 1) return null;
  return { state: sanitize({ ...data.state, lastSaved: 0 }), version: ver, newer: ver > SAVE_VERSION };
}

function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
// 53-bit hash (cyrb53) of the synchronised content; the play-time counter is excluded so that it alone never counts as a change
export function fingerprint(state) {
  const p = toCloudPayload(state).state;
  if (p.stats) p.stats.playSeconds = 0;
  const s = stable(p);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// "Milestone" = the things a player consciously did: purchases, stage / run progress, unlocks, Flying Ball results.
// Idle cash and coin counters are not milestones (they grow every second).
export function milestoneKey(s) {
  return [s.stage, s.run, s.perm.bestStage, s.perm.points, s.perm.runsCompleted, s.perm.achievements.length, s.perm.unlocks.length,
    Math.floor(s.gems), s.levels.rate, s.levels.capacity, s.levels.rare, Object.values(s.machines).join('.'), s.cursor.owned ? 1 : 0,
    s.mini.plays, s.mini.wins, s.stats.upgradesBought].join('|');
}

export function hasProgress(s) {
  return s.stats.coinsCollected > 0 || s.stats.upgradesBought > 0 || s.stage > 1 || s.run > 1 || s.mini.plays > 0 || s.perm.runsCompleted > 0;
}

export function summarize(s, savedAt) {
  return {
    run: s.run, stage: s.stage, bestStage: Math.max(s.perm.bestStage, s.stage), totalEarned: s.stats.totalEarned, cash: s.cash, gems: Math.floor(s.gems),
    upgrades: s.levels.rate + s.levels.capacity + s.levels.rare + Object.values(s.machines).reduce((a, b) => a + b, 0),
    playSeconds: s.stats.playSeconds, achievements: s.perm.achievements.length, savedAt: savedAt || null,
  };
}

/**
 * Decides what to do when the signed-in account and the local save meet (sign-in, session restore, reconnect, rejected write).
 *  local : { state }                 the game state in memory
 *  cloud : the server row {save_data, save_version, revision} or null
 *  meta  : per-device sync record {userId, baseRevision, baseFp, baseMilestone} (what this device last synchronised)
 * Returns { action: 'noop'|'insync'|'upload'|'download'|'conflict', kind?, why }
 */
export function decide({ userId, state, cloud, meta }) {
  const local = { fp: fingerprint(state), ms: milestoneKey(state), progress: hasProgress(state) };
  const mine = !!meta && meta.userId === userId;       // this device already synchronised with THIS account
  const foreign = !!meta && !!meta.userId && !mine;    // the local progress was synchronised with ANOTHER account
  if (!cloud) {
    if (!local.progress) return { action: 'noop', why: 'nothing to save yet' };
    if (foreign) return { action: 'conflict', kind: 'foreign', why: 'local progress belongs to another account' };
    return { action: 'upload', why: 'first cloud save (guest progress migrated)' };
  }
  const parsed = fromCloudPayload(cloud);
  if (!parsed) return { action: 'conflict', kind: 'unreadable', why: 'cloud save could not be read' };
  if (parsed.newer) return { action: 'conflict', kind: 'newer-format', why: 'cloud save was made by a newer game version' };
  const cloudFp = fingerprint(parsed.state);
  if (cloudFp === local.fp) return { action: 'insync', why: 'identical', fp: cloudFp };
  if (!local.progress) return { action: 'download', why: 'this device has no progress yet' };
  if (!hasProgress(parsed.state)) return { action: 'upload', why: 'the cloud save is empty' };
  if (mine && meta.baseRevision != null) {
    if (Number(cloud.revision) === Number(meta.baseRevision)) return { action: 'upload', why: 'this device is ahead of the cloud save' };
    if (local.ms === meta.baseMilestone) return { action: 'download', why: 'the cloud save is newer and this device has no purchases / progress of its own since the last sync' };
    return { action: 'conflict', kind: 'diverged', why: 'both this device and another one changed the progress since the last sync' };
  }
  if (foreign) return { action: 'conflict', kind: 'foreign', why: 'local progress belongs to another account' };
  return { action: 'conflict', kind: 'guest', why: 'guest progress on this device differs from the account\'s cloud save' };
}

// which of two summaries has more lifetime progress (informational label in the conflict dialog; never auto-selects)
export function moreProgress(a, b) {
  if (a.totalEarned === b.totalEarned) return 0;
  return a.totalEarned > b.totalEarned ? 1 : -1;
}
