// Account window (Luna style) + conflict dialog. Rendering only: every action goes through AccountService / CloudSync.
import { XPButton, XPDialog, esc } from '../xp.js';
import { icon as gameIcon } from '../icons.js';
import { ui as ic, providerIcon, avatar } from './icons.js';
import { AVATARS, PROVIDER_LABEL, CONFIG } from './config.js';
import { AccountError, standaloneStartUrl } from './service.js';
import { STATUS_TEXT } from './sync.js';
import { moreProgress } from './payload.js';
import { getRemember } from './storage.js';

const fmtMoney = (n) => { n = Math.max(0, Number(n) || 0); if (n < 1000) return '$' + Math.floor(n); const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi']; let i = -1; while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; } return '$' + n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + u[i]; };
const fmtTime = (s) => { s = Math.floor(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };
const fmtDate = (t) => { if (!t) return 'Never'; const d = new Date(t); if (isNaN(d)) return 'Never'; const diff = (Date.now() - d) / 1000; if (diff < 60) return 'Just now'; if (diff < 3600) return Math.floor(diff / 60) + ' min ago'; return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const STATUS_ICON = { unconfigured: 'cloudOff', guest: 'cloudOff', checking: 'spinner', synced: 'cloudOk', unsaved: 'cloudUp', saving: 'spinner', offline: 'cloudOff', failed: 'cloudWarn', conflict: 'cloudWarn' };
export const statusIcon = (s, size = 16) => ic(STATUS_ICON[s] || 'cloud', size, s === 'saving' || s === 'checking' ? 'spin' : '');

export class AccountView {
  constructor(ui, svc, sync, { toast }) {
    this.ui = ui; this.svc = svc; this.sync = sync; this.toast = toast;
    this.view = 'auto'; this.tab = 'login'; this.msg = null; this.busy = false; this.pendingEmail = ''; this.resendAt = 0; this.waiting = null; this.popupBlocked = null;
    this.w = null; this.avatarSel = null;
    svc.on('change', () => this._onChange());
    svc.on('user', () => { this.view = 'auto'; this.msg = null; this._onChange(true); });
    sync.on(() => this._onSync());
  }

  // ---------------- window plumbing
  open() {
    const w = this.ui.wm.open({ id: 'account', title: 'Account', icon: 'user', width: 392, html: '<div class="acc" id="accRoot"></div>', replace: false, resize: true });
    if (!this.w || this.w.closed || this.w !== w) { this.w = w; this._wire(w); }
    this.msg = this.svc.notice ? this.svc.notice : this.msg; this.svc.notice = null;
    this.render();
    return w;
  }
  get root() { return this.w && !this.w.closed ? this.w.q('#accRoot') : null; }
  _onChange(force) {
    if (!this.root) return;
    const v = this._current();
    // typing in a form must never be interrupted by background updates: only the provider list is refreshed there
    if (force || this._lastView !== v) this.render(); else this._refreshProviders();
  }
  _onSync() { const r = this.root; if (!r) return; if (this._current() === 'profile') this._paintCloud(); }
  _current() {
    if (!this.svc.cfg.configured) return 'unconfigured';
    if (this.svc.phase === 'loading') return 'loading';
    if (this.svc.phase === 'error') return 'error';
    if (this.svc.recovery && this.svc.user) return 'recovery';
    if (this.svc.user) return ['profile', 'delete', 'password'].includes(this.view) ? this.view : 'profile';
    return ['login', 'register', 'forgot', 'verify', 'waiting'].includes(this.view) ? this.view : this.tab;
  }
  go(view, msg = null) { this.view = view; if (view === 'login' || view === 'register') this.tab = view; this.msg = msg; this.popupBlocked = null; this.render(); }

  setMsg(kind, text) { this.msg = text ? { kind, text } : null; const el = this.root && this.root.querySelector('#accMsg'); if (el) el.outerHTML = this._msgHtml(); }
  _msgHtml() {
    const m = this.msg;
    if (!m) return '<div id="accMsg" class="acc-msg" hidden></div>';
    const icn = m.kind === 'error' ? 'error' : m.kind === 'ok' ? 'ok' : 'info';
    return `<div id="accMsg" class="acc-msg ${esc(m.kind)}" role="${m.kind === 'error' ? 'alert' : 'status'}">${ic(icn, 16)}<span>${esc(m.text)}</span></div>`;
  }

  // ---------------- render
  render() {
    const r = this.root; if (!r) return;
    const v = this._current(); this._lastView = v;
    const map = { unconfigured: () => this._unconfigured(), loading: () => this._loading(), error: () => this._errorView(), login: () => this._login(), register: () => this._register(),
      forgot: () => this._forgot(), verify: () => this._verify(), waiting: () => this._waiting(), recovery: () => this._recovery(), profile: () => this._profile(), password: () => this._password(), delete: () => this._delete() };
    r.innerHTML = (map[v] || map.login)();
    if (v === 'profile') { this._paintCloud(); this.avatarSel = this.svc.profile ? this.svc.profile.avatar : 'coin'; }
    const f = r.querySelector('[data-autofocus]'); if (f && !this.ui.isTouch) setTimeout(() => f.focus({ preventScroll: true }), 40);
    this._tickResend();
  }

  _hero(title, sub) {
    return `<div class="acc-hero"><div class="acc-logo">${gameIcon('coin', 34)}</div><div><div class="acc-brand">PIXEL COIN PUSHER</div><div class="acc-h">${esc(title)}</div>${sub ? `<div class="acc-sub">${esc(sub)}</div>` : ''}</div></div>`;
  }
  _privacy() {
    return `<div class="acc-priv">${ic('shield', 14)}<span>Your password is handled by the account service and is never stored in the game. Only your progress is saved to the cloud. You can play as a guest at any time.</span></div>`;
  }
  _field({ id, label, type = 'text', ac = '', ph = '', icon = '', value = '', auto = false, eye = false, extra = '' }) {
    return `<label class="acc-f" for="${id}"><span class="acc-l">${esc(label)}</span><span class="acc-in">${icon ? ic(icon, 16) : ''}<input id="${id}" name="${id}" type="${type}" ${ac ? `autocomplete="${ac}"` : ''} placeholder="${esc(ph)}" value="${esc(value)}" ${auto ? 'data-autofocus' : ''} autocapitalize="off" autocorrect="off" spellcheck="false" ${extra}>${eye ? `<button type="button" class="acc-eye" data-act="eye" data-for="${id}" aria-label="Show password" title="Show password">${ic('eye', 16)}</button>` : ''}</span></label>`;
  }
  _tabs(active) {
    return `<div class="acc-tabs" role="tablist"><button type="button" role="tab" class="${active === 'login' ? 'sel' : ''}" aria-selected="${active === 'login'}" data-act="tab" data-v="login">${ic('lock', 14)}Sign in</button><button type="button" role="tab" class="${active === 'register' ? 'sel' : ''}" aria-selected="${active === 'register'}" data-act="tab" data-v="register">${ic('userRound', 14)}Create account</button></div>`;
  }
  _providersHtml() {
    const ps = this.svc.providers;
    if (!ps.length) return '';
    const btns = ps.map((p) => `<button type="button" class="acc-prov ${p}" data-act="oauth" data-p="${p}">${providerIcon(p)}<span>Continue with ${PROVIDER_LABEL[p]}</span></button>`).join('');
    return `<div class="acc-or"><span>or</span></div><div class="acc-provs" id="accProvs">${btns}</div>`;
  }
  _refreshProviders() {
    const el = this.root && this.root.querySelector('#accProvsWrap'); if (!el) return;
    el.innerHTML = this._providersHtml();
  }
  _fallback() {
    if (!this.popupBlocked) return '';
    const p = this.popupBlocked;
    const direct = !this.svc.inIframe;
    const link = direct
      ? `<button type="button" class="xpbtn touch" data-act="redirect" data-p="${p}">${ic('link', 14)}<span>Continue in browser</span></button>`
      : `<a class="xpbtn touch" href="${esc(standaloneStartUrl(p))}" target="_blank" rel="noopener">${ic('link', 14)}<span>Continue in browser</span></a>${this.svc.hostOrigin ? `<button type="button" class="xpbtn touch" data-act="hostopen" data-p="${p}"><span>Ask the host app</span></button>` : ''}`;
    return `<div class="acc-fallback" role="alert">${ic('warn', 16)}<div><b>Your browser blocked the ${esc(PROVIDER_LABEL[p])} sign-in window.</b><div class="acc-small">${direct ? 'Continue in this tab: your progress is saved first and you return to the game afterwards.' : 'Open the sign-in in its own browser tab. Afterwards come back here and reload the game.'}</div><div class="acc-row">${link}</div></div></div>`;
  }
  _storageNote() {
    const s = this.svc.storage;
    if (s.local) return '';
    return `<div class="acc-note">${ic('info', 14)}<span>This browser does not allow the game to store data, so you will stay signed in only until you close the page.</span></div>`;
  }

  _login() {
    const rem = getRemember();
    return `${this._hero('Welcome, player!', 'Sign in to back up your progress and play on any device.')}${this._tabs('login')}${this._msgHtml()}
      <form class="acc-form" data-form="login" novalidate>
        ${this._field({ id: 'accEmail', label: 'Email', type: 'email', ac: 'email', ph: 'you@example.com', icon: 'mail', auto: true, extra: 'inputmode="email"', value: this.pendingEmail })}
        ${this._field({ id: 'accPass', label: 'Password', type: 'password', ac: 'current-password', icon: 'lock', eye: true })}
        <div class="acc-row between"><label class="xpchk"><input type="checkbox" id="accRemember" ${rem ? 'checked' : ''}><span class="box"></span><span>Keep me signed in on this device</span></label><button type="button" class="acc-link" data-act="forgot">Forgot password?</button></div>
        ${XPButton({ id: 'accGo', label: 'Sign in', ico: '', cls: 'touch acc-primary', def: true, attrs: 'type="submit"' })}
      </form>
      <div id="accProvsWrap">${this._providersHtml()}</div>${this._fallback()}${this._storageNote()}${this._privacy()}`;
  }
  _register() {
    return `${this._hero('Create your account', 'It is free, and your guest progress on this device can be kept.')}${this._tabs('register')}${this._msgHtml()}
      <form class="acc-form" data-form="register" novalidate>
        ${this._field({ id: 'accEmail', label: 'Email', type: 'email', ac: 'email', ph: 'you@example.com', icon: 'mail', auto: true, extra: 'inputmode="email"', value: this.pendingEmail })}
        ${this._field({ id: 'accPass', label: 'Password', type: 'password', ac: 'new-password', ph: 'At least 8 characters', icon: 'lock', eye: true })}
        <div class="acc-meter" id="accMeter" aria-hidden="true"><i></i></div>
        ${this._field({ id: 'accPass2', label: 'Confirm password', type: 'password', ac: 'new-password', icon: 'lock', eye: true })}
        ${XPButton({ id: 'accGo', label: 'Create account', cls: 'touch acc-primary', def: true, attrs: 'type="submit"' })}
        <div class="acc-small">${ic('mail', 12)} We will send a verification link to your email address.</div>
      </form>
      <div id="accProvsWrap">${this._providersHtml()}</div>${this._fallback()}
      <div class="acc-row"><button type="button" class="acc-link" data-act="tab" data-v="login">${ic('back', 12)} Back to sign in</button></div>${this._privacy()}`;
  }
  _forgot() {
    return `${this._hero('Reset your password', 'Enter your email and we will send you a reset link.')}${this._msgHtml()}
      <form class="acc-form" data-form="forgot" novalidate>
        ${this._field({ id: 'accEmail', label: 'Email', type: 'email', ac: 'email', icon: 'mail', auto: true, extra: 'inputmode="email"', value: this.pendingEmail })}
        ${XPButton({ id: 'accGo', label: 'Send reset link', cls: 'touch acc-primary', def: true, attrs: 'type="submit"' })}
      </form>
      <div class="acc-row"><button type="button" class="acc-link" data-act="tab" data-v="login">${ic('back', 12)} Back to sign in</button></div>`;
  }
  _verify() {
    return `${this._hero('Check your email', '')}${this._msgHtml()}
      <div class="acc-card center">${ic('mail', 36)}<p>We sent a verification link to <b>${esc(this.pendingEmail)}</b>.</p><p class="acc-small">Open the link in this same browser, then sign in. The link works once. Check your spam folder if it does not arrive.</p></div>
      <div class="acc-row">${XPButton({ id: 'accResend', label: 'Resend email', cls: 'touch', attrs: 'type="button" data-act="resend"' })}${XPButton({ id: 'accBackLogin', label: 'Back to sign in', cls: 'touch', attrs: 'type="button" data-act="tab" data-v="login"' })}</div>`;
  }
  _waiting() {
    return `${this._hero('Waiting for sign-in', '')}${this._msgHtml()}
      <div class="acc-card center">${ic('spinner', 32, 'spin')}<p>Finish signing in with <b>${esc(PROVIDER_LABEL[this.waiting] || 'your provider')}</b> in the other window.</p><p class="acc-small">The game keeps running here. If the window did not open or was closed, cancel and try another way.</p></div>
      <div class="acc-row">${XPButton({ id: 'accCancel', label: 'Cancel', cls: 'touch', attrs: 'type="button" data-act="cancel-oauth"' })}</div>${this._fallback() || (this.waiting ? this._fallbackFor(this.waiting) : '')}`;
  }
  _fallbackFor(p) { this.popupBlocked = p; const h = this._fallback(); this.popupBlocked = null; return h.replace('Your browser blocked the', 'Prefer not to use a popup? Or if it was blocked, the').replace(' sign-in window.', ' sign-in window.'); }
  _recovery() {
    return `${this._hero('Choose a new password', 'You opened a password reset link.')}${this._msgHtml()}
      <form class="acc-form" data-form="recovery" novalidate>
        ${this._field({ id: 'accPass', label: 'New password', type: 'password', ac: 'new-password', ph: 'At least 8 characters', icon: 'key', auto: true, eye: true })}
        ${this._field({ id: 'accPass2', label: 'Confirm new password', type: 'password', ac: 'new-password', icon: 'key', eye: true })}
        ${XPButton({ id: 'accGo', label: 'Save new password', cls: 'touch acc-primary', def: true, attrs: 'type="submit"' })}
      </form>`;
  }
  _password() {
    return `${this._hero('Change password', '')}${this._msgHtml()}
      <form class="acc-form" data-form="password" novalidate>
        ${this._field({ id: 'accPass', label: 'New password', type: 'password', ac: 'new-password', ph: 'At least 8 characters', icon: 'key', auto: true, eye: true })}
        ${this._field({ id: 'accPass2', label: 'Confirm new password', type: 'password', ac: 'new-password', icon: 'key', eye: true })}
        <div class="acc-row">${XPButton({ id: 'accGo', label: 'Save password', cls: 'touch acc-primary', def: true, attrs: 'type="submit"' })}${XPButton({ id: 'accBack', label: 'Cancel', cls: 'touch', attrs: 'type="button" data-act="profile"' })}</div>
      </form>`;
  }
  _unconfigured() {
    return `${this._hero('Cloud accounts are not set up', '')}
      <div class="acc-card">${ic('cloudOff', 28)}<p>This copy of the game has no account service configured, so it cannot sign players in or save to the cloud.</p><p class="acc-small">You can keep playing as a guest: progress is saved on this device. Site owners: see <b>docs/backend-setup.md</b> to connect a Supabase project.</p></div>`;
  }
  _loading() { return `${this._hero('Account', '')}<div class="acc-card center">${ic('spinner', 32, 'spin')}<p>Checking your session...</p></div>`; }
  _errorView() { return `${this._hero('Account unavailable', '')}${this._msgHtml()}<div class="acc-row">${XPButton({ id: 'accRetry', label: 'Reload the game', cls: 'touch', attrs: 'type="button" data-act="reload"' })}</div>`; }

  _profile() {
    const u = this.svc.user, p = this.svc.profile || { name: (u.email || 'Player').split('@')[0], avatar: 'coin' };
    const prov = u.provider === 'email' ? 'Email and password' : (PROVIDER_LABEL[u.provider] || u.provider);
    const grid = AVATARS.map((a) => `<button type="button" class="acc-avopt ${a === p.avatar ? 'sel' : ''}" data-act="avatar" data-a="${a}" aria-label="Avatar ${a}" aria-pressed="${a === p.avatar}">${avatar(a, 36)}</button>`).join('');
    const linkable = CONFIG.linking ? this.svc.providers.filter((x) => !u.providers.includes(x)) : [];
    return `<div class="acc-who">${avatar(p.avatar, 56)}<div class="acc-whoi"><div class="acc-name" id="accName">${esc(p.name)}</div><div class="acc-mail">${esc(u.email || 'No email address')}</div>
        <div class="acc-chips"><span class="acc-chip ${u.verified ? 'ok' : 'warn'}">${ic(u.verified ? 'verified' : 'warn', 12)}${u.verified ? 'Verified' : 'Email not verified'}</span><span class="acc-chip">${ic('key', 12)}${esc(prov)}</span></div></div></div>
      ${this._msgHtml()}
      <div class="acc-card" id="accCloud"></div>
      <details class="acc-det" ${this._editOpen ? 'open' : ''}><summary>${ic('edit', 14)} Edit profile</summary>
        <form class="acc-form" data-form="profile" novalidate>
          ${this._field({ id: 'accDisp', label: 'Display name', ac: 'nickname', icon: 'userRound', value: p.name, extra: 'maxlength="24"' })}
          <div class="acc-l">Avatar</div><div class="acc-avgrid" id="accAvGrid">${grid}</div>
          ${XPButton({ id: 'accSaveProf', label: 'Save profile', cls: 'touch', def: true, attrs: 'type="submit"' })}
        </form></details>
      <details class="acc-det"><summary>${ic('settings', 14)} Account management</summary><div class="acc-form">
        ${u.provider === 'email' ? XPButton({ id: 'accPwd', label: 'Change password', cls: 'touch', attrs: 'type="button" data-act="password"' }) : ''}
        ${linkable.length ? `<div class="acc-l">Link another sign-in method</div><div class="acc-provs">${linkable.map((x) => `<button type="button" class="acc-prov ${x}" data-act="link" data-p="${x}">${providerIcon(x)}<span>Link ${PROVIDER_LABEL[x]}</span></button>`).join('')}</div>` : ''}
        <div class="acc-small">${ic('shield', 12)} Accounts are never merged automatically: two sign-in methods are only combined if you link them here, or if the account service itself matches the same verified email address.</div>
        <div class="acc-danger"><b>Delete account</b><span class="acc-small">Permanently removes your account and your cloud save. Progress stored on this device is kept.</span>${XPButton({ id: 'accDel', label: 'Delete account...', cls: 'touch red', attrs: 'type="button" data-act="delete"' })}</div>
      </div></details>
      <div class="acc-row between">${XPButton({ id: 'accOut', label: 'Sign out', cls: 'touch', attrs: 'type="button" data-act="signout"' })}</div>`;
  }
  _paintCloud() {
    const el = this.root && this.root.querySelector('#accCloud'); if (!el) return;
    const s = this.sync.snapshot();
    const bk = this.sync.backupSummary() || [];
    const label = { local: 'this device', cloud: 'the cloud' };
    const backups = bk.length ? `<div class="acc-bk"><div class="acc-l">${ic('history', 12)} Backups kept on this device</div>${bk.map((b) => `<div class="acc-bkrow"><span>Progress from ${label[b.kind]}: Run ${b.summary.run}, stage ${b.summary.stage}, ${fmtMoney(b.summary.totalEarned)} earned (replaced ${esc(fmtDate(b.at))})</span><button type="button" class="acc-link" data-act="restore" data-k="${b.kind}">Restore</button></div>`).join('')}</div>` : '';
    el.innerHTML = `<div class="acc-cloudrow"><span class="acc-cs ${s.status}">${statusIcon(s.status, 22)}</span><div class="grow"><div class="acc-ct">Cloud save: <b>${esc(STATUS_TEXT[s.status] || s.status)}</b></div><div class="acc-small">${s.detail ? esc(s.detail) + '. ' : ''}Last synced: ${esc(fmtDate(s.lastSync))}</div></div>
      ${s.status === 'conflict' && this.sync.pending ? `<button type="button" class="xpbtn touch def" data-act="resolve">Choose</button>` : `<button type="button" class="xpbtn touch" data-act="syncnow" ${s.status === 'saving' || s.status === 'checking' ? 'disabled' : ''} aria-label="Sync now">${ic('sync', 14)}<span>Sync now</span></button>`}</div>${backups}`;
  }
  _delete() {
    const u = this.svc.user, pw = u && u.provider === 'email';
    return `${this._hero('Delete your account', '')}${this._msgHtml()}
      <div class="acc-card warn">${ic('warn', 28)}<div><p><b>This cannot be undone.</b></p><ul class="acc-ul"><li>Your account and profile are deleted.</li><li>Your <b>cloud save is permanently deleted</b>. Progress stored on this device is not touched, and the game keeps working as a guest.</li><li>You can create a new account later, but the deleted cloud save cannot be recovered.</li></ul></div></div>
      <form class="acc-form" data-form="delete" novalidate>
        ${pw ? this._field({ id: 'accPass', label: 'Your password', type: 'password', ac: 'current-password', icon: 'lock', auto: true, eye: true }) : ''}
        ${this._field({ id: 'accConfirm', label: 'Type DELETE to confirm', ph: 'DELETE', icon: 'trash', auto: !pw })}
        <div class="acc-row">${XPButton({ id: 'accGo', label: 'Delete my account', cls: 'touch red', attrs: 'type="submit"' })}${XPButton({ id: 'accBack', label: 'Keep my account', cls: 'touch', def: true, attrs: 'type="button" data-act="profile"' })}</div>
      </form>`;
  }

  // ---------------- events
  _wire(w) {
    const body = w.body;
    body.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) this._act(b.dataset.act, b, e); });
    body.addEventListener('submit', (e) => { e.preventDefault(); const f = e.target.closest('[data-form]'); if (f) this._submit(f.dataset.form, f); });
    body.addEventListener('input', (e) => {
      if (e.target.id === 'accPass' && this._current() === 'register') this._meter(e.target.value);
    });
  }
  _meter(v) {
    const m = this.root.querySelector('#accMeter i'); if (!m) return;
    let sc = 0; if (v.length >= 8) sc++; if (v.length >= 12) sc++; if (/[a-z]/.test(v) && /[A-Z]/.test(v)) sc++; if (/\d/.test(v)) sc++; if (/[^A-Za-z0-9]/.test(v)) sc++;
    m.style.width = Math.min(100, sc * 20) + '%'; m.className = sc <= 2 ? 'weak' : sc === 3 ? 'ok' : 'strong';
  }
  _val(id) { const el = this.root.querySelector('#' + id); return el ? el.value : ''; }
  _setBusy(on, label) {
    this.busy = on;
    const b = this.root && this.root.querySelector('#accGo, #accSaveProf'); if (!b) return;
    b.disabled = on; if (label !== undefined) { const s = b.querySelector('span'); if (s) { if (on) b.dataset.l = s.textContent; s.textContent = on ? label : (b.dataset.l || s.textContent); } }
  }
  async _run(label, fn) {
    if (this.busy) return;
    this._setBusy(true, label); this.setMsg(null, '');
    try { await fn(); } catch (e) { const fe = e instanceof AccountError ? e : new AccountError('unknown', 'Something went wrong. Please try again.'); this._fail(fe); }
    finally { this._setBusy(false); }
  }
  _fail(e) {
    if (e.code === 'popup_blocked') { this.popupBlocked = this._lastProvider; this.waiting = null; this.go(this.tab, { kind: 'error', text: e.message }); return; }
    if (this.view === 'waiting') { this.waiting = null; this.go(this.tab, { kind: 'error', text: e.message }); return; }
    this.setMsg('error', e.message);
    if (e.code === 'email_not_confirmed') { this.pendingEmail = this._val('accEmail') || this.pendingEmail; }
  }

  async _submit(kind, form) {
    const email = this._val('accEmail').trim();
    if (kind === 'login') {
      if (!EMAIL_RE.test(email)) return this.setMsg('error', 'Enter a valid email address.');
      const pw = this._val('accPass'); if (!pw) return this.setMsg('error', 'Enter your password.');
      const remember = !!(this.root.querySelector('#accRemember') || {}).checked;
      this.pendingEmail = email;
      await this._run('Signing in...', async () => { await this.svc.signIn(email, pw, remember); });
    } else if (kind === 'register') {
      const pw = this._val('accPass'), pw2 = this._val('accPass2');
      if (!EMAIL_RE.test(email)) return this.setMsg('error', 'Enter a valid email address.');
      if (pw.length < 8) return this.setMsg('error', 'The password needs at least 8 characters.');
      if (pw !== pw2) return this.setMsg('error', 'The two passwords do not match.');
      this.pendingEmail = email;
      await this._run('Creating account...', async () => {
        const r = await this.svc.signUp(email, pw);
        if (r.needsVerification) { this.resendAt = Date.now() + 60000; this.go('verify', { kind: 'ok', text: 'Account created. Please verify your email address.' }); }
        else this.toast('Account created. Welcome!', 'check');
      });
    } else if (kind === 'forgot') {
      if (!EMAIL_RE.test(email)) return this.setMsg('error', 'Enter a valid email address.');
      this.pendingEmail = email;
      await this._run('Sending...', async () => { await this.svc.sendPasswordReset(email); this.setMsg('ok', 'If an account exists for this address, a reset link is on its way. Open it in this browser.'); });
    } else if (kind === 'recovery' || kind === 'password') {
      const pw = this._val('accPass'), pw2 = this._val('accPass2');
      if (pw.length < 8) return this.setMsg('error', 'The password needs at least 8 characters.');
      if (pw !== pw2) return this.setMsg('error', 'The two passwords do not match.');
      await this._run('Saving...', async () => { await this.svc.updatePassword(pw); this.toast('Your password was changed.', 'check'); this.go('profile', { kind: 'ok', text: 'Password changed.' }); });
    } else if (kind === 'profile') {
      await this._run('Saving...', async () => { await this.svc.saveProfile({ name: this._val('accDisp'), avatar: this.avatarSel || 'coin' }); this._editOpen = false; this.go('profile', { kind: 'ok', text: 'Profile saved.' }); });
    } else if (kind === 'delete') {
      if (this._val('accConfirm').trim() !== 'DELETE') return this.setMsg('error', 'Type DELETE (in capital letters) to confirm.');
      const pw = this.svc.user && this.svc.user.provider === 'email' ? this._val('accPass') : '';
      if (this.svc.user && this.svc.user.provider === 'email' && !pw) return this.setMsg('error', 'Enter your password to confirm.');
      await this._run('Deleting...', async () => {
        await this.svc.deleteAccount(pw);
        this.sync.forgetDevice();
        this.toast('Your account and cloud save were deleted. Your progress on this device is unchanged.', 'info');
        this.go('login', { kind: 'ok', text: 'Your account was deleted.' });
      });
    }
  }

  async _act(act, el) {
    switch (act) {
      case 'tab': this.go(el.dataset.v); break;
      case 'forgot': this.pendingEmail = this._val('accEmail').trim() || this.pendingEmail; this.go('forgot'); break;
      case 'profile': this.go('profile'); break;
      case 'password': this.go('password'); break;
      case 'delete': this.go('delete'); break;
      case 'reload': location.reload(); break;
      case 'eye': {
        const inp = this.root.querySelector('#' + el.dataset.for); if (!inp) break;
        const show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
        el.innerHTML = ic(show ? 'eyeOff' : 'eye', 16); el.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); el.title = show ? 'Hide password' : 'Show password'; break;
      }
      case 'avatar': {
        this.avatarSel = el.dataset.a;
        this.root.querySelectorAll('.acc-avopt').forEach((b) => { const on = b === el; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', String(on)); });
        break;
      }
      case 'resend': {
        if (Date.now() < this.resendAt) break;
        this.busy = false;
        try { await this.svc.resendVerification(this.pendingEmail); this.resendAt = Date.now() + 60000; this.setMsg('ok', 'Verification email sent again.'); this._tickResend(); } catch (e) { this.setMsg('error', e.message); }
        break;
      }
      case 'oauth': await this._oauth(el.dataset.p); break;
      case 'cancel-oauth': this.svc.cancelOAuth(); break;
      case 'redirect': {
        this.toast('Saving your progress, then continuing in this tab...', 'info');
        try { await this.svc.startOAuth(el.dataset.p, 'redirect'); } catch (e) { this.setMsg('error', e.message); }
        break;
      }
      case 'hostopen': if (this.svc.hostOpen(el.dataset.p)) this.setMsg('info', 'Asked the host app to open the sign-in page.'); break;
      case 'link': {
        this._lastProvider = el.dataset.p;
        try { await this.svc.linkProvider(el.dataset.p); this.setMsg('ok', PROVIDER_LABEL[el.dataset.p] + ' was linked to your account.'); this.render(); } catch (e) { this.setMsg('error', e.message); }
        break;
      }
      case 'signout': await this.svc.signOut(); this.toast('Signed out. Your progress stays on this device.', 'info'); this.go('login'); break;
      case 'syncnow': this.sync.syncNow(); break;
      case 'resolve': if (this.sync.pending) { const c = await this.askConflict(this.sync.pending); if (c === 'cloud' || c === 'local') await this.sync.resolve(c); } break;
      case 'restore': this._restore(el.dataset.k); break;
      default: break;
    }
  }
  async _oauth(p) {
    if (this.busy) return;
    this._lastProvider = p; this.popupBlocked = null; this.waiting = p;
    // the popup must be opened inside this click: render the waiting screen only after startOAuth opened it
    const run = this.svc.startOAuth(p, 'popup');
    this.view = 'waiting'; this.msg = null; this.render();
    try { await run; this.waiting = null; this.view = 'auto'; this.render(); this.toast('Signed in.', 'check'); }
    catch (e) { this._fail(e instanceof AccountError ? e : new AccountError('unknown', 'Sign-in failed. Please try again.')); }
  }
  _restore(kind) {
    XPDialog(this.ui.wm, { id: 'accRestore', title: 'Restore backup', ico: 'warn', message: `Replace the progress on this device with the backup from ${kind === 'cloud' ? 'the cloud' : 'this device'}? Your current progress is backed up first.`, width: 340,
      buttons: [{ id: 'rsY', label: 'Restore', def: true, onClick: (w) => { w.close(); if (this.sync.restoreBackup(kind)) this.toast('Backup restored. It will be saved to your account.', 'check'); } }, { id: 'rsN', label: 'Cancel', onClick: (w) => w.close() }] });
  }
  _tickResend() {
    const b = this.root && this.root.querySelector('#accResend'); if (!b) return;
    clearInterval(this._rt);
    const upd = () => { const left = Math.ceil((this.resendAt - Date.now()) / 1000); const s = b.querySelector('span'); if (left > 0) { b.disabled = true; s.textContent = `Resend email (${left}s)`; } else { b.disabled = false; s.textContent = 'Resend email'; clearInterval(this._rt); } };
    upd(); this._rt = setInterval(() => { if (!this.root || !this.root.querySelector('#accResend')) { clearInterval(this._rt); return; } upd(); }, 1000);
  }

  // ---------------- conflict dialog: the player decides, nothing is overwritten silently
  askConflict(info) {
    return new Promise((resolve) => {
      const existing = this.ui.wm.get('accConflict'); if (existing && !existing.closed) existing.close(true);
      const col = (title, s, tag) => `<div class="acc-cc"><div class="acc-cct">${esc(title)}${tag ? `<span class="acc-tag">${esc(tag)}</span>` : ''}</div>${s ? `
        <div class="xpkv"><span>Run / stage</span><b>${s.run} / ${s.stage}</b></div><div class="xpkv"><span>Total earned</span><b>${fmtMoney(s.totalEarned)}</b></div><div class="xpkv"><span>Cash</span><b>${fmtMoney(s.cash)}</b></div>
        <div class="xpkv"><span>Gems</span><b>${s.gems}</b></div><div class="xpkv"><span>Upgrades</span><b>${s.upgrades}</b></div><div class="xpkv"><span>Play time</span><b>${fmtTime(s.playSeconds)}</b></div><div class="xpkv"><span>Last saved</span><b>${esc(fmtDate(s.savedAt))}</b></div>` : '<div class="acc-small">No cloud save yet.</div>'}</div>`;
      const why = { guest: 'This device already has progress, and your account has a different cloud save.', diverged: 'Progress changed both on this device and on another device since the last sync.',
        foreign: 'The progress on this device was synced with a different account.' }[info.kind] || info.why;
      const cmp = info.cloud ? moreProgress(info.local, info.cloud) : 1;
      const html = `<div class="acc-conf"><p>${esc(why)} Choose which progress to keep.</p><div class="acc-cols">${col('This device', info.local, cmp > 0 ? 'More earnings' : '')}${col('Cloud save', info.cloud, cmp < 0 ? 'More earnings' : '')}</div>
        <p class="acc-small">${ic('shield', 12)} The one you do not keep is backed up on this device first, so you can restore it from the Account window.</p></div>`;
      let done = false;
      const fin = (c) => { if (done) return; done = true; resolve(c); };
      const w = XPDialog(this.ui.wm, { id: 'accConflict', title: 'Which progress do you want to keep?', ico: 'cloud', message: '', extra: html, width: 400, onClose: () => fin('later'),
        buttons: [
          { id: 'cfCloud', label: 'Use cloud save', onClick: (d) => { fin('cloud'); d.close(true); }, disabled: !info.cloud },
          { id: 'cfLocal', label: 'Keep this device', onClick: (d) => { fin('local'); d.close(true); } },
          { id: 'cfLater', label: 'Decide later', onClick: (d) => { fin('later'); d.close(true); } },
        ] });
      void w;
    });
  }
}
