// Cloud save synchronisation: serialized queue, debounce, change detection, retry with back-off, offline handling and
// conflict-aware writes (the database refuses a write whose base revision is not the current one).
import { CONFIG } from './config.js';
import { SAVE_VERSION, toCloudPayload, fromCloudPayload, fingerprint, milestoneKey, hasProgress, summarize, decide } from './payload.js';
import { readJSON, writeJSON, removeKey, deviceId } from './storage.js';

export const META_KEY = 'pixelCashFactory.cloud.v1';
export const BACKUP_KEY = 'pixelCashFactory.backup.v1';

// timings (ms). Idle income changes the state every second, so routine changes are written at most once per ROUTINE_MS.
export const TIMING = { importantDebounce: 4000, routine: 45000, safety: 60000, retry: [5000, 15000, 45000, 120000, 300000] };

export const STATUS_TEXT = {
  unconfigured: 'Cloud save is not set up', guest: 'Login required', checking: 'Checking cloud save...', synced: 'Saved to cloud', unsaved: 'Unsaved changes',
  saving: 'Saving...', offline: 'Offline', failed: 'Synchronization failed', conflict: 'Choose which progress to keep',
};

export class CloudSync {
  // h: { getState(), applyState(state, info), canApply(), build }
  constructor(service, h, opts = {}) {
    this.svc = service; this.h = h;
    this.t = { ...TIMING, ...(opts.timing || {}) };
    this.status = service.cfg.configured ? 'guest' : 'unconfigured';
    this.detail = '';
    this.lastSync = null; this.lastError = null;
    this.listeners = new Set();
    this.askResolve = null; // async (info) => 'cloud' | 'local' | 'later'
    this.meta = readJSON(META_KEY) || { userId: null, baseRevision: null, baseFp: null, baseMilestone: null, lastSyncAt: null };
    this.lastFp = null; this.lastMs = null;
    this.timer = 0; this.retryTimer = 0; this.safetyTimer = 0; this.attempt = 0;
    this.running = false; this.again = false; this.pendingReconcile = false; this.reconciling = false;
    this.dueAt = 0;
    this.user = null;
    service.on('user', (u) => this._onUser(u));
    service.on('expired', () => { this._set('guest', 'Your session ended'); });
    window.addEventListener('online', () => { if (this.user) { this.attempt = 0; this.kick(true); } });
    window.addEventListener('offline', () => { if (this.user) this._set('offline'); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.user && this._dirty()) this.flush({ keepalive: true }); });
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of [...this.listeners]) { try { fn(this.snapshot()); } catch (e) { console.error(e); } } }
  snapshot() {
    return { status: this.status, text: STATUS_TEXT[this.status] || '', detail: this.detail, lastSync: this.lastSync || this.meta.lastSyncAt, error: this.lastError, hasBackup: !!this.backups() };
  }
  _set(status, detail = '') { if (this.status === status && this.detail === detail) return; this.status = status; this.detail = detail; this._emit(); }
  _saveMeta() { writeJSON(META_KEY, this.meta); }

  // ---------------- local backups (a save that is replaced is never destroyed at once)
  backups() { return readJSON(BACKUP_KEY); }
  _backup(kind, state, savedAt, revision) {
    const all = this.backups() || {};
    all[kind] = { at: Date.now(), savedAt: savedAt || null, revision: revision ?? null, payload: toCloudPayload(state, this.h.build) };
    writeJSON(BACKUP_KEY, all);
  }
  backupSummary() {
    const b = this.backups(); if (!b) return null;
    const out = [];
    for (const k of ['local', 'cloud']) {
      if (!b[k]) continue;
      const p = fromCloudPayload({ save_data: b[k].payload, save_version: SAVE_VERSION });
      if (p) out.push({ kind: k, at: b[k].at, summary: summarize(p.state, b[k].savedAt) });
    }
    return out;
  }
  restoreBackup(kind) {
    const b = this.backups(); const e = b && b[kind]; if (!e) return false;
    const p = fromCloudPayload({ save_data: e.payload, save_version: SAVE_VERSION }); if (!p) return false;
    this._backup('local', this.h.getState(), Date.now(), null); // what is being replaced is backed up in turn
    this.h.applyState(p.state, { reason: 'restore-backup' });
    this._markDirtyNow();
    return true;
  }

  // ---------------- lifecycle
  _onUser(u) {
    this.user = u;
    clearTimeout(this.timer); this.timer = 0; this.dueAt = 0; clearTimeout(this.retryTimer); clearInterval(this.safetyTimer);
    if (!u) { this._set(this.svc.cfg.configured ? 'guest' : 'unconfigured'); return; }
    this.attempt = 0;
    this._set('checking');
    this.safetyTimer = setInterval(() => { if (this.user && this.status !== 'conflict' && this._dirty() && !this.running) this.flush(); }, this.t.safety);
    this.reconcile();
  }

  // ---------------- called after every local save of the game (cheap: no network unless something meaningful changed)
  notify(state) {
    const fp = fingerprint(state), ms = milestoneKey(state);
    const changed = fp !== this.lastFp;
    const important = this.lastMs !== null && ms !== this.lastMs;
    this.lastFp = fp; this.lastMs = ms;
    if (!this.user || !changed) return;
    if (this.status === 'conflict' || this.status === 'checking' || this.status === 'guest') return;
    if (this.status === 'synced') this._set('unsaved');
    this._schedule(important);
  }
  _dirty() { return this.user && this.lastFp !== null && this.lastFp !== this.meta.baseFp; }
  _markDirtyNow() { const s = this.h.getState(); this.lastFp = fingerprint(s); this.lastMs = milestoneKey(s); if (this.user) { this._set('unsaved'); this._schedule(true); } }
  _schedule(important) {
    const delay = important ? this.t.importantDebounce : this.t.routine;
    const due = Date.now() + delay;
    if (this.timer && this.dueAt && this.dueAt <= due) return; // an earlier write is already planned
    clearTimeout(this.timer);
    this.dueAt = due;
    this.timer = setTimeout(() => { this.timer = 0; this.dueAt = 0; this.flush(); }, delay);
  }
  kick(force) { if (!this.user) return; if (this.pendingReconcile && this.h.canApply()) { this.pendingReconcile = false; this.reconcile(); return; } if (force || this._dirty()) this.flush(); }

  // ---------------- writes (serialized: one request at a time, always the newest snapshot)
  async flush(opts = {}) {
    if (!this.user) return;
    if (this.status === 'conflict' || this.status === 'checking' || this.reconciling) return;
    if (this.running) { this.again = true; return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { this._set('offline'); return; }
    this.running = true;
    try {
      do {
        this.again = false;
        const state = this.h.getState();
        if (!hasProgress(state) && this.meta.baseRevision == null) break;       // nothing worth saving yet
        const fp = fingerprint(state), ms = milestoneKey(state);
        if (fp === this.meta.baseFp && this.meta.userId === this.user.id) { this._set('synced'); break; }
        this._set('saving');
        const sum = summarize(state);
        const res = await this._rpc(state, this.meta.userId === this.user.id ? this.meta.baseRevision : null, sum.totalEarned, opts);
        if (res.status === 'conflict') { this.running = false; await this.reconcile(); return; }
        this.meta = { userId: this.user.id, baseRevision: res.revision, baseFp: fp, baseMilestone: ms, lastSyncAt: Date.now() };
        this._saveMeta();
        this.lastSync = this.meta.lastSyncAt; this.lastError = null; this.attempt = 0;
        const cur = this.h.getState(); const now = fingerprint(cur);
        this.lastFp = now; this.lastMs = milestoneKey(cur);
        this._set(now === fp ? 'synced' : 'unsaved');
        if (now !== fp) this.again = true;
      } while (this.again);
    } catch (e) { this._onWriteError(e); }
    finally { this.running = false; }
  }
  async _rpc(state, baseRevision, score, opts = {}) {
    const payload = toCloudPayload(state, this.h.build);
    const { data, error } = await this.svc.client.rpc('save_game', {
      p_game_id: CONFIG.gameId, p_save_version: SAVE_VERSION, p_save_data: payload, p_base_revision: baseRevision, p_progress_score: score,
      p_device_id: deviceId(), p_client_saved_at: new Date().toISOString(), p_force: false,
    });
    void opts;
    if (error) throw error;
    return data;
  }
  _onWriteError(e) {
    const code = String((e && (e.code || e.status)) || ''), msg = String((e && e.message) || '');
    const net = (typeof navigator !== 'undefined' && navigator.onLine === false) || /failed to fetch|networkerror|load failed|network request failed/i.test(msg) || e.name === 'AuthRetryableFetchError';
    const auth = code === '401' || code === 'PGRST301' || code === '28000' || /jwt|not authenticated/i.test(msg);
    if (auth) { this.lastError = 'Your session has expired. Sign in again.'; this._set('guest', this.lastError); this.svc.emit('expired'); return; }
    this.lastError = net ? 'No connection' : 'The cloud save could not be written';
    if (net) this._set('offline'); else this._set('failed', this.lastError);
    const wait = this.t.retry[Math.min(this.attempt++, this.t.retry.length - 1)];
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.flush(), wait);
  }

  // ---------------- reconcile: the account meets the local save
  async fetchCloud() {
    const { data, error } = await this.svc.client.from('user_game_saves')
      .select('save_data, save_version, revision, updated_at, client_saved_at, progress_score').eq('game_id', CONFIG.gameId).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  async reconcile() {
    if (!this.user || this.reconciling) return;
    if (!this.h.canApply()) { this.pendingReconcile = true; this._set('checking', 'Waiting for the mini-game to close'); return; }
    this.reconciling = true;
    try {
      this._set('checking');
      let cloud;
      try { cloud = await this.fetchCloud(); } catch (e) { this.reconciling = false; this._onWriteError(e); this.retryTimer = setTimeout(() => this.reconcile(), 8000); return; }
      const state = this.h.getState();
      const d = decide({ userId: this.user.id, state, cloud, meta: this.meta });
      this.lastDecision = d;
      if (d.action === 'noop') { this._set('synced'); this.lastFp = fingerprint(state); this.lastMs = milestoneKey(state); }
      else if (d.action === 'insync') { this._adopt(cloud, state, d.fp); this._set('synced'); }
      else if (d.action === 'upload') { this.reconciling = false; this._adoptBase(cloud); await this._uploadAfterDecision(d); return; }
      else if (d.action === 'download') { this._download(cloud, 'newer'); }
      else await this._conflict(d, cloud, state);
    } finally { this.reconciling = false; }
    this.lastFp = fingerprint(this.h.getState()); this.lastMs = milestoneKey(this.h.getState());
    if (this.status === 'synced' && this._dirty()) this.flush();
  }
  _adoptBase(cloud) { // we are about to write on top of this cloud revision
    this.meta = { ...this.meta, userId: this.user.id, baseRevision: cloud ? Number(cloud.revision) : null, baseFp: cloud ? this.meta.baseFp : null };
    if (cloud) this.meta.baseFp = null; // forces a write
    this._saveMeta();
  }
  _adopt(cloud, state, fp) {
    this.meta = { userId: this.user.id, baseRevision: Number(cloud.revision), baseFp: fp, baseMilestone: milestoneKey(state), lastSyncAt: Date.now() };
    this._saveMeta(); this.lastSync = this.meta.lastSyncAt;
  }
  async _uploadAfterDecision(d) {
    this.svc.emit('info', d.why);
    this.lastFp = null;
    this._set('unsaved'); // leave 'checking' so that flush() is allowed to write
    await this.flush();
    if (this.status === 'synced' && d.why.startsWith('first cloud save')) this.svc.emit('notice', { kind: 'ok', text: 'Your progress from this device was saved to your account.' });
  }
  _download(cloud, why) {
    const p = fromCloudPayload(cloud);
    if (!p) return;
    this._backup('local', this.h.getState(), this.meta.lastSyncAt, null);
    this.h.applyState(p.state, { reason: why, revision: Number(cloud.revision) });
    const s = this.h.getState();
    this.meta = { userId: this.user.id, baseRevision: Number(cloud.revision), baseFp: fingerprint(s), baseMilestone: milestoneKey(s), lastSyncAt: Date.now() };
    this._saveMeta(); this.lastSync = this.meta.lastSyncAt; this.lastFp = this.meta.baseFp; this.lastMs = this.meta.baseMilestone;
    this._set('synced');
    this.svc.emit('notice', { kind: 'ok', text: 'Your cloud save was loaded.' });
  }
  async _conflict(d, cloud, state) {
    const parsed = cloud ? fromCloudPayload(cloud) : null;
    if (d.kind === 'unreadable' || d.kind === 'newer-format') {
      this._set('failed', d.kind === 'newer-format' ? 'The cloud save was made by a newer version of the game. Reload to update.' : 'The cloud save could not be read.');
      return;
    }
    this._set('conflict', d.why);
    const info = {
      kind: d.kind, why: d.why,
      local: summarize(state, this.meta.lastSyncAt), cloud: parsed ? summarize(parsed.state, cloud.client_saved_at || cloud.updated_at) : null,
      cloudExists: !!cloud,
    };
    this.pending = info;
    if (!this.askResolve) return;
    let choice = 'later';
    try { choice = await this.askResolve(info); } catch { choice = 'later'; }
    if (choice === 'cloud') await this.resolve('cloud');
    else if (choice === 'local') await this.resolve('local');
    else this._set('conflict', 'Choose which progress to keep (Account window)');
  }
  // explicit player decision
  async resolve(choice) {
    if (!this.user) return;
    let cloud;
    try { cloud = await this.fetchCloud(); } catch (e) { this._onWriteError(e); return; }
    const state = this.h.getState();
    if (choice === 'cloud') {
      if (!cloud) { this._set('failed', 'There is no cloud save to load.'); return; }
      this._download(cloud, 'chosen');
      return;
    }
    // keep this device: the cloud copy is backed up locally first, then replaced by a normal conflict-checked write
    if (cloud) { const p = fromCloudPayload(cloud); if (p) this._backup('cloud', p.state, cloud.client_saved_at || cloud.updated_at, Number(cloud.revision)); }
    this.meta = { ...this.meta, userId: this.user.id, baseRevision: cloud ? Number(cloud.revision) : null, baseFp: null, baseMilestone: null };
    this._saveMeta();
    this.pending = null;
    this._set('unsaved');
    this.lastFp = null;
    await this.flush();
    void state;
  }
  // "Sync now" button
  async syncNow() { if (!this.user) return; this.attempt = 0; if (this.status === 'conflict' && this.pending) return; await this.reconcile(); }

  forgetDevice() { removeKey(META_KEY); this.meta = { userId: null, baseRevision: null, baseFp: null, baseMilestone: null, lastSyncAt: null }; }
}
