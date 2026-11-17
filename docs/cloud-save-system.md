# Cloud save

## Storage
Table `user_game_saves` (unique `user_id, game_id`): `save_data jsonb` = `{format:1, build, state}`, `save_version`, `revision`, `progress_score`, `device_id`, `client_saved_at`, timestamps. RLS: a user can only touch their own row; anon has no access. Writes go through RPC `save_game` (SECURITY INVOKER, `auth.uid()`), which does optimistic locking on `revision` and validates version/size. Triggers pin `user_id`, `game_id`, `created_at` and bump `revision`.

## What is synchronised
Real game progression (`Save` state v3). Not synchronised: `settings` (graphics, volumes), `lastSaved`, Flying Ball `mini.session`. Cloud data passes through `Save.sanitize` on load. After a download `lastSaved` is reset, so no offline income is paid for the gap between devices. No passwords, tokens or secrets are in the payload.

## Autosave
Debounced and serialised (one request at a time, newest snapshot): 4 s after a milestone (purchase, stage, run, unlock, mini-game result), 45 s for routine changes, 60 s safety interval, flush when the page is hidden, retry back-off 5 s / 15 s / 45 s / 2 min / 5 min, retry on `online`. Unchanged state is never sent (fingerprint ignores play time). Sync waits while the Flying Ball window freezes the game.
Indicators: Saving..., Saved to cloud, Offline, Synchronization failed, Login required, Unsaved changes, plus last-synced time.

## Never overwrite newer with older
Each device stores `{userId, baseRevision, baseFp, baseMilestone}`. `decide()`:
- no cloud save: upload (guest progress is migrated) or nothing if empty
- identical: in sync
- empty device: download
- same account, cloud unchanged since last sync: upload
- cloud moved on, this device made no purchases: download
- both changed, guest vs existing cloud save, progress from another account, unreadable or newer-format save: **conflict dialog**
The dialog shows both summaries and offers *Use cloud save*, *Keep this device's progress* or *Decide later*. The replaced side is first backed up in `localStorage` (`pixelCashFactory.backup.v1`) and can be restored from the Account window. A rejected write (revision mismatch) re-runs the comparison.

## Offline
The game keeps using the existing local persistence. Changes are uploaded when the connection returns.
