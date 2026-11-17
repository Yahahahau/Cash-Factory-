# Backend setup (Supabase)

The game talks to **Supabase** (Auth + Postgres). Nothing is configured in this repository: without the two public variables below the game runs exactly as before as a guest game, and the Account window says "Cloud accounts are not set up".

## 1. Create the project
1. Create a project at supabase.com. Note the **Project URL** and the **publishable (anon) key** (Project Settings > API).
2. Run the migration `supabase/migrations/20261116000000_player_accounts_and_cloud_saves.sql` (SQL editor, or `supabase db push`). It is idempotent. It creates `profiles` and `user_game_saves`, Row Level Security, triggers and the RPCs `save_game` and `delete_my_account`.

## 2. Auth settings (Authentication)
- **Email**: enable the Email provider and **Confirm email**. Set a custom SMTP server for production (the built-in mailer is rate limited).
- **URL Configuration**
  - Site URL: the public game URL, e.g. `https://yahahahau.github.io/Cash-Factory-/`
  - Redirect URLs (allow-list, exact): the game URL, `<game URL>auth-callback.html`, and `http://localhost:5173/` plus `http://localhost:5173/auth-callback.html` for development.
- **Google**: Google Cloud Console > OAuth client (Web). Authorized redirect URI = `https://<project-ref>.supabase.co/auth/v1/callback`. Paste client id + secret into Supabase > Providers > Google. (Secrets live only in Supabase.)
- Discord / GitHub / Apple: same pattern. The UI only shows providers that Supabase reports as enabled.
- Optional: enable **Manual linking** and set `VITE_ENABLE_LINKING=1` to show "Link provider".
- Supabase links identities that share the same **verified** email automatically. That is server behaviour. The game never merges two accounts' saves.

## 3. Game build variables
See `.env.example`. Locally copy it to `.env.local`. On GitHub Pages set **repository variables** (not secrets; they are public by design): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_GAME_ID`, `VITE_AUTH_PROVIDERS`, `VITE_ENABLE_LINKING`, `VITE_TRUSTED_HOST_ORIGINS`. The workflow `pages.yml` passes them to the build. **Never** use the `service_role` key.

## 4. Embedding hosts (iframe)
- Popup sign-in needs the host iframe to allow popups: `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"` (plus `allow-forms` if used).
- If popups are blocked the player gets **Continue in browser** (a new tab on the game's own domain; afterwards they return and reload the game).
- A host may open the sign-in itself: set `VITE_TRUSTED_HOST_ORIGINS` to the host's exact origin. The game then sends `{source:'pixel-cash-factory', type:'pcf:auth-open', url}` (no secrets) to that origin only.
- Third-party storage may be partitioned or blocked in iframes. The game falls back to session/memory storage and tells the player that they stay signed in only for this page.

## 5. Verify
Follow the checklist in `docs/account-testing-report.md` ("Still to verify with a real project").
