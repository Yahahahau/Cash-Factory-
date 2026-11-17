# Account system: testing report

No Supabase project, Google OAuth client or real mail server was available in the development environment. **The feature has therefore NOT been verified against a live backend.** What was and was not tested:

## Run and passing
| Suite | Command | Result |
|---|---|---|
| Game economy/save (existing) | `npm test` | 31 passed |
| Account logic (payload, fingerprint, `decide`, sanitising) | `npm run test:account` | 15 passed |
| Database: RLS, RPC, triggers, conflicts, cascade delete, idempotent migration, on a **real Postgres 16** with a minimal `auth` stub | `bash scripts/sql-test.sh` | 35 passed |
| Browser end to end (Chromium, real supabase-js + real UI) against a **test-only mock** of GoTrue/PostgREST (`scripts/mock/mock-supabase.mjs`) | build with `VITE_SUPABASE_URL=http://127.0.0.1:54400 ...`, then `node scripts/account-e2e.mjs <configured URL> <unconfigured URL>` | 51 passed |
| Production build (multi-page, emits `auth-callback.html`) | `npm run build` | ok |

The e2e suite covers: unconfigured state, single window, provider list from the server, register validation, verify/resend, unverified and wrong-password errors, sign-in, guest migration, payload contents (no password, no settings), profile edit, autosave, offline indicator and reconnect, backend outage and recovery, session restore, second device download, conflict dialog (decide later, use cloud, backup), sign out, deletion, layouts 390/820/1280 px, no console errors.

Bugs found by these tests and fixed: first upload after sign-in stayed in "checking" (never written); the debounce timer could stay armed after sign-out; the change detector was not primed after a write.

## NOT tested (needs a real project / real devices)
- Real sign-up, verification e-mail delivery, password reset link, e-mail templates and SMTP.
- Google (and Discord/GitHub/Apple) OAuth, redirect allow-list, popup relay with real COOP headers, "Continue in browser".
- Behaviour inside a real third-party iframe (partitioned storage, sandbox flags), Rezona WebView, iPad/Android browsers.
- The mock is a simplification of Supabase: real error codes, rate limits and token refresh timing may differ.
- Real cross-device sync with two physical devices.

## Still to verify with a real project
1. Run the migration; sign up with a real address; receive and open the verification mail.
2. Forgot password -> link -> new password.
3. Enable Google; sign in via popup and via "Continue in browser".
4. Sign in on two devices; progress, conflict dialog, delete account.
5. Embed in the target host with the sandbox flags from `docs/backend-setup.md`.
