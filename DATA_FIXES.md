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
  are blank spacer columns) → one `media_booking_packages` row per release,
  with one `media_booking_package_lines` row per non-empty quantity cell —
  **and** the same quantities into `release_package_items` (see "package
  naming" below for why both). Category/brand match the live Package
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

**Package naming (fixed after the first version of this script — the
Booking Board showed "0/—" everywhere, numbers nowhere in the data):** the
Booking Board's per-brand columns (`app/booking/page.js`'s `bookedFor()`)
don't read `release_package_items` — they match a release to a
`media_booking_packages` row **by name**, where name === `releases.
project_type`. The first version of this script named every imported
package `LEGACY BOOKING IMPORT`, which could never match any
`project_type` and so never showed up as a booking target on the Board at
all, no matter how much data it held — the itemized quantities existed in
the database but nothing on screen pointed at them. Fixed: when a release
already has a real resolved `project_type` (not the `BRIEF & DATA` /
`DEALING` pipeline placeholders — those aren't a package name, there's
nothing to match), the imported package is named to match it exactly, so
it becomes the Board's live target. If Marketing already has a real
same-named package for that release, the imported lines merge into it
(skipping any category/brand/platform combo already present, so re-running
never doubles a count) rather than creating a second package with the same
name — `packageByRelease` only ever picks the first match, so a duplicate
name would have silently hidden one or the other. A release still sitting
at `BRIEF & DATA`/`DEALING` has no real package name to match yet, so its
quantities go into a `LEGACY BOOKING IMPORT` package as a fallback (the
script logs this per-release in the dry run) — that data is preserved but
won't show as a Board target until the release gets a real package name.
The same quantities are also written straight into `release_package_items`
(only if that release has no rows there yet, same idempotency rule
`confirmChoice()` itself uses) — that's what the release detail page's
Media Booking tab and the magic link's Booking Progress read, so this
import shows up in both places, not just the Board.

Both halves are safely re-runnable: the quantity half only inserts lines
that aren't already present in the matched package (never a second
same-named package, never a doubled count), and a URL is only inserted if
an identical (release, category, channel, link) row doesn't already exist.

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

### 3. Booking Board — bigger numbers, INT filter fix

- The `added / booked` count in each brand cell (and the "DONE" label) is
  now `fontSize: 17` instead of `12` — same cells, just easier to read at
  a glance across a full row of columns.
- **INT-type releases were leaking into the Đợt 1 view.** The round filter
  used to check `project_type === "INT MEDIA"` exactly to decide what
  counts as INT and what to exclude from Đợt 1 — a release whose
  `project_type` is a close-but-not-identical label (seen live: `"INT
  Media Support"`) matched neither branch, so it fell into Đợt 1 instead
  of being excluded from it. The check is now a loose, case-insensitive
  `/int\s*media/i` match on `project_type` instead of an exact string
  comparison, so any INT-flavored label lands in the INT round and stays
  out of Đợt 1.

No SQL, no backfill — both are live-logic-only changes in `app/booking/page.js`.

## Follow-up round — Bổ Sung DID field, Streaming & Milestone on the magic link

### 1. Streaming workstation's "Bổ Sung" tab — DID field is a real search + link, not just text

A Bổ Sung row (`release_stream_metrics` with `release_id = null`) is for a
product that has no matching row in the New Release dashboard at all. New
`manual_did` column (`add-stream-supplement-did.sql`) plus a new field
under the existing title/artist/date inputs on that tab — but per
follow-up feedback, this isn't just a label: typing 3+ characters searches
`releases` by `did`/`legacy_id` (debounced, live) and shows matches in a
dropdown. Picking one **merges this Bổ Sung row's numbers into that
release's real `release_stream_metrics` row** (every release already has
one — see the auto-create step in `load()`) and removes the Bổ Sung entry,
so the song's numbers land on its actual dashboard row instead of staying
parked separately. Only fills fields that are still blank on the target —
never overwrites a real number someone already entered directly on that
release. If nothing matches, whatever's typed is still saved as plain text
on blur, so a DID for a release that doesn't exist yet is at least on
record for later.

```sql
-- see add-stream-supplement-did.sql
alter table release_stream_metrics add column if not exists manual_did text;
```

### 2. Streaming & Milestone now shows on the magic link page

New section on `app/pick-package/[token]/page.js`, below Booking Progress,
shown once a package is confirmed — mirrors the release detail page's own
"Stream Numbers" + "Milestone (Chart Rank)" sections in spirit, but pulls
from **`release_stream_metrics`**, not `dsp_metrics_snapshots`: the
release detail page's version reads `dsp_metrics_snapshots` /
`release_dsp_links`, which per `schema.sql`'s own comment is "a separate,
still-unused, future path" — there's no automated fetch wired up yet, so
that section is always empty in practice. `release_stream_metrics` is the
real, actively-maintained table behind the Streaming workstation's Today
Check / Monthly tabs (and now Bổ Sung's DID field above), so that's what
actually has numbers in it to show an artist.

Renders as a grid of small cards, one per non-empty metric field (Spotify
Current, TikTok Views/Creations, Zing/NCT/YouTube/YTB Music/Facebook
fields, etc. — whichever ones are actually filled in, not a fixed empty
grid), plus a Milestone (Chart Rank) table matched by DID, same matching
rule as the release detail page. Read-only — nothing here is editable from
the magic link, same as Booking Progress.

## Follow-up round — magic link layout, Streaming Monthly tab navigation

### 1. Booking Progress round tabs only show when there's another round to show

The INT/Đợt 1/Đợt 2 switcher above Booking Progress used to always render
all three, even for a release that only ever had INT bookings — nothing
behind the other two tabs, just an empty view if clicked. Now it only
renders when `media_booking_entries` actually has a Đợt 1 or Đợt 2 row for
this release; otherwise Booking Progress shows straight away with no
switcher at all (there's only one thing to show).

### 2. The only pickable option now sits on the left, not stranded on the right

When no real package has been built yet (`richOptions` empty — just the
one always-offered simple pick, e.g. "Chỉ Phát Hành"), that option used to
render in its narrow 200px right-hand rail next to a wide, empty "No
packages built yet." placeholder on the left — reads oddly, like the real
option is an afterthought. Now: when there are no rich options, that left
placeholder box doesn't render at all, and the simple option gets a wider
left-aligned card instead of the narrow rail. As soon as a real package
does get built, layout goes back to the normal two-column comparison.

### 3. Streaming workstation — Monthly tab search + month index, frozen header row

- **Search box** (title/artist/DID) above the Monthly list — filters every
  month's rows live; a month with zero matches drops out of the list
  entirely instead of showing an empty table.
- **Month index bar** — one button per month (hidden while searching,
  since search already narrows it down) that jumps straight to that
  month's table via an anchor link, for browsing to an old entry by
  roughly-remembered release date instead of title.
- **Column header row is now sticky on scroll**, not just the Release
  column (which was already frozen horizontally) — the Spotify/TikTok/
  Zing/etc. column labels now stay visible scrolling down through a long
  month's worth of rows, so you're never guessing which column you're
  editing.

No SQL for any of this — purely `app/pick-package/[token]/page.js` and
`app/workstation/stream/page.js` layout/logic changes.

No SQL for this half — it only reads two tables that already exist.

## Follow-up round — booking import: URLs invisible because of a round mismatch (bug)

**Reported:** after running `import-booking.js --confirm`, the requested
quantities and links were confirmed to be in the database, but the
Booking Board still showed no "added" count and no links when a cell was
expanded.

**Root cause:** the Booking Board's round tabs (INT/Đợt 1/Đợt 2) do double
duty — they filter which releases show as ROWS (by `project_type`) AND
which `media_booking_entries` rows count as "added" (by `booking_round`).
The import script hardcoded every imported URL to `booking_round: "INT"`.
But the INT tab's row filter only shows a release whose `project_type` is
itself INT-MEDIA-flavored — and the vast majority of imported releases
have a normal resolved package (`Độc Quyền 5 năm`, etc.), which is a
**Đợt 1** row, not an INT row. So the entries were tagged for a tab their
release never appears under, and the tab where the release DOES appear
(Đợt 1) was filtering those entries out by round. The data was correctly
in the database the whole time — just tagged for a view nothing could
ever land on.

**Fix:** `booking_round` is now set per-sheet instead of hardcoded — rows
from `BOOKING - INT MEDIA SUPPORT` get `"INT"` (matches releases whose
package really is INT MEDIA), rows from `BOOKING & REPORT 01` get
`"Đợt 1"` (the general sheet, matches a normal resolved package). The
script is also now self-healing: re-running it with `--confirm` checks
every already-imported URL's `booking_round` against what it should be
and corrects it in place (new "round corrected: N" count in the summary
line), on top of its existing skip-if-already-imported behavior for the
package/quantity half.

**What to do:** just re-run the `import-booking` Actions workflow with
confirm checked again, same file, same path — it will not create any
duplicates, it will only fix the round tag on entries already there and
insert anything genuinely new. After that, check the Booking Board again
under the **Đợt 1** tab (not INT) for most of the imported releases.

One thing this doesn't fully solve on its own: a release matched from the
`BOOKING - INT MEDIA SUPPORT` sheet whose `project_type` **isn't** actually
INT MEDIA-flavored yet in the live database — its URLs are now correctly
tagged `round="INT"`, but they still won't be visible until that release's
package type is updated to match (a data-correctness question about that
specific release, not something the import script can resolve on its
own). The script now logs this case by name in the confirm run's output
if it comes up, so it won't be a silent gap.

## Follow-up round — 7-item request: TBU checklist, label prefix, Preview tab, notification redesign, artist feedback hardening, promotion package link

### 1. Artist Photo — allow multiple links

**Checked, no change needed.** `artist_photo_url` is wired through the
shared `UrlField` component everywhere it appears — the Additional Flags
grid (both the New Release create form and the release detail page,
`gate_artist_photo` → `artist_photo_url` via `URL_GATE_FIELDS`) and the
release detail page's URL tab. `UrlField` already auto-expands into a
multi-line list with individually-openable link chips the moment 2+ URLs
are entered — that's true for every field on `UrlField`, not something
that needed field-specific work. Checked `lib/ticketConfigs.js`'s
`artist_profile` ticket type too, in case a separate legacy photo field
existed there — it only has social links (Spotify/Apple/Facebook URLs),
no photo field of its own.

### 2. Metadata Checklist — TBU (to-be-updated) tri-state

The 6 Metadata Checklist fields (`meta_audio`, `meta_artwork`,
`meta_working_files`, `meta_lyric`, `meta_mv`, `meta_doc`) now use the
same tri-state pattern as the Additional Flags gate_* fields — a text
column holding `'false'` / `'true'` / `'update'` (TBU), rendered with the
same 3-button `GateToggle` instead of the old plain Yes/No `BoolToggle`.

**SQL:** `add-meta-checklist-tbu.sql` — converts the 6 columns from
`boolean` to `text`, preserving every existing true/false value
(`boolean::text` gives exactly `'true'`/`'false'`), default `'false'`.
Safe to re-run. **Run this before deploying the updated app code** — the
app now writes/reads these columns as strings.

**App code updated** (every place that read these 6 fields as booleans —
`"false"` is JS-truthy, so a plain truthy check would have silently
treated every unfilled TBU field as done):
- `app/releases/[id]/page.js` — `GateToggle` on the checklist, `metaDone`/
  `requiredMetaDone`/`requiredMetaDoneLive` now compare `=== "true"`
  (TBU counts the same as No for gating Send Upload — it's not done
  yet), Tasklist tab shows a distinct "◐ TBU" state instead of folding it
  into ✓/—.
- `app/new-release/page.js` — same `GateToggle` swap, default form state
  now `"false"` strings instead of JS `false`.
- `app/summary/page.js` — `isReleaseDone()`'s meta checks now compare
  `=== "true"` instead of falling into the generic `Boolean()` check.
- `lib/helpers.js` — `metadataPercent()` now compares `=== "true"`.
- `scripts/import-brief.js`, `scripts/repair-brief-ticks.js` — the "tick"
  column handling now writes `"true"`/`"false"` strings for these 6
  fields specifically (no TBU source data in the sheet, so imports can
  only ever produce a definite Yes/No); every other "tick" field (SONY
  PUBLISH, Is_publish, Split Share, REQUESTED PL) is unaffected, still
  real booleans.
- `scripts/backfill-ar-to-ops.js` — ticks all 6 as the string `"true"`
  instead of JS `true`.

### 3. Label field — same "HĐ - " prefix badge UI as the Label List admin page

`LabelInput` (`lib/ReferenceInputs.js`, shared by the New Release create
form and the release detail page's Label field) now renders the same
fixed, non-editable `HĐ - ` badge + suffix-only input that the standalone
Label List admin page (`app/labels/page.js`) already had — instead of the
prefix living as live, editable text inside the input. `value`/`onChange`
still carry the full label name (prefix included) to both call sites, so
nothing downstream changed. No SQL — display-only.

### 4. Pre-release Workstation fields — view only, not a new tab

First pass added a separate "Preview" tab (reverted — see below); what
was actually wanted: the CANVAS MV Status / CANVAS Status / Artist Pick
Status / Musixmatch Link / Musixmatch Status / NCT Lyric fields on the
existing **Pre-release & Note** tab are now view-only display instead of
editable inputs. These 6 fields are set on the Pre-release OPS
Workstation (`app/workstation/pre-release/page.js`) — they were also
independently editable right here, which meant two places could write
the same column and there was no signal that this page wasn't the source
of truth. Now this tab just reads `form.canva_mv_status` etc. straight
off the same release row the workstation writes to, so whatever OPS
updates there shows up here automatically on next load — no separate
copy, no sync logic needed. Musixmatch Link renders as an openable
link, matching how URLs display everywhere else. Everything else on that
tab (Phụ Lục dates, Next Step Note, Linkshare Note, Generated Notes) is
unchanged — still editable here, since those aren't Pre-release
Workstation fields.

The earlier separate "Preview" tab (read-only rollup across Upload/
Confirm/Pre-release) was reverted — not what was meant, and its removal
left no trace in the tab bar or code. No SQL for either — reads/writes
columns that already existed.

### 5. Notification panel — bigger, categorized by workstation + team

`lib/NotificationBell.js` redesigned from a single 320px flat list into a
640px two-column panel: a left sidebar lists every workstation/team
combination present in your notifications (read off the linked ticket's
tab — `executor_team` + tab label, e.g. "Marketing · Media Booking"),
each with a count and unread badge, click to filter the right-hand list
down to just that category ("All" shows everything, the default).
Notifications with no linked ticket fall into "General". No SQL — one
extra nested `tickets(tab_id, ticket_tabs(...))` join on the existing
read query, category grouping happens client-side.

### 6. Artist Feedback → "Send Package Ticket Again" — hardened against stale state

**Reported:** the button that's supposed to take a COMPLETE Media Booking
ticket back to REQUESTED and tag it with the hidden "Artist request
package changed" `proposedPackage` (after the artist leaves feedback on
the magic link) wasn't behaving correctly.

Static review of the logic itself (`sendPackageTicket()` in
`app/releases/[id]/page.js`) didn't turn up a defect in the actual
status-flip/tagging code — it correctly flips the ticket to REQUESTED,
tags `proposedPackage`, clears `feedback`, and fires the Marketing
fanout notification. What it found instead: the function was acting on
`mediaBookingTicket` **component state**, loaded once when the release
page first mounted. The artist's Feed Back submission on the magic link
page writes `data.feedback` straight to the ticket row from a completely
separate page/session — if the release detail page was already open
before that write happened (a very plausible ordering: AR has the page
open, artist submits feedback elsewhere, AR clicks the button without
refreshing), the in-memory `mediaBookingTicket` here is stale. Two ways
that goes wrong: if the stale copy's status wasn't "COMPLETE" yet, the
click silently no-ops; if it was COMPLETE but missing the freshly-written
feedback, it reopens the ticket without the `proposedPackage` tag.

**Fix:** `sendPackageTicket()` now re-fetches the ticket row fresh from
the database immediately before acting on it, instead of trusting
whatever was loaded at page-mount time — every check and write in the
reopen path (status, `data.feedback`, the update itself) now uses that
fresh row. If the click turns out to still misbehave after this, the
next thing to check is the exact repro (does the button appear
disabled/wrong-labeled, or does it look clickable but nothing happens
after clicking, or does it error?) — that'll point at a different layer
(RLS, the trigger, or the magic link's own write) than the staleness
class this fix covers.

### 7. Promotion Package link on the magic link page

`app/pick-package/[token]/page.js` now shows the same 🔗 "Promotion
Package" link (when `promotion_package_url` is set) that already existed
on the release detail page's Streaming/Milestone tab — placed right under
the Booking Progress numbers (moved there after the first pass put it
near Streaming & Milestone instead, which wasn't the intended spot), same
`confirmed`-gated visibility. No SQL — the column already existed, this
just surfaces it on one more page.

**SQL to run for this round:** `add-meta-checklist-tbu.sql` only (item 2)
— everything else is app-code-only.

## Follow-up round — booking round filter (bug), requester-side editing + notify, notification bulk-select, sticky table headers

### 1. Media Booking tab's INT/Đợt 1/Đợt 2 buttons — bug fix

**Reported:** on the release detail page's Media Booking tab, clicking
INT / Đợt 1 / Đợt 2 looked like it did nothing — same content showed for
all three.

**Root cause:** the round buttons only ever fed into the small
Added/Booked count grid at the bottom of the tab. The much more visible
"All Booking Links" block above it (the raw list of every booked URL)
read straight off the unfiltered `entries` prop — every round's links
mixed together, always, regardless of which button was selected. So the
buttons technically worked, but the one thing most people were looking
at when they clicked never changed.

**Fix:** "All Booking Links" is now "Booking Links — {round}", scoped to
`roundEntries` (the already-existing per-round filter, it just wasn't
being used there) — moved to sit right below the round buttons so the
connection is obvious. Shows "No links added for {round} yet." when a
round has none. The "Chosen Package — Itemized" table above it
deliberately still doesn't change per round — that's the one confirmed
package for the release (picked once, not per round), with a note added
explaining that so it doesn't read as another instance of the same bug.
No SQL — reads columns that already existed.

### 2. Requester-side ticket editing — open it up, flag instead of block

**Ask:** several ticket types locked most fields to read-only text once
a requester (AR/whoever) submitted them — only the executor team (or a
short explicit `bothEditable` list, e.g. url/note on some types) could
fix a typo or change a value afterward. Wanted: let the requester edit
too, but make sure the executor doesn't miss that it happened.

**Changed** (`lib/TicketListPage.js` — shared by Artist Profile, Khác,
Report Conflict, Stream Update — plus the bespoke `app/tickets/design`,
`app/tickets/manual-claim`, `app/tickets/phai-sinh` pages, which don't go
through the shared component): every previously-locked field is now
editable from both sides. A requester's edit:
- tags the ticket (`data.__requesterEdited = true`, plus who/when/which
  field),
- fires a `fanout_notification` to the ticket's executor team,
- shows the executor a small orange left-border highlight + "✎ edited"
  badge on that row (executor-side only — the requester obviously
  already knows they just edited it).

Executor clears the highlight by clicking the "✎ edited" badge itself
(sets the flag back to false) — doesn't touch the actual field values,
just acknowledges having seen the change. Fields that were already
both-editable (e.g. url/note on Phái Sinh/Manual Claim) get the same
flag+notify treatment now too, for consistency — one behavior for every
field on a ticket type rather than two different rules depending on
which field got touched. Status is unchanged — still gated the same way
it always was (requester can only move it out of a refund-like state).
No SQL — `notifications.type` is a plain text column, no enum constraint
to extend for the new `"ticket_edited"` type.

### 3. Notification panel — bulk mark-as-read

Each notification row now has a checkbox. Click one to select it,
shift-click another to select the whole range between them (same
convention as a file manager) — a "N selected · Mark selected read"
control appears in the header the moment anything's selected, so
clearing a big backlog doesn't mean opening every notification one at a
time. "Mark all read" (the original, unscoped) is unchanged and still
sits next to it. Selection resets when switching category, since the
row indices a range-select depends on stop lining up otherwise.

### 4. Sticky table headers under a sticky topbar

`lib/TopBar.js` is now `position: sticky` at the top of the viewport, and
`.table th` in `app/shared.module.css` is sticky too, pinned right under
it (`top: var(--topbar-height)`, a new CSS variable in
`app/globals.css`) — scrolling down a long workstation table now floats
the column header row directly under the orange bar instead of losing it
off the top of the screen, and the topbar itself no longer scrolls away
either. Applies everywhere `styles.table` is used (every workstation and
ticket list table), not just one page. No SQL — pure CSS/layout.

## Follow-up round — Marketing Checklist/Request split, Publishing dedup, TBU carried over, Overview cleanup

This round came in as one large batched message (10 numbered asks, several
with a screenshot). Some were unambiguous and are done below; a few had
genuine ambiguity in matching each instruction to its screenshot — those
are called out explicitly so they can be corrected quickly rather than
silently guessed wrong.

**SQL to run first:** `add-marketing-request-fields.sql` — adds 8 new
tri-state gate columns plus `design_content_types` (jsonb array), and
backfills `gate_sony_publish`/`gate_split_share` from the old boolean
columns they replace. Doesn't drop anything — old columns
(`sony_publish`, `is_publish`, `has_splitshare`, `phu_luc_requested`,
`gate_publishing`) are left in place with their historical data, just no
longer read/written by the UI.

### Done

**Marketing Checklist / Marketing Request split** (`lib/GateFields.js`,
the "Additional Request" grid on both the New Release create form and the
release detail page) — now two labeled clusters instead of one flat grid:
- **Marketing Checklist:** Profile Artist, Artist Photo, Project Proposal.
- **Marketing Request:** Pitching, Gói Hỗ Trợ Truyền Thông, Data Request
  (new), Priority Sync Lyric, Music Video on Spotify (new), Discovery Mode
  on Spotify (new), Sony Publish (new tri-state, replaces the old
  boolean), Splitshare, Legal Request (new), Phụ Lục MG (new), Phụ Lục
  Truyền Thông (new — see auto-yes below), Phụ Lục Publishing (new),
  plus **Design, Có Trong Net YouTube, and Pre-order** — these three
  weren't in the list you sent, but they're functionally wired (Design
  reveals the new Thể Loại picker, Pre-order reveals its URL field) so
  they were kept rather than dropped silently. Say if any of the three
  should move elsewhere or go away.

**Publishing duplication fixed** ("bị trùng publishing") — the old
`gate_publishing` field (tri-state, Additional Request) and `is_publish`
(plain boolean, Overview's old "Other Checklist") were two separate DB
columns both showing a field called "Publishing" on the same page. Both
are now gone from the UI — the only Publishing-shaped field left is the
new **Phụ Lục Publishing**, inside Marketing Request.

**TBU carried into the old "Other Checklist" fields** — Sony Publish and
Splitshare used to be plain Yes/No (`sony_publish`, `has_splitshare`);
they're now tri-state with TBU via `gate_sony_publish`/`gate_split_share`
in the Marketing Request cluster, replacing the old "Other Checklist"
section on the release detail page entirely (Request Phụ Lục there is
also superseded — split into the three new specific Phụ Lục fields
instead of one generic flag).

**"Thể Loại" on Design = Yes** — when the Design gate is set to Yes, a
"Thể Loại" checkbox group appears (Lyrics / Music Video / Visualize),
saved to the new `design_content_types` array. **Assumption flagged**:
your instruction was "bấm yes thì thêm Thể loại vô MV Lyrics, Music
Video, Visualize" with one screenshot showing the MV metadata-checklist
toggle and another showing the full Additional Request grid — I attached
this to the Design gate since content-type categories (Lyrics/MV/
Visualize) read as a Design-ticket concept, not a metadata-checklist one,
but if you meant a different toggle, tell me which and I'll move it.

**Phụ Lục Truyền Thông auto-yes** ("CHỌN GÓI TỰ ĐỘNG CHỌN YES") — the
moment a release's package/contract type resolves (leaves BRIEF & DATA/
DEALING), `gate_phu_luc_truyen_thong` auto-flips to "true" if it's still
at its untouched default — never overwrites an explicit No/TBU. Like
every other field on this page, this still needs Save clicked to persist.

**UPC/ISRC/Apple ID hidden from the release Overview tab** ("ẩn đi,
không hiện ở dự án") — removed the redundant 3-field row; UPC still lives
on the URL tab, ISRC/Apple ID still live on the Pitching tab. Same
underlying columns, just one fewer place they show up.

### Still pending — needs a quick confirmation before I build these

These four involve either real ambiguity in which screenshot matched
which instruction, or a bigger structural decision (team-based field
locking doesn't exist anywhere else in this app yet) that's worth
confirming before spending a full round building it:

1. **New Release dashboard "Channel" column always blank** — confirmed
   why: it reads `requester_segment` (an optional "Media Channel"
   dropdown), which nothing requires or defaults, so it's easy to leave
   empty at creation. My plan: make it inline-editable directly from the
   dashboard table (a small dropdown per row) so blanks can be fixed in
   bulk without opening every release. Confirm that's what "nhớ cập nhật
   cái channel nhan" meant before I build it.
2. **Add a "Status Pitching" column to the dashboard** — my plan: a new
   column next to Metadata/Booking/Upload showing each release's Pitching
   ticket status. The screenshot attached to this line actually showed the
   Booking Board's TikTok filter row, not anything Pitching-related, so
   I want to confirm the column itself (not the Booking Board) before
   building it.
3. **Booking Board: rename TikTok Channel sub-columns + add a team
   filter** — rename "TIKTOK BOLERO / MT / TIKTOK VPOP / TIKTOK INDIE /
   CAPCUT" to "TIKTOK NEWS / CAPCUT / LYRICS / REUP MB / MV" (5 columns
   instead of 4), and add a filter by team (AR/Marketing/OPS/Design) next
   to the existing All/Social/Community/Ads/TikTok Channel filter. Low
   ambiguity on the rename itself, but confirm the new 5 names are exact
   and in what order, and what "filter by team" should actually filter
   (which releases/entries belong to which team isn't tracked on
   `media_booking_entries` today — I'd need to add that).
4. **URL tab: cluster fields by owning team (OPS / Marketing / Data) and
   lock whatever AR shouldn't fill in** — this is the biggest one: it
   needs a real notion of "which team owns which field" and enforced
   read-only-per-team, which nothing in the app does yet (the closest
   pattern, requester/executor on tickets, doesn't apply to release
   fields). Before I build a new access-control layer for this, confirm:
   which fields go in which cluster (OPS vs Marketing vs Data), and
   whether "khóa lại" means read-only display or actually disabled/
   grayed-out inputs for non-owning teams.
ticket list table), not just one page. No SQL — pure CSS/layout.

## Follow-up round — Dashboard Channel + Status Pitching, item 3/4/10 status

Answers came back on the 4 pending items above:

- Item 2 (Status Pitching column) — confirmed to belong on the New
  Release dashboard, not the Booking Board; the screenshot really was
  misaligned.
- Item 3's "team filter" — still genuinely unclear, including to the
  person who wrote the instruction ("i have no idea what team filter
  is, guessing which is envi and which is vieent"). Not built this
  round — see below.
- Item 4 (URL tab team-clustering + field-locking) — explicitly
  cancelled: "i don't think that neccesarry, sometime the boss is just
  asking without knowing." Not built, and not planned unless raised
  again with real specifics.

### Done this round

1. **Dashboard Channel column is now inline-editable.** `app/releases/page.js`
   — the Channel cell is a `<select>` (VIEENT / ENVI / —) that writes
   straight to `requester_segment` on change, no need to open the release.
   No SQL — existing column, just a UI change.
2. **New "Status Pitching" column on the dashboard.** `app/releases/page.js`
   — added between Status and Metadata. For each release it looks up its
   Pitching ticket (same `ticket_tabs.key = "pitching"` / `tickets.data->>
   releaseId` matching pattern used on the release detail page), reads
   which pitching types were selected (Priority/Spotify/NCT/Zing), and
   summarizes: "Not requested" (no ticket, or ticket with nothing ticked),
   "Done" (every selected type's status column reads "Đã pitching"),
   "Cancelled" (every selected type is "Không thực hiện"/"Không hỗ trợ"),
   or "In Progress" (anything else). Same DONE/CANCEL definitions as
   `app/workstation/pitching/page.js`, so the two pages agree. No SQL —
   reads existing columns (`priority_pitching`, `pitching_status_spotify`,
   `pitching_status_nct`, `pitching_status_zing`) and the existing
   `tickets` table.

### Still open — item 3 (Booking Board rename + team filter)

Splitting this in two, since the rename and the filter are different
risk levels:

- **Column rename** (TIKTOK BOLERO/MT, TIKTOK VPOP, TIKTOK INDIE, CAPCUT
  → TIKTOK NEWS, CAPCUT, LYRICS, REUP MB, MV) — NOT built yet. These
  aren't just display labels: `TIKTOK_CHANNEL_GROUPS` in
  `app/booking/page.js` matches against the real `brand` value stored on
  every existing `media_booking_entries` row. Renaming the constant alone
  would silently stop matching any historical booking entry still tagged
  with the old brand name — it needs a data migration (`update
  media_booking_entries set brand = ... where brand = ...`) alongside the
  code change, not just a code change. Also the old list has 4 names and
  the new one has 5 — want to confirm there's a real 1:1 (or 1:many)
  mapping from old to new before writing that migration, so no bookings
  end up unmatched.
- **Team filter** — still not built; not enough to build on top of a
  guess. If it does turn out to mean "filter by VIEENT/ENVI" rather than
  AR/Marketing/OPS/Design, that's actually just the existing
  `requester_segment` value on the linked release (same field the
  dashboard Channel column edits above) — cheap to add as a filter
  dropdown on this page once confirmed. If it really does mean the
  AR/Marketing/OPS/Design teams, `media_booking_entries` doesn't track
  "which team" today and that'd need a new column first.

Delivered as `starter_v2_round_z.zip`. No new SQL this round — both
completed items reuse existing columns/tables.
