// Account controller: wires AccountService + CloudSync + the Account window into the game.
// The game only talks to this object (notifySaved / openWindow / start); nothing here touches gameplay rules.
import { AccountService } from './service.js';
import { CloudSync } from './sync.js';
import { AccountView, statusIcon } from './ui.js';
import { readJSON, writeJSON } from './storage.js';
import { STATUS_TEXT } from './sync.js';

const INVITE_KEY = 'pixelCashFactory.accountInvite.v1';
const INVITE_EVERY = 3 * 24 * 3600 * 1000;
const INVITE_MIN_PLAY = 300; // seconds of play before the first gentle invitation
const TOAST_ICON = { check: 'check', info: 'info', warn: 'warn' };

export function createAccount({ ui, getState, applyState, canApply, build }) {
  const service = new AccountService();
  const sync = new CloudSync(service, { getState, applyState, canApply, build });
  const toast = (msg, icon = 'info') => ui.toast(msg, 3600, { title: 'Account', icon: TOAST_ICON[icon] || 'info' });
  const view = new AccountView(ui, service, sync, { toast });
  sync.askResolve = (info) => view.askConflict(info);

  service.on('notice', (n) => { if (n && n.text) toast(n.text, n.kind === 'error' ? 'warn' : n.kind === 'ok' ? 'check' : 'info'); });
  service.on('expired', () => { toast('You were signed out. Sign in again to keep saving to the cloud.', 'warn'); });

  // ---- tray indicator (only when an account service is configured)
  const tray = document.getElementById('cloudTray');
  const paintTray = () => {
    if (!tray) return;
    if (!service.cfg.configured) { tray.classList.add('hidden'); return; }
    tray.classList.remove('hidden');
    const st = sync.status;
    const text = service.user ? (STATUS_TEXT[st] || st) : 'Guest: progress is saved on this device only';
    tray.dataset.status = service.user ? st : 'guest';
    tray.title = text; tray.setAttribute('aria-label', 'Account and cloud save. ' + text);
    tray.innerHTML = statusIcon(service.user ? st : 'guest', 16);
  };
  if (tray) tray.addEventListener('click', () => view.open());
  sync.on(paintTray); service.on('change', paintTray); service.on('user', paintTray);

  const invite = () => {
    if (!service.cfg.configured || service.user || service.phase !== 'ready') return;
    const s = getState();
    if (!s || (s.stats.playSeconds || 0) < INVITE_MIN_PLAY) return;
    const rec = readJSON(INVITE_KEY) || {};
    if (rec.at && Date.now() - rec.at < INVITE_EVERY) return;
    writeJSON(INVITE_KEY, { at: Date.now() });
    toast('Create a free account to back up your progress and play on any device. You can keep playing as a guest.', 'info');
  };

  return {
    service, sync, view,
    get configured() { return service.cfg.configured; },
    get label() { return service.user ? (service.profile ? service.profile.name : (service.user.email || 'Signed in')) : 'Guest'; },
    notifySaved: (state) => { try { sync.notify(state); } catch (e) { console.error(e); } },
    kick: () => { try { sync.kick(); } catch (e) { console.error(e); } },
    openWindow: () => view.open(),
    async start() {
      paintTray();
      try { await service.init(); } catch (e) { console.error(e); }
      paintTray();
      if (service.recovery || service.notice) view.open();
      setTimeout(invite, 30000);
    },
  };
}
