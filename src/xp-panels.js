// XPUpgradePanel (machine / global upgrade window) and XPSettingsPanel (tabbed settings window).
import * as E from './economy.js';
import { icon } from './icons.js';
import { XPButton, XPProgressBar, XPTabControl, XPToggle, XPDialog, XPGroup, esc } from './xp.js';

const KIND_ICON = { pusher: 'piston', conveyor: 'conveyor', blower: 'fan', magnet: 'magnet', launcher: 'launcher', rate: 'coin', capacity: 'box', rare: 'gem' };

export function renderUpgrade(ui, force) {
  const key = ui.sheetKey;
  if (!key || !ui.state) return;
  const s = ui.state;
  const info = E.upgradeInfo(s, key);
  const eff = E.effectText(s, key);
  const sig = [key, info.lvl, info.cost, info.canBuy, eff].join('|');
  const exist = ui.wm.has('upgrade') ? ui.wm.get('upgrade') : null;
  if (!exist && !force) return;
  if (!force && exist && ui.cache.sheetSig === sig) return;
  ui.cache.sheetSig = sig;
  const kind = info.isMachine ? E.MACHINES[key].type : key;
  const name = info.isMachine ? E.MACHINES[key].name : info.name;
  const status = info.isMachine ? (info.lvl === 0 ? '<span class="tagoff">Not installed</span>' : '<span class="tagon">Running</span>') : '';
  const first = info.lvl === 0 && info.isMachine;
  const html = `<div class="upg-head"><div class="xpico-lg">${icon(KIND_ICON[kind] || 'gear', 32)}</div><div class="grow"><div class="xph">${esc(name)}</div><div class="xps">${esc(info.title)}</div></div></div>
    <div class="xpkv"><span>Level</span><b>${info.lvl} / ${info.max}</b></div>
    ${XPProgressBar((info.lvl / info.max) * 100, '', { cls: 'blue thin' })}
    ${status ? `<div class="xprow"><span>Status</span>${status}</div>` : ''}
    <div class="upg-fx">${eff}</div>
    <div class="xp-btnrow">${XPButton({ id: 'upBuy', label: info.atMax ? 'Maximum level' : `${first ? 'Install' : 'Upgrade'} &nbsp;$${E.fmtCash(info.cost)}`, def: !info.atMax && info.canBuy, disabled: info.atMax || !info.canBuy, cls: 'touch' + (info.canBuy ? ' money' : '') })}${XPButton({ id: 'upClose', label: 'Close', cls: 'touch' })}</div>`;
  const w = ui.wm.open({ id: 'upgrade', title: name, icon: KIND_ICON[kind] || 'gear', width: 300, dock: 'bottom', html, replace: true, max: false, reveal: false, onClose: () => { ui.sheetKey = null; ui.cache.sheetSig = null; } });
  w.q('#upClose').addEventListener('click', () => { ui.h.onClick(); w.close(); });
  w.setTitle(name);
  w.q('#upBuy').addEventListener('click', () => { ui.h.onBuy(key); renderUpgrade(ui, true); });
}

const QL = { low: 'Low', medium: 'Medium', high: 'High' };

export function openSettings(ui, startTab = 0) {
  const s = ui.state, h = ui.h, st = s.stats;
  const q = s.settings.quality;
  const kv = (a, b) => `<div class="xpkv"><span>${a}</span><b>${b}</b></div>`;
  const ach = s.perm.achievements.map((id) => E.ACHIEVEMENTS[id] && E.ACHIEVEMENTS[id].name).filter(Boolean);
  const tabs = [
    { label: 'Graphics', html: XPGroup('Graphics quality', ['low', 'medium', 'high'].map((k) => XPToggle({ id: 'q_' + k, radio: true, name: 'quality', value: k, checked: q === k, label: QL[k] })).join('')) + '<div class="xps">Low turns shadows off and renders fewer pixels, which is smoother on older devices.</div>',
      onShow: (p) => p.querySelectorAll('input[name=quality]').forEach((i) => i.addEventListener('change', () => { h.onSetting('quality', i.value); h.onClick(); })) },
    { label: 'Retro Pixel', html: XPGroup('Retro Pixel Effect', XPToggle({ id: 'pix', label: 'Enable retro pixel effect', checked: !!s.settings.pixel })) + '<div class="xps">Renders the playfield at a low resolution for the chunky pixel look. Turn it off for smooth, full resolution graphics.</div>',
      onShow: (p) => p.querySelector('#pix').addEventListener('change', (e) => { h.onSetting('pixel', e.target.checked); h.onClick(); }) },
    { label: 'Sound', html: XPGroup('Sound effects', `<div class="xprow">${icon('sound', 16)}<input id="sfx" class="xprange" type="range" min="0" max="100" value="${Math.round(s.settings.sfx * 100)}" aria-label="Sound effects volume"><b id="sfxV">${Math.round(s.settings.sfx * 100)}%</b></div>`),
      onShow: (p) => { const r = p.querySelector('#sfx'); r.addEventListener('input', () => { h.onSetting('sfx', r.value / 100); p.querySelector('#sfxV').textContent = r.value + '%'; }); r.addEventListener('change', () => h.onClick()); } },
    { label: 'Music', html: XPGroup('Music', `<div class="xprow">${icon('sound', 16)}<input id="mus" class="xprange" type="range" min="0" max="100" value="${Math.round(s.settings.music * 100)}" aria-label="Music volume"><b id="musV">${Math.round(s.settings.music * 100)}%</b></div>`),
      onShow: (p) => { const r = p.querySelector('#mus'); r.addEventListener('input', () => { h.onSetting('music', r.value / 100); p.querySelector('#musV').textContent = r.value + '%'; }); } },
    { label: 'Controls', html: XPGroup('Playfield', '<div class="xpt">Tap or click the machine to poke coins with a real impulse.</div>') + XPGroup('Buttons', '<div class="xpt">Drop releases a coin. Tap a price tag to open its upgrade window.</div>') + XPGroup('Flying Ball', '<div class="xpt">Tap, click, Space or Up Arrow to flap. Esc closes the top window.</div>') },
    { label: 'Performance', html: `${XPGroup('Adaptive quality', '<div class="xpt">If the frame rate stays low, quality is lowered automatically (High, Medium, Low).</div>')}${kv('Current quality', QL[q])}${kv('Frame rate', '<span id="fps">-</span>')}${kv('Retro pixel', s.settings.pixel ? 'On' : 'Off')}${(() => { const pr = h.getPresentation ? h.getPresentation() : null; return pr ? kv('Display mode', pr.mode) + kv('Pointer policy', pr.input === 'mouse' ? 'mouse (' + pr.cursor + ' cursor)' : 'touch / native pointer') + (pr.diagnostics.length ? '<div class="xps">' + pr.diagnostics.map(esc).join('<br>') + '</div>' : '') : ''; })()}`,
      onShow: (p) => { const f = p.querySelector('#fps'); const t = () => { if (!f.isConnected) return; f.textContent = (h.getFps ? h.getFps() : 0) + ' fps'; setTimeout(t, 500); }; t(); } },
    { label: 'Save info', html: `${XPGroup('Run', kv('Current run', s.run) + kv('Permanent upgrade points', `${s.perm.points} (x${E.permMult(s).toFixed(2)} income)`) + kv('Runs completed', s.perm.runsCompleted) + kv('Best stage', Math.max(s.perm.bestStage, s.stage)) + kv('Flying Ball best', s.mini.best) + kv('Flying Ball wins', `${s.mini.wins}/${s.mini.plays}`))}
      ${XPGroup('Statistics', kv('Total earned', E.fmtMoney(st.totalEarned)) + kv('Coins collected', E.fmtNum(Math.floor(st.coinsCollected))) + kv('Stages cleared', st.stagesCleared) + kv('Best combo', st.bestCombo) + kv('Upgrades bought', st.upgradesBought) + kv('Manual drops', st.manualDrops) + kv('Offline earnings', E.fmtMoney(st.offlineEarned)) + kv('Play time', E.fmtDuration(st.playSeconds)))}
      ${XPGroup('Achievements', `<div class="xpt">${ach.length ? ach.map(esc).join(', ') : 'None yet'}</div>`)}
      ${kv('Version', esc(h.version) + (h.inIframe ? ' (embedded)' : ''))}
      <div class="xp-btnrow">${XPButton({ id: 'sUpd', label: 'Check for updates', ico: 'disk' })}${XPButton({ id: 'sNewRun', label: 'New Run...', ico: 'flag', disabled: !E.canNewRun(s) })}${XPButton({ id: 'sReset', label: 'Reset progress...', ico: 'warn' })}</div>`,
      onShow: (p) => {
        p.querySelector('#sUpd').addEventListener('click', () => { h.onCheckUpdate(); ui.toast('Checking for a new version...', 2000, { title: 'Update' }); });
        p.querySelector('#sNewRun').addEventListener('click', () => { ui.wm.get('settings').close(true); h.onNewRunOpen(); });
        p.querySelector('#sReset').addEventListener('click', () => XPDialog(ui.wm, { id: 'resetq', title: 'Reset progress', ico: 'warn', message: '<div class="xph">Delete all progress?</div><div class="xps">Cash, upgrades, runs and statistics will be erased. Settings are kept. This cannot be undone.</div>',
          buttons: [{ id: 'rYes', label: 'Yes, reset', cls: 'red', onClick: (w) => { w.close(true); ui.wm.closeAll(true); h.onReset(); } }, { id: 'rNo', label: 'Cancel', def: true, onClick: (w) => w.close() }] }));
      } },
  ];
  const w = ui.wm.open({ id: 'settings', title: 'Settings', icon: 'gear', width: 360, resize: true, minW: 300, minH: 260, html: '<div id="setTabs" style="display:flex;flex-direction:column;min-height:0;flex:1"></div><div class="xp-btnrow">' + XPButton({ id: 'setOk', label: 'OK', def: true }) + '</div>', height: 'min(560px, calc(100% - 8px))', max: true });
  w.q('#setOk').addEventListener('click', () => { h.onClick(); w.close(); });
  w.tabs = new XPTabControl(w.q('#setTabs'), tabs, startTab);
  if (!ui.wm.has('settings')) return;
  w.tabs.select(startTab);
  return w;
}
