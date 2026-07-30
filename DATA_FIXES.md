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

## Follow-up round — Priority Pitching retiming, Category, sortable tables, BRIEF import

### 1. Send Upload now only unlocks after Save

Ticking Priority Pitching under "Which pitching?" no longer unlocks Send
Upload by itself — you have to hit Save first. Before, `uploadReady` and
the warning text both read the live checkbox state; now they read the
saved ticket (`pitchingTicket.data.priority`). While it's ticked-but-
unsaved, a gray note says so ("Priority Pitching is ticked but not saved
yet — hit Save below to unlock Send Upload"); once saved, the existing red
note now reads "Priority Pitching is ticked — Send Upload is unlocked,
please fill in Metadata Checklist."

### 2. Category is now a fixed single choice

Release detail page and the New Release create form both changed Category
from free text / an admin-configurable lookup list to a hardcoded 2-option
select: **New Release** / **Remarketing**. Removed `release_category` from
the Config page's editable lookup categories, since it's no longer
lookup-table-driven.

### 3. Sortable columns

Every workstation table (dashboard, Upload, Re-Check both phases,
Pre-release, Pitching) now has clickable column headers — click once for
ascending, again for descending, a third time (or the "Reset sort" button
that appears once you've sorted) goes back to the default: Release Date,
newest first. Milestone and Streaming are chart/report layouts, not really
"row per release" tables, so they were left as-is.

### 4. BRIEF sheet import (`scripts/import-brief.js`)

Imports the BRIEF sheet from VIEENT PROJECT MANAGEMENT 2026.xlsx as new
`releases` rows, per the column = field mapping from the brief. New
fields this needed, all added via `add-brief-import-fields.sql`:

- `single_album_ep` ('Single' | 'EP' | 'Album') + a new `release_tracks`
  table — both the release detail page and the New Release form now show
  a Tracklist section (order / track name / main artist / feature artist)
  whenever it's EP or Album.
- `sony_publish`, `is_publish`, `has_splitshare`, `phu_luc_requested` —
  plain Yes/No ticks, shown on the release detail page under a new "Other
  Checklist" row next to the Metadata Checklist.
- `start_date`, `end_date`, `creation_on_tiktok`,
  `legacy_booking_dot1_raw`, `legacy_booking_dot2_raw` — background-only
  for now, not shown anywhere in the UI yet (per the brief — Booking Đợt
  1/2 keep the sheet's raw text verbatim since there's no package
  simulator to parse it into real booking entries, and Creation on Tiktok
  is flagged as "can skip for now").

Everything from OPS TRACKING's "NEW RELEASE" and "NR CONFIRM" sheets in
the brief (CANVA/MV/Artist Pick/Musixmatch/NCT Lyric, DSP check/Tag
Confirm/Product Type/Update Smartlink/Sound Instagram/Sound TikTok) was
already built and wired into the Pre-release and Re-Check workstations in
an earlier round — nothing new needed there.

DID: the sheet's DID column only has the first 10 characters. Per the
confirmed rule, the last 4 digits come from the row's position in the
sheet, top-down starting at 1 (row 1 → `-0001`, row 2 → `-0002`, ...). The
original 10-char value is kept in `legacy_id` so re-running the script
skips rows already imported.

Needs the `xlsx` npm package (the Data Fix Scripts workflow installs it
automatically when you pick `import-brief`). Commit the actual .xlsx file
to the repo first — e.g. `data/brief-import.xlsx` — since the Actions
dropdown can only take text, not a file upload:

```bash
npm install xlsx --no-save
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-brief.js data/brief-import.xlsx
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-brief.js data/brief-import.xlsx --confirm
```

**Not done by this script, on purpose:**
- Tracklist per EP/Album — the sheet has no per-track breakdown; add
  tracks by hand afterwards.
- Booking Đợt 1/Đợt 2 as real Media Booking entries — no package
  simulator exists to turn the sheet's free text into one; it's preserved
  verbatim in the two `legacy_booking_dot*_raw` columns instead.
- Mã Phụ Lục, and the Phụ Lục/Pitching/Booking status+WIP columns —
  skipped per the brief.
- **Manual Booking data itself** (the messiest sheet) — explicitly
  deferred, not started this round.

Run `node scripts/backup.js` first, same as every other write script here.
Run the SQL migration (`add-brief-import-fields.sql`) against your
database before running this script — the new columns need to exist
first.

### 5. OPS_TRACKING backfill (`scripts/import-ops-tracking.js`)

Fills in the OPS-side fields for releases already created by
`import-brief.js` — CANVA/MV/Artist Pick/Musixmatch status+link/NCT Lyric
from OPS_TRACKING's "NEW RELEASE" sheet, and DSP check (bulk-ticks all 6
`confirm_*_correct` fields)/Tag Confirm/Product Type/Update
Smartlink/Sound Instagram/Sound TikTok/Check Lyrics-Canva from its "NR
CONFIRM" sheet. Every one of these fields already existed and was already
wired into the Pre-release and Re-Check workstations from an earlier
round — this only backfills historical values, nothing new to build.

**Run `import-brief.js` first.** Matching works by the same 10-character
DID both files share — `import-brief.js` stores it as `legacy_id` on the
release it creates, and this script looks up `legacy_id = <this row's DID
column>` to find which release to update. A DID this script can't find a
match for is skipped (logged, not an error) — it just means that
particular OPS_TRACKING row isn't one of the releases you imported from
BRIEF.

```bash
npm install xlsx --no-save
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-ops-tracking.js data/ops-tracking-import.xlsx
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-ops-tracking.js data/ops-tracking-import.xlsx --confirm
```

Same dry-run-by-default rule as everything else here, and same "Data Fix
Scripts" Actions workflow can run it (pick `import-ops-tracking` from the
dropdown, set `file_path` to wherever you commit the OPS_TRACKING file).
