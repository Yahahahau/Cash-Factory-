// Popup plumbing for OAuth. Only an authorization CODE (single use, useless without the PKCE verifier kept by this page) or an error
// string travels between windows. Never a password, access token or refresh token.
export const MSG_TYPE = 'pcf-auth:callback';
export const CHANNEL = 'pcf-auth';
const CODE_RE = /^[A-Za-z0-9._~-]{8,512}$/;

// validates an untrusted callback message; returns {code} | {error} | null
export function parseCallback(d) {
  if (!d || typeof d !== 'object' || d.type !== MSG_TYPE) return null;
  if (typeof d.code === 'string' && CODE_RE.test(d.code)) return { code: d.code };
  if (typeof d.error === 'string' && d.error) return { error: d.error.slice(0, 200), description: typeof d.description === 'string' ? d.description.slice(0, 300) : '' };
  return null;
}

// must be called synchronously inside the click handler (browsers block popups that are not a direct result of a user gesture)
export function openPopup() {
  const w = 480, h = 680;
  const left = Math.max(0, Math.round((window.screenX || 0) + ((window.outerWidth || w) - w) / 2));
  const top = Math.max(0, Math.round((window.screenY || 0) + ((window.outerHeight || h) - h) / 3));
  let p = null;
  try { p = window.open('about:blank', 'pcf-auth', `popup=yes,width=${w},height=${h},left=${left},top=${top}`); } catch { p = null; }
  if (!p || p.closed) return null;
  try { p.document.title = 'Signing in...'; } catch { /* cross-origin already: ignore */ }
  return p;
}

// waits for the callback page. Two independent routes (window.opener message and a same-origin BroadcastChannel), both limited to this origin.
export function waitForCallback(popup, { timeout = 5 * 60 * 1000 } = {}) {
  let finish;
  let ch = null;
  let timer = 0;
  const cleanup = () => {
    window.removeEventListener('message', onMsg);
    clearTimeout(timer);
    if (ch) { try { ch.close(); } catch { /* ignore */ } }
  };
  const onMsg = (e) => {
    if (e.origin !== window.location.origin) return;                       // exact origin, never '*'
    if (popup && e.source && e.source !== popup) return;                   // only from the window we opened
    const r = parseCallback(e.data);
    if (r) finish(r);
  };
  const promise = new Promise((resolve) => {
    let done = false;
    finish = (r) => { if (done) return; done = true; cleanup(); resolve(r); };
    window.addEventListener('message', onMsg);
    try { ch = new BroadcastChannel(CHANNEL); ch.onmessage = (e) => { const r = parseCallback(e.data); if (r) finish(r); }; } catch { ch = null; }
    timer = setTimeout(() => finish({ error: 'timeout', description: 'The sign-in window was not completed in time.' }), timeout);
  });
  return { promise, cancel: () => { finish && finish({ error: 'cancelled' }); try { popup && !popup.closed && popup.close(); } catch { /* ignore */ } } };
}
