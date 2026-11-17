// Account / cloud-save logic tests (pure functions, no network). Run: npm run test:account
import * as E from '../src/economy.js';
import { toCloudPayload, fromCloudPayload, fingerprint, milestoneKey, hasProgress, decide, summarize, moreProgress, SAVE_VERSION } from '../src/account/payload.js';

let pass = 0;
const t = (n, f) => { try { f(); pass++; console.log('ok   ' + n); } catch (e) { console.log('FAIL ' + n + '\n     ' + e.message); process.exitCode = 1; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} expected ${b}, got ${a}`); };
const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
const fresh = () => E.newState();
const played = () => { const s = fresh(); s.stats.totalEarned = 500; s.stage = 3; s.levels.rate = 2; s.stats.playSeconds = 900; return s; };
const row = (s, rev = 1) => { const p = toCloudPayload(s, 'b1'); return { save_data: p, save_version: SAVE_VERSION, revision: rev, client_saved_at: new Date().toISOString() }; };

t('payload round-trips and drops per-device fields', () => {
  const s = played(); s.settings.sfx = 0.1; s.mini.session = { x: 1 };
  const p = toCloudPayload(s, 'b1');
  ok(!('settings' in p.state) && !('lastSaved' in p.state), 'settings/lastSaved removed');
  eq(p.state.mini.session, undefined === p.state.mini.session ? undefined : null, 'mini.session removed');
  const back = fromCloudPayload(row(s));
  ok(back && back.state.stage === 3, 'restored');
});
t('payload carries no secrets / tokens', () => {
  const j = JSON.stringify(toCloudPayload(played(), 'b1'));
  ok(!/token|password|apikey|secret|@/i.test(j), 'no credential-like content');
});
t('fingerprint ignores play time, settings and lastSaved; sees real progress', () => {
  const a = played(), b = played();
  b.stats.playSeconds += 500; b.settings.sfx = 0.3; b.lastSaved += 1000;
  eq(fingerprint(a), fingerprint(b));
  b.levels.rate++;
  ok(fingerprint(a) !== fingerprint(b), 'upgrade changes it');
});
t('idle cash is not a milestone; a purchase is', () => {
  const a = played(), b = played(); b.cash += 1000; b.stats.totalEarned += 1000;
  eq(milestoneKey(a), milestoneKey(b));
  b.levels.capacity++;
  ok(milestoneKey(a) !== milestoneKey(b));
});
t('hasProgress: new game none, played yes', () => { ok(!hasProgress(fresh())); ok(hasProgress(played())); });
t('decide: nothing anywhere -> noop; guest progress + empty cloud -> upload', () => {
  eq(decide({ userId: 'u', state: fresh(), cloud: null, meta: null }).action, 'noop');
  eq(decide({ userId: 'u', state: played(), cloud: null, meta: null }).action, 'upload');
});
t('decide: new device (no progress) downloads the cloud save', () => {
  eq(decide({ userId: 'u', state: fresh(), cloud: row(played()), meta: null }).action, 'download');
});
t('decide: identical -> insync', () => { const s = played(); eq(decide({ userId: 'u', state: s, cloud: row(s), meta: null }).action, 'insync'); });
t('decide: guest progress vs different cloud save -> conflict (never auto-merge)', () => {
  const c = played(); c.levels.rate = 9; c.stats.totalEarned = 9999;
  const d = decide({ userId: 'u', state: played(), cloud: row(c), meta: null });
  eq(d.action, 'conflict'); eq(d.kind, 'guest');
});
t('decide: same account, cloud unchanged since last sync -> upload', () => {
  const s = played(); const base = played();
  const meta = { userId: 'u', baseRevision: 4, baseFp: fingerprint(base), baseMilestone: milestoneKey(base) };
  s.levels.rate++;
  eq(decide({ userId: 'u', state: s, cloud: row(base, 4), meta }).action, 'upload');
});
t('decide: cloud moved on, this device only idle -> download; both changed -> conflict', () => {
  const base = played(); const meta = { userId: 'u', baseRevision: 4, baseFp: fingerprint(base), baseMilestone: milestoneKey(base) };
  const cloud = played(); cloud.levels.rate = 7;
  const idle = played(); idle.cash += 50; idle.stats.totalEarned += 50;
  eq(decide({ userId: 'u', state: idle, cloud: row(cloud, 5), meta }).action, 'download');
  const mine = played(); mine.levels.capacity = 3;
  eq(decide({ userId: 'u', state: mine, cloud: row(cloud, 5), meta }).kind, 'diverged');
});
t('decide: local progress synced with another account -> conflict "foreign"', () => {
  const base = played(); const meta = { userId: 'other', baseRevision: 1, baseFp: fingerprint(base), baseMilestone: milestoneKey(base) };
  const c = played(); c.levels.rate = 5;
  eq(decide({ userId: 'u', state: base, cloud: row(c), meta }).kind, 'foreign');
  eq(decide({ userId: 'u', state: base, cloud: null, meta }).kind, 'foreign');
});
t('decide: unreadable and newer-format cloud saves are conflicts, not overwritten', () => {
  eq(decide({ userId: 'u', state: played(), cloud: { save_data: 'junk', save_version: 3, revision: 1 }, meta: null }).kind, 'unreadable');
  const r = row(played()); r.save_version = 99;
  eq(decide({ userId: 'u', state: played(), cloud: r, meta: null }).kind, 'newer-format');
});
t('malicious cloud payload is sanitised on load', () => {
  const r = row(played()); r.save_data.state.cash = 'NaN'; r.save_data.state.levels = { rate: 1e99, capacity: -5 }; r.save_data.state.__proto__ = { polluted: 1 };
  const p = fromCloudPayload(r);
  ok(p, 'loads'); ok(Number.isFinite(p.state.cash), 'cash finite'); ok(({}).polluted === undefined, 'no prototype pollution');
});
t('summarize / moreProgress', () => {
  const a = summarize(played(), null), b = summarize(fresh(), null);
  eq(moreProgress(a, b), 1); eq(moreProgress(b, a), -1); eq(moreProgress(a, a), 0);
});
console.log(pass + ' account tests passed');
