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

### 6. Checklist repair (`scripts/repair-brief-ticks.js`)

**Found a bug after the first `import-brief` run:** the dry-run log only
printed title/artist/label/release date — never the checklist columns —
so a mismatch there had nothing to catch it before `--confirm` wrote it.
If your imported releases show 0/6 on Metadata Checklist (or the wrong
values for SONY PUBLISH/PUBLISHING/Splitshare/Request Phụ lục/Single-
Album-EP) even though the sheet has them filled in, this is why.

`repair-brief-ticks.js` fixes it without redoing the whole import — it
re-reads the same BRIEF sheet and re-applies ONLY the checklist/tick
columns (Audio/Artwork/Working Files/Lyric/MV/Metadata, SONY PUBLISH,
PUBLISHING, Splitshare, Request Phụ lục, Single/Album/EP) onto releases
that already exist, matched by `legacy_id` — same matching approach as
`import-ops-tracking.js`. Nothing else on the release (title, links,
dates, etc.) gets touched.

```bash
npm install xlsx --no-save
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/repair-brief-ticks.js data/brief-import.xlsx
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/repair-brief-ticks.js data/brief-import.xlsx --confirm
```

Also available from the "Data Fix Scripts" Actions workflow — pick
`repair-brief-ticks`. `import-brief.js`'s dry-run log now also prints
each row's checklist values (`checklist: meta_audio=true meta_artwork=true
...`), so future imports can be checked against the sheet before writing,
not just after.

**Root cause found — a different bug than the checklist one.** Confirmed
via the database directly: `legacy_id` was null on all 702 imported
releases, even though `did` (built from the exact same value, in the same
insert) came out correct. Couldn't identify the exact mechanism (nothing
in the insert code explains one field landing and a sibling from the same
object not), but it doesn't matter — `legacy_id` is fully recoverable
from `did` itself, since `did` is just `<legacy_id>-<suffix>`.

### 7. `scripts/backfill-legacy-id.js`

Run this **before** `repair-brief-ticks` or `import-ops-tracking` — both
of those match releases by `legacy_id`, so with it null on every row,
every lookup was guaranteed to miss (hence "No matching release: 456"
with 0 actually updated). This script sets `legacy_id` on every release
whose `did` matches the BRIEF-import shape (10-character base + `-NNNN`
suffix, one dash) straight from `did` itself — no Excel file needed.
Organically-created releases have a different DID shape (two dashes,
longer base) and won't match, so this is safe to run without touching
anything that didn't come from the BRIEF import. Only ever fills in a
null `legacy_id`, never overwrites one that's already set.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-legacy-id.js
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-legacy-id.js --confirm
```

Also runs from the "Data Fix Scripts" Actions workflow (`backfill-legacy-id`
— no `file_path` needed, it's DB-only). **Correct order now:**
`backfill-legacy-id` → `repair-brief-ticks` → `import-ops-tracking`.

## Follow-up round — doubled "New Release -" prefix on Package

**Bug:** the dashboard's Package column shows `release_category + " - " +
project_type` (e.g. "New Release - Chỉ Phát Hành"). Both BRIEF's "GÓI
HTTT" and OPS_TRACKING's "GÓI TRUYỀN THÔNG" columns carry the old sheet's
own "New Release - " (sometimes "SONY - New Release - ") prefix baked
into the value itself — so an imported release ends up with `project_type
= "New Release - Chỉ Phát Hành"`, and the dashboard prepends
`release_category` ("New Release" by default) on top of that, showing
"New Release - New Release - Chỉ Phát Hành". A bare leftover value of
just "NEW RELEASE" (the old sheet's placeholder for "not resolved yet")
showed up as "New Release - NEW RELEASE".

**Fix, future imports:** both `import-brief.js` and `import-ops-tracking.js`
now run a `normalizeProjectType()` step on the value from their respective
columns before writing it — strips the "New Release - " / "SONY - New
Release - " prefix, and maps a bare "NEW RELEASE" to v2's actual default
pipeline stage, `BRIEF & DATA`. Every value from `contract_type_packages`
in `schema.sql` (`Chỉ Phát Hành`, `Độc Quyền 2 năm`, `Độc Quyền 5 năm`,
`Độc Quyền Vĩnh Viễn`) already comes through the prefix strip unchanged,
so this only ever touches the old-shaped values.

**Fix, already-imported releases (`scripts/repair-project-type-prefix.js`):**
one-time repair — re-reads every release's current `project_type` from the
database (no Excel file needed) and re-applies the same normalization.
Only touches rows where normalization actually changes the value; a
release whose `project_type` is already a bare v2-style value is left
alone.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/repair-project-type-prefix.js
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/repair-project-type-prefix.js --confirm
```

Also runs from the "Data Fix Scripts" Actions workflow — pick
`repair-project-type-prefix` (no `file_path` needed, it's DB-only, same as
`backfill-legacy-id`). Safe to run any time, including more than once —
after the first `--confirm` run, a second dry run should report 0 releases
need changing.

## Follow-up round — Send Upload only needs 4/6, Media Booking dedup

### Send Upload now only requires 4 of the 6 checklist items

Audio, Artwork, Lyric, Metadata are required — Working Files and MV are
still shown and trackable on the checklist (marked with `*` next to the
other four to show which ones actually gate the button), they just don't
block Send Upload anymore. The heading now reads "Metadata Checklist (X/6
— Y/4 required)" so both counts are visible at once.

This also changes what counts as "went out via the Priority Pitching
shortcut" — previously any release under 6/6 that used Priority to unlock
Send Upload got flagged (`priority_pitching_used`/`needs_update`); now
that only happens if it's under 4/4 on the *required* items. Same for the
"Checklist complete — unlock Smartlink" button on the warning banner — it
appears once the 4 required items are done, not all 6.

No SQL, no backfill needed — this only changes the live gating logic, not
any stored data. Releases that were already `requested = true` are
unaffected either way.

### Media Booking: 1 ticket per release, enforced at the DB level

**Bug:** a tester left 3 identical Media Booking tickets for the same
release. The picker already filtered out releases with an existing
ticket, but that's a client-side, load-time-only check — it doesn't stop
a second insert from a different creation path (the release popup's Send
Package Ticket / priority pitching auto-create) or a race between two
people.

**Fix — DB trigger (`add-media-booking-dedup.sql`):** a new trigger,
`trg_prevent_duplicate_media_booking`, rejects any insert or update that
would leave two non-deleted Media Booking tickets pointing at the same
`data.releaseId`. This is the actual guarantee now — every code path that
creates one of these tickets goes through it. Run this against your live
database:

```sql
-- see add-media-booking-dedup.sql
```

The manual create form (`app/tickets/media-booking/new/page.js`) also got
a friendlier pre-insert check so a real race shows "A Media Booking ticket
for this release already exists" instead of a raw Postgres error — the
trigger is still what actually blocks it either way.

**Cleanup for the 3 existing duplicates (`scripts/cleanup-duplicate-media-booking.js`):**
one-time script — for every release with more than one non-deleted Media
Booking ticket, keeps the oldest (by `created_at`) and soft-deletes
(`deleted_at`/`deleted_by`, same as the app's own delete) every other one
in that group. Nothing is hard-deleted, so it's reversible.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/cleanup-duplicate-media-booking.js
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/cleanup-duplicate-media-booking.js --confirm
```

Also runs from the "Data Fix Scripts" Actions workflow — pick
`cleanup-duplicate-media-booking` (no `file_path` needed, DB-only).

**Run order:** either order works for these two — the trigger only stops
*new* duplicates, the script only clears *existing* ones, they don't
interact. Run `add-media-booking-dedup.sql` against the database, then run
the cleanup script (dry run, review, then `--confirm`) whenever's
convenient.

## Follow-up round — new Media Booking ticket cycle, legacy booking import

### 1. New Media Booking ticket lifecycle

The old flow was one-shot: AR sends the ticket once, Marketing builds it,
and the only way to touch it again was the separate INT MEDIA follow-up
button. It's now a real back-and-forth cycle:

- **Magic link visibility is now gated on the ticket actually reaching
  COMPLETE.** Before, a built `media_booking_packages` row showed up on
  the magic link page the moment Marketing saved it in the Package
  Builder, even mid-build. Now `app/pick-package/[token]/page.js` looks up
  the release's Media Booking ticket and only shows built packages once
  `status_log.COMPLETE` has been set at least once — the always-offered
  "Chỉ Phát Hành" simple pick is unaffected. Once a package has been shown
  once, a later rebook (ticket back to REQUESTED) doesn't hide it again —
  it just keeps showing the last COMPLETE build until the new one
  finishes and completes too.
- **The AR notification on COMPLETE already existed** (`notify_on_ticket_complete`,
  fires on `requester_segment`) — it just wasn't wired up for Media
  Booking tickets, since they were created without a `requester_segment`.
  `sendPackageTicket()` in `app/releases/[id]/page.js` now sets
  `requester_segment: "AR"` on creation, so AR gets notified the instant
  Marketing marks it COMPLETE — no new SQL needed, this is the same
  trigger every other ticket type already uses.
- **Confirming a pick on the magic link now locks it automatically** —
  `confirmChoice()` sets `package_locked: true` in the same update as
  `project_type`/`package_total_value`, so AR no longer needs to click
  "Lock editing" separately after an artist confirms.
- **New "Feed Back" button** on the magic link page, next to Confirm — an
  alternative to picking a package outright. Opens a text box with a "+
  Text in Zalo/Telegram" button that inserts that literal placeholder text
  (for the team to swap in a real link before sending), and its own inline
  Confirm button. Submitting writes the text onto the ticket
  (`tickets.data.feedback = { text, submittedAt }`, no new column) and
  fires a notification to the **AR** team via the existing
  `fanout_notification()` SQL function (called straight from the client
  via `supabase.rpc()` — already grants `execute` to `anon`/`authenticated`
  by default, see `schema.sql`'s `alter default privileges` block) titled
  literally "Artist request package changed", linking to
  `/releases/<id>?focus=media_booking`.
- **Clicking that notification** opens the release page, auto-switches to
  the Media Booking tab, and smooth-scrolls to it (`?focus=media_booking`
  query param, read via `useSearchParams`). The feedback text shows in a
  small orange-bordered box at the top of the tab.
- **"Send Package Ticket to Marketing" is no longer strictly one-shot.**
  Once the ticket reaches COMPLETE, the same button becomes "Send Package
  Ticket Again" — clicking it reopens the SAME ticket (never a second one;
  `trg_prevent_duplicate_media_booking` still guards that either way) back
  to REQUESTED. If there's unread feedback (`data.feedback` set), it also
  tags the ticket with the hidden `data.proposedPackage = "Artist request
  package changed"` and clears the feedback flag (consumed). If there's no
  feedback, it's a plain **internal rebook** — same reopen mechanism, no
  special tag, AR can use this any time they want Marketing to redo a
  package with no artist involvement. Either way, since a status-only
  UPDATE never fires `trg_notify_on_ticket_insert` (insert-only trigger),
  the reopen calls `fanout_notification()` to Marketing by hand so it
  still shows up as new work for them. The INT MEDIA follow-up button got
  the same treatment (it already had its own reopen logic; it just now
  also fires that Marketing notification).

No SQL migration for any of this — every piece reuses existing columns
(`tickets.data`, `tickets.status`, `tickets.status_log`,
`tickets.requester_segment`, `releases.package_locked`) and the existing
`fanout_notification()` function.

### 2. Legacy Booking data import (`scripts/import-booking.js`)

Imports both `BOOKING & REPORT 01` and `BOOKING - INT MEDIA SUPPORT`
sheets from the booking workbook — confirmed to share an **identical**
column layout (checked directly against the uploaded file; an earlier
description of the ranges differing per sheet didn't hold up), so one
script/column map covers both. Matches rows to releases by
`legacy_id = <column B, the DID>` — same convention as `import-brief.js`/
`import-ops-tracking.js`; unmatched DIDs are skipped and logged, not
errored.

Two independent things get imported per matched row:

- **Requester quantities** (columns R, U, V, W, X, Y, Z, AC, AD, AE, AF,
  AG, AH — S/T are a status/meta pair, not a brand, and are skipped; AA/AB
  are blank spacer columns) → one `media_booking_packages` row per release
  named `LEGACY BOOKING IMPORT`, with one `media_booking_package_lines`
  row per non-empty quantity cell. Category/brand match the live Package
  Builder's vocabulary (Social: VIEENT/ENVI, Community: PAGE BOLERO·VPOP·
  INDIE, TikTok Channel: TIKTOK BOLERO·VPOP·INDIE/CAPCUT, Ads: FB POST
  ADS/FB VIDEO ADS/YOUTUBE ADS) except `EXT TIKTOK`, which the sheet
  mushes into one total with no matching single Partner sub-brand in the
  live 4-way picker — imported as its own standalone brand label instead
  of force-matched to one of the four.
- **Result links** (columns AV–BE, 10 columns of "Label: https://url"
  text, newline-separated per cell; BF–BH just past them are a WIP status
  column for the 3 Ads brands, not URLs, so they're excluded) → one
  `media_booking_entries` row per URL line. Platform is guessed from each
  URL's own domain (tiktok.com/facebook.com/youtube.com/instagram.com),
  not the column, since a few cells mix domains. Round is imported as
  `INT` (the sheets don't distinguish Đợt 1/Đợt 2), status as `Done`
  (these are all already-posted historical links).

Both halves are safely re-runnable: a release that already has a `LEGACY
BOOKING IMPORT` package is skipped for the quantity half (not
re-diffed/merged), and a URL is only inserted if an identical (release,
category, channel, link) row doesn't already exist.

```bash
npm install xlsx --no-save
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-booking.js data/booking-import.xlsx
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-booking.js data/booking-import.xlsx --confirm
```

Also runs from the "Data Fix Scripts" Actions workflow — pick
`import-booking`, set `file_path` to wherever you commit the workbook
(e.g. `data/booking-import.xlsx`). Run `import-brief.js` first, same as
`import-ops-tracking.js` — matching depends on `legacy_id` already being
set.

**Not imported by this script:** the single per-release metadata columns
(AK–AU: LOẠI DỰ ÁN, Project, Artist, ngày release, LINK SOUND TIKTOK, LINK
DRIVE, LINK LBM, SOCIAL BOOKING, LINK MV/SOURCE, HASHTAG, BID) and the
BF–BN WIP-status text columns — out of scope for this pass, flag if you
want those pulled in too.
