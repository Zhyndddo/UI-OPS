# Data Backup

A daily, git-native snapshot of every Supabase table into JSON — no extra
storage service, no new infra. Backups live as plain files in the repo's
history, so browsing, diffing, and restoring old versions is just git.

## How it works

- `.github/workflows/backup.yml` runs `scripts/backup.js` once a day
  (18:00 UTC by default) via GitHub Actions.
- The dump — every table listed in `scripts/backup.js`'s `TABLES` array —
  gets written to `backups/daily/YYYY-MM-DD.json` and committed to a
  dedicated **`data-backups`** branch, never `main`. That's deliberate:
  Vercel deploys off `main`, so a daily backup commit never triggers a
  redeploy.
- Every Sunday, that same day's dump is also copied into
  `backups/weekly/YYYY-MM-DD.json`.
- Old backups are pruned automatically: daily backups roll off after 7
  days, weekly backups after ~90 days (13 weeks). Both are configurable —
  see `scripts/prune-backups.js` (`BACKUP_DAILY_KEEP_DAYS` /
  `BACKUP_WEEKLY_KEEP_DAYS` env vars).

So at any time you've got a rolling week of daily snapshots for "grab
yesterday back", plus roughly a quarter of weekly snapshots as a longer
safety net — all sitting in git history on `data-backups`, restorable with
one script.

## One-time setup

1. **Add repo secrets** — Settings → Secrets and variables → Actions →
   New repository secret:
   - `SUPABASE_URL` — your project's URL.
   - `SUPABASE_SERVICE_ROLE_KEY` — the **service role** key (Project
     Settings → API in Supabase), not the anon key. This is required to
     read every row regardless of RLS policies. Treat it like a database
     password — it's already scoped to a GitHub secret, never put it
     anywhere else.

2. **Create the `data-backups` branch once** (it starts empty — the
   workflow only ever adds to it, never creates it):

   ```bash
   git checkout --orphan data-backups
   git rm -rf .
   git commit --allow-empty -m "Initial data-backups branch"
   git push origin data-backups
   git checkout main
   ```

3. **Merge this workflow to `main`** — once `.github/workflows/backup.yml`
   is on the default branch, GitHub picks up the schedule automatically.
   No further action needed; the first run happens at the next scheduled
   time, or trigger one immediately (see below).

## Running a backup on demand

Actions tab → "Data Backup" → **Run workflow**. Or locally (needs **Node 22
or newer** — `@supabase/supabase-js` needs a native `WebSocket`, which
Node only has built in from 22 onward; on older Node it fails immediately
with "Node.js 20 detected without native WebSocket support"):

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup.js backups/daily
```

## Restoring

`scripts/restore.js` reads a backup JSON and writes it back to Supabase.
**It defaults to a dry run** — nothing is written until you pass
`--confirm`.

```bash
# See what a backup contains without touching the database:
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/restore.js backups/daily/2026-07-29.json

# Actually restore everything (upsert — adds/overwrites by id, doesn't
# delete anything that isn't in the backup):
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/restore.js backups/daily/2026-07-29.json --confirm

# Revert just one table to exactly match the backup (deletes first, then
# reinserts — a true point-in-time revert for that table):
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/restore.js backups/daily/2026-07-29.json --table=releases --wipe --confirm
```

Pull the JSON file down from the `data-backups` branch first
(`git show data-backups:backups/daily/2026-07-29.json > backup.json`, or
just check out that branch locally) before running restore against it.

## Backup file format

Each file is one JSON object:

```json
{
  "stamp": "2026-07-29",
  "generated_at": "2026-07-29T18:00:03.421Z",
  "tables": {
    "releases": [ { "id": "...", ... }, ... ],
    "tickets": [ { "id": "...", ... }, ... ],
    ...
  }
}
```

## Keeping the table list in sync

`scripts/backup.js`'s `TABLES` array is a plain list, hand-kept in sync
with `schema.sql`'s `create table` statements. Adding a new table to the
schema means adding its name to that array too — nothing pulls the list
automatically, on purpose, so a schema change doesn't silently start (or
stop) backing something up without a visible diff.
