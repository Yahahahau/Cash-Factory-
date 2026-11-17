# Player account system

Start Menu > **Account** opens one Account window (a second click focuses/restores it). A cloud indicator also sits in the tray when a backend is configured.

## Modules (`src/account/`)
| File | Role |
|---|---|
| `config.js` | public config from `VITE_*`, provider list, avatar ids |
| `service.js` | `AccountService`: Supabase Auth (PKCE), email flows, OAuth popup/redirect, profile, deletion, friendly errors |
| `sync.js` | `CloudSync`: autosave queue, conflict handling, backups |
| `payload.js` | pure: cloud payload, fingerprint, `decide()` |
| `storage.js` | auth storage adapter (local/session/memory), device id |
| `oauth.js`, `callback.js`, `../../auth-callback.html` | popup code relay and standalone sign-in |
| `ui.js`, `icons.js`, `index.js` | Account window, conflict dialog, tray, wiring |

## Sign-in
- Email: sign up (+ confirm password, strength meter), verification screen with resend (60 s cooldown), sign in ("Keep me signed in"), forgot/reset password, change password, sign out, session restore, friendly errors.
- OAuth: Google and any other enabled provider (Discord, GitHub, Apple) with official/Simple Icons marks. PKCE. The popup is opened synchronously in the click. `auth-callback.html` relays only `{type:'pcf-auth:callback', code}` to `window.opener` (target origin = its own origin, validated on receipt) and a BroadcastChannel; the game exchanges the code with its own verifier. Popup blocked -> **Continue in browser** (top-level redirect on a direct site, a new tab when embedded). Progress is saved locally first; the game state is never reset.
- Profile: display name (1-24 chars) and one of 8 pixel avatars.
- Deletion: type `DELETE` (+ password for email accounts, re-checked) -> RPC `delete_my_account`. Cloud save is removed; the local save stays.

## Guest mode and conflicts
Guests play with the existing local save. A gentle toast invites sign-up (at most every 3 days, after ~5 min of play). On sign-in the game compares local and cloud: see `docs/cloud-save-system.md`. Accounts are never merged by email similarity.
