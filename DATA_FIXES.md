# Priority Pitching + Data Fixes (this round)

## Part 1 — Priority Pitching can now actually reach OPS

Previously, Send Upload required the full 6/6 Metadata Checklist no matter
what. That's wrong for a Priority Pitching release — the whole point of
priority is that it needs to reach OPS *before* the checklist is done.

- **Send Upload now unlocks** the moment Priority is ticked under Pitching
  → Which pitching?, even with an incomplete checklist (Name/Artist/Release
  Date are still required — those are the bare minimum for the ticket to
  mean anything).
- Using that shortcut sets two flags on the release (both already existed
  in `schema.sql`, just never wired up — no migration needed):
  `priority_pitching_used` (a permanent record the shortcut was used) and
  `needs_update` (the live "still incomplete" flag).
- While `needs_update` is true: a warning banner shows on the release
  detail page ("This product is in priority mode and doesn't have full
  data set."), and **Smartlink is locked everywhere it's editable** — the
  URL tab, the OPS Upload workstation, the Confirm workstation, and the
  Note popup's product-note config. Each shows the same warning as a
  hover title, truncated with `…` in narrow table cells.
- **Unlocking**: once the checklist actually reaches 6/6, a button appears
  on the warning banner ("Checklist complete — unlock Smartlink") that
  clears `needs_update`. It's gated on the checklist really being 6/6, so
  it can't be used to just dismiss the warning early.

No SQL to run for this — both columns were already part of the original
`releases` table.

## Part 2

### 1. URL tab now aggregates every link tied to the DID

The release detail popup's URL tab has a new read-only section at the
bottom, "All URLs Related to This DID", pulling in:
- Booking Board links (`media_booking_entries`)
- Every ticket referencing this release (Phái Sinh, Manual Claim, Report
  Conflict, etc. — any ticket type with a `url` or `refLink` field)
- Magic Links generated for this release

Each source is still edited at its own canonical location — this is a
single place to *see* everything, not a second copy of the data.

### 2. DID suffix backfill (`scripts/backfill-did-suffix.js`)

New releases already get a proper `-NNNN` suffix automatically (a DB
trigger, unchanged). This is a **one-time script** for legacy/imported
releases that don't have one.

- Ordered oldest-first by `created_at` — the earliest legacy release gets
  `-0001`, next `-0002`, and so on.
- Since the DID is stored as plain text in a few other places (tickets'
  `data.releaseId`, `milestone_chart_entries.did`), the script rewrites
  those references too, per release, right after renaming it.
- **Dry run by default.** Run it once without `--confirm` first and read
  the planned renames before committing to anything:

  ```bash
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-did-suffix.js
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-did-suffix.js --confirm
  ```

  Strongly recommend running `scripts/backup.js` first so there's a full
  snapshot to fall back to (see `BACKUP.md`) — renaming primary
  identifiers that other rows reference by text is exactly the kind of
  change you want a safety net under.

### 3. Manual Booking template

Waiting on the Excel file you're sending over — I'll build the import/
template once I've seen the actual sheet, since the old version's
structure doesn't necessarily match this app's tables.

### 4. AR → OPS auto-tick backfill (`scripts/backfill-ar-to-ops.js`)

**One-time only**, confirmed — this does not change any live behavior.
For every existing release that already has both Linkshare and Smartlink
filled in (which in practice means it has a UPC too), the script does
exactly what clicking Send Upload does: ticks all 6 checklist boxes, sets
`requested = true`, creates the Newrelease Upload ticket, and creates the
Media Booking ticket (bumping the project stage from BRIEF & DATA to
DEALING) if one doesn't already exist. Skips anything already sent.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-ar-to-ops.js
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-ar-to-ops.js --confirm
```

### 5. Linkshare auto-note logic

**Live/future (New Release create form and everywhere the Linkshare Note
already showed):**
- Facebook Release Timing defaults to **"Ngày deliver+4"** if the release
  is created at least 4 days before its Release Date, otherwise **"Cùng
  ngày"** — recomputed live as you change Release Date, until you pick one
  yourself.
- Tiktok Release Timing defaults to **"Ngày release+7"** if left blank.
- Manual picks always win — this only ever fills in a blank field, exactly
  like the existing behavior everywhere else in this app (Label autofill,
  Deadline default, etc.).
- The New Release create form now has both pickers plus a live preview of
  the generated Linkshare Note, matching what the release detail page and
  OPS Upload's note popup already show.
- Product Note logic is unchanged, as requested.

**Existing data:** `scripts/backfill-linkshare-timing.js` applies the same
default logic to releases missing either timing value, using their real
`created_at`/`release_date`. Never touches a value that's already set.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-linkshare-timing.js
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-linkshare-timing.js --confirm
```

## Running order, if doing all of this in one pass

1. `node scripts/backup.js` — snapshot first, always.
2. `node scripts/backfill-did-suffix.js` (dry run, review, then `--confirm`)
   — do this before the other two, since it touches DIDs everything else
   references by text.
3. `node scripts/backfill-ar-to-ops.js` (dry run, review, then `--confirm`)
4. `node scripts/backfill-linkshare-timing.js` (dry run, review, then `--confirm`)

All four scripts need `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the
environment (same as everything in `BACKUP.md`).
