// Authentication service. The game never talks to Supabase (or any provider) directly: it uses this class, so providers can be
// added or the backend swapped without touching gameplay code.
import { CONFIG, KNOWN_PROVIDERS } from './config.js';
import { authStorage, getRemember, setRemember, storageStatus } from './storage.js';
import { openPopup, waitForCallback } from './oauth.js';

export const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
const gameUrl = () => window.location.origin + window.location.pathname;
const callbackUrl = () => new URL('auth-callback.html', document.baseURI).href;
export const standaloneStartUrl = (provider) => `${callbackUrl()}?start=${encodeURIComponent(provider)}`;

export class AccountError extends Error {
  constructor(code, message, cause) { super(message); this.code = code; this.cause = cause; }
}

const FRIENDLY = {
  invalid_credentials: 'Incorrect email or password.',
  email_not_confirmed: 'Please verify your email address first. Check your inbox, or resend the verification email.',
  user_already_exists: 'An account with this email already exists. Try signing in instead.',
  email_exists: 'An account with this email already exists. Try signing in instead.',
  weak_password: 'This password is too weak. Use at least 8 characters, mixing letters and numbers.',
  over_email_send_rate_limit: 'Too many emails were requested. Please wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
  email_address_invalid: 'This email address is not accepted.',
  signup_disabled: 'New accounts cannot be created right now.',
  same_password: 'The new password must be different from the current one.',
  session_not_found: 'Your session has expired. Please sign in again.',
  refresh_token_not_found: 'Your session has expired. Please sign in again.',
  bad_jwt: 'Your session has expired. Please sign in again.',
  otp_expired: 'This link has expired or was already used. Please request a new one.',
  provider_disabled: 'This sign-in method is not available.',
  user_banned: 'This account is not allowed to sign in.',
  reauthentication_needed: 'Please sign in again to do this.',
  popup_blocked: 'Your browser blocked the sign-in window.',
  cancelled: 'Sign-in was cancelled.',
  timeout: 'The sign-in window was not completed in time.',
  access_denied: 'Sign-in was cancelled or denied.',
};
export function friendlyError(err) {
  if (err instanceof AccountError) return err;
  const code = String((err && (err.code || err.error_code)) || '');
  const name = String((err && err.name) || '');
  const msg = String((err && err.message) || '');
  if (name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|load failed|network request failed/i.test(msg) || (typeof navigator !== 'undefined' && navigator.onLine === false && !code))
    return new AccountError('network', 'Cannot reach the account server. Check your connection and try again.', err);
  if (FRIENDLY[code]) return new AccountError(code, FRIENDLY[code], err);
  if (/invalid login credentials/i.test(msg)) return new AccountError('invalid_credentials', FRIENDLY.invalid_credentials, err);
  if (/email not confirmed/i.test(msg)) return new AccountError('email_not_confirmed', FRIENDLY.email_not_confirmed, err);
  if (/already registered/i.test(msg)) return new AccountError('user_already_exists', FRIENDLY.user_already_exists, err);
  if (/rate limit/i.test(msg)) return new AccountError('over_request_rate_limit', FRIENDLY.over_request_rate_limit, err);
  return new AccountError(code || 'unknown', 'Something went wrong. Please try again.', err);
}

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new AccountError('timeout', what + ' timed out.')), ms))]);

export class AccountService {
  constructor(cfg = CONFIG) {
    this.cfg = cfg;
    this.client = null;
    this.listeners = new Map();
    this.phase = cfg.configured ? 'loading' : 'unconfigured'; // loading | ready | unconfigured | error
    this.user = null;
    this.profile = null;
    this.providers = [];          // providers that Supabase reports as enabled (and that we have branding for)
    this.authSettings = null;     // {emailEnabled, signupDisabled, autoconfirm}
    this.settingsError = false;
    this.recovery = false;        // arrived through a password reset link: the player must choose a new password
    this.notice = null;           // {kind:'info'|'error'|'ok', text} from the URL / session handling
    this.storage = storageStatus();
    this.inIframe = inIframe;
    this._oauth = null;
    this.hostOrigin = this._detectHostOrigin();
  }

  // ---------------- tiny event emitter
  on(evt, fn) { if (!this.listeners.has(evt)) this.listeners.set(evt, new Set()); this.listeners.get(evt).add(fn); return () => this.listeners.get(evt).delete(fn); }
  emit(evt, data) { for (const fn of [...(this.listeners.get(evt) || [])]) { try { fn(data); } catch (e) { console.error(e); } } }

  _detectHostOrigin() {
    if (!inIframe) return '';
    let o = '';
    try { if (window.location.ancestorOrigins && window.location.ancestorOrigins.length) o = window.location.ancestorOrigins[0]; } catch { /* ignore */ }
    if (!o) { try { o = new URL(document.referrer).origin; } catch { o = ''; } }
    return this.cfg.trustedHosts.includes(o) ? o : '';
  }

  get signedIn() { return !!this.user; }
  get emailEnabled() { return !this.authSettings || this.authSettings.emailEnabled; }

  // ---------------- start-up: client, provider discovery, session restore
  async init() {
    if (!this.cfg.configured) { this.phase = 'unconfigured'; this.emit('change'); return; }
    try {
      const { createClient } = await import('@supabase/supabase-js');
      this.client = createClient(this.cfg.url, this.cfg.key, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: authStorage, storageKey: 'pcf-auth' },
        global: { headers: { 'x-client-info': 'pixel-coin-pusher-web' } },
      });
    } catch (e) {
      this.phase = 'error'; this.notice = { kind: 'error', text: 'The account module could not be loaded. Check your connection and reload.' }; this.emit('change'); return;
    }
    this.client.auth.onAuthStateChange((event, session) => {
      // never call other auth methods synchronously from inside this callback (supabase-js holds a lock here)
      setTimeout(() => this._onAuthEvent(event, session), 0);
    });
    this._readUrlNotice();
    this.refreshSettings();
    let session = null;
    try { ({ data: { session } } = await withTimeout(this.client.auth.getSession(), 12000, 'Restoring the session')); } catch (e) { /* offline: the stored session is kept and retried by supabase-js */ }
    this._setSession(session);
    this._checkLeftoverCode();
    this.phase = 'ready';
    this.emit('change');
    window.addEventListener('online', () => this.refreshSettings());
  }

  _readUrlNotice() {
    try {
      const q = new URLSearchParams(window.location.search), h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const err = q.get('error_description') || h.get('error_description') || q.get('error') || h.get('error');
      const code = q.get('error_code') || h.get('error_code');
      let touched = false;
      if (err) {
        const fr = code && FRIENDLY[code] ? FRIENDLY[code] : /expired|invalid/i.test(err) ? FRIENDLY.otp_expired : 'The sign-in link could not be used. Please try again.';
        this.notice = { kind: 'error', text: fr }; touched = true;
      }
      for (const k of ['error', 'error_code', 'error_description']) if (q.has(k)) { q.delete(k); touched = true; }
      if (touched || h.has('error')) {
        const url = window.location.pathname + (q.toString() ? '?' + q : '');
        window.history.replaceState(null, '', url); // keep tokens / error details out of the address bar and history
      }
    } catch { /* ignore */ }
  }

  // supabase-js removes a ?code= it exchanged. One that is still there could not be used (typically: the link was opened in another browser than the one that requested it)
  _checkLeftoverCode() {
    try {
      const q = new URLSearchParams(window.location.search);
      if (!q.get('code')) return;
      if (!this.user && !this.notice) this.notice = { kind: 'error', text: 'This link can only be completed in the same browser where it was requested. Open it there, or request a new one.' };
      q.delete('code');
      window.history.replaceState(null, '', window.location.pathname + (q.toString() ? '?' + q : ''));
    } catch { /* ignore */ }
  }

  async refreshSettings() {
    if (!this.cfg.configured) return;
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 7000);
      const r = await fetch(`${this.cfg.url}/auth/v1/settings`, { headers: { apikey: this.cfg.key }, signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error('settings ' + r.status);
      const j = await r.json();
      const ext = (j && j.external) || {};
      this.authSettings = { emailEnabled: ext.email !== false, signupDisabled: !!j.disable_signup, autoconfirm: !!j.mailer_autoconfirm };
      // only providers that the project really has enabled, and (optionally) that the site owner listed in VITE_AUTH_PROVIDERS
      this.providers = KNOWN_PROVIDERS.filter((p) => ext[p] === true && (!this.cfg.providerHint.length || this.cfg.providerHint.includes(p)));
      this.settingsError = false;
    } catch {
      this.settingsError = true;      // unknown: show only e-mail; never guess that a provider works
      this.providers = [];
    }
    this.emit('change');
  }

  // ---------------- session state
  _publicUser(u) {
    if (!u) return null;
    const ids = Array.isArray(u.identities) ? u.identities.map((i) => i.provider) : [];
    const prov = (u.app_metadata && u.app_metadata.provider) || ids[0] || 'email';
    return { id: u.id, email: u.email || '', provider: prov, providers: ids.length ? ids : [prov], verified: !!u.email_confirmed_at || prov !== 'email', createdAt: u.created_at || null };
  }
  _setSession(session) {
    const prev = this.user;
    this.user = session && session.user ? this._publicUser(session.user) : null;
    if (!this.user) this.profile = null;
    if ((prev && prev.id) !== (this.user && this.user.id)) { this.emit('user', this.user); if (this.user) this.loadProfile(); }
  }
  async _onAuthEvent(event, session) {
    if (event === 'PASSWORD_RECOVERY') { this.recovery = true; }
    if (event === 'SIGNED_OUT') { const was = this.user; this._setSession(null); if (was && !this._manualSignOut) { this.notice = { kind: 'info', text: 'You were signed out (your session ended). Sign in again to keep saving to the cloud.' }; this.emit('expired'); } }
    else this._setSession(session);
    if (event === 'USER_UPDATED' && session) this.user = this._publicUser(session.user);
    this.emit('change');
  }

  // ---------------- e-mail flows
  async signUp(email, password, displayName) {
    this._need();
    const { data, error } = await this.client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: gameUrl(), data: displayName ? { display_name: displayName } : {} } });
    if (error) throw friendlyError(error);
    // an existing address answers with a user that has no identities (the server does not reveal which addresses are registered)
    const hasSession = !!data.session;
    return { needsVerification: !hasSession, session: hasSession };
  }
  async signIn(email, password, remember = true) {
    this._need();
    setRemember(remember); this.storage = storageStatus();
    const { error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw friendlyError(error);
  }
  async resendVerification(email) {
    this._need();
    const { error } = await this.client.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: gameUrl() } });
    if (error) throw friendlyError(error);
  }
  async sendPasswordReset(email) {
    this._need();
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), { redirectTo: gameUrl() });
    if (error) throw friendlyError(error);
  }
  async updatePassword(password) {
    this._need();
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw friendlyError(error);
    this.recovery = false; this.emit('change');
  }
  async signOut() {
    if (!this.client) return;
    this._manualSignOut = true;
    try { await this.client.auth.signOut({ scope: 'local' }); } catch (e) { /* local session is cleared even if the request failed */ }
    this._setSession(null);
    this._manualSignOut = false;
    this.recovery = false;
    this.emit('change');
  }

  // ---------------- OAuth (Google, Discord, GitHub, Apple)
  // mode 'popup': secure popup + PKCE (the game page stays alive, nothing reloads)
  // mode 'redirect': top-level redirect in the same tab (direct website fallback). The caller saves the game first.
  async startOAuth(provider, mode = 'popup') {
    this._need();
    if (!this.providers.includes(provider)) throw new AccountError('provider_disabled', FRIENDLY.provider_disabled);
    if (mode === 'redirect') {
      if (inIframe) throw new AccountError('iframe_redirect', 'Open the game in its own browser tab to sign in with this provider.');
      this.emit('before-redirect');
      const { error } = await this.client.auth.signInWithOAuth({ provider, options: { redirectTo: gameUrl() } });
      if (error) throw friendlyError(error);
      return { redirected: true };
    }
    const popup = openPopup();
    if (!popup) throw new AccountError('popup_blocked', FRIENDLY.popup_blocked);
    let wait;
    try {
      const { data, error } = await this.client.auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl(), skipBrowserRedirect: true } });
      if (error) throw error;
      wait = waitForCallback(popup);
      this._oauth = wait;
      popup.location.href = data.url;
    } catch (e) { try { popup.close(); } catch { /* ignore */ } throw friendlyError(e); }
    const res = await wait.promise;
    this._oauth = null;
    try { popup.closed || popup.close(); } catch { /* ignore */ }
    if (res.error) throw new AccountError(res.error, FRIENDLY[res.error] || res.description || 'Sign-in failed.');
    const { error } = await this.client.auth.exchangeCodeForSession(res.code);
    if (error) throw friendlyError(error);
    return { redirected: false };
  }
  cancelOAuth() { if (this._oauth) { this._oauth.cancel(); this._oauth = null; } }

  // link another provider to the signed-in account (needs "Manual linking" enabled in Supabase; shown only when VITE_ENABLE_LINKING=1)
  async linkProvider(provider) {
    this._need();
    if (!this.cfg.linking || !this.providers.includes(provider)) throw new AccountError('provider_disabled', FRIENDLY.provider_disabled);
    const popup = openPopup();
    if (!popup) throw new AccountError('popup_blocked', FRIENDLY.popup_blocked);
    let wait;
    try {
      const { data, error } = await this.client.auth.linkIdentity({ provider, options: { redirectTo: callbackUrl(), skipBrowserRedirect: true } });
      if (error) throw error;
      wait = waitForCallback(popup); this._oauth = wait;
      popup.location.href = data.url;
    } catch (e) { try { popup.close(); } catch { /* ignore */ } throw friendlyError(e); }
    const res = await wait.promise;
    this._oauth = null;
    try { popup.closed || popup.close(); } catch { /* ignore */ }
    if (res.error) throw new AccountError(res.error, FRIENDLY[res.error] || res.description || 'Linking failed.');
    const { error } = await this.client.auth.exchangeCodeForSession(res.code);
    if (error) throw friendlyError(error);
    const { data: u } = await this.client.auth.getUser();
    if (u && u.user) { this.user = this._publicUser(u.user); this.emit('change'); }
  }

  // ask a cooperating embedding host to open the sign-in page (only for exact origins listed in VITE_TRUSTED_HOST_ORIGINS)
  hostOpen(provider) {
    if (!inIframe || !this.hostOrigin || !KNOWN_PROVIDERS.includes(provider)) return false;
    try { window.parent.postMessage({ source: 'pixel-cash-factory', type: 'pcf:auth-open', url: standaloneStartUrl(provider) }, this.hostOrigin); return true; } catch { return false; }
  }

  // ---------------- profile (display name + avatar) and account deletion
  async loadProfile() {
    if (!this.client || !this.user) return null;
    try {
      const { data, error } = await this.client.from('profiles').select('display_name, avatar_id').eq('id', this.user.id).maybeSingle();
      if (error) throw error;
      this.profile = data ? { name: data.display_name, avatar: data.avatar_id } : { name: (this.user.email || 'Player').split('@')[0].slice(0, 24) || 'Player', avatar: 'coin' };
    } catch { this.profile = this.profile || { name: (this.user.email || 'Player').split('@')[0].slice(0, 24) || 'Player', avatar: 'coin' }; }
    this.emit('change');
    return this.profile;
  }
  async saveProfile({ name, avatar }) {
    this._need();
    if (!this.user) throw new AccountError('reauthentication_needed', FRIENDLY.reauthentication_needed);
    const clean = String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!clean) throw new AccountError('invalid_name', 'Please enter a display name (1 to 24 characters).');
    // the owner is the authenticated session (RLS: id = auth.uid()); a user id sent from here would not be trusted by the database anyway
    const { error } = await this.client.from('profiles').upsert({ id: this.user.id, display_name: clean, avatar_id: avatar }, { onConflict: 'id' });
    if (error) throw friendlyError(error);
    this.profile = { name: clean, avatar };
    this.emit('change');
  }
  async deleteAccount(password) {
    this._need();
    if (!this.user) throw new AccountError('reauthentication_needed', FRIENDLY.reauthentication_needed);
    if (this.user.provider === 'email') {
      const { error: e1 } = await this.client.auth.signInWithPassword({ email: this.user.email, password: password || '' });
      if (e1) throw friendlyError(e1);
    }
    const { error } = await this.client.rpc('delete_my_account');
    if (error) throw friendlyError(error);
    await this.signOut();
  }

  _need() { if (!this.client) throw new AccountError('unconfigured', 'Cloud accounts are not set up for this copy of the game.'); }
}
