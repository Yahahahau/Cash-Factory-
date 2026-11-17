// Landing page of the OAuth redirect. It has three jobs and never shows a token:
//  1. popup relay   : hands the one-time authorization code (or an error) to the game window that opened it, then closes
//  2. standalone    : "Continue in browser" (?start=provider): starts OAuth in this top-level tab and finishes it here
//  3. nothing to do : explains how to get back to the game
import { CONFIG } from './config.js';
import { MSG_TYPE, CHANNEL } from './oauth.js';

const msgEl = document.getElementById('msg');
const say = (text, cls = '', link = '') => {
  msgEl.textContent = '';
  const p = document.createElement('p'); p.textContent = text; if (cls) p.className = cls; msgEl.appendChild(p);
  if (link) { const a = document.createElement('a'); a.className = 'btn'; a.href = link; a.textContent = 'Back to the game'; msgEl.appendChild(a); }
};
const gameHome = () => new URL('./', document.baseURI).href;
const MARK = 'pcf.cb.standalone';
const q = new URLSearchParams(location.search);
const h = new URLSearchParams(location.hash.replace(/^#/, ''));
const code = q.get('code'), start = q.get('start');
const err = q.get('error') || h.get('error'), errDesc = q.get('error_description') || h.get('error_description') || '';
const flag = (v) => { try { return sessionStorage.getItem(MARK) === v; } catch { return false; } };

function cleanUrl() { try { history.replaceState(null, '', location.pathname); } catch { /* ignore */ } }

async function standalone() {
  const { AccountService } = await import('./service.js');
  const svc = new AccountService();
  if (!CONFIG.configured) { say('Cloud accounts are not set up for this game.', 'err', gameHome()); return; }
  await svc.init();
  if (start) {
    if (!/^[a-z]+$/.test(start) || !svc.providers.includes(start)) { say('This sign-in method is not available.', 'err', gameHome()); return; }
    try { sessionStorage.setItem(MARK, '1'); } catch { /* ignore */ }
    say('Opening the sign-in page...');
    cleanUrl();
    const { data, error } = await svc.client.auth.signInWithOAuth({ provider: start, options: { redirectTo: location.origin + location.pathname, skipBrowserRedirect: true } });
    if (error) { say('Could not start sign-in. Please try again from the game.', 'err', gameHome()); return; }
    location.assign(data.url);
    return;
  }
  // returning from the provider: the page's own supabase client exchanges the code (PKCE verifier lives in this tab's storage)
  try { sessionStorage.removeItem(MARK); } catch { /* ignore */ }
  if (svc.user) say('You are signed in. Return to the game. If the embedded game still shows you as signed out, your browser keeps storage separate for embedded games: sign in with e-mail inside the game, or play the game in its own tab.', '', gameHome());
  else say(svc.notice ? svc.notice.text : 'Sign-in could not be completed. Please try again from the game.', 'err', gameHome());
}

if (start || flag('1')) standalone();
else if (code || err) {
  // popup relay: only the single-use code / error text is sent, and only to this exact origin
  const payload = code ? { type: MSG_TYPE, code } : { type: MSG_TYPE, error: err === 'access_denied' ? 'access_denied' : 'oauth_failed', description: errDesc };
  let delivered = false;
  try { if (window.opener && !window.opener.closed) { window.opener.postMessage(payload, location.origin); delivered = true; } } catch { /* opener may be severed */ }
  try { const ch = new BroadcastChannel(CHANNEL); ch.postMessage(payload); ch.close(); delivered = true; } catch { /* ignore */ }
  cleanUrl();
  say(code ? 'Signed in. You can close this window and return to the game.' : 'Sign-in was not completed. You can close this window.', code ? '' : 'err', delivered ? '' : gameHome());
  setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 600);
} else say('Nothing to do here.', '', gameHome());
