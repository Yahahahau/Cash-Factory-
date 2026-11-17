// Browser end-to-end test of the account UI + cloud sync against the TEST-ONLY mock backend (scripts/mock/mock-supabase.mjs).
// Usage: node scripts/account-e2e.mjs <urlOfConfiguredBuild> <urlOfUnconfiguredBuild>
import { createRequire } from 'node:module';
import { startMock } from './mock/mock-supabase.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [CFG, UNCFG] = process.argv.slice(2);
let pass = 0, fail = 0;
const ok = (c, n, extra = '') => { if (c) { pass++; console.log('ok   ' + n); } else { fail++; console.log('FAIL ' + n + ' ' + extra); process.exitCode = 1; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mock = startMock(54400); await mock.listen();
const browser = await chromium.launch();
const OPT = { viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 };
const errors = [];
async function page(ctx, url) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
  await p.goto(url); await p.waitForFunction(() => window.__pcf && window.__pcf.account, null, { timeout: 30000 }); await sleep(400);
  return p;
}
const openAccount = async (p) => { await p.click('#startBtn'); await p.click('.sm-item[data-k="acct"]'); await p.waitForSelector('#accRoot'); };
const text = (p) => p.evaluate(() => (document.querySelector('#accRoot') || {}).innerText || '');
const play = (p, n) => p.evaluate((n) => { const s = window.__pcf.state; s.levels.rate = n; s.stats.upgradesBought = n; s.stats.coinsCollected = 100 * n; s.stats.totalEarned = 1000 * n; s.stage = 1 + n; window.__pcf.Save.save(s); window.__pcf.account.notifySaved(s); }, n);
const cloudRate = () => { const r = [...mock.saves.values()][0]; return r ? r.save_data.state.levels.rate : null; };
const waitRate = async (n, ms = 25000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cloudRate() === n) return true; await sleep(300); } return false; };
const waitText = async (p, re, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (re.test(await text(p))) return true; await sleep(250); } return false; };

// ---------- 1. not configured build
{
  const ctx = await browser.newContext(OPT); const p = await page(ctx, UNCFG);
  await openAccount(p);
  ok(/not set up/i.test(await text(p)), 'unconfigured: honest "not set up" message');
  await p.click('#startBtn'); await p.click('.sm-item[data-k="acct"]');
  ok((await p.locator('#accRoot').count()) === 1, 'unconfigured: second click does not duplicate the window');
  ok(await p.locator('#cloudTray.hidden').count() === 1, 'unconfigured: tray cloud icon hidden');
  ok(await p.evaluate(() => !!window.__pcf.state && window.__pcf.pause.running), 'unconfigured: game keeps running');
  await ctx.close();
}

// ---------- 2. configured build
const ctxA = await browser.newContext(OPT); const A = await page(ctxA, CFG);
await openAccount(A);
let t = await text(A);
ok(/Sign in/.test(t) && /Create account/.test(t), 'signed-out: sign in / create account tabs');
ok(/Continue with Google/.test(t) && /Continue with GitHub/.test(t), 'only providers enabled on the server are shown (Google, GitHub)');
ok(!/Discord|Apple/.test(t), 'disabled providers (Discord, Apple) are not shown');
ok(/Guest|device only|never stored/i.test(t), 'privacy text shown');
await A.click('[data-act="tab"][data-v="register"]');
await A.fill('#accEmail', 'not-an-email'); await A.fill('#accPass', 'abcdefgh'); await A.fill('#accPass2', 'abcdefgh'); await A.click('#accGo');
ok(/valid email/i.test(await text(A)), 'register: invalid email rejected');
await A.fill('#accEmail', 'player@example.test'); await A.fill('#accPass2', 'different'); await A.click('#accGo');
ok(/do not match/i.test(await text(A)), 'register: password mismatch rejected');
await A.fill('#accPass', 'short'); await A.fill('#accPass2', 'short'); await A.click('#accGo');
ok(/at least 8/i.test(await text(A)), 'register: short password rejected');
await A.fill('#accPass', 'CorrectHorse9!'); await A.fill('#accPass2', 'CorrectHorse9!');
await A.click('[data-act="eye"][data-for="accPass"]');
ok(await A.getAttribute('#accPass', 'type') === 'text', 'show/hide password works');
await A.click('#accGo');
ok(await waitText(A, /Check your email/), 'register: verification screen');
ok(/player@example.test/.test(await text(A)), 'verify screen names the address');
ok(await A.locator('#accResend').isDisabled(), 'resend has a cooldown');
// sign in before confirming -> clear error
await A.click('#accBackLogin'); await A.fill('#accEmail', 'player@example.test'); await A.fill('#accPass', 'CorrectHorse9!'); await A.click('#accGo');
ok(await waitText(A, /verif|confirm/i), 'unverified email: friendly error');
await A.fill('#accPass', 'wrong-password'); await A.click('#accGo');
ok(await waitText(A, /incorrect|invalid|wrong/i), 'wrong password: friendly error');
await fetch('http://127.0.0.1:54400/__confirm?email=player@example.test');
// guest progress exists before sign-in
await play(A, 3);
await A.fill('#accPass', 'CorrectHorse9!'); await A.click('#accGo');
ok(await waitText(A, /player@example.test/), 'sign in succeeds, profile view');
ok(await waitText(A, /Saved to cloud/, 20000), 'guest progress migrated: "Saved to cloud"');
ok(mock.saves.size === 1, 'exactly one cloud save row');
const row = [...mock.saves.values()][0];
ok(row && row.save_data.state.levels.rate === 3, 'cloud payload holds real game state');
ok(!JSON.stringify(row.save_data).includes('CorrectHorse9'), 'no password in the cloud payload');
ok(!('settings' in row.save_data.state), 'device settings not uploaded');
// edit profile
await A.click('summary:has-text("Edit profile")'); await A.fill('#accDisp', 'Tester One'); await A.click('[data-act="avatar"][data-a="gem"]'); await A.click('#accSaveProf');
ok(await waitText(A, /Tester One/), 'profile: display name saved');
// tray / start menu label
await A.click('#startBtn'); ok(await A.locator('.sm-item[data-k="acct"] small').innerText() === 'Tester One', 'start menu shows the account name'); await A.click('.sm-item[data-k="acct"]'); await A.waitForSelector('#accRoot');
// autosave of a later change
await play(A, 5);
if (!(await waitRate(5, 12000))) console.log('DEBUG', await A.evaluate(() => JSON.stringify({ s: window.__pcf.account.sync.snapshot(), m: window.__pcf.account.sync.meta, due: window.__pcf.account.sync.dueAt - Date.now(), run: window.__pcf.account.sync.running, rate: window.__pcf.state.levels.rate })), mock.log.slice(-6));
ok(await waitRate(5) && await waitText(A, /Saved to cloud/, 8000), 'autosave uploads a later change');
// offline -> offline indicator -> recovery
await ctxA.setOffline(true); await A.evaluate(() => window.dispatchEvent(new Event('offline'))); await play(A, 6);
ok(await waitText(A, /Offline/, 8000), 'offline indicator shown');
await ctxA.setOffline(false); await A.evaluate(() => window.dispatchEvent(new Event('online')));
ok(await waitRate(6, 40000) && await waitText(A, /Saved to cloud/, 8000), 'reconnect syncs the offline progress');
// backend failure -> failed state, game unaffected, then recovers
await fetch('http://127.0.0.1:54400/__down?on=1'); await play(A, 7);
ok(await waitText(A, /Synchronization failed|Unsaved|Offline/, 25000), 'backend error surfaces as a failed/unsaved state');
ok(await A.evaluate(() => window.__pcf.pause.running && window.__pcf.state.levels.rate === 7), 'game keeps running and local progress is intact during the outage');
await fetch('http://127.0.0.1:54400/__down?on=0'); await A.click('[data-act="syncnow"]');
ok(await waitText(A, /Saved to cloud/, 20000), 'recovers after the outage');
// session restore on reload
await A.reload(); await A.waitForFunction(() => window.__pcf && window.__pcf.account); await sleep(1500); await openAccount(A);
ok(await waitText(A, /Tester One|player@example.test/), 'session restored after reload');
ok(await A.evaluate(() => window.__pcf.state.levels.rate) === 7, 'local progress unchanged after reload');

// ---------- 3. second device: no progress -> downloads cloud save
const ctxB = await browser.newContext(OPT); const B = await page(ctxB, CFG);
await openAccount(B); await B.fill('#accEmail', 'player@example.test'); await B.fill('#accPass', 'CorrectHorse9!'); await B.click('#accGo');
ok(await waitText(B, /Saved to cloud/, 20000), 'device B: signed in');
ok(await B.evaluate(() => window.__pcf.state.levels.rate) === 7, 'device B: cloud progress loaded onto an empty device');
ok(await B.evaluate(() => window.__pcf.pause.running), 'device B: game running after applying the cloud save');

// ---------- 4. third device with different guest progress -> explicit conflict choice
const ctxC = await browser.newContext(OPT); const C = await page(ctxC, CFG);
await play(C, 2);
await openAccount(C); await C.fill('#accEmail', 'player@example.test'); await C.fill('#accPass', 'CorrectHorse9!'); await C.click('#accGo');
ok(await C.waitForSelector('[data-win="accConflict"]', { timeout: 20000 }).then(() => true).catch(() => false), 'conflict dialog shown for differing guest progress');
ok(await C.evaluate(() => window.__pcf.state.levels.rate) === 2 && [...mock.saves.values()][0].save_data.state.levels.rate === 7, 'nothing overwritten before the player decides');
await C.click('#cfLater'); ok(await waitText(C, /Choose which progress/i, 8000), 'decide later keeps the conflict visible');
await C.click('[data-act="resolve"]'); await C.click('#cfCloud');
await sleep(2500);
ok(await C.evaluate(() => window.__pcf.state.levels.rate) === 7, 'choosing the cloud save loads it');
ok(await C.evaluate(() => !!JSON.parse(localStorage.getItem('pixelCashFactory.backup.v1') || '{}').local), 'the replaced local progress was backed up');

// ---------- 5. sign out, delete
await A.click('[data-act="signout"]'); ok(await waitText(A, /Sign in/), 'sign out returns to the sign-in view');
ok(await A.evaluate(() => window.__pcf.state.levels.rate) === 7, 'sign out keeps local progress');
await A.fill('#accEmail', 'player@example.test'); await A.fill('#accPass', 'CorrectHorse9!'); await A.click('#accGo'); await waitText(A, /Tester One/);
await A.click('summary:has-text("Account management")'); await A.click('[data-act="delete"]');
await A.fill('#accConfirm', 'nope'); await A.fill('#accPass', 'CorrectHorse9!'); await A.click('#accGo');
ok(/Type DELETE/.test(await text(A)), 'delete requires typing DELETE');
await A.fill('#accConfirm', 'DELETE'); await A.click('#accGo');
ok(await waitText(A, /deleted/i), 'account deleted');
for (let i = 0; i < 20 && (mock.saves.size || mock.users.size); i++) await sleep(250);
ok(mock.saves.size === 0 && mock.users.size === 0, 'cloud save and user removed server side', 'saves=' + mock.saves.size + ' users=' + mock.users.size);
ok(await A.evaluate(() => window.__pcf.state.levels.rate) === 7, 'local progress survives account deletion');

// ---------- 6. layout
for (const [w, h] of [[390, 760], [820, 1180], [1280, 800]]) {
  const c = await browser.newContext({ viewport: { width: w, height: h } }); const P = await page(c, CFG);
  await openAccount(P);
  const m = await P.evaluate(() => { const win = document.querySelector('#accRoot').closest('.xpwin'); const r = win.getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, sh: document.querySelector('#accRoot').scrollWidth, cw: document.querySelector('#accRoot').clientWidth }; });
  ok(m.l >= -1 && m.r <= m.w + 1 && m.sh <= m.cw + 1, `layout ${w}x${h}: window inside viewport, no horizontal overflow`, JSON.stringify(m));
  if (w === 390) await P.screenshot({ path: process.env.SHOT || '/tmp/acc-390.png' });
  await c.close();
}
ok(errors.length === 0, 'no page errors / console errors', errors.slice(0, 3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);
await browser.close(); await mock.close();
