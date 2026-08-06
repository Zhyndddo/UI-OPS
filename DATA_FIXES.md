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

## Follow-up round — v1 (Firebase) → v2 migration: Phái Sinh + Manual Claim

The only two v1 collections that actually had data. Both map onto the
generic `tickets` table here (same shape every other ticket type uses),
so no schema change was needed — field names in v1's Firestore documents
already match what schema.sql's `entity_fields` define for `phai_sinh`/
`manual_claim` almost exactly.

**Source:** exported from the Firebase console via a browser-console
script against `window._db` (the v1 app already exposes its Firestore
connection there) — service-account key creation was blocked by an org
policy on the Firebase project, so this was the workaround. Two plain
JSON arrays: `data/phai-sinh-export.json` (109 documents, Firestore
collection `segmentOrders` filtered to `type="phai_sinh"`) and
`data/manual-claim-export.json` (39 documents, collection `manualClaim`).

**New script: `scripts/import-legacy-orders.js`.** For each row: looks up
the matching `ticket_tabs` row (`phai_sinh` or `manual_claim`, read from
each row's own `type` field, not the filename), builds `tickets.data`
from the known field list per type, converts Firestore's
`{seconds, nanoseconds}` timestamps in `statusLog`/`createdAt`/`updatedAt`
to real ISO strings, and inserts with `legacy_id = <Firestore doc id>` so
re-running never double-imports. Dropped on purpose: `artistDisplay`,
`contributorDisplay`, `releaseDisplay` (phai_sinh only) — computed
display strings from the old renderer, not real stored data.

**Flagged, not guessed at:** `requesterSegment` values in the export are
`AR`, `OPS`, and `GUEST_REQUESTER`. AR/OPS pass through as-is (v2's
`requester_segment` is free text, not an enum). `GUEST_REQUESTER` doesn't
have an obvious v2 equivalent — v1's guest-vs-real-account split isn't a
thing in v2's auth model — so it's imported verbatim rather than mapped
to a guess. If you want it changed to something specific, that's a single
`update tickets set requester_segment = '...' where requester_segment =
'GUEST_REQUESTER'` after the fact, not a script rewrite.

**Not linked to any release** — neither collection's source data ties a
row to a release DID, and the v2 forms already treat "Related DID" as
optional, so these import as standalone tickets.

Same dry-run-by-default / `--confirm` pattern as every other import here,
runnable from the "Data Fix Scripts" Actions workflow (`import-legacy-orders`
in the dropdown, `file_path`/`file_path_2` set to the two files above — a
second `file_path_2` input was added to the workflow just for this, since
it's the only import script here that needs two source files). Run
`scripts/backup.js` first, same as always.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-legacy-orders.js data/phai-sinh-export.json data/manual-claim-export.json
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-legacy-orders.js data/phai-sinh-export.json data/manual-claim-export.json --confirm
```

## Follow-up round — light theme colors, Send Upload backfill, dashboard bug report

### Done

**Light theme colors** (`app/globals.css`, `[data-theme="light"]` block) —
greys darkened toward near-black (`--text-muted`/`--text-faint`/
`--text-dim`/`--border-strong` all repointed) so secondary text actually
pops instead of reading washed-out; the whites (`--bg`/`--bg-card`/
`--bg-input`/`--bg-hover`) are now a warm yellowish eggshell instead of
stark white, so surfaces read as dimmer. Dark theme untouched. `--border`
(hairline dividers) got a lighter warm tone rather than near-black, since
a near-black hairline on an eggshell background would look heavier than
before, not just "popped."

**New one-time script: `scripts/backfill-send-upload.js`.** The BRIEF
import creates releases with the Metadata Checklist already ticked from
the sheet, but importing a row was never the same as a human clicking
"Send Upload" on it — so imported releases that are fully uploadReady
(4/4 required checklist items + Title/Artist/Release Date) were sitting
there never actually sent. This script finds exactly those (only releases
with a `legacy_id`, i.e. only ones that came from an import — never
touches a release someone's still working on through the normal UI) and
does exactly what the Send Upload button does: creates the Newrelease
Upload ticket, sets `requested = true`, creates the Media Booking ticket.
Dry-run first, `--confirm` to write, added to the Actions dropdown as
`backfill-send-upload` (no file needed). Safe to re-run — skips anything
already sent or already ticketed.

### Investigated, not yet fixed — need more info from you

**Bug: clicking into a release detail page sometimes 404s + crashes**
(`TypeError: Cannot read properties of null (reading 'id')`). Went
through the release detail page's load path (the initial release fetch,
the Pitching/Media Booking/Artist Profile ticket lookups, the
`gate_phu_luc_truyen_thong` auto-yes effect added a couple rounds back)
and didn't find a null-dereference bug in any of them — everything that
reads `.id` off a ticket/release object is already guarded by a
truthiness check first. The 404 *before* the crash is the bigger clue:
that pattern (a 404 for a hashed JS chunk, then a generic null-reference
crash right after) is the classic symptom of a browser having an old
version of the app already loaded in a tab and then trying to
client-side-navigate into a route whose chunk hash changed in a newer
deploy — not usually an actual code bug. Before I chase this further:
next time it happens, try a hard refresh (Cmd+Shift+R / Ctrl+Shift+R) on
that tab first — if that makes it go away, it was stale-chunk, not a real
bug. If it still happens after a hard refresh, send the DID/URL of the
specific release and I'll dig deeper with that as a concrete repro.

**Dashboard filter — "probably the month"**: read through every filter on
the New Release dashboard (`app/releases/page.js`) — Today/This
Week/This Month, Pre-release/Release/Post-release, Channel, Type, Label,
search — and didn't find a logic bug in any of them as written. One real
candidate worth flagging though: "This Month" filters by `created_at`
(when the row was added to the system), not `release_date` (when the
song actually releases) — if you were expecting it to mean "releasing
this month," that's not a bug, it's filtering the wrong date field for
what you wanted. Let me know if that's it (easy one-line fix to switch
which field it reads), or if you catch the actual bug happening again,
a screenshot of it mid-glitch would pin it down fast.

**Booking Board top-row hover glitch (item 2)** and **Community + Instagram
column (item 3)** — held off on both; see the chat reply for what I found
and what I need confirmed before building either.

## Follow-up round — confirmed fixes: month filter, Instagram column, tall-row peek

Three items from the previous round got confirmed with a screenshot/
clarification, so all three are now fixed:

**"This Month" dashboard filter (item 5)** — confirmed: meant "releasing
this month," not "created this month." `app/releases/page.js`'s stat card
and filter now both read `release_date` (bounded to the current calendar
month — start through the first of next month) instead of `created_at`.
Today/This Week left alone (not flagged as wrong).

**Missing Instagram column (item 3)** — confirmed: the Booking Board
workstation, not the ticket page. Found it: `PLATFORM_COLUMNS` in
`app/booking/page.js` (the fixed platform-column list for Social's and
Community's per-brand breakdown) was `["Facebook", "TikTok", "YouTube",
"Thread"]` — missing Instagram even though it's already a real pickable
platform on the Media Booking ticket itself. Any Instagram entries logged
there had nowhere to show up on the Board. Added — now shows for all 3
Community brands (and Social's, same shared list).

**Booking Board top-row glitch (item 2)** — confirmed via the annotated
screenshot: rows with the 4-item Result checklist column were roughly
twice as tall as a normal row, so as they scrolled past the sticky table
header, the header could only ever cover part of a row at a time —
leaving a "half-cut" row with its title and top checkboxes hidden but the
bottom checkboxes still poking out below the header, unlabeled. This is
inherent to sticky headers with rows taller than one line (universal
browser behavior, not really "fixable" outright), but I cut the row's
height roughly in half — `ResultCell` in `app/booking/page.js` now lays
its 4 items out 2-per-row instead of 4-stacked — which meaningfully
shrinks how much of any row can be mid-cut. Also added a subtle shadow
under every sticky table header app-wide so the cutoff reads as an
intentional edge instead of a glitch.

No SQL this round — all three are pure code/CSS.

## Follow-up round — regression fix, bulk team-add, editable email

### Fixed: the sticky-header box-shadow from last round caused the new "blank first row" glitch

The previous round's `box-shadow` on `.table th` (added to soften the
tall-row cutoff) is a known trap on `border-collapse: collapse` tables —
combined with `position: sticky` it can render as a solid banded gap
instead of a soft shadow, which lines up exactly with the newly-reported
blank first row. Reverted in `app/shared.module.css`; the row-height fix
(ResultCell laid out 2-per-row) from last round stays, since that one was
working as intended. If the shadow effect is wanted again later, it needs
either the table off `border-collapse: collapse` first, or the shadow
moved onto a non-collapsed wrapper — noted in the CSS comment so it isn't
re-added blind.

### New: bulk team add without the email rate limit

`scripts/bulk-create-team.js` — creates accounts directly via
`auth.admin.createUser({ email_confirm: true })` instead of
`inviteUserByEmail`, which never sends an email at all, so the free-tier
2/hour cap doesn't apply. Reads a CSV (`name,email,role,segment` —
template at `data/team-import-template.csv`); emails can be real or
placeholder/dummy (nothing here needs them to be deliverable, since no
mail gets sent). Generated passwords are written to a local
`team-created-credentials.csv` (NOT printed to the terminal/Actions log)
for you to hand out over a private channel — delete that file once
everyone's logged in and changed their password. Idempotent — skips any
email that already has a profile. Dry-run first, `--confirm` to write.

**Deliberately not added to the Data Fix Scripts Actions dropdown** —
every other script there is safe to run from a CI log because it doesn't
produce secrets; this one generates passwords, and an Actions log isn't
a great place for those to live even briefly. Run it locally instead:

```bash
npm install @supabase/supabase-js --no-save
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bulk-create-team.js data/team-import-template.csv
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bulk-create-team.js data/team-import-template.csv --confirm
```

**New: Config -> Team's Email cell is now editable** (`app/config/page.js`
+ new `app/api/admin/update-email/route.js`) — needed for the placeholder
emails above to get corrected once real addresses are known. Updates the
person's actual login email (if they have one) and the profile record
together — editing profiles.email alone would silently break their login,
since AuthContext matches a signed-in session to a profile by email, and
the session itself authenticates against auth.users' email, not
profiles.email.

No SQL this round.

## 2026-08-02 — Critical release-detail crash, further theme darkening, booking sticky-header shadow

### Fixed: EVERY release detail page was crashing ("Application error")

Root cause, found in `app/releases/[id]/page.js`:

```js
const [form, setForm] = useState(null); // starts null, only set once the fetch resolves
...
useEffect(() => {
  if (!form.id) return;
  ...
}, [form.id, form.project_type]);
```

`form` starts out `null`. This effect runs on every render, including the
very first one, before the Supabase fetch has come back — and a bare
`form.id` in the dependency array is evaluated **during render itself**,
not inside the guarded callback body. Reading `.id` off `null` throws
`TypeError: Cannot read properties of null (reading 'id')` — matching the
console error reported earlier — and crashed the page before the
`if (!form) return <div>Loading…</div>` guard further down ever got a
chance to help (hooks — including dependency arrays — always run first,
on every mount, regardless of where a conditional return sits later in
the component).

This wasn't a stale-JS-chunk fluke (the earlier, unverified theory) — it's
a real bug that fires on literally every mount, which lines up exactly
with the report that ALL release detail pages had started crashing.

Fix: guard with `if (!form) return;` and use `form?.id` / `form?.project_type`
in the dependency array, so the first (null) render is a no-op and the
effect re-fires once `form` is actually set.

### Fixed: inactive filter buttons still too light on the light theme

`app/booking/page.js`'s round/Hạng-Mục/sub-filter buttons (round, All,
category, and brand buttons — e.g. "PAGE VPOP", "PAGE INDIE") had their
inactive-state text hardcoded to `#ccc`, left over from the dark theme.
That's a light grey that's fine against a near-black background but
nearly invisible against the light theme's eggshell background — the
CSS-variable darkening pass from the previous round never reached it,
since it was a hardcoded hex, not a variable reference. Swapped to
`var(--text-muted)`, which resolves to a near-black `#211f16` in the
light theme (and stays the original `#999` in dark) — same known-limitation
class noted in `theme-template.json` (~25 files use hardcoded colors).

### Fixed (Booking Board only): sticky-header box-shadow, done correctly this time

Re-added a soft box-shadow under the sticky table header on the Booking
Board — but this time following the fix path the earlier revert's comment
called for: `app/booking/page.js`'s table now sets
`borderCollapse: "separate", borderSpacing: 0` inline, overriding the
shared `.table` class's `border-collapse: collapse` for this table only.
box-shadow on a sticky `<th>` inside a `border-collapse: collapse` table
is what caused the earlier "blank first row" regression; switching to
`separate` first avoids that rendering trap. This change is scoped
entirely to Booking Board's own inline styles — `shared.module.css`'s
`.table` class (used by every other workstation table, including
Pitching) is untouched.

You confirmed the underlying "rows can get visually cut off by the sticky
header" issue happens elsewhere too (e.g. Pitching workstation showing a
header with a blank body despite "Showing 1–1 of 1"), but asked to scope
the fix to Booking Board only for now — Pitching workstation and other
tables were deliberately left alone this round.

No SQL this round.

## 2026-08-02 (2) — Sticky-header fix rolled out to every workstation

Rolled the Booking-Board-only sticky-header fix from earlier today out to
every table that uses the shared `.table` class (`shared.module.css`) —
which is every workstation, every ticket list, and every dashboard table
in the app (grepped for `styles.table` usage: booking, releases, artists,
labels, config, pick-package, all `app/tickets/*`, all `app/workstation/*`
including pitching).

`.table` now uses `border-collapse: separate; border-spacing: 0` instead
of `collapse`, and `.table th` carries the soft `box-shadow` under the
sticky header directly. Collapse + a sticky `<th>` + box-shadow was the
known rendering trap (see the long-standing comment on `.table th`) that
caused the earlier "blank first row" regression on Booking Board — the
fix there (switch off collapse first) is now the table's default
everywhere, not a one-page workaround, so Pitching workstation's blank
first row and any other workstation hitting the same class of bug is
covered by the same change.

Removed the now-redundant per-page override that had been added to
`app/booking/page.js` for this — it's back to using the shared class
plainly, since `shared.module.css` does the job for every table now.

No SQL this round.

## 2026-08-02 (3) — Booking Channels reference import + picker

### New: real channel reference data imported, wired into the Add Link popup

You sent the real "LIST KÊNH VIEENT & ENVI" sheet (142 usable rows —
channel name, platform, URL, follower count, and a loose tag, across the
VIEENT / ENVI / INDIE / VPOP / capcut brand groupings). This is exactly
what `booking_channels` (schema.sql) was already built for — it was
seeded with only 9 hand-typed rows (VIEENT's and ENVI's own official
channels) and its own comment already said it should "match the real
LIST KÊNH VIEENT & ENVI sheet exactly." There's also already a
`/booking-channels` admin page for it — it just had no real data yet, and
nothing in the Booking Board actually read from it.

**Schema change** — `add-booking-channels-reference-fields.sql` adds 4
nullable columns the original 9 rows didn't need: `brand`, `url`,
`follower_count`, `note`. Run this against your database first:

```sql
alter table booking_channels add column if not exists brand text;
alter table booking_channels add column if not exists url text;
alter table booking_channels add column if not exists follower_count int;
alter table booking_channels add column if not exists note text;
```

(Full file with column comments is `add-booking-channels-reference-fields.sql`
at the repo root reference — not shipped inside `starter/`, same as
`schema.sql` itself; ask if you want it bundled into this zip too.)

**Import** — `scripts/import-booking-channels.js` reads
`data/booking-channels-import.json` (the sheet, already committed) and
inserts into `booking_channels`:

- `platform` is normalized to the app's existing vocabulary (Facebook,
  Instagram, TikTok, YouTube, Thread) — the sheet's "INS" → Instagram,
  "Youtube" → YouTube, and "Capcut" → TikTok (those rows are all real
  tiktok.com links; "Capcut" is kept in `note` as a tag instead of
  inventing a 6th platform column nothing else in the app knows about).
- `channel_type` (Direct/Partner — not in the sheet) is inferred: a row
  only counts as "Direct" when the channel's own name IS the brand's name
  (VIEENT's own pages, ENVI's own pages) — everything else (the ~130
  community/curator pages) is "Partner".
- `brand` is kept as the sheet's own raw grouping, not force-mapped onto
  the Booking Board's column brand names (PAGE VPOP, TIKTOK VPOP, etc.) —
  see the picker note below for why.
- Idempotent via the table's existing `unique(name, platform, channel_type)`
  — safe to re-run.
- One spacer row (brand "capcut", nothing else filled in) has no name and
  is skipped.

```bash
npm install @supabase/supabase-js --no-save
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-booking-channels.js
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-booking-channels.js --confirm
```

Also runs from the Data Fix Scripts Actions dropdown as
`import-booking-channels` — no file path needed, it reads the committed
JSON directly.

**Picker wired into the Booking Board's Add Link popup**
(`app/booking/page.js`) — `BrandCell`'s popup now has a collapsible "Pick
from reference list" section: search by name, click a result to fill the
first blank channel row with that channel's name + URL, instead of typing
both from scratch. Free typing still works exactly as before regardless.

Suggestions are filtered by platform (a reliable 1:1 mapping) and then
*ranked* — not filtered — by whether the channel's raw `brand` likely
matches this column's brand (a soft token-overlap check, e.g. column
brand "PAGE VPOP" and sheet brand "VPOP" share the token VPOP). Kept as a
ranking instead of a hard filter deliberately: the sheet's brand
vocabulary and the Board's column brand vocabulary were never meant to
line up exactly, and getting that mapping wrong should never mean a real
channel becomes impossible to find — it just won't be sorted first.

**`/booking-channels` admin page** now shows and lets you set URL, and
displays brand/follower count/note/URL for every channel, plus a search
box (with ~140 real rows in there now, the old just-scroll-and-look UI
stopped being usable).

No further code changes — the release-detail crash fix, filter-button
darkening, and workstation sticky-header fix from earlier today are
already in this same round.

## 2026-08-02 (4) — Light theme black boxes, more grey text, GateFields regroup

### Fixed: black boxes with unreadable text in the light theme

Root cause across the whole app: lots of panels (the "Which pitching?"
box, "Thể Loại" box, Split Share box, the Magic Link page's package
detail panels, several ticket pages, dropdown popups, etc.) had their
background/border/text hardcoded to dark-theme-only hex values (`#121212`,
`#141414`, `#262626`, `#333`, plus grey text like `#ccc`/`#888`/`#666`/
`#555`/`#999`/`#aaa`) instead of the `--bg-card`/`--border`/`--text-*`
variables. In dark mode that's invisible (same near-black on near-black
the variables would produce anyway), but in light mode it's a literal
black box with dark grey text on it — unreadable.

Swept every one of these across the app and lib folders and replaced them
with the matching theme variable, in:

`lib/GateFields.js`, `app/releases/[id]/page.js`, `app/booking/page.js`,
`app/new-release/page.js`, `app/tickets/pitching-info/page.js`,
`lib/ReleaseNotePopup.js`, `app/pick-package/[token]/page.js` (the Magic
Link page — artist-facing, so this one mattered most), `app/tickets/media-booking/page.js`,
`app/tickets/newrelease-upload/page.js`, `app/tickets/phu-luc/page.js`,
`app/tickets/phu-luc/new/page.js`, `app/tools/page.js`,
`app/workstation/stream/page.js`, `lib/ReferenceInputs.js`, `lib/helpers.js`.

Deliberately left alone: the two solid dark TikTok-group header bands in
`app/tickets/media-booking/page.js` (`background: "#141414", color: "#fff"`)
— those are an intentional persistent-dark divider style with white text,
readable regardless of theme, not a grey-text-on-dark-box readability bug.
`lib/helpers.js`'s `statusColor()` also got its neutral/idle status pills
(REQUESTED, "Chưa bắt đầu", "Hủy") switched from a flat white-tint +
grey text to the theme variables — same invisible-in-light-mode problem,
one level removed (a translucent white background instead of an opaque
dark one). The colored statuses (PROCESS/SUBMITTED/COMPLETE/REFUND/
CANCELED) were already fine on both themes and are untouched.

If anything else still shows a dark/unreadable box in light mode, it's
almost certainly the same pattern in a file this sweep didn't catch —
point me at it.

### Additional Request, regrouped

`lib/GateFields.js` regrouped per your spec:

- **Marketing Checklist** — unchanged: Profile Artist, Artist Photo, Project Proposal.
- **Marketing Request** — now just Pitching and Gói Hỗ Trợ Truyền Thông.
- **Data Request** — new group header, holding Priority Sync Lyric, Music
  Video on Spotify, Discovery Mode on Spotify, Sony Publish, Splitshare.
- **Legal Request** — new group header, holding Phụ Lục MG (still a plain
  editable toggle — you said you don't know what it does yet, left as-is),
  Phụ Lục Truyền Thông (now **read-only**, a colored status badge instead
  of a Yes/No/TBU toggle — see below), Phụ Lục Publishing.

**On Data Request the field:** `gate_data_request` was a real, live column
— set on the New Release create form, rendered as a normal toggle here
before this regroup, same as every other gate field. It's not something
that got added by accident. Per your instruction I did **not** delete it
— I just stopped showing it as its own field, since the regroup didn't
list a place for it to keep being one. It still has whatever data was
already saved on it; say if you want it back as a field somewhere (inside
the new Data Request group, or its own thing) and I'll wire it back in.

**On Phụ Lục Truyền Thông going read-only:** confirmed this is the same
gate as the auto-ticket trigger — `app/releases/[id]/page.js` has an
effect that flips it to `"true"` the instant a release leaves BRIEF &
DATA/DEALING with a real package type (not "Chỉ Phát Hành"), and never
touches it again once it's already something other than the untouched
default. Since that effect would silently overwrite any hand-pick anyway,
I made it a plain status badge (colored the same as the real toggle would
be) instead of leaving it clickable and confusing.

**Left as-is, not moved, not mentioned in the new group spec:**
`gate_legal_request` (the standalone field, separate from the new "Legal
Request" GROUP — putting a field named "Legal Request" directly under a
group also named "Legal Request" seemed likely to confuse, so it stayed
under Marketing Request instead), plus `gate_design`,
`gate_co_trong_net_youtube`, `gate_pre_order` (same as before — flagged as
an assumption previously, still unflagged where they should really live).
Say where any of these four should actually go.

## 2026-08-02 (5) — Media Booking tab: round auto-detected, picker removed

`app/releases/[id]/page.js`'s Media Booking tab (the "SOCIAL / COMMUNITY /
ADS / TIKTOK CHANNEL" summary + "Booking Links — ___" panel) had a manual
INT/Đợt 1/Đợt 2 button picker defaulting to INT. Replaced with automatic
detection (`resolveBookingRound`) — no more picker, just a label showing
whichever round actually applies:

- project_type is an INT MEDIA package, OR the release is Chỉ Phát Hành
  and already had an INT MEDIA follow-up sent (`int_media_requested`) →
  **INT**
- any other real resolved package (not still BRIEF & DATA/DEALING, and
  not bare Chỉ Phát Hành with no follow-up yet) → **Đợt 1**
- still BRIEF & DATA/DEALING, or Chỉ Phát Hành with no follow-up sent yet
  → nothing shown, just a note that it'll appear once a package is picked
- **Đợt 2 is never auto-selected** — not wired here yet, per your note
  it should stay hidden for now

This tab was already read-only (editing/adding links happens on the
Booking Board) so removing the picker doesn't lose any capability — it
was only ever choosing which round's data to *display*.

The Booking Board's own INT/Đợt 1/Đợt 2 picker (used for actually adding
links) and the Magic Link page's round picker are both untouched — you
only asked about this one square.

## 2026-08-02 (6) — Booking channel import: fixed wrong channel_type

You caught it: `scripts/import-booking-channels.js` guessed `channel_type`
wrong — it set "Direct" only for VIEENT's/ENVI's own named pages and
"Partner" for the ~134 community/curator channels, assuming channel_type
tracked page ownership. It doesn't — per schema.sql's own comment on the
concept, Direct/Partner is about who VIEENT contracts through ("Direct" =
VIEENT runs it themselves, no third-party agency involved), and every
channel on this reference sheet is one VIEENT deals with directly. They
should all be "Direct".

**Fixed for future/re-runs:** `import-booking-channels.js`'s
`inferChannelType()` now just always returns "Direct" — if this script is
re-run (e.g. after a fresh import), it'll get it right from the start.

**If you already ran `--confirm` and the wrong data is live:**
`scripts/fix-booking-channels-direct.js` — one-time correction, only
touches rows this import created (`brand is not null`, which only this
script ever sets — your 9 original hand-seeded rows and anything added by
hand from `/booking-channels` are untouched). Checks for the (unlikely)
case where flipping a row to Direct would collide with an existing Direct
row of the same name+platform and skips + reports those individually
instead of erroring the whole run.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/fix-booking-channels-direct.js
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/fix-booking-channels-direct.js --confirm
```

Also in the Data Fix Scripts Actions dropdown as `fix-booking-channels-direct`.

If you haven't run the import at all yet, you don't need this fix
script — just run the (now-corrected) `import-booking-channels.js` and
everything comes in right the first time.

## 2026-08-02 (7) — Design ticket historical import

You sent "2026 REQUEST DESIGN VIDEO VIEENT 1.xlsx" — real historical
Design tab tickets. Checked it for exposed secrets first (same as the
last upload) — none found, safe to process.

The workbook has 12 sheets; almost everything usable lives in one place:

- **BACKLOG** (4505 rows × 73 columns — the messiest sheet) actually
  contains two unrelated tables sharing the same row numbers: a
  team-assignment matrix in columns A–W, and — the one this import
  uses — a clean one-row-per-task master table in columns BE:BT
  (57–72), header at row 3. **895 populated task rows.**
- **REQUEST / RECEIVE / PROCESS / ARCHIVED** are near-empty live-snapshot
  tabs — checked every row of each by hand (not just a header/summary
  glance). Only **one** real ticket turned up that wasn't already in
  BACKLOG: a still-open REQUESTED row in REQUEST ("Congrats Post",
  requested 2026-07-31 — hasn't finished processing yet so it hadn't
  landed in BACKLOG). That one row is included.
- **SOCIAL / ARTIST / OTHER** are raw Google-Form-response sheets, mostly
  placeholder/instruction rows, not real per-task records — not
  imported.
- **TỔNG QUAN / Trang tính13** are dashboard/summary sheets — not
  imported.

**896 tickets total** (895 BACKLOG + 1 REQUEST) exported to
`data/design-tickets-import.json`, mapped into the app's real Design
ticket shape by `scripts/import-design-tickets.js` — see that file's
header comment for the full field-by-field mapping (task-line parsing
into typeRequest/designType/project/artist, priority mapping, free-text
platform/size/description/executor, status_log built from the
ngay_request/process/complete/refund columns, code-dedup into legacy_id,
created_at carried forward from ngay_request).

Two things worth knowing before you run it:

- **Executor** (Như/Amy/Thư/Bảo/blank in the sheet) is stored as plain
  text in the ticket's legacy `executor` column, not matched to a
  `profiles` row — bare first names aren't safe to auto-resolve (more
  than one staffer shares some of these first names elsewhere in the
  same workbook). Assign real owners by hand later if you want that.
- **Requester identity**: the sheet's `code` column is a squashed
  legacy ID (timestamp + submitter email + task type, no separators) —
  the email is pulled out where it parses cleanly and kept under
  `data._legacyImport.requesterEmail` for reference only.
  `requester_name`/`requester_segment`/`pic_profile_id` are left blank
  rather than guessed.

Idempotent via `legacy_id` (dedup+suffixed `code` values) — safe to
re-run. Dry-run by default; pass `--confirm` to write.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-design-tickets.js
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-design-tickets.js --confirm
```

Also in the Data Fix Scripts Actions dropdown as `import-design-tickets`.

**Executor → profile linking:** the import script now also tries to link
each ticket's `executor` (Như/Amy/Thư/Bảo) to a real `profiles` row
(`pic_profile_id`) — but only on an exact, case-insensitive, unambiguous
name match. This only works if you create those profiles with `name`
set to exactly the short first name as it appears in the sheet (e.g.
`name = "Như"`, not a fuller name) — otherwise it won't match and the
executor stays free text only (nothing breaks, it's just unlinked).

If you add those profiles **after** already running `import-design-tickets
--confirm` once, re-running it won't retroactively fix the tickets
already in the database (the `legacy_id` check skips them) — run
`scripts/backfill-design-executor-profile.js` instead, which finds
already-imported Design tickets with a still-unlinked executor and links
them the same way. Safe to run repeatedly.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-design-executor-profile.js
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-design-executor-profile.js --confirm
```

Also in the Data Fix Scripts Actions dropdown as
`backfill-design-executor-profile`.

**Recommended order for you:** add the 4 profiles first (name = exact
short first name), then run `import-design-tickets` — that way every
ticket gets linked on the first pass and you won't need the backfill
script at all. If you'd already run the import before adding the
profiles, run the backfill script afterward instead.

## 2026-08-03 — Booking Board: TikTok Channel gets a 3rd filter layer, reference-picker fix, editable channel list, sticky-header z-index fix

**TikTok Channel now has a real 3-layer drill-down**, matching the
ticket's Package Builder exactly: Group (In-house/Partner, unchanged) →
Brand (NEW — a picker for the group's 4 real brands) → columns, which
are now the 5 fixed subchannel types (TIKTOK NEWS / TIKTOK CAPCUT / MẪU
CAPCUT / TIKTOK REUP MV / TIKTOK LYRICS) instead of the 4 brands. Picking
a brand no longer IS the final column set — it's a filter, and the
columns underneath show which subchannel type each booked link belongs
to.

This needed a small schema change: `media_booking_entries` gets a new
`subchannel_type` column (see `add-media-booking-subchannel-type.sql`).
It's separate from the existing `platform` column, which for TikTok
Channel already holds the specific channel/account name (e.g. "Hey lên
nhạc") — the two are independent tags on the same link now, not
alternatives. **Run the migration SQL against your database before this
round's code goes live** — the Add Link popup writes to that column
directly.

```sql
-- add-media-booking-subchannel-type.sql
alter table media_booking_entries add column if not exists subchannel_type text;
```

The "booked" target number shown per subchannel column is the same
brand-level aggregate for all 5 of that brand's columns — the underlying
target itself isn't split by subchannel on the ticket side either (one
quantity per brand, built by summing all its DSP rows), so there's
nothing more granular to show.

**Reference-picker fix:** picking a channel from "Pick from reference
list" in the Add Link popup used to also fill in the URL from the
reference list's own `url` field — silently defaulting the real booking
link to a value nobody typed, which could go stale without anyone
noticing. It now only fills the Channel Name; the URL is always typed or
pasted by hand. The reference list's own URL stays purely informational
(so the team knows which handle a channel name points to).

**Channel reference list is now editable.** `/booking-channels` — every
existing channel (name, platform, channel type, brand, URL, follower
count, note) can be edited in place via a new "Edit" link on each row,
not just added/removed. Changing name/platform/channel type is guarded
against the table's unique constraint — a collision is caught and shown
inline instead of silently failing.

**Sticky-header/first-row overlap, another pass:** found a real,
consistent bug across every workstation table with a sticky left+top
corner cell (the "Release Info" column header) — Pitching, Pre-release,
Upload, Confirm, and the Booking Board. That header cell's inline
`zIndex: 2` was far below the shared `.table th` class's `zIndex: 20`,
so during scroll it could render BEHIND its sibling header cells instead
of on top of them at the corner where sticky-top and sticky-left meet.
Bumped to `zIndex: 21` (one above the shared header z-index) everywhere
this pattern appears. This is a real, verified inconsistency and a
plausible contributor to the reported overlap — flagging honestly that I
couldn't reproduce the exact glitch live (no browser access this
session) to confirm it's the *whole* fix; let me know if it's still
happening after this round and I'll keep digging.

## 2026-08-03 (2) — import-design-tickets: fixed the created_at crash

Your first real run of `import-design-tickets` failed on the first
insert chunk: `null value in column "created_at" of relation "tickets"
violates not-null constraint`. Root cause: the script only set
`created_at` on a row when `ngay_request` was present, leaving the key
off the object entirely for the 9 rows that lacked it. That's fine for a
single-row insert (Postgres falls through to the column's `default
now()`) — but PostgREST's BULK insert treats a key that's present on
some rows of the array and absent on others as an explicit `NULL` for
the rows missing it, not "use the default." Since those 9 rows were
mixed into the same 50-row chunk as rows that DID have `created_at`,
Postgres saw an explicit NULL going into a NOT NULL column and rejected
the whole chunk — which is why it failed immediately at row 0 and
nothing got inserted (confirmed: this was a clean failure, not a partial
import — safe to just re-run).

**Fixed:** `created_at` is now always set explicitly on every row —
falls back through `ngay_request` → `start_date` → `ngay_process` →
`ngay_complete` → `ngay_refund` → `deadline` → import time, in that
order, so it's never omitted. Only 3 of the 896 rows have no usable date
anywhere and fall all the way back to import time.

Re-run the same command — this round's `data/design-tickets-import.json`
and `scripts/import-design-tickets.js` are otherwise unchanged, so
nothing else about the plan (executor linking, dedup, etc.) is affected.

## 2026-08-03 (3) — Media Booking ticket list: auto-sorted by release date

`/tickets/media-booking` now sorts by release date (soonest first)
instead of ticket `created_at` — for a booking execution queue, "which
release is coming up next" is the more useful priority signal than
"which ticket was made most recently." Tickets with no matching release
sort to the bottom rather than jumping to the top from a missing date.
The admin view's existing REFUND-first grouping is preserved on top of
this (REFUND tickets still surface first; release date decides the order
within that group and within the rest).

This is explicitly a "for now" sort per your ask — happy to build a real
column-picker (click a header to sort by date/status/etc, like Pre-release
already has) if release date alone doesn't cover what you need.

## 2026-08-03 (4) — Found the REAL sticky-header root cause: overflowY

Previous rounds fixed a real z-index issue on the sticky corner cell, but
that wasn't the actual reason Pre-release's header wasn't sticking to
the topbar at all while scrolling. Root cause: every workstation table
is wrapped in `<div style={{ overflowX: "auto" }}>` for horizontal
scrolling on narrow screens. Setting `overflow-x` alone forces the
browser to compute `overflow-y` as `auto` too (a real CSS spec quirk —
you can't have one axis scroll and the other stay `visible`), which
makes THAT DIV the nearest scrolling ancestor for `position: sticky`
purposes, instead of the actual page. Since the div itself never grows a
real vertical scrollbar (it's sized to its content; the page scrolls
around it instead), the div's own scroll position never moves — so from
the sticky header's perspective, its nearest scrolling context never
scrolls, and the header just never floats at all. Not an overlap or
z-index problem — sticky was silently inert the whole time.

**Fixed everywhere this pattern appears** (Pre-release, Pitching,
Upload, Confirm×2, Booking Board, Stream, Artists, Phái Sinh, Manual
Claim) — every one of those wrapper divs now sets `overflowY: "visible"`
explicitly alongside `overflowX: "auto"`, opting back out of the
implicit coercion so the page is the real scrolling context again. Full
explanation left as a comment on `.table th` in `shared.module.css` for
next time this comes up.

## 2026-08-03 (5) — "Khác" ticket pulled onto the sidebar + a CC field

The shared "Khác" (catch-all) ticket type now has its own shortcut
directly on the main sidebar — labeled **"Cứu mạng Zhyn ơi"** by default
— instead of being one option buried inside the Tickets switcher.

**The label is admin-editable**, dev role only: Config → Sidebar Label.
Backed by `app_settings.khac_sidebar_label` — the sidebar falls back to
the joke default if that row is ever missing, so nothing breaks if the
setting hasn't been seeded yet. **Run
`add-khac-sidebar-label-setting.sql`** against your database if it
predates this round (schema.sql already seeds it for fresh deploys).

**New field on the Khác ticket form**: "Also Notify (CC)", defaults to
Zhyn's account (an.thien@vieent.vn) on every new Khác ticket, editable
or clearable by whoever's filling out the form. Worth being upfront
about the scope of this: it's a plain text field on the ticket, not a
real hookup into the notification system (Khác doesn't have an
executor/PIC concept to plug into — `executorTeam: null`) — it doesn't
actually page/email anyone by itself. If you want it to trigger a real
notification, that's a bigger follow-up (wiring a new type into
`notification_settings`/the digest system) — let me know if that's
actually what you're after.

## 2026-08-03 (6) — New: audit-booking-board (read-only diagnostic)

You reported two things after the historical booking data import:
1. A release's colored Result-cell dot shows green ("done") for a Hạng
   Mục, but none of that Hạng Mục's actual brand/subchannel columns show
   any progress.
2. Large stretches of releases show grey/empty across the whole row.

I don't have a way to query your live database directly from here, so
`scripts/audit-booking-board.js` is a **read-only** diagnostic you can
run from the Actions dropdown to see exactly what's going on — it never
writes anything (`confirm` has no effect on it).

**Why #1 happens:** the Result-cell dot counts every entry in a category
regardless of brand — it doesn't check whether `channel_name` matches a
real brand. The individual columns, on the other hand, only count an
entry if `channel_name` EXACTLY matches one of the brands the Board
actually renders. A stray casing/spacing difference or an old brand
spelling from the import is enough for an entry to count toward the dot
while being invisible in every column. Run the script with no DID for an
all-releases summary of exactly these mismatched entries.

**Why #2 happens:** a release's whole row goes grey when there's no
`media_booking_packages` row whose `name` exactly equals that release's
`project_type` — regardless of how many links were actually added. The
same no-DID run also flags every release with a `project_type` but no
matching package row.

**For the specific release you flagged** (Sau Tiếng Mưa Đêm, DID
STBP2406-0004): run the script with that DID in the `file_path` field
(leave it blank for the general summary instead) —

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-booking-board.js STBP2406-0004
```

— it dumps that release's `project_type`, every `media_booking_packages`
row and whether it actually matches (the Board only uses the one that
does), and every `media_booking_entries` row tied to it with its
category/brand/platform/status. That'll show directly whether it's grey
because of a missing/mismatched package, because the import never wrote
any entries for it, or something else — paste the output back and I can
tell you exactly what to fix from there (and whether a follow-up
correction script makes sense once we know the actual pattern).

Also in the Data Fix Scripts Actions dropdown as `audit-booking-board`.

## 2026-08-03 (7) — Fix: "This Week" stat tile was keyed off created_at, not release_date

`app/releases/page.js`'s "This Week" stat tile (and the filter it drives
when clicked) was counting releases **created** in the current calendar
week, same as "Today" — not releases actually **releasing** this week.
That's inconsistent with "This Month" on the same row, which already
reads `release_date`. Fixed "This Week" to match: it now counts releases
whose `release_date` falls between this Sunday (inclusive) and the
following Sunday (exclusive), same window described in your request.
Both the stat tile itself and the filter it applies when you click it
were updated together, so they stay in agreement.

## 2026-08-03 (8) — Fix: sticky table header STILL not engaging — the round-6 fix was wrong

The round-6 fix (see the CSS comment in `app/shared.module.css`) diagnosed
the right mechanism — the table's `overflowX: "auto"` wrapper div forces
the browser to compute `overflow-y` as `auto` too, which makes that div
(not the page) the sticky header's scrolling context, and since the div
itself never grows a real scrollbar, the header never floats — but the
fix it shipped was wrong. It set `overflowY: "visible"` explicitly on the
wrapper, on the theory that would opt back out of the coercion. It
doesn't: the CSS rule is "if one axis is non-visible and the other is
`visible`, the `visible` one computes to `auto`" — and that applies
whether the `visible` value was left as the default or written by hand.
So `overflowX: "auto"` next to an explicit `overflowY: "visible"` still
computes to `overflow-y: auto` under the hood, and sticky still never
engaged. That's why Upload, Pitching, Confirm (Re-Check), and Pre-release
all kept showing the same "title row hovers over the first row, doesn't
stick on scroll" symptom even after that fix shipped.

**Actual fix:** `overflowY: "hidden"` instead of `"visible"`. `hidden` is
not `visible`, so both axes are non-visible and the coercion rule never
triggers — no forced `auto`, so the div never becomes a scroll container,
so the page itself stays the true scrolling context and `position: sticky`
on the header row now has something that actually scrolls to stick
against. It's safe specifically because every one of these wrapper divs
is sized to its content (never height-constrained) — there's nothing
for `overflow-y: hidden` to ever clip, so vertically it's a no-op; it
only changes what the browser computes the property to.

Updated across all 9 pages that had the wrong value: `app/booking/page.js`,
`app/workstation/{upload,pitching,confirm,pre-release,stream}/page.js`,
`app/artists/page.js`, `app/tickets/{phai-sinh,manual-claim}/page.js`.
The comment in `app/shared.module.css` above `.table th`'s sticky rules
was rewritten to explain both the original coercion and why the first
attempted fix didn't actually fix it, so this doesn't get re-broken by a
future "helpful" cleanup.

## 2026-08-03 (9) — Fix + new diagnostic: New Release dashboard's Channel column showing blank for imported data

You confirmed: the import wrote the Channel value, the dashboard just
wasn't showing it. Root cause — `app/releases/page.js` renders Channel as
a `<select>` with exactly two hardcoded options, "VIEENT" and "ENVI" (see
the `CHANNELS` constant). `releases.requester_segment` is free text
(`import-brief.js` writes whatever's in the sheet's "SOCIAL BOOKING"
column, trimmed but not validated against those two words). Any imported
value that isn't an exact case-for-case match — different casing, extra
wording, a legacy spelling — has no matching `<option>`, so the browser
just shows the `<select>` blank. The value was genuinely sitting in the
database the whole time; the dropdown just had nowhere to display it.
Same blind spot hits the "By Media Channel" stat tiles above the table,
which also only count rows that are exactly "VIEENT" or "ENVI".

**Fix shipped:** the `<select>` now adds a one-off `<option>` for the
row's actual raw value whenever it doesn't match VIEENT/ENVI, labeled
"(unrecognized — pick to fix)" with a hover tooltip — so instead of
silently going blank, you now SEE the real imported value sitting there,
and can just pick VIEENT or ENVI from the same dropdown to correct it
in place (same inline-save path as before, no separate edit flow).

**New diagnostic** (read-only, no `--confirm`, same pattern as
`audit-booking-board`): `scripts/audit-release-channel.js` prints every
distinct value seen in `requester_segment` across all releases, a count
of each, and flags every one that isn't exactly VIEENT/ENVI/blank — plus
a sample of up to 30 affected releases (DID, title, artist, raw value) so
you can see the actual scope before deciding whether this needs a bulk
correction script or just a few manual clicks in the now-visible
dropdown. Also in the Data Fix Scripts Actions dropdown as
`audit-release-channel`.

## 2026-08-03 (10) — Fix + new diagnostic: Pre-release "CANVA" group showing blank, same root cause as the Channel column

Same bug class as round (9)'s Channel column, this time on the
Pre-release workstation's 6 picker columns: CANVA, MV, Artist Pick,
Musixmatch Status, NCT Lyric, Zing Lyric. Each renders as a `<select>`
with a small fixed option list (e.g. CANVA is only "Done"/"CUT"/"No
Vid"), but `import-ops-tracking.js` writes whatever free text was in the
source sheet's STATUS/NOTE/Artist Pick columns straight into these
fields with no mapping onto those lists. Any imported value that isn't
an exact match has no matching `<option>` and renders blank — the value
is really in the database, the picker just has nowhere to show it. That
matches what you saw: the whole CANVA group looking empty even though
the historical OPS tracking data was imported.

**Fix shipped:** extracted a shared `PickSelect` component for all 6
columns that, same as the Channel column fix, adds a flagged
"(unrecognized — pick to fix)" option showing the real imported value
whenever it doesn't match the picker's fixed list — so it's visible
instead of silently blank, and you can just pick the correct option to
fix it in place.

**New diagnostic** (read-only, no `--confirm`): `scripts/audit-pre-release-fields.js`
checks all 6 fields at once and, per field, lists every value that isn't
one of its known options plus a sample of affected releases (DID, title,
artist, raw value) — run it to see the actual scope before deciding if
this needs a bulk correction pass. Also in the Data Fix Scripts Actions
dropdown as `audit-pre-release-fields`.

## 2026-08-03 (11) — Team import CSV

You sent an updated `team-import-template.csv`, but it's byte-for-byte
identical to the placeholder already in the repo (Nguyen Van A / Tran
Thi B) — nothing to update. You confirmed: nothing to do right now,
you'll send the real new-hire list separately when ready.

Worth noting for when you do: `scripts/bulk-create-team.js` is already
idempotent by email — it checks each row's email against `profiles`
first and skips it (logs "profile already exists, skipping") if that
person was already created in a previous run. So re-running the same
file, or a file that's a superset of a previous one, is always safe —
no need to manually strip out people you've already imported.

## 2026-08-03 (12) — data/team-import-template.csv updated with your real team list

Replaced the placeholder rows with the real list you sent (17 rows). Two
things worth flagging before you run this with `--confirm` — I didn't
change them, since I don't know which is actually right:

1. **`duy.dang@vieent.vn` appears 8 times** (rows "Duy2" through "Duy8",
   with "Duy4" listed twice), each with a different name but the exact
   same email. `bulk-create-team.js` is idempotent by email, so this is
   safe in the sense that it won't error or create duplicates — the
   first matching row ("Duy2") creates the account, every row after it
   for that same email gets skipped with "profile already exists,
   skipping." But if these were meant to be 7 different people, only one
   account (named "Duy2") will actually get created — the other 6 names
   are silently dropped. If that's not what you want, fix the emails to
   be unique per person before running with `--confirm`.
2. **"Nh_" (row 4)** — looks like it might be a name that got mangled in
   transit (a Vietnamese diacritic character turning into `_`?). Worth
   double-checking before you hand out that account.

Everything else parses cleanly against the script's rules (role is one
of exc/admin/dev, segment is one of AR/Marketing/OPS/Design and only
required when role isn't dev — Leila's row correctly has no segment
since she's `dev`).

Run a dry run first (no `--confirm`) from the Actions dropdown as
`bulk-create-team` with `file_path` set to `data/team-import-template.csv`
to see exactly what it'll do before committing to it.

## 2026-08-03 (13) — Fix: Summary page's team filter tabs (dev view) did nothing

You flagged (with two screenshots showing AR and Design giving identical
numbers) that the ALL/AR/MARKETING/OPS/DESIGN tabs on `/summary` weren't
filtering at all as a dev.

Root cause: those tabs correctly update `viewTeam` state when clicked,
but the two things that render below it never actually read that state:

- `ticketStatsByType`'s `visibleTypes` was `isDev ? ticketTabs.map(...) : ...`
  — for a dev, that's unconditionally "every ticket type," full stop,
  regardless of which tab was selected. The non-dev branch (which DOES
  correctly filter by team) was simply never reachable once you're a dev.
- `showNewRelease` was `isDev || effectiveTeam !== "Design"` — the
  `isDev ||` meant it was always `true` for a dev even with the Design
  tab active, so the New Release tile never hid the way it does for a
  real Design admin/exc.

Both now key off `effectiveTeam` (which IS `viewTeam` for a dev) instead
of branching on `isDev` at all — clicking AR/Marketing/OPS/Design now
narrows the ticket table to that team's types (matching what a real
admin/exc of that team sees) and hides New Release when Design is
selected; the "All" tab keeps showing everything, same as before.

## 2026-08-03 (14) — Sticky header: the real fix, after two wrong ones

Both previous "fixes" (round 6's `overflowY: "visible"` and round 8's
`overflowY: "hidden"`) were wrong, and this time it was confirmed with
your own DevTools screenshots, not just source review — the CSS was
correctly deployed exactly as described, `top` correctly resolved to
`44px`, nothing was overriding the rule, and it still didn't stick. That
ruled out every deploy/cache explanation and left only one possibility:
the underlying reasoning about the CSS itself was wrong.

It was. Per the CSS Positioned Layout spec (and MDN's own wording),
`position: sticky` sticks to the nearest ancestor with **any** scrolling
mechanism — and `hidden`, `scroll`, and `auto` **all** create one, not
just `auto`. So `overflowX: "auto"` on the table's wrapper `<div>` makes
that div a scroll container no matter what `overflow-y` is set to.
`hidden` doesn't dodge that the way round 8 assumed — there's no
`overflow-y` value that both keeps the horizontal scroll working and
avoids making that div sticky's scroll context. Since the div's own
content is always sized to fit it exactly (nothing was ever asking IT to
scroll — the page was meant to scroll around it), its internal scroll
offset never moves, so the header computes its "stuck" position relative
to a container that's permanently sitting at scroll-offset zero. Not a
z-index problem, not a caching problem — the header genuinely had no
scroll context to stick to.

**The actual fix:** stop fighting that and use it. Every table wrapper
now gets a bounded height (`maxHeight: "70vh"`) and a real, functioning
`overflowY: "auto"` — so once a table's rows exceed that height, the
wrapper itself scrolls internally (a genuine scrollbar), and the header
sticks to `top: 0` — the top of that div's own scrollport, not an offset
borrowed from the page-level TopBar height. `.table th`'s `top` changed
from `var(--topbar-height)` to `0` in `shared.module.css` to match — the
TopBar isn't inside this scrolling region anymore, so there's nothing to
offset by.

**Trade-off worth knowing about:** each table is now its own scrollable
panel (closer to a spreadsheet) instead of the whole page scrolling as
one continuous document. `Pagination` controls were moved to sit right
below each table's scroll box (outside it) in every affected file, so
they stay visible instead of scrolling out of view along with the rows.

Applied across all 9 tables that had this pattern: `app/booking/page.js`,
`app/workstation/{upload,pitching,confirm,pre-release,stream}/page.js`,
`app/artists/page.js`, `app/tickets/{phai-sinh,manual-claim}/page.js`.
`shared.module.css`'s comment above `.table th` was rewritten a third
time with the full history (both wrong attempts, the actual spec
reasoning, and the real fix) so this doesn't get re-broken by a future
"cleanup" of what looks like a stray `maxHeight`.

Thanks for pushing through all the DevTools checks on this one — the
Styles-panel screenshot showing a perfectly correct, unoverridden rule
that still didn't work was what actually cracked it; without that, the
wrong theory would have kept getting reinforced instead of questioned.

## 2026-08-03 (15) — Follow-up: round 14 would have broken every OTHER table

You asked whether the New Release dashboard uses the same sticky
mechanism, since it works there — good question, and it caught a real
regression before it shipped anywhere. The Releases dashboard renders
its `<table>` with **no wrapper `<div>` at all** — it always stuck to the
real page scroll, which is exactly why it always worked and never needed
any of this. Same story for 10 other pages: Summary, the release detail
page, Design/Media Booking/Phụ Lục/Newrelease Upload tickets, Labels,
Milestone, Pitching Info, and the public pick-package page all use the
shared `.table` class with no overflow wrapper either.

Round 14 changed `.table th`'s `top` globally from `var(--topbar-height)`
to `0` — correct for the 9 tables with the new bounded scroll-box
wrapper, but wrong for all 11 of these, since their header sticks to the
real page/TopBar, not an internal scrollport starting at 0. That would
have tucked their sticky header right under (behind) the orange TopBar
instead of below it.

Fixed by scoping the override instead of changing the shared default:
`.table th`'s `top` is back to `var(--topbar-height)` (correct default
for the 11 no-wrapper pages), and a new `.scrollBox .table th { top: 0 }`
rule overrides it just for the 9 tables that have the bounded
scroll-box wrapper — each of those `<div>`s now carries a `scrollBox`
class alongside its inline overflow/maxHeight style specifically so this
selector can target them.

## 2026-08-03 (16) — Fix: round 13 broke the Vercel build (adjacent JSX elements)

Sorry — round 13 shipped a real syntax error. Moving `<Pagination />` to
sit after `</div>` instead of inside it turned each conditional branch
into two sibling JSX elements (`<div>...</div>` followed by
`<Pagination />`) with no single parent wrapping them — invalid JSX,
which is exactly the "Expected ',', got 'page'" error Vercel's build
caught in `app/workstation/confirm/page.js`.

Fixed by wrapping each `<div className={styles.scrollBox}>...</div>` +
`<Pagination />` pair in a React fragment (`<>...</>`) — same 7 files
affected: `app/workstation/{upload,pitching,confirm,pre-release}/page.js`,
`app/tickets/{phai-sinh,manual-claim}/page.js`, `app/booking/page.js`
(confirm's two phases both needed it). Verified this time with
`tsc --jsx react --allowJs --checkJs false` against all 7 files before
sending — zero syntax errors, which is the same class of check that
would have caught this before it reached Vercel.

## 2026-08-04 (17) — New Release: duplicate-DID soft lock, Contract Signed button, Additional Request regroup

Three separate feature requests, all on the New Release create form
and/or the release detail page's Overview tab.

**Duplicate-release soft lock.** `app/new-release/page.js` computes a DID
preview (`didPreview()`) as the user types, but nothing stopped two
releases with the same title+artist initials and release date from both
actually being created — easy to do by accident when re-entering a
product. `handleSubmit` now runs a new `didPrefixFor()` (same
title/artist-initials + release-date computation as `didPreview`, minus
the `-####` placeholder — mirrors `_field_initials()`/`set_release_did()`
in schema.sql exactly) and queries `releases` for any existing `did like
'<prefix>-%'` before inserting. A match pops a modal showing the
duplicate's title/artist/DID/date with two buttons: "Cancel Creation"
(closes the modal, nothing happens) or "Confirm New Creation" (proceeds
with the already-built insert payload via a new `performInsert()`,
extracted out of the old inline `handleSubmit` body specifically so both
the no-duplicate path and the confirmed-duplicate path can call it).
Deliberately a soft lock, not a hard block — legitimate remarketing/
re-release cases exist and shouldn't be impossible to create.

**Label "Contract Signed" button replaces Curve-ID-gated prefix removal.**
Previously, removing labels' auto-added `"HĐ - "` prefix required filling
in Curve ID (`validateLabelNameEdit()` blocked the edit otherwise, and
`app/labels/page.js`'s `updateField()` auto-stripped the prefix the
moment Curve ID got a value). Curve ID is gone from the Label List's
create form, table column, and the release detail page's Label field
entirely (plus the now-dead `labelCurveId` state/fetch effect and its
"Edit in Label List →" link in `app/releases/[id]/page.js`). In its
place: a new `contract_signed boolean` column on `labels` (migration:
`add-label-contract-signed-and-artist-portfolio-url.sql`) and a one-time
"Contract Signed" button per row on the Label List — click it once
(confirm dialog first) and it strips the prefix and sets
`contract_signed = true` in one update; the cell then shows a static "✓
Signed" badge instead of the button. `validateLabelNameEdit()` no longer
takes a `curveId` parameter — it now unconditionally blocks any manual
edit that would drop the prefix, redirecting to the button instead. No
role-gating on the button (matches this page's existing pattern; the
explicit decision was "Direct DB edit only" for corrections, so no
separate dev-reset UI was built either).

**Additional Request regroup.** The old flat "Additional Request" wrapper
title above `<GateFields />` is gone from both call sites
(`app/new-release/page.js` and `app/releases/[id]/page.js`) — the four
group subheadings inside `lib/GateFields.js` are now the only titles,
per the explicit "remove all (like Additional Request) title" ask. New
grouping:

- **Marketing Checklist**: "Artist Info" (renamed from "Profile Artist" —
  same `gate_artist_profile` field; ticking Yes now also reveals a URL
  popup for the artist's portfolio link, new `artist_portfolio_url`
  column, with a hover tooltip — "Add artist portfolio link"), Artist
  Photo. Project Proposal moved OUT of this grid entirely — it's rendered
  separately, directly under each caller's own Metadata Checklist
  section (new exported `GateGrid`/`PROJECT_PROPOSAL_FIELD` from
  `lib/GateFields.js`), to keep checklist-y fields visually separate from
  request-y ones.
- **Data Request**: Pitching (now this group's first field — the "which
  pitching?" detail popup moved to render directly under this grid
  instead of at the very bottom of the whole component), Có Trong Net
  YouTube, "Pre-order Itunes" (relabeled from "Pre-order"), Priority Sync
  Lyric, Music Video on Spotify, Discovery Mode on Spotify, Sony Publish.
- **Marketing Request**: Gói Hỗ Trợ Truyền Thông, Design. Gói Hỗ Trợ
  Truyền Thông is now **read-only** (a status badge, not a toggle) and
  continuously recomputed by a new effect in `app/releases/[id]/page.js`:
  `"update"` (TBU) while `project_type` is still in `PIPELINE_STAGES`
  (BRIEF & DATA/DEALING); `"false"` (NO) once `project_type === "Chỉ
  Phát Hành"` is locked in, unless the INT MEDIA follow-up has been sent
  (`form.int_media_requested`, the existing "Send INT MEDIA Follow-up"
  button); `"true"` (YES) for every other resolved package. Mirrors the
  existing one-time `gate_phu_luc_truyen_thong` auto-flip effect's
  pattern but recomputes on every relevant change instead of firing once
  from a default. On the New Release create form (no live `project_type`
  yet — every release starts in BRIEF & DATA) this just defaults to
  `"update"`.
- **Legal Request**: Splitshare (moved in from Data Request), Phụ Lục MG,
  Phụ Lục Publishing, Phụ Lục Truyền Thông (still read-only, unchanged —
  same auto-flip effect as before).
- **Removed**: the old standalone `gate_legal_request` field (distinct
  from the "Legal Request" *group* name) — dropped from the UI, from
  `lib/GateFields.js`'s field lists, and from `EMPTY_FORM` in
  `app/new-release/page.js`, per the explicit "unused and remove field"
  list.

Migration delivered separately: `add-label-contract-signed-and-artist-portfolio-url.sql`
(adds `labels.contract_signed` and `releases.artist_portfolio_url`; also
folded into `schema.sql` for fresh installs). Verified with
`tsc --jsx react --allowJs --checkJs false` against all 5 touched files
before sending — zero syntax errors.

## 2026-08-04 (18) — Follow-up: Marketing Checklist placement + Marketing Request order

Two small corrections to round 17's regroup, from screenshots:

**Marketing Checklist placement.** Round 17 pulled Project Proposal out
of the Marketing Checklist group on its own, rendering it right under
Metadata Checklist while Artist Info/Artist Photo stayed further down
next to Data Request — a literal read of the original "Project Proposal
-> move this to right under metadata checklist" line, but not what was
meant. Corrected: Project Proposal is back inside
`MARKETING_CHECKLIST_FIELDS` (`lib/GateFields.js`), and the whole
Marketing Checklist group (all 3 fields, with its own subheading) now
renders directly under Metadata Checklist on both `app/new-release/page.js`
and `app/releases/[id]/page.js`, no longer inside `<GateFields>` at all —
`<GateFields>` now starts straight with Data Request. Removed the
now-unnecessary `PROJECT_PROPOSAL_FIELD` single-field export.

**Marketing Request order.** Design and Gói Hỗ Trợ Truyền Thông swapped —
Design now renders first, matching the originally-intended listing order.
Pure display-order change in `MARKETING_REQUEST_FIELDS`, no logic touched.

Verified with `tsc --jsx react --allowJs --checkJs false` against all 3
touched files before sending — zero syntax errors.

## 2026-08-04 (19) — Sidebar order fix, header additions, tab reshuffle, per-workstation notes

Five separate requests.

**1. Khác sidebar position.** Turned out to be real, once pinned down —
`lib/Sidebar.js`'s `navItems` spliced Khác in at a fixed position
(`num: "05"`) BEFORE `AR_NAV` (Artist List/Label List, "06"/"07"), so for
AR users/dev it sat above the artist/label reference shortcuts instead of
below everything. Fixed: `navItems` now builds `[...NAV, ...(showArNav ?
AR_NAV : []), khacItem]` — Khác always last regardless of whether AR_NAV
renders — and every item's `num` is now assigned by final array position
(`String(i + 1).padStart(2, "0")`) instead of being hardcoded per item, so
this stays correct if the nav ever grows. (Tickets index page's ordering,
`app/tickets/page.js`, was already correct — `SHARED_TICKET_TYPES`
appended last — no change needed there.)

**2a. Promotion Package header link.** Added a `LinkPill` for
`form.promotion_package_url` (an existing column, already editable on the
URL tab) next to Link Drive/Smartlink/Magic Link in the release detail
page's header.

**2b. Note panel next to the header.** New `ReleaseNotePanel` component,
same two-pane shape as the notification bell dropdown
(`lib/NotificationBell.js`: fixed-width list left, content right) — left
pane lists all 4 teams (`TEAMS` from `lib/teamTypes.js`), click to
highlight; right pane shows the note. Per explicit decision, this is a
**single shared note** (`releases.brief` — the same field edited at the
bottom of Overview, see below) rather than one note per team, so which
team is selected only changes the highlighted pill, not the content
shown — every team already sees the same note today. Read-only here;
editing happens via Next Step Note on Overview. The header itself is now
a `2fr 1fr` grid: existing header content on the left, this panel on the
right.

**3. Pre-release & Note tab reshuffle.**
- Phụ Lục (Ngày Gửi/Ngày Ký date pair + status line) moved from
  `PreReleaseTab` to `MediaBookingTab` — it's a Booking-side deliverable,
  that tab is where it belongs. `MediaBookingTab` didn't have
  `update`/`onSave`/`saving` wired in before (it was 100% read-only) —
  added those props plus a `SaveBar`, both at the component and its call
  site.
- Next Step Note (`releases.brief` textarea) moved from `PreReleaseTab`
  to the very bottom of `OverviewTab`, right before its `SaveBar` — same
  field shown read-only in the new header note panel (2b above).

**4. Musixmatch URL on the URL tab.** Added `["musixmatch_link",
"Musixmatch URL"]` to `UrlTab`'s `urlFields` array — same `UrlField`
pattern as every other URL there. This is a genuinely new edit surface on
the detail page (the field was previously only editable on the
Pre-release Workstation, and shown read-only in Pre-release & Note) — the
Workstation's own edit surface is untouched.

**5. Note column per workstation.** Added an independent (not shared
with any other field) Note column to Pitching (`pitching_note`), Confirm
(`confirm_note` — same field, shown in both Phase 1 and Phase 2 tables),
Pre-release (`pre_release_note`), and Booking Board (`booking_note`, a
fixed column next to Result so it doesn't shift around with the
Hạng-Mục-dependent dynamic columns). Deliberately **not** touched:
- **Upload** already has a Note affordance (the 📝 button bound to
  `releases.brief`, same field as Next Step Note) — left as-is rather
  than converted, since that popup also edits linkshare timing and
  rebuilding it risked regressing that unrelated feature.
- **Stream** already has its own note column
  (`release_stream_metrics.stream_note`, pre-existing) — nothing to add.
- **Milestone** has no per-release row table to attach a note to (its
  tables are keyed by chart entry, not by release) — skipped.
- **Package Price** is still an unbuilt placeholder page — skipped.

Migration delivered separately: `add-round19-notes-and-header-fields.sql`
(adds `releases.pitching_note`/`confirm_note`/`pre_release_note`/
`booking_note`; also folded into `schema.sql`). Verified with
`tsc --jsx react --allowJs --checkJs false` against all 6 touched files
before sending — zero syntax errors.

## 2026-08-04 (20) — Follow-up: Upload Note relabel + Streaming's real auto-composed note

Two corrections to round 19's item 5, from explicit feedback.

**Upload Note relabel.** The existing Upload workstation note (📝 button,
bound to `releases.brief`) is deliberately different from the new
independent Note columns — per feedback, just needed a clearer label so
it doesn't read as the same thing. `app/workstation/upload/page.js`'s
table header changed from "Note" to "Upload Note", and the button's hover
title from "Note — ..." to "Upload Note — ...". No behavior change.

**Streaming's real note.** Turns out `stream_note` (the plain free-text
field already on `release_stream_metrics`) isn't what was meant by
"streaming note" at all — the team has a Google Sheets formula that
*computes* a note straight from a row's own metric columns (Spotify/
Tiktok views+creations/Youtube/Youtube Music/Zing/NCT), formatted with
K/M/B suffixes. Ported that formula literally into a new
`buildStreamNote(m)` in `lib/releaseNotes.js` (full LET/LAMBDA source
kept in a comment above it for reference) — same K/M/B rounding, same
line order, same "blank if all 6 current-metrics are zero" gate, and the
same quirk where the Tiktok creations suffix still appends even if the
Tiktok views line itself is blank (kept exactly as the sheet computes it,
not "fixed").

This is offered as a **preview**, not an auto-fill — `stream_note` itself
stays exactly as it was (plain input, edited on blur, never touched by
this). `StreamTable`'s Note cell in `app/workstation/stream/page.js` now
has a small "▸ Auto note" toggle underneath the input; opening it shows
the live-computed text for that row with a "Use this" button that copies
it into the field. Nothing fires automatically — a manually-typed note
is never silently overwritten by a metrics change.

No schema change this round (`buildStreamNote` is pure computation over
already-loaded metric columns). Verified with
`tsc --jsx react --allowJs --checkJs false` against all 3 touched files
before sending — zero syntax errors.

## 2026-08-05 (21) — Labels overhaul, Booking Board Community + numbers, Tasklist team grouping, MV type field

Five items this round.

**1. Labels reference table overhaul.**
- **Hợp Tác**: converted from free text to a multi-select pill tag picker
  (Youtube / Publishing / Nhạc Số — `lib/pickerOptions.js`
  `LABEL_HOP_TAC_OPTIONS`, rendered by the new `TagPicker` component local
  to `app/labels/page.js`). Old free-text data is preserved, not
  discarded: `labels.hop_tac` (text) was renamed to `hop_tac_legacy` and a
  new `labels.hop_tac` (`text[]`) took over the name — see
  `add-round21-labels-hop-tac.sql`.
- **PIC → "Thời gian hoạt động gần nhất"**: the old free-text PIC field is
  gone from the create row entirely and the table column is relabeled.
  The value is no longer hand-entered — it's auto-computed from each
  label's own releases (latest `release_date` year, matched by the
  denormalized `releases.label` text) and **persisted** to the
  pre-existing `labels.latest_activity_year` column on every page load
  (`syncLatestActivityYears()`, same "auto-sync on load" pattern as the
  Stream Workstation's metrics rows — only writes rows whose stored year
  is actually stale). Per explicit decision, persisted rather than
  display-only, so other queries/exports can rely on it.
- **Phân Loại**: converted from free text to a single-choice select
  (Priority / New / Collab before — `LABEL_PHAN_LOAI_OPTIONS`), using the
  new shared `lib/PickSelect.js` (extracted from the Pre-release
  Workstation's existing unrecognized-value-flagging pattern — a stored
  value that doesn't match the fixed list shows as its own flagged
  "(unrecognized — pick to fix)" option instead of rendering blank).
- **Genre** (new field, takes the create row's freed-up PIC slot):
  single-choice select sourced from `lookup_options` where
  `category = 'genre'` (the same lookup list New Release's own Genre
  field and the release detail page already use). Bound to
  `labels.the_loai` — this column already existed in the schema, unused;
  reused instead of adding a redundant new one.
- Release detail page (`app/releases/[id]/page.js`): the label's Hợp Tác
  tags are now shown read-only, directly below the Label field, in the
  space Curve ID used to occupy (fetched by `label_name` on load).

**2. Booking Board — Community uses the Channel+URL combo.** Hạng Mục
"Community" columns now carry a `subchannelType` (platform-named) instead
of a fixed `platform`, the same shape TikTok Channel already used — so
each column shows a Channel Name input alongside the URL input, not just
a bare URL field. `BrandCell`'s platform-matching logic
(`matchPlatform`) updated to fall back to `subchannelType` when
`column.platform` isn't set.

**3. Booking Board — thousand separator on Quantity.** Package preview
popup's Quantity cell now renders with `.toLocaleString("en-US")`
(comma-grouped). Deliberately left the Amount column's existing `vi-VN`
dot-separated currency formatting untouched — different fields, was
already correct for its own convention.

**4. Tasklist tab — grouped by team.** `TasklistTab` on the release
detail page now renders one subheaded table per team (AR / Marketing /
OPS / Design order, empty groups hidden) instead of one flat list. This
is a **best-guess mapping** — flagged in a comment above the function —
since most Tasklist rows turned out to be OPS-owned (16 of 18: all
metadata, Smartlink/UPC/Link LBM/Link Share, all three pitching
platforms, CANVAS status, Artist Pick status, Musixmatch) with only Link
Drive (AR) and Media Booking entries (Marketing) landing elsewhere;
Design has none currently. Please flag any row that's mapped to the
wrong team.

**5. MV type conditional field.** Ticking the Metadata Checklist's "MV"
toggle (`meta_mv`) to Yes now reveals a single-choice select right below
it — LYRIC / Đã có / Chưa có / Không có (`lib/pickerOptions.js`
`MV_TYPE_OPTIONS`) — on both the New Release create form and the release
detail page's Overview tab. Per explicit clarification this is bound to
`releases.canva_status`, the same column the Pre-release Workstation's
**"MV"** column already edits (not the literally-named
`canva_mv_status`, which is a different column labeled "CANVA" there —
see the existing comment in `app/workstation/pre-release/page.js` about
this naming swap). `MV_TYPE_OPTIONS` was pulled out to
`lib/pickerOptions.js` so the Pre-release Workstation and these two new
call sites can't drift out of sync.

New shared files this round: `lib/pickerOptions.js` (small option lists
reused across pages), `lib/PickSelect.js` (unrecognized-value-flagging
single-select, generalized out of the Pre-release Workstation).

Migration delivered separately: `add-round21-labels-hop-tac.sql` (renames
`labels.hop_tac` → `hop_tac_legacy`, adds new `labels.hop_tac text[]`;
also folded into `schema.sql`). `labels.the_loai`, `labels.phan_loai`,
and `labels.latest_activity_year` already existed and needed no schema
change. Verified with
`tsc --jsx react --allowJs --checkJs false --skipLibCheck` plus a
brace/paren/bracket balance check against all 7 touched files before
sending — zero errors.

## 2026-08-05 (22) — Contract Signed at creation, new MV options, Booking Board round counters

**1. Contract Signed at label creation.** The Labels create row now has a
"Contract Signed" checkbox. Ticking it before submitting skips the
"HĐ - " prefix entirely (and sets `contract_signed: true` on insert), so
there's no longer a separate step of adding the label, then clicking the
table row's "Contract Signed" button afterward — same end result, one
step instead of two. Unticked behaves exactly as before (prefix added,
`contract_signed` false).

**5. MV type options replaced.** `MV_TYPE_OPTIONS`
(`lib/pickerOptions.js`) changed from LYRIC/Đã có/Chưa có/Không có to the
new set: Full / Lyric / Visualization, per explicit request. All three
call sites (Pre-release Workstation's "MV" column, New Release's and the
release detail Overview tab's conditional MV-type field) already used or
were switched to the shared `PickSelect` component, so any release still
holding an old option value shows up flagged as
"(unrecognized — pick to fix)" instead of silently rendering blank — no
data is hidden by the option-list change.

**New: Booking Board round counters.** The three status-based stat cards
(Done / Đang Booking / Chưa Booking) are replaced with per-round release
counts: INT, Đợt 1, Đợt 2 — same round-membership rules
`roundFilteredReleases` already used (INT = INT-media project type; Đợt 1
= any other real project type; Đợt 2 = has Đợt 2 targets set), just
computed for all three rounds at once instead of only the currently
selected one, so all four cards (Tổng Releases + the three round counts)
show together regardless of which round tab is active.

Verified with `tsc --jsx react --allowJs --checkJs false --skipLibCheck`
plus a brace/paren/bracket balance check against all 5 touched files
before sending — zero errors. No schema change this round.

## 2026-08-05 (23) — Contract Signed create-row button style

Small follow-up to round 22's item 1: the "Contract Signed" toggle on the
Labels create row is now a button styled like the table row's own
"Contract Signed" button (`styles.btnSmall` — orange outline, uppercase)
instead of a plain checkbox, per explicit request. It's a real toggle
(click to flip), with an active fill (orange background + border) when
on so the state reads at a glance — the row's version is a one-time
action button, not a toggle, so this one needed its own active/inactive
styling rather than reusing that logic outright. Behavior (skips the
"HĐ - " prefix on insert when on) is unchanged from round 22.

Verified with `tsc --jsx react --allowJs --checkJs false --skipLibCheck`
plus a brace/paren/bracket balance check before sending. No schema
change.

## 2026-08-05 (24) — Data Request field tickets + Legal team

The big one: every request-tick field on the release detail page's Data
Request / Marketing Request / Legal Request groups now has (or links to)
its own ticket, per explicit request. New team: **Legal**.

**New team: Legal.** Added to `lib/teamTypes.js` `TEAMS`, plus the two
places that duplicated the team list as a local hardcoded const instead of
importing it — `app/config/page.js` (Team picker on profile
create/reassign) and `lib/TopBar.js` (dev "View As" switcher). No DB
migration needed for this part — `profiles.segment` is a plain text
column, not an enum.

**Already-have fields — no action, per explicit instruction:**
- **Design** (`gate_design`) — already has its own ticket type
  (`design`, executor Design), own page (`app/tickets/design`).
- **Gói Hỗ Trợ Truyền Thông** (`gate_goi_ho_tro_truyen_thong`) — already
  the `media_booking` ticket + magic-link package flow.

**Pitching — "moved to the ticket system."** The `pitching` ticket
already existed (auto-created when a DSP is requested) and
`tickets.status`/`status_log` already exist as real columns on every
ticket type — so per the explicit note ("I think just add the column
status and we done"), this really was mostly a UI gap, not new schema.
Added the dedicated ticket list page that was previously missing
(`app/tickets/pitching/page.js` — `TICKET_ROUTES.pitching` used to fall
back to `/tickets` if visited directly). It's deliberately narrow: overall
**Status** (editable, with the same timestamped `status_log` history
every ticket type already uses) and **PIC** (`tickets.pic_profile_id` —
the "OPS executive" seat) only. Per-DSP work (Priority/Spotify/NCT/Zing)
stays exactly where it was, on the Pitching Workstation — this page
doesn't duplicate it. The "Which pitching?" picker on the release detail
page now links out to this new list.

**Ten new placeholder ticket types** — one per remaining field, each
executor/requester pair exactly as specified, fields deliberately minimal
(DID + a Note) per the explicit "leave blank" instruction — flesh out per
type as follow-up rounds cover them individually:

- **OPS-executed** (Data Request group): Có Trong Net YouTube, Pre-order
  Itunes, Priority Sync Lyric, Music Video on Spotify, Discovery Mode on
  Spotify, Sony Publish.
- **Legal-executed** (Legal Request group): Splitshare, Phụ Lục MG, Phụ
  Lục Publishing, Phụ Lục Truyền Thông.

Each is a thin config entry in `lib/ticketConfigs.js` (requesterTeam AR)
plus a 6-line list + 6-line create-form page reusing the generic
`TicketListPage`/`NewTicketPage` engine (same pattern as Report Conflict,
Stream Update, etc.) — genuinely minimal, matching the request. Splitshare
is a separate tracking ticket from the existing inline % / Shared Label /
Scope entries editor already on the Legal Request group — that editor is
untouched.

**Release detail page wiring.** Once a mapped gate field is ticked "Yes"
(or, for the one read-only auto-computed field, Phụ Lục Truyền Thông,
once it auto-flips), a small "Send Ticket" button appears right under the
toggle — click once to create the ticket (idempotent), after which it
becomes a "✓ Ticket Sent — View" link straight to that ticket's list page.
One batched query on page load fetches all 10 types' existing tickets for
this release at once (`lib/GateFields.js` `GATE_TICKET_TYPES` map +
`app/releases/[id]/page.js`'s `gateTicketMap`/`sendGateTicket`), rather
than 10 separate round trips.

Migration delivered separately:
`add-round24-legal-team-and-gate-tickets.sql` — adds `ticket_tabs.
executor_team` (if missing), inserts the 10 new `ticket_tabs` rows (+
matching `entity_field_groups` "Info" tabs), and backfills `executor_team`
for the pre-existing types that didn't already have it, all via
idempotent `if not exists`/`on conflict do nothing`/`coalesce()` so it's
safe to run regardless of what the live DB already has. Also folded into
`schema.sql`. **Note:** per an earlier architecture check, `schema.sql`
was already missing 6 `gate_*` columns
(`gate_mv_spotify`/`gate_discovery_mode_spotify`/`gate_sony_publish`/
`gate_phu_luc_mg`/`gate_phu_luc_publishing`/`gate_phu_luc_truyen_thong`)
that the app already reads/writes — those aren't new this round, but the
migration file includes a commented-out `add column if not exists` block
for them in case the live DB is ever missing one.

Verified with `tsc --jsx react --allowJs --checkJs false --skipLibCheck`
plus a brace/paren/bracket balance check against all 28 touched/created
files before sending — zero errors.

## 2026-08-05 (25) — Pre-order Itunes ticket built out, Pitching DSP auto-status, note panel drops Design

**1. Pre-order Itunes ticket — fully built out (was a round-24 placeholder).**
- Auto-created the moment `gate_pre_order` is ticked "Yes" on the New
  Release create form (mirrors the existing Pitching/Artist Profile
  auto-send pattern) — no manual "Send Ticket" click needed at creation
  time. Toggling it "Yes" later, from the release detail page, still works
  too (round 24's generic "Send Ticket" button, unchanged).
- Rebuilt as a bespoke page (was the generic `TicketListPage`) —
  `app/tickets/pre-order-itunes/page.js`. Executor (OPS) view: 4 status
  tabs only — Request/Process/Complete/Refund, no Cancel (custom
  `status_options` on this type's `ticket_tabs` row). Rows match the
  Pitching ticket list's shape (Request Date/Release/PIC/Status).
  Requester (AR) view: same flat list, no status tabs — standard dual-view
  default, nothing special needed there.
- Clicking a row opens a popup: "Pre-order Itunes ticket" title top-left,
  two external-link buttons underneath (**Itunes convert** →
  vieent.com/en/ituneslink, **linkfire** → Linkfire dashboard, both open
  in a new tab), release info, then **Link LBM** and **Link Preorder** —
  both real `releases` columns (`link_lbm`, `link_preorder`), same ones
  the URL tab and Upload Workstation already read/write, not ticket data.
  Status is also editable here (executor only).
- **Link Preorder's column removed from the Upload Workstation table** —
  it's edited from this ticket's popup now instead, one surface instead of
  two. Link LBM's own Upload Workstation column is untouched (it's shared
  infrastructure — Confirm Workstation's Phase 1 completion also depends
  on it — removing it there felt riskier than the request called for; flag
  if it should come out too).

**2. Priority Sync Lyric — skipped this round.** The request text for item
2 was an exact copy of item 1's (same "Pre-order Itunes ticket" title,
same LBM/Preorder fields, same iTunes/Linkfire buttons) — clearly a
paste-over, not the real spec for this type. Left as the round-24
placeholder; send the real spec whenever you're ready for this one.

**3. Pitching ticket — DSP status now auto-syncs from the ticket.** The
Pitching Workstation's popup already only showed tabs for the DSPs
actually requested (no change needed there — was already filtering on
`ticket.data[type]`). New this round: each DSP's status column on the
release now auto-follows the ticket's requested-flags + overall status,
computed on every Pitching Workstation page load (same "auto-sync on
load" pattern as the Stream Workstation's metrics rows):
- Not requested at all → the DSP's own "won't do" value (Priority/Spotify:
  "Không thực hiện"; NCT/Zing: "Không hỗ trợ" — their vocab has no exact
  "Không thực hiện" equivalent, this is the closest same-bucket value).
- Requested, ticket ticket status not yet PROCESS → "Chưa thực hiện".
- Requested, ticket status IS PROCESS → "Đang thực hiện" for
  Priority/Spotify. NCT/Zing have no "in progress" option in their own
  vocab (`NCT_ZING_OPTS` has no such value) — they stay at "Chưa thực
  hiện" until OPS picks a real value by hand; flag if NCT/Zing should get
  an in-progress option added to support this properly.
Only ever touches a column that's currently blank or still one of these
same auto-managed pre-work values — a real in-progress pick or a
completed one ("Đã pitching"/"Có gói") is never silently overwritten.

**4. Note panel — Design removed from the team list.** The release detail
page's header note panel (team list left / note content right, from round
19) no longer shows Design as a pickable team — display-only filter
local to that one component; Design still exists as a real team
everywhere else (its own ticket type, TEAMS, etc.).

Migration delivered separately: `add-round25-preorder-4-statuses.sql`
(narrows Pre-order Itunes's `ticket_tabs.status_options` down to the 4
requested values — idempotent). Also folded into `schema.sql`. Everything
else this round is app-layer only, no schema change. Verified with
`tsc --jsx react --allowJs --checkJs false --skipLibCheck` plus a
brace/paren/bracket balance check against all 5 touched files before
sending — zero errors.

## 2026-08-05 (26) — Priority Sync Lyric built out, Pre-release Workstation width

**Priority Sync Lyric — fully built out** (round 24's placeholder, round
25 skipped it since that request's text was a copy of Pre-order Itunes's).
- Auto-created the moment `gate_lyric_musixmatch` is ticked "Yes" on the
  New Release create form — same pattern as Pitching/Artist
  Profile/Pre-order Itunes.
- Rebuilt as a bespoke page (`app/tickets/priority-sync-lyric/page.js`,
  was the generic `TicketListPage`). Executor (OPS) view: same 4 status
  tabs as Pre-order Itunes — Request/Process/Complete/Refund, no Cancel.
  Requester (AR) view: flat list, no tabs, standard dual-view default.
- **No popup this time** (unlike Pre-order Itunes) — columns are inline on
  the row, matching the Pre-release Workstation's layout: Release info,
  Link LBM (plain hyperlink, view-only — edited from Pre-order Itunes's
  ticket or the Upload Workstation, not here), Musixmatch Status,
  Musixmatch Link, PIC, Status. Musixmatch Status/Link edit the exact same
  `releases.musixmatch_status`/`musixmatch_link` columns the Pre-release
  Workstation already shows — same DB column, so a change here shows up
  there immediately and vice versa, no sync code needed.

**Pre-release Workstation — width tweaks (unrelated, per explicit note).**
The sticky "Release info" column now has a 260px minimum width (up from
unconstrained/content-driven) with the artist/DID/date line forced to one
line (`whiteSpace: nowrap`) instead of wrapping — the DID no longer bleeds
onto a second line. The page's own container widened from 1300px to
1600px, and the table's minimum width from 1100px to 1300px, so the
scrollable table area has more room before horizontal scrolling kicks in.

Migration delivered separately:
`add-round26-priority-sync-lyric-4-statuses.sql` (narrows Priority Sync
Lyric's `ticket_tabs.status_options` to the 4 requested values —
idempotent). Also folded into `schema.sql`. Everything else this round is
app-layer only. Verified with
`tsc --jsx react --allowJs --checkJs false --skipLibCheck` plus a
brace/paren/bracket balance check against all 3 touched files before
sending — zero errors.

## 2026-08-05 (27) — Phái Sinh column layout, Music Video on Spotify built out

**1. Phái Sinh ticket — column width/layout only, no new columns.**
- Widened a lot: Type, Label, Tên Bài, Artist, Contributor, Release, PIC.
- Widened a little: Tác Quyền.
- Narrowed a lot: URL (down to ~70-90px).
- **Related DID moved out of its own column**, into the Tên Bài cell as a
  second stacked input right below the title — the row was already
  several lines tall (Artist/Contributor groups), so this reclaims a
  whole column's worth of width instead of adding to the row height.
- **New pill tags under Type**: "Publishing" / "Splitshare", shown when
  the related DID's own release has that gate field ticked "Yes" —
  assumed `gate_phu_luc_publishing` and `gate_split_share` respectively
  (flag if a different field was meant). One batched query looks up all
  referenced related-DID releases at once.

**2. Music Video on Spotify — fully built out** (round 24 placeholder).
- Auto-created on `gate_mv_spotify` = "Yes" at New Release creation, same
  pattern as Pre-order Itunes/Priority Sync Lyric/Pitching.
- Bespoke page (`app/tickets/mv-spotify/page.js`), same 4-status executor
  view (Request/Process/Complete/Refund) as the other two new ticket
  types this round.
- Row layout matches the Upload Workstation: Release info, Link LBM
  (view-only hyperlink), Link Drive (view-only hyperlink, with **MV
  status right underneath it as a second line** — `releases.canva_status`,
  the same Full/Lyric/Visualization field the Pre-release Workstation's
  "MV" column and the New Release/Overview conditional field already
  edit), **Spotify MV Link** (new `releases.spotify_mv_link` column — this
  ticket is its only editor), and **Note** — intentionally kept as
  `ticket.data.note` rather than a releases column, per explicit "no link
  to anywhere," so it only ever shows up on this one ticket, nowhere else.

Migration delivered separately:
`add-round27-mv-spotify-and-phai-sinh.sql` (adds
`releases.spotify_mv_link`, narrows Music Video on Spotify's
`ticket_tabs.status_options` to the 4 requested values). Also folded into
`schema.sql`. Phái Sinh's changes are app-layer only. Verified with
`tsc --jsx react --allowJs --checkJs false --skipLibCheck` plus a
brace/paren/bracket balance check against all 3 touched files before
sending — zero errors.

## 2026-08-05 (28) — Pre-release Workstation: explicit 3-line Release info

The sticky "Release info" column now renders as three explicit lines —
Name / Artist & DID / Release date + time — instead of the title plus one
run-on line combining artist, DID, date, and time. Same 260px column
width from round 26, just split so each line is short and never wraps.

App-layer only, no schema change. Verified with
`tsc --jsx react --allowJs --checkJs false --skipLibCheck` plus a
brace/paren/bracket balance check before sending — zero errors.

## 2026-08-05 (29) — Filter out already-ticketed releases from manual "New Ticket" forms

Since a lot of ticket types can now be auto-created from the New Release
dashboard (ticking a gate field "Yes") AND also created manually from the
ticket page's own "New Ticket" form, it was possible to accidentally create
a second ticket for a release that already had one. Per explicit request,
went with "filter out" over "hide the button" — the release just doesn't
show up as a pickable option once it already has a ticket of that type.

- New `oneTicketPerRelease: true` flag added to `lib/ticketConfigs.js` on
  every type that can be both auto-created and manually created: Artist
  Profile, Có Trong Net YouTube, Pre-order Itunes, Priority Sync Lyric,
  Music Video on Spotify, Discovery Mode on Spotify, Sony Publish,
  Splitshare, Phụ Lục MG, Phụ Lục Publishing, Phụ Lục Truyền Thông.
  (Note: Artist Profile's manual form has no release-picker field at all —
  its fields are artist name/email/etc, not tied to a specific release —
  so the flag is inert there for now; flagging in case Artist Profile's
  form is later given a release field.)
- `lib/NewTicketPage.js` (the generic create-form engine) now reads that
  flag: when set, it fetches every non-deleted ticket of that type's
  `data.releaseId` values on load and passes them to `ReleasePicker` as
  `excludeDids`, so an already-ticketed release simply doesn't appear in
  the search results. Also added a belt-and-suspenders re-check right
  before insert (same pattern Media Booking already used) that blocks the
  submit with a clear error if a duplicate slipped in via a race (e.g. an
  auto-ticket landing in the gap between the form loading and submitting).
- `app/tickets/phu-luc/new/page.js` (Phụ Lục's own bespoke form — not on
  the generic engine, and normally auto-created from the pick-package
  magic link flow) got the equivalent treatment by hand: releases with an
  existing non-deleted Phụ Lục ticket are filtered out of its own inline
  search, plus the same pre-insert re-check. Note Phụ Lục stores
  `data.releaseId` as the release's UUID (a pre-existing convention
  difference from every other type here, which stores the DID) — the
  filter logic matches that, not the DID-based one.
- Media Booking's `/new` page already had this exact pattern from before —
  untouched, no regressions there.

App-layer only, no schema change. Verified with
`tsc --jsx react --allowJs --checkJs false --skipLibCheck` plus a
brace/paren/bracket balance check on all three edited files before
sending — zero errors.

## 2026-08-05 (30) — Gate tickets auto-send on Save, OPS split into 3 sub-teams, Sony Publish built out

Three bundled changes this round.

**Gate tickets fold into Save, no more manual "Send Ticket" click.** The Data Request/Marketing Request/Legal
Request sub-tickets (Có Trong Net YouTube, Pre-order Itunes, Priority Sync Lyric, Music Video on Spotify,
Discovery Mode on Spotify, Sony Publish, Splitshare, Phụ Lục MG/Publishing/Truyền Thông) used to need a
separate "Send Ticket" click after ticking a gate field to "Yes" and saving. That button read straight off
local (unsaved) form state, so clicking it before Save created a ticket referencing a gate field that hadn't
actually been persisted yet — a real bug. Now `saveTab()` in `app/releases/[id]/page.js` creates any missing
gate ticket the moment the release write itself succeeds — same idempotent-on-save pattern Pitching/Artist
Profile already used. Uses a new `gateTabsMap` state (ticket_tabs id/default_status per type, fetched once on
load alongside the existing `gateTicketMap`) instead of a fresh `ticket_tabs` lookup per type, so this adds
**zero extra reads per save** — only a write for whichever types are newly "Yes" and don't have a ticket yet,
addressing the read/write-rate concern raised before implementing. `lib/GateFields.js`'s `GateTicketLink` is
now display-only — green "✓ Ticket Sent — View" once a ticket exists, otherwise a muted "Ticket sends on Save"
hint instead of a clickable button.

**OPS split into Youtube/Publishing/Operation.** New team list: AR, Marketing, Design, Youtube, Publishing,
Operation, Legal — OPS itself is hidden from the config page's profile create/reassign dropdown and the dev
"View As" switcher, per explicit request. It still exists everywhere else (ticketConfigs.js's `executorTeam`,
`TEAM_TICKET_TYPES`/`TEAM_WORKSTATION_TYPES`, `notDoneCounts.js`, `ticket_tabs.executor_team`) as a hidden
aggregate representing the union of the three real sub-teams — used for ticket-type ownership/routing and for
counting/reporting/summarizing (Summary page's dev tab picker shows one combined "OPS" tab via the new
`REPORTING_TEAMS` export, not three separate ones). New `lib/teamTypes.js` exports: `OPS_SUB_TEAMS`,
`isOpsTeam()`, `resolveTeamKey()`, `isExecutorSegment()`, `REPORTING_TEAMS`. Every place that used to compare
`segment === "OPS"` directly now goes through one of these — `lib/TicketListPage.js`'s dual-view check,
`lib/notDoneCounts.js`'s dual-view check, `lib/workstationHelpers.js`'s `filterProfilesByTeam` (used by all 4
OPS-team PIC dropdowns), `lib/teamTypes.js`'s `typesForTeam` (sidebar/switcher visibility), and the 6 bespoke
ticket pages' own `isExecutorView` checks (Pitching, Phái Sinh, Music Video on Spotify, Manual Claim,
Pre-order Itunes, Priority Sync Lyric — plus the new Sony Publish page uses it from the start). Legal is
completely untouched, per explicit confirmation. Migration: `update profiles set segment = 'Operation' where
segment = 'OPS'` — every existing OPS profile migrates to Operation as a one-time default; reassign anyone who
should actually be Youtube or Publishing by hand afterward. **Flagged risk, not fixable from here:** if a
DB-side trigger or the `fanout_notification()` RPC (neither is defined in `schema.sql` — same gap flagged back
in round 24) resolves "notify team OPS" by literally matching `profiles.segment = 'OPS'`, those notifications
could silently stop reaching anyone once this migration runs, since no profile will have that literal value
anymore. Please verify against the real function/trigger definition in production.

**Sony Publish built out.** Special-cased, unlike every other gate-linked type: it only auto-creates once the
4 required Metadata Checklist fields (Audio/Artwork/Lyric/Metadata doc) are ALL filled in — both at New
Release creation (`app/new-release/page.js`, rarely satisfied that early since the checklist is usually filled
in afterward) and on every subsequent Save on the release detail page (same "loop until ready" idea as the
generic gate tickets, just gated on metadata instead of just existence). The moment it fires, it ALSO sends
the release to the Upload workstation — a `newrelease_upload` ticket + `requested: true` — same effect as the
SEND UPLOAD button, deliberately without the Priority Pitching shortcut or Media Booking cascade (neither was
asked for). Before it's ready, the release detail page shows a warning ("⚠ Not enough data to upload yet…")
instead of the generic "Ticket sends on Save" hint. The ticket's own list page (`app/tickets/sony-publish`,
fully bespoke) is laid out like the Upload Workstation: Release info / Link LBM / UPC / ISRC (releases.isrc
already existed as a column — Priority Pitching's supplement field — but had no editable UI anywhere until
now) / PIC / Status, all editable from here. Once a release has a Sony Publish ticket, its Upload Workstation
and Pre-release Workstation rows lock — per explicit confirmation, this means the fields actually become
non-interactive, not just visually greyed. Implemented as a new shared `lib/SonyPublishLockRow.js` (a single
spanning cell replaces the row's normal content — a true absolutely-positioned overlay would fight with these
tables' sticky first column) + `lib/useSonyPublishDids.js` (one batched fetch, not per-row) used by both
workstations. Clicking the grey watermark banner ("Sony Publish — no task here required for this product")
opens the Sony Publish ticket. Migration: `ticket_tabs.sony_publish` narrowed to the same 4 statuses
(REQUESTED/PROCESS/COMPLETE/REFUND) every other Data Request sub-ticket type uses.

Migration: `add-round30-ops-sub-teams-and-sony-publish.sql`. Verified with
`tsc --jsx react --allowJs --checkJs false --skipLibCheck` plus a brace/paren/bracket balance check across
every edited/new file before sending — zero errors.

## 2026-08-05 (31) — Artist Profile revised, Splitshare/Phụ Lục MG/Phụ Lục Publishing built out, Phụ Lục Truyền Thông rename

**Phụ Lục Truyền Thông retired, merged into the real Phụ Lục.** Confirmed with the user: it was never a
separate ticket type, it IS the existing Phụ Lục ticket (auto-created from the pick-package magic-link flow).
`ticket_tabs.phu_luc.label` relabeled to "Phụ Lục Truyền Thông" (route/data/behavior otherwise untouched); the
`phu_luc_truyen_thong` placeholder type from round 24 — its config block, `/tickets/phu-luc-truyen-thong`
wrapper pages, `TICKET_TYPE_LABELS`/`TICKET_ROUTES`/`TEAM_TICKET_TYPES` entries — is fully removed.
`gate_phu_luc_truyen_thong`'s "Send Ticket" affordance (`GATE_TICKET_TYPES` in `lib/GateFields.js`) now points
at the real `phu_luc` ticket type for display purposes only — it's excluded from the round-30 generic
auto-create-on-Save loop (same exclusion mechanism as Sony Publish, different reason): Phụ Lục tickets need
real data from the magic-link flow, an empty auto-created placeholder would be wrong. Legal's ticket switcher
gains `phu_luc` (it had `phu_luc_truyen_thong` before, this keeps that visibility under the real name).
Migration soft-deletes any tickets that may already exist under the retired `phu_luc_truyen_thong` key —
flagged as a real possibility since round 30's generic gate-ticket-on-Save logic would have started
auto-creating them the moment `gate_phu_luc_truyen_thong` next flipped "Yes" (which happens automatically,
not by hand) on any Save, in the window between round 30 shipping and this round retargeting it.

**Splitshare, Phụ Lục MG, Phụ Lục Publishing built out.** All three: auto-created at New Release creation now
(added matching blocks to `app/new-release/page.js`'s `performInsert()` — previously only reachable via the
release detail page's manual Send Ticket/Save flow), Legal-executor/AR-requester dual view with the same 4
statuses (REQUESTED/PROCESS/COMPLETE/REFUND) as every other Data/Legal Request sub-ticket. Splitshare
(`app/tickets/split-share/page.js`, bespoke) has its own short field set per explicit request — Release / PIC
/ Status / Ngày Set (hand-edited date) / Ngày Hoàn Thành (NOT hand-edited — `updateStatus()` stamps today's
date the moment status becomes COMPLETE, and clears it back to null the moment it's taken back out of
COMPLETE). Phụ Lục MG and Phụ Lục Publishing share a new `lib/PhuLucStyleTicketList.js` component — "reuse the
current Phụ Lục template, just add the name next to each column to differentiate them" — same columns as the
original Phụ Lục ticket (Ngày Order / Release / Giá Trị PL / Mã PL / PIC / Status / PL Status / Link Phụ Lục /
Ngày Gửi / Ngày Ký, PL Status computed the same way), labels suffixed "(MG)"/"(Publishing)", plus the dual-view
+ 4-status-tab layer the original Phụ Lục never had. Unlike the original (which owns real `releases` columns
for link/ngày Gửi/ngày Ký), these two store everything in `tickets.data` — they don't have dedicated release
columns of their own.

**Artist Profile revised** (`app/tickets/artist-profile/page.js` — converted to a bespoke page; the generic
`TicketListPage` engine only ever renders the first 4 `config.fields` as columns and has no concept of a
view-only field, neither works for what this round needed):
- Bài Hát Phát Hành Gần Nhất is now view-only in the table — "computed, not an input field" — no input
  rendered for it at all (still whatever value the ticket already has, just never editable from here).
- New Note column, placed before Deadline.
- New "set up on which platforms" Spotify/Tiktok/Apple picker — "show to pick like the pitching field," same
  checkbox-group idiom as Pitching's "Which pitching?" block. Lives in `lib/GateFields.js` as
  `ARTIST_PROFILE_PLATFORMS`, rendered in `GateFields` right after Pitching's own block (both the New Release
  dashboard and the release detail page — `artistProfileTypes`/`onArtistProfileToggle` threaded through both,
  same `*TypesDraft` pattern Pitching already used), and shown as checkboxes in the ticket table itself
  (executor-editable, view-only badges for the requester side).
- Two new external-link buttons — Spotify for Artists / Apple Music for Artists — reading their URLs from a
  new Config page section ("Artist Profile Links" tab, **not** dev-only since "3rd party sometime change their
  url" is exactly the kind of thing an exc/admin needs to fix without a dev around), stored in `app_settings`
  key `artist_profile_links`. Buttons simply don't render until someone fills the URLs in once.
- **Simplification flagged:** the manual "New Ticket" form (`app/tickets/artist-profile/new`, generic
  `NewTicketPage`) was NOT extended with the platform picker — that engine has no checkbox-field type, and the
  picker's primary path is the New Release dashboard/release detail page anyway. Add it by hand later on that
  specific release if a ticket was created without it.

No schema changes beyond the two `ticket_tabs` updates (label + status_options) and the retirement cleanup —
every new field (Ngày Set, Ngày Hoàn Thành, Giá Trị PL, Mã PL, Link Phụ Lục, Ngày Gửi, Ngày Ký, the Artist
Profile platform picker, Note) lives in `tickets.data` jsonb. Migration:
`add-round31-phu-luc-rename-and-legal-tickets.sql`. Verified with
`tsc --jsx react --allowJs --checkJs false --skipLibCheck` plus a brace/paren/bracket balance check across
every edited/new file before sending — zero errors.

## 2026-08-05 (32) — Có Trong Net YouTube and Discovery Mode on Spotify built out

Re-sent the round 31 request text arrived bundled with 2 genuinely new items this round — items 1-5 (Artist
Profile / Splitshare / Phụ Lục MG / Phụ Lục Publishing / Phụ Lục Truyền Thông) were confirmed already fully
delivered in round 31 (checked `lib/ticketConfigs.js`, `lib/teamTypes.js`, `app/tickets/artist-profile/page.js`
against the round-31 spec — all matched, no changes made). Only items 6 (Có Trong Net YouTube) and 7 (Discovery
Mode on Spotify) were new work.

**Có Trong Net YouTube** — was previously just a placeholder type (DID + Note, generic `TicketListPage`/
`NewTicketPage`, from the round-24 "every request tick gets a related ticket" wave) with no auto-create wired
up at New Release creation time at all (only the release detail page's generic gate-ticket-on-Save loop could
create one, added round 30). Built out fully per explicit spec:
- New shared draft shape `CO_TRONG_NET_DRAFT_DEFAULTS` (`lib/GateFields.js`) — `teaser`/`official` (single
  date+time each), `shortFrom`/`shortTo` (a PERIOD, date-only, no time, per explicit "no time require for this
  field"), `moTa` (free text).
- New `CoTrongNetYoutubePanel` in `lib/GateFields.js`, shown once `gate_co_trong_net_youtube` is "Yes" — same
  "background card under the grid" placement as Pitching's/Artist Profile's own panels. Teaser/Official are
  `<input type="datetime-local">`; Short is two `<input type="date">`s; Mô Tả is a small button ("+ Mô Tả" /
  "✓ Mô Tả (edit)") that opens `MoTaPopup` — a small modal holding just the textarea — per the request's own
  explicitly preferred alternative ("or better yet, just add the button Mô tả… for greater UX and view")
  instead of a cramped inline single-line box. Threaded through both the release detail page
  (`coTrongNetDraft` state, seeded once from the existing ticket's data when the page's batched gate-ticket
  fetch resolves) and the New Release create form (local `coTrongNetDraft` state, reset on Hủy), same
  `*Draft`/`on*Change` pattern Pitching/Artist Profile already established.
- Auto-creation on tick-Yes now fires at BOTH New Release creation (`performInsert()` gained a dedicated block
  — it had no block at all before this round, unlike Pre-order Itunes/Priority Sync Lyric/Music Video on
  Spotify, which is why it silently never auto-created there previously) and on every Save on the release
  detail page (`saveTab()` — excluded from the generic `missingGateEntries` loop, given its own block right
  above it, mirroring Artist Profile's "create if missing else write-if-changed" shape exactly, just carrying
  `coTrongNetDraft` instead of the platform picker's data).
- Manual creation form (`app/tickets/co-trong-net-youtube/new/page.js`) converted to bespoke — DID search via
  the existing `ReleasePicker` component (autofills Tên/Artist/Label, shown read-only for confirmation) plus
  the same 4 fields/Mô Tả popup as the panel above.
- Ticket list (`app/tickets/co-trong-net-youtube/page.js`) converted to bespoke — Dự Án Info / Thời Gian Đăng
  (3 lines: Teaser/Official/Short, per explicit "each row has 3 different line composed by the ticket or from
  the new release dashboard") / Mô Tả (view/edit popup button) / Ytb Page (free text input) / Link YTB (3
  lines: Link Teaser/Link Official/Link Short, "to match the date") / PIC / Status, dual view via `isOpsTeam`
  ("Youtube executive" resolves through the same OPS aggregate every other OPS-executed type uses).
- `ticket_tabs.co_trong_net_youtube` narrowed from the 5-status table default to the same 4 statuses
  (REQUESTED/PROCESS/COMPLETE/REFUND) every other Data Request sub-ticket uses — it had never been explicitly
  narrowed before this round.
- `lib/ticketConfigs.js`'s `co_trong_net_youtube` block is no longer read by anything (kept as a record only,
  same treatment as Sony Publish's/Music Video on Spotify's config blocks).

**Discovery Mode on Spotify** — same starting point (placeholder-only, generic pages, no dedicated New
Release auto-create block) and same treatment:
- `performInsert()` gained a dedicated block (previously missing, same gap as Có Trong Net YouTube above) —
  plain `{releaseId}` body, no extra draft needed since url LBM/name/artist/release date all live on the
  release itself, same "map directly back" idiom Sony Publish/Music Video on Spotify already use.
- Manual creation form (`app/tickets/discovery-mode-spotify/new/page.js`) converted to bespoke — DID search via
  `ReleasePicker`, then Url LBM (editable, writes straight to `releases.link_lbm`) / Name Of Product / Artist /
  Release Date (all three read-only, shown for confirmation) per explicit "only have 5 fields."
- Ticket list (`app/tickets/discovery-mode-spotify/page.js`) converted to bespoke — Dự Án Info / Url LBM
  (view-only hyperlink) / Discovery Clip Url (new `tickets.data` field, editable) / Clip Status (single-choice
  dropdown — new `DISCOVERY_CLIP_STATUS_OPTIONS` export in `lib/GateFields.js`: No clip / Clip uploaded / Clip
  published) / PIC / Status.
- New external-tool button next to "+ New Ticket," per explicit "just make the button, I'll send the url
  later, the team is confirming which to use" — renders now, disabled/greyed until a URL is configured.
  Reused the existing Artist Profile Links config section instead of adding a near-duplicate one: that
  section (`app/config/page.js`) gained a third field ("Discovery Mode Clip Tool URL") and was retitled
  "External Tool Links" (tab key unchanged — `artistProfileLinks` — to avoid touching anything else), all
  three URLs sharing the one `app_settings` row (key `artist_profile_links`, shape now
  `{ spotify, apple, discoveryMode }`). Starts blank; button flips live once someone fills it in, no code
  change needed when the team decides on a tool.
- `ticket_tabs.discovery_mode_spotify` narrowed to the same 4 statuses, same reason as Có Trong Net YouTube.
- `lib/ticketConfigs.js`'s `discovery_mode_spotify` block is likewise no longer read by anything, kept as a
  record only.

Migration: `add-round32-co-trong-net-youtube-and-discovery-mode.sql` (just the two `ticket_tabs` status
narrowings — every new field lives in `tickets.data` jsonb or reuses the existing `artist_profile_links`
`app_settings` row). Verified with `tsc --jsx react --allowJs --checkJs false --skipLibCheck` (zero errors)
across every edited/new file before sending.

## 2026-08-05 (33) — Phái Sinh (Batch): bulk derivative-tracklist requests without notification spam

New ticket type, `batch_phai_sinh`, built from a real design discussion rather than a spec dropped in whole —
the problem was: AR sometimes requests a big sum of derivative tracks in one go, and importing/generating one
Phái Sinh ticket per song (discussed and rejected first) would mean e.g. 100 individual notifications for one
request, with no way to tell which song belonged to which batch. Landed on: one ticket = one batch, one
notification, with the individual songs living in a new child table instead of as their own tickets.

**Data model.** New table `phai_sinh_batch_items` (schema.sql + `add-round33-batch-phai-sinh.sql`) —
`batch_ticket_id` references the parent `tickets` row (tab key `batch_phai_sinh`, same default 5-status
vocabulary as plain Phái Sinh — REQUESTED/PROCESS/COMPLETE/REFUND/CANCELED), one row per song. Field set
mirrors the uploaded "NHẠC SỐ Nguyễn Văn Chung x VIEENT — TRACKING LIST" example sheet's KHO NHẠC tab
column-for-column (Tên Bài/Version/Thể Loại/Artist/Composer/Producer/Mixer/Release Date/UPC/ISRC/Link
Audio/Link Artwork/Lyrics/Smartlink/Ngày Nhận/Ngày Hoàn Thành/Tác Quyền/Type/Note), plus the app's usual
pic_profile_id/deadline/status/status_log/soft-delete scaffolding. Two things flagged from reading that sheet:
its Status column only ever held ✅Hoàn thành/❌Đã huỷ/blank, mapped onto this app's usual
REQUESTED/PROCESS/COMPLETE/CANCELED vocabulary (PROCESS added as the normal in-between state even though the
sheet itself never used one); and its column U had no real header (the header cell held an unrelated
instructional note) but DID have a real per-row labelmaster.app product URL in every row — kept as
`link_labelmaster`, named for what the data actually was.

**"Treat each children row a workload row aka N item rather 1 item per batch"** per explicit decision —
`lib/notDoneCounts.js` gained a bespoke count path for `batch_phai_sinh` that counts `phai_sinh_batch_items`
rows directly (not the parent tickets), same as how workstations already have bespoke done-rules.

**Notifications — decided explicitly, not guessed:**
- Batch created: no new trigger needed at all — inserting the one parent ticket row already fires the
  existing `notify_on_ticket_insert` DB trigger exactly once, same as any other ticket type.
- Batch fully complete: also rides an EXISTING trigger (`notify_on_ticket_complete`, fires when a ticket's
  `status` becomes `'COMPLETE'`) rather than new DB logic — `lib/batchPhaiSinhStatus.js`'s
  `recomputeBatchStatus()` just flips the parent ticket's own `status` to `COMPLETE` the moment every child
  item is COMPLETE/CANCELED (and back to `PROCESS` if one gets reopened afterward), called after every item
  status change on the batch detail page.
- Item overdue: genuinely new — nothing fires on its own when a deadline silently passes. New SQL function
  `flag_overdue_batch_items()` (schema.sql + the migration) scans for open, overdue items and inserts
  `notifications` rows, addressed to the item's PIC if set, else every OPS profile. **This function does not
  run itself** — needs `pg_cron` enabled in Supabase (exact `cron.schedule(...)` call is in the migration
  file's comment) or an external scheduled call; that setup step is outside what I can do from here.
- Manual "Ping": new `lib/pingNotification.js`, a button on both the batch list row and each item in the
  expanded table — inserts directly into the existing `notifications` table a person decides to send, rather
  than any status change automatically cascading into one. **Flagged limitation:** `tickets` has no
  `requester_profile_id` column (only free-text `requester_name`/`requester_segment`), so a Ping can only
  target the assigned PIC (or all of OPS, if unassigned) — not a specific AR requester by name. Worth a real
  column later if per-person requester pings turn out to matter.

**UI — 3 new pages under `app/tickets/batch-phai-sinh/`:**
- `page.js` — the list, one row per BATCH (not per song): batch label/artist, progress (`done/total`
  resolved), PIC, status, "Open Batch ↗" (opens the expanded table in a new tab, per explicit "to another
  browser tab for clarity"), and a Ping button.
- `new/page.js` — batch label + main artist, then a paste box (`lib/phaiSinhBatchParse.js`, shared with the
  detail page's own "+ Add Via Paste") — copy a range out of a sheet built like the example and paste
  straight in; a header row is auto-detected and skipped; live "N songs parsed" count before submitting.
  Creates the one parent ticket, then bulk-inserts every parsed row as a child.
- `[id]/page.js` — the actual "expand into a full-size table" view: every song in the batch as its own
  editable row (all 19 sheet-derived fields plus PIC/Deadline/Status/Ping), dual view via `isOpsTeam` (same
  OPS-executes/AR-requests split as plain Phái Sinh), "+ Add Via Paste" to bulk-add more songs into an
  existing batch.

**Simplification flagged:** date parsing on pasted cells is lenient (`YYYY-MM-DD` as-is, otherwise
`Date.parse` reformatted) rather than locale-aware — a date pasted in an unusual format may parse wrong or
blank instead of erroring loudly; worth re-checking imported dates after a big paste until this proves
reliable in practice.

Migration: `add-round33-batch-phai-sinh.sql` (creates `phai_sinh_batch_items`, seeds the `batch_phai_sinh`
ticket_tabs row, creates `flag_overdue_batch_items()` — none of it destructive, safe to re-run). Verified with
`tsc --jsx react --allowJs --checkJs false --skipLibCheck` (zero errors) across every new/edited file before
sending.

## 2026-08-05 (34)

### Item 1 — Batch Phái Sinh: lock the deadline column once work has started

`app/tickets/batch-phai-sinh/[id]/page.js`'s per-item Deadline `<input>` is now `disabled` once
`item.status !== "REQUESTED"`, unless the viewer's `profile.role` is `"dev"` or `"admin"`. Matches
the exact wording of the request ("only Allow dev and admin to change the column from that stage on").

### Item 2 — New Release dashboard: OPS note tabs merged into one

`app/releases/[id]/page.js`'s `NOTE_PANEL_TEAMS` (feeding the Note panel on the release detail page)
switched from `TEAMS.filter(t => t !== "Design")` (which listed Youtube/Publishing/Operation as 3
separate tabs) to `REPORTING_TEAMS.filter(t => t !== "Design")` — `REPORTING_TEAMS` (already exported
from `lib/teamTypes.js`, same list the Summary page's dev tab picker uses) folds those three into one
combined "OPS" tab. One-line change, no migration needed. The Tasklist tab's own team grouping (a
different `TEAMS.map(...)` a bit further down the same file) was checked and does NOT need this same
fix — every item fed into it is already tagged literally `"OPS"`, never split into sub-teams, so
Youtube/Publishing/Operation groups there were always empty already.

### Item 3 — Design ticket flow redesign

The biggest piece this round. New status vocabulary, new transition rules, a reworked form, 4 new/
changed counter boxes, and 5 notification triggers — see `lib/designFlow.js` for the concentrated
business logic (transition rules, business-day/urgency deadline math, counter-comment thresholds).

**Status vocabulary** — `REQUESTED/PROCESS/COMPLETE/REFUND/CANCELED` → `REQUEST/PROCESS/PENDING/
REVISE/COMPLETE/CANCEL`, Design-only (no other ticket type touched). Existing `design` tickets (if any)
are migrated by `add-round34-design-flow-and-ops-notes.sql`: `REQUESTED→REQUEST`, `CANCELED→CANCEL`,
`PROCESS`/`COMPLETE` unchanged, and **`REFUND→PENDING`** — REFUND doesn't map 1:1 onto the new PENDING/
REVISE split, PENDING was picked as the safer landing spot (keeps the ticket visibly actionable rather
than silently reading as "in review"). Flag this if that's not the mapping you'd have picked — trivial
to re-run a one-off `UPDATE` afterward.

**Transition rules** (`lib/designFlow.js`'s `statusOptionsFor`):
- REQUEST → PROCESS is gated by a confirm modal requiring Expected Deadline + PIC (both get written to
  the ticket at that moment, not just validated). Requester can only self-move REQUEST → CANCEL.
- PROCESS → PENDING or REVISE (both require a Note first) or straight to COMPLETE, or CANCEL.
- REVISE → COMPLETE (feedback accepted) or CANCEL. **Assumption, not explicit in the request**: also
  allowed back to PROCESS, since otherwise REVISE would be a dead end whenever the feedback means more
  work is needed rather than acceptance. Flagging in case you want REVISE to be COMPLETE/CANCEL-only.
- PENDING → bounces back to whichever status it was in right before PENDING (stored in
  `data.returnStatus` the moment the transition into PENDING happens), triggerable by either side —
  matches "AR change the status back to previous status based on the last timestamp log."
- Every transition still stamps `status_log[newStatus] = now()` (same shared pattern as every other
  ticket type) — this satisfies every "log the timestamp" instruction in the request. One known,
  pre-existing limitation shared with every other ticket type: `status_log` is keyed by status name, so
  a SECOND visit to the same status (e.g. PENDING → PROCESS → PENDING again) overwrites the first
  timestamp rather than keeping full history.

**Form/columns** (item 3d): Priority field/column removed entirely. Expected Deadline sits where
Priority used to (first field row, paired with Request Type); Project now shares a row with Artist;
a new "Proposed PIC" field shares Requested By's row. In the list table, "Proposed PIC" is a real
column but only ever shows a value while the ticket is in REQUEST status (blank afterward) — a full
table can't literally hide/show a whole column per-row, so this is "blank beyond REQUEST," not
"column disappears," which should read the same in practice.

**Urgent rule** (item 3d bullet 2) — computed at creation time, three independent triggers, any one
marks the ticket urgent:
1. Expected Deadline is today, or earlier than the minimum non-urgent date (2 week-days out, or — if
   created after 18:00 on a Friday — the next Tuesday).
2. The requester's own team already has 2+ Design requests created today (picked "only in request" —
   the simplest of the three options the request explicitly offered — a straightforward count query at
   submit time; nothing blocks the 3rd+ request outright, it's just auto-marked urgent).
An urgent request shows a confirm popup summarizing the rule before it can be submitted, per request.
Urgent rows are locked for status changes until a `dev`-role profile clicks the row's "Confirm" button
(visible only to dev) — implemented as `data.urgent` / `data.urgentConfirmed` on the ticket.

**Design Team Status comment thresholds** — the request gave overlapping boundaries (`<5`, `5-10`,
`10-15`, `>15`); resolved to non-overlapping buckets `<5 / 5-9 / 10-14 / ≥15` so every count lands in
exactly one bucket. Flagging in case a different boundary resolution (e.g. `10` counting as "Bình ổn"
instead of "Quá tải") was intended.

**Counter boxes** (item 3e) — all computed client-side from the already-loaded ticket list, no schema
changes needed: Design Team Status (`comment && count` of PROCESS+REVISE), "Đang chờ nhận" (REQUEST
count, excluding not-yet-confirmed urgent rows per explicit exclusion), "Đang thực hiện" (PROCESS+REVISE
split into a small box per PIC), "Urgent Task" (urgent-and-not-COMPLETE, split confirmed/not-confirmed).

**Notifications** (item 3f) — "creation: send 1" already happens for free: `ticket_tabs.executor_team =
'Design'` already drives the existing (production-only, invisible to this codebase — see prior rounds'
notes on `notify_on_ticket_insert`) DB trigger, unchanged. What's new:
- **Urgent creation → dev**: app-side, right after insert, targeted at every `role='dev'` profile.
- **Reminder** (every 4h, 10am–8pm weekday) + **Late** (10am weekday) + **Pending/Revise count → AR**
  (10am weekday, merged with Late per explicit permission) are all scheduled, via a new
  `design_scheduled_sweep(p_include_late boolean)` SQL function (mirrors `flag_overdue_batch_items()`'s
  "nothing fires this on its own, you must set up pg_cron yourself" pattern from round 33) — see
  `add-round34-design-flow-and-ops-notes.sql`'s header comment for the exact `cron.schedule(...)` calls
  to run. "Every 4h 10am-8pm" was read as firing AT 10/14/18h (3 checks spanning the window) rather than
  continuing to a 4th firing at 10pm (which would fall outside "-8pm") — flagged in case a literal
  10/14/18/22 cadence was actually intended.
- **Overload** (Design Team Status counter reaches 11, to `anh.duong@vieent.vn` only) is event-driven,
  not time-driven, so it's triggered app-side at the moment a status change crosses the threshold
  (`app/tickets/design/page.js`'s `maybeNotifyOverload`), de-duplicated per day via a new
  `app_settings.design_overload_alert_state` row (`{ active, date }`, same shape as the pre-existing
  `design_overload` soft-lock row but deliberately separate — different semantics, not reused).
- All 5 notification bodies are text-templated via a new `app_settings.design_notification_templates`
  row, dev-editable from **Config → Design Notifications** (no code round needed to reword them) — per
  the request's explicit closing ask. `lib/designFlow.js`'s `DEFAULT_DESIGN_NOTIFICATION_TEMPLATES` is
  what the app/functions fall back to if that row or a specific key is ever missing.
- Targeting "anh.duong@vieent.vn" and "AR team" both go through direct `notifications` inserts (new
  helpers in `lib/pingNotification.js`: `resolveProfilesByEmail`/`resolveProfilesByRole`/
  `resolveProfilesBySegment`) — same "app/function writes directly, not a DB trigger" category as
  Batch Phái Sinh's Ping buttons and overdue sweep, since none of this has a natural home on an
  existing trigger either.

**Elsewhere touched**: `lib/helpers.js`'s `statusColor`/`isTicketDone` extended with the new
REQUEST/PENDING/REVISE/CANCEL literals (design-only vocabulary, additive, nothing else affected).
`lib/notDoneCounts.js` needed a Design-specific terminal-status branch (`TERMINAL_DESIGN = ["COMPLETE",
"CANCEL"]`) — the generic `TERMINAL_EXECUTOR`/`TERMINAL_REQUESTER` constants check for the literal
`"CANCELED"` (with a D) and treat `"REFUND"` as executor-terminal, neither of which exists in Design's
new vocabulary anymore, and PENDING/REVISE are active work states for both sides (no REFUND-style
asymmetry), so without this branch Design's "not done" counts everywhere in the app (Summary, sidebar
badges) would have silently over/under-counted.

Migration: `add-round34-design-flow-and-ops-notes.sql` (updates the `design` ticket_tabs row's status
vocabulary, migrates any existing `design` ticket rows, upserts the 2 new `app_settings` rows, creates
`design_scheduled_sweep()` — none of it destructive, safe to re-run; the pg_cron `cron.schedule(...)`
calls in its header comment are NOT run automatically, do those manually once). Verified with
`tsc --jsx react --allowJs --checkJs false --skipLibCheck` (zero errors) across every new/edited file
before sending.

## 2026-08-05 (35)

### Quick edit — real "Change Password" in the account Info dropdown

`lib/TopBar.js`'s Info panel used to say "Change password doesn't apply — this app uses magic-link
sign-in, no password exists." Replaced with an actual working control: a "Change Password" button
opens a small inline form (new password, confirm password, Save/Cancel), calling Supabase Auth's
`supabase.auth.updateUser({ password })` on the current session.

This **sets** a password on the account — it does not disable or replace magic-link sign-in, which
still works exactly as before. After setting a password, the user can sign in either way (magic-link
or password), assuming the login page ever grows a password field — it currently only has the
magic-link flow, so for now this is mainly useful for anyone who wants a password ready for later, or
for any other app/tool that authenticates against the same Supabase Auth project. No schema/migration
needed — this is pure Supabase Auth, not the `profiles` table.

## 2026-08-05 (36)

### Fix — Batch Phái Sinh table's Note/Link Labelmaster columns were in the wrong order

`app/tickets/batch-phai-sinh/[id]/page.js`'s table displayed `... Type, Link Labelmaster, Note, PIC`,
but `lib/phaiSinhBatchParse.js`'s `BATCH_ITEM_COLUMNS` (what the paste importer actually expects) is
`... Type, Status, Note, Link Labelmaster`. Anyone building a working sheet by eyeballing the on-screen
table order (rather than the importer's real expected order) would have their Note and Link
Labelmaster values swapped on import. Pure display fix — swapped the table's header + row cells to put
Note before Link Labelmaster, matching the importer. No data migration needed (the two are separate
columns; existing rows' actual `note`/`link_labelmaster` values are untouched, only which column they
render under changes).

Also delivered `batch-phai-sinh-template.xlsx` — a fill-in template locked to the importer's real
column order, with a Legend tab (paste mechanics, Status/Type vocab, date format, the one required
field) and one italic example row.

## 2026-08-05 (37)

### Fix — Batch Phái Sinh date paste bug: day/month silently swapped or dropped

Real bug, found from a user-reported screenshot: `lib/phaiSinhBatchParse.js`'s `parseDateLenient`
handed slash-separated dates straight to `new Date(v)`, which assumes US `M/D/YYYY`. Every real
tracklist sheet writes dates Vietnamese-style, day-first (`D/M/YYYY`) — so `"25/5/2025"` (25 May) read
as month=25, an invalid date, and silently became blank; `"2/6/2025"` (2 June) read as month=2/day=6,
a VALID but WRONG date (6 February) since day<=12 flips silently into a plausible month. Both symptoms
showed up in the same paste the user sent.

Fixed by parsing `D/M/YYYY` / `DD/MM/YYYY` explicitly (day-first) and building the `YYYY-MM-DD` string
directly, rather than routing through a `Date` object at all for that branch — this also sidesteps a
separate off-by-one risk from `toISOString()`'s UTC conversion. Anything else still falls back to
`Date.parse` as before. Affects `Ngày Phát Hành` / `Ngày nhận` / `Ngày hoàn thành` on both the batch
creation paste and the "+ Add Via Paste" on an existing batch (same shared parser). No migration
needed — pure parsing logic, nothing stored incorrectly needs backfilling since this was caught before
any bad batch was actually created.

## 2026-08-05 (38)

### Fix — Phái Sinh (plain) ticket table: Contributor and LBM url columns blowing out way too wide

`app/tickets/phai-sinh/page.js`'s table — reported via screenshot, a huge blank-looking gap under
Contributor and an unclipped, overflowing raw URL under LBM url.

- **Contributor** used to be an unbounded `minWidth: 220` with no cap — a long unbroken URL in the
  Mixer line (contributors sometimes paste a raw Drive folder link there instead of a name) has no
  natural wrap point, so the browser stretched the whole column to fit it on one line. Pinned to a
  fixed `240` (matching Artist's width, per the fallback the request specifically named) and added
  `wordBreak`/`overflowWrap` so a long link now wraps onto its own line inside the cell instead of
  stretching the column.
- **LBM url** had NO width constraint at all on either the header or the cell — `LinkOrEditCell`
  already truncates a displayed link with ellipsis, but that only works once its container has a
  bounded width to truncate against, which this column never had. Capped to `140–180`, double the URL
  column's own `70–90`, per the request ("same as the url column or just double that side, no more").

Pure `<th>`/`<td>` style changes — no data, no migration.

## 2026-08-05 (39)

### Fix — Design Team Status counter box: dropped the literal "&&"

The round 34 spec wrote the box's content as `*comment* && count` — I'd read that as a literal string
to render ("Rảnh nè && 2"), but per a follow-up screenshot that was just shorthand for "comment
alongside count," not literal `&&` characters. `app/tickets/design/page.js`'s first counter box now
shows the comment and count as two separate styled spans (comment normal weight, count bold/larger),
same visual pattern as the box's title-then-value convention elsewhere on the page — no `&&` text.
Pure display fix, no logic/data change.

## 2026-08-05 (40)

### UI tweak — Urgent flag folded into the Task cell instead of its own column

Per a follow-up screenshot: the standalone "Urgent" column in `app/tickets/design/page.js` is gone —
the red "URGENT" label + dev-only "confirm" button now render inline at the left edge of the Task
cell itself (same idea as the small inline badge pattern used elsewhere in the app, e.g. the "✎ edited"
indicator), instead of eating a whole separate column. Pure display change — `data.urgent` /
`data.urgentConfirmed` still drive it exactly as before, nothing structural changed.

## 2026-08-05 (41)

### Feature — Phái Sinh and Phái Sinh (Batch) merged into one ticket type

Per explicit request: "merge the phai sinh with the batch... when user choose type phái sinh, normal
phái sinh input, if they choose kho nhạc, switch to the batch." Phái Sinh's Type field is no longer
free text — it's a real 4-option select (**Phái sinh** / **Kho nhạc** / **Chuyển net** / **Takedown**),
and that one field now decides the whole ticket's behavior. Chuyển net and Takedown "count as kho nhạc"
per explicit instruction — all three share one predicate, `isKhoNhacType()` in the new
`lib/phaiSinhTypes.js`, which is the single source of truth everywhere this distinction matters.

**Architecture decision:** reuse everything Phái Sinh (Batch) already had rather than build anything
new — the `phai_sinh_batch_items` table, and the expanded per-song table at
`app/tickets/batch-phai-sinh/[id]/page.js`, are both unchanged and now serve as the Kho Nhạc-family
flow for `phai_sinh` tickets too (that detail page was already tab-agnostic — it only ever looked up
by ticket id, never by which tab the parent belonged to). The standalone Phái Sinh (Batch) tab
(`/tickets/batch-phai-sinh` and its `/new`) is retired: both are now redirect stubs into the Phái Sinh
equivalents, and `batch_phai_sinh` is removed from `lib/teamTypes.js`'s `TEAM_TICKET_TYPES` so it no
longer shows as its own TypeSwitcher tab. Its `ticket_tabs` seed row is left in place (never
hard-deleted, same precedent as the earlier `phu_luc_truyen_thong` retirement).

**Per-item changes (2a–2e from the request):**

- **2a — Type options.** `Phái sinh` (original single-song flow, unchanged) / `Kho nhạc` (existing) /
  `Chuyển net` (new) / `Takedown` (new). The latter two behave identically to Kho nhạc.
- **2b — Grey out single-song fields.** On the parent list (`app/tickets/phai-sinh/page.js`), the
  Tên Bài, Artist, Contributor, Release, and LBM url cells dim (`opacity: 0.4`) and disable their
  inputs for Kho Nhạc-family rows — that data now lives per-song in the children table instead.
- **2c — URL → Open Batch.** For Kho Nhạc-family rows, the URL cell is replaced with an "Open Batch ↗"
  link into the same `/tickets/batch-phai-sinh/[id]` table (new tab), instead of the plain-song
  link-or-edit cell.
- **2d — Counter dashboard.** Added a new "Kho Nhạc Progress" column on the parent list, populated only
  for Kho Nhạc-family rows, computed live from that ticket's `phai_sinh_batch_items` children:
  **Confirm Metadata** (N/total children with every field in `CONFIRM_METADATA_FIELDS` filled —
  `ten_bai, version, the_loai, artist, composer, producer, mixer, release_date, link_audio,
  link_artwork, lyrics`, flagged in the request as "may change in the future"), **Uploading /
  Delivery / Rechecking / Complete** (straight counts of children at each of those statuses), and
  **Takedown Bên Cũ** (count of children with the new `takedown_ban_cu` flag set). UI choice (left
  explicitly open — "this is your call on how to UI them here"): a row of small pill badges, one per
  counter, rather than 6 separate table columns — keeps the parent list from getting unreadably wide
  while still surfacing every number at a glance. The 3 new child statuses (Uploading/Delivery/
  Rechecking) were added to `ITEM_STATUSES` on the children table
  (`app/tickets/batch-phai-sinh/[id]/page.js`, now imported from `CHILD_ITEM_STATUSES` in
  `lib/phaiSinhTypes.js`) alongside the pre-existing Requested/Process/Complete/Canceled — colors for
  the 3 new ones added to `statusColor()` in `lib/helpers.js`. "Recheck Takedown Bên Cũ" is a new
  Yes/No select column on the children table itself, backed by a new `takedown_ban_cu boolean`
  column on `phai_sinh_batch_items` (see migration below) — every other Confirm-Metadata field and
  every status counter already existed as real columns on that table from round 33, so no other
  schema change was needed.
- **2e — Hạn Cuối.** Real date-picker column on the parent list, bound to `tickets.deadline` (already
  a real column, no schema change needed there). Locked for the `exc` role per explicit request — only
  `dev`/`admin` can edit it, same lock pattern already used for Batch Phái Sinh's per-item deadline and
  Design's deadline lock (round 34).

**File import (mid-turn addition):** "also make the import so they can import the data via template
file" — added a real file-upload alternative to the existing paste-a-TSV-block textarea, via the new
`lib/BatchFileImport.js` component (SheetJS/`xlsx` package, added to `package.json`, dynamically
imported so it doesn't bloat the initial bundle). Reads `.xlsx`/`.xls`/`.csv` entirely client-side —
nothing is uploaded anywhere else, the file never leaves the browser before being turned into rows and
inserted through the normal Supabase client, same as a paste. `lib/phaiSinhBatchParse.js` was
refactored so both the paste path and the file path share one `cellsToItem()`/`isHeaderRow()` mapping
(new `parseBatchRows()` export takes an array-of-arrays, as SheetJS's `sheet_to_json(sheet, {header:
1})` produces) — the round 36/37 D/M/YYYY date-parsing fix and column order live in exactly one place
either way. Wired into both the create form (`app/tickets/phai-sinh/new/page.js` — Kho Nhạc-family
Type shows Label/Tác Quyền/Description + the file import + the paste textarea, file takes priority if
both are used) and the existing batch table's "+ Add" (`app/tickets/batch-phai-sinh/[id]/page.js`).
Delivered a matching `batch-phai-sinh-template.xlsx` (Legend tab + one example row) for the requester
side.

**Other files touched:** `lib/notDoneCounts.js` — the `batch_phai_sinh`-specific "not done" branch
replaced with a `phai_sinh`-aware one: plain Phái sinh tickets count 1 each (normal terminal-status
rule), Kho Nhạc-family tickets count their children instead (same "each song is its own workload item"
rule the batch type always had, just keyed off `isKhoNhacType()` now instead of a separate tab).
`schema.sql` — `takedown_ban_cu boolean not null default false` added to the `phai_sinh_batch_items`
table definition (fresh installs); the `batch_phai_sinh` `ticket_tabs` seed row's comment updated to
explain the retirement.

**Migrations delivered separately** (not zipped with `starter/`, per convention):

- `add-round41-merge-phai-sinh-batch.sql` — adds `takedown_ban_cu` to `phai_sinh_batch_items` (idempotent,
  `if not exists`), and moves any tickets still sitting on the retired `batch_phai_sinh` tab onto
  `phai_sinh` (tagged `typeRequest: "Kho nhạc"`, backfilling `data.label` from the old `data.batchLabel`
  if `label` isn't already set). The `batch_phai_sinh` `ticket_tabs` row itself is left in place, never
  deleted.
- `remove-test-batch-phai-sinh-ticket.sql` — the standalone cleanup requested in item 3: deletes the
  one test Phái Sinh (Batch) ticket (and its `phai_sinh_batch_items` children) created while trying the
  old flow, so nothing stale is left once the merge migration runs. Includes a commented-out `SELECT`
  to review what will be deleted first, in case more than one test ticket exists.

**Assumption flagged:** the 6-counter cell's exact visual treatment (pill badges vs. dedicated columns)
was explicitly left as an implementation choice in the request — flag if a different layout (e.g. 6
separate sortable columns) was actually wanted.

## 2026-08-05 (42, reverted)

### Reverted — Booking Board "Smart Import"

Round 42 added an in-app "⚡ Smart Import" button (auto-split a pasted mixed-platform URL pile by
domain, insert straight into `media_booking_entries`). Reverted per explicit request — the actual need
is a downloadable template + offline import (this round's actual (43) below), not a live in-app paste
feature. `lib/socialUrlDetect.js` removed; `app/booking/page.js`'s `SmartImportButton`/`addSmartRows`
and the import removed — back to the pre-round-42 per-column Add Link / Bulk Add flow.

## 2026-08-06 (44)

### UI tweak — Booking Channels: "Channel Type" relabeled "Hạng Mục", added CSV export

Per explicit request. `app/booking-channels/page.js`'s two "Channel Type" field labels (the Add form
and the inline edit form) now read "Hạng Mục" — display-only, the underlying field/column is still
`channel_type` and its Direct/Partner values are unchanged, so nothing else in the app (Booking Board's
`channel_type` matching, the DB column, `BOOKING_CHANNEL_TYPES`) needed to change. Platform and Brand
labels are untouched per the request ("keep").

Added a "⇩ Export CSV" button next to the search box — exports whatever's currently on screen (respects
the search filter, same convention as the Booking Board's own export button): Platform, Hạng Mục,
Brand, Name, URL, Follower Count, Note. UTF-8 BOM included so Excel opens the Vietnamese text correctly
instead of mangling it.

Also delivered (not part of the zip): `booking-channels-reconstructed.csv` /
`.xlsx` — an actual export of "the current list," since this session has no live database access to
pull the real one. Reconstructed by running `schema.sql`'s 9 seed rows plus
`data/booking-channels-import.json` through `scripts/import-booking-channels.js`'s exact matching/dedup
logic (142 rows). Flagged clearly to the user that this reflects the seed + import script's result, not
necessarily the live table if it's been hand-edited in the app since that import ran.

## 2026-08-06 (45)

### Data fix — 2 New Release rows' Media Channel corrected

Per your corrected `round43newreleaseimportreport.md`: row 314 → ENVI, row 321 → ALL. Delivered as
`add-round45-fix-media-channel.sql` (not zipped, per convention) — matched by label+title+main_artist
since these round-43-inserted rows carry no other identifier.

## 2026-08-06 (46)

### Data fix — 31 held-back New Release rows imported with placeholder date

Per explicit request ("set 31/12/2026 20:00 to all of those 31 lines. They are really blank"): the 31
rows round 43 held back for missing `release_date` are now inserted with `release_date = 2026-12-31`,
`release_time = 20:00` as a placeholder — update these individually once real dates are known. Delivered
as `add-round46-import-held-back-31.sql` (not zipped, per convention), re-derived from the same
"New Release" sheet in `vieentopstemplates.xlsx` using the same column mapping as round 43's import.

Two of the 31 rows needed a manual correction to locate in the sheet, since their Main Artist cell was
wrong/blank there:
- **HTM Entertainment / "Anh Muốn Em Biết Anh Nhớ Em"** — the sheet's Main Artist cell had the title
  text copy-pasted into it instead of an artist name. Used "Lâm Chấn Huy" (from the original held-back
  report) instead.
- **EEZO / "Lặng Nhìn Yêu Thương"** — the sheet's Main Artist cell was blank. Used "EEZO" (per your
  correction on the resent report, row 477).

Flag if either substitution isn't right — I didn't have a live DB to cross-check against.

### Feature — New Release form: Quick Create, always-redirect-to-detail, Save and Create another

Per explicit request, in `app/new-release/page.js`:

- **"⚡️ Quick Create" button** — top-right of the form, opens a small modal asking only for Hãng Đĩa
  (Label) / Tên bài hát (Title) / Main Artist. `release_date` isn't collected there (the DB column is
  `NOT NULL`) — defaulted to today's date, `release_time` stays the normal default (19:00). Runs the
  same DID-prefix duplicate-warning check as the full form. On success, lands on the new release's
  detail page, same as the normal button — the idea being everything else gets filled in there.
- **Normal "Tạo Release" button** — now always navigates to the new release's own detail page
  (`/releases/[id]`) after creating it, instead of the release list (`/releases`) as before.
- **New "Save and Create another" button**, next to "Tạo Release" — saves using the full form (same
  validation, same duplicate check), then resets straight back to a blank creation form instead of
  navigating away. Shows a small "Release created — DID …" confirmation banner (this reused the
  `createdDid` state that already existed in the file but was never actually wired up to anything).

**Assumption flagged:** Quick Create landing on the detail page (rather than also offering "stay and
create another") wasn't explicitly specified — flag if a different flow was intended there.

## 2026-08-06 (46b) — schema: Link Gói TT (Legacy)

Added `releases.link_goi_tt_legacy` (URL tab, backup/reference only, not tied to any workflow) —
schema.sql updated, migration delivered separately as `add-round46-link-goi-tt-legacy.sql`. Wired
into `app/releases/[id]/page.js`'s `UrlTab` field list. Part of the same zip as (46) above.

## 2026-08-06 (47)

### Data import — Booking Board (6 of the 11 `booking_board_data.xlsx` sheets)

Per your mapping answers, imported SOCIAL ENVI, SOCIAL VIEENT, PAGETIKTOK INDIE/BOLERO/VPOP, and
CAPCUT — 287 releases matched (title+main_artist parsed from each row's `THÔNG TIN` block,
cross-checked against the New Release import), 7,608 links written into `media_booking_entries`,
plus `booking_note`/`link_goi_tt_legacy`/`link_lbm`/`link_ugc`/`drive_link`/`legacy_id` backfilled
on the matched releases (all via `coalesce`, never overwriting an existing value). 20 rows across
these sheets had no matchable data (blank `THÔNG TIN`) and were skipped — listed in
`round47-booking-board-import-report.md`.

Delivered as 6 separate SQL files (not zipped, per convention — see
`RUNBOOK-round43-to-47.md` for the full run order across rounds 43–47), one per sheet since a
combined file would have been ~10,000+ lines.

**Deliberately not done this round:** the `EXT TIKTOK` sheet (pooled across 4 Partner brands with
no per-row brand signal) and the numeric `"…BOOKING"` target columns / the 2 TikTok cost-ledger
sheets — per your direction, these are waiting on a small simulator that mimics the app's own
package-build logic instead of a blind bulk insert into `media_booking_package_lines`.

## 2026-08-06 (48)

### Data fix — dedup New Release rows duplicated by round 43's import

Round 43's New Release import (441 rows) turned out to have needed to be an UPDATE against
existing releases (same as the Upload Workstation round), but ran as a plain INSERT — so every
release that already existed under the same title/main_artist/release_date now has a duplicate: a
"BRIEF & DATA" stub created that round, alongside the real pre-existing release.

Delivered `add-round48-dedup-new-release-duplicates.sql` (not zipped, per convention) — a
verify-first STEP 1 (lists every duplicate group, which row it'd keep vs. delete, and a ticket/
booking-entry count on each) then a STEP 2 delete. Match key: title + main_artist + release_date.
Keep rule: prefer the row whose `project_type` has moved past a named package (`'BRIEF & DATA'` /
`'DEALING'`), tie-broken by older `created_at` (every round-43 row was inserted the same day).
Every table with a real foreign key to `releases(id)` is `on delete cascade`, so deleting the loser
also cleans up anything that accidentally landed on it — including round 47's Booking Board import,
which matched releases by title+main_artist and would have written the same links to both copies
of a duplicate pair if one already existed when it ran. `tickets` is the one exception (references
releases via a free-text DID in `data`, not a real FK) — STEP 1 checks that explicitly before
anything is deleted.

**Run this between rounds 43–46 (New Release imports) and round 47 (Booking Board import)** — see
the updated `RUNBOOK-round43-to-47.md`.

## 2026-08-06 (49)

### Quick fixes batch

1. **New Release dashboard's "Today" stat/filter** — was filtering by `created_at` (when the row
   was entered into the app), inconsistent with "This Week"/"This Month" right next to it which
   already filter by `release_date`. Now filters by `release_date` too, per explicit request.
   `app/releases/page.js`.

2. **Media Booking ticket's "Build Package" panel — header row overlapping the first data row.**
   Root cause: the panel's package-lines table scrolls inside its own small internal box, but that
   box wasn't wearing the `.scrollBox` class the app's own sticky-header convention requires —
   without it, the `<th>` offset by `--topbar-height` (meant for tables that scroll with the real
   page) instead of `0` (this panel's own scrollport has no topbar above it), so the header floated
   too low and sat on top of row 1. Fixed by adding `className={styles.scrollBox}` to that wrapper
   div. `app/tickets/media-booking/page.js`.

3. **Booking Channels reference list** — per explicit request: added a Direct/Partner counter row
   (click-to-filter, same pattern as the New Release dashboard's stat cards), and regrouped the
   list from Platform-only to Brand first, then Platform within each brand (channels with no brand
   land in a "— No Brand —" bucket at the end). `app/booking-channels/page.js`.

4. **Booking Board — new "Đã có yêu cầu" filter button**, mirroring the existing "Chưa có yêu cầu"
   button: only relevant once a specific Hạng Mục (and Brand, where applicable) is picked, shows
   only releases that DO have a requested/booked number for at least one of the columns currently
   shown — the opposite check from "Chưa có yêu cầu"'s "every column empty." Works against whatever
   set a number, whether from the package builder or a historical-data import (e.g. round 47's
   Booking Board import). `app/booking/page.js`.

5. **Booking Board — highlight releases releasing today.** Row background tinted, sticky first
   column tinted to match, and a small "· TODAY" tag next to the date, using a plain
   YYYY-MM-DD string compare against `release_date` (not a Date-object compare) to avoid any
   timezone drift. `app/booking/page.js`.

6. **"Chưa có yêu cầu" — not stale, working as designed.** You asked what this does: it's the
   filter added earlier for "only show releases with no requested/booked number at all for the
   currently picked Hạng Mục" — every brand/column shown reads "—". Not a leftover from an earlier
   round; (4) above adds its direct opposite ("Đã có yêu cầu") right next to it.

7. **Media Booking ticket list — already sorted by release date.** Checked
   `app/tickets/media-booking/page.js`: `byReleaseDate()` already sorts both the requester view and
   the executor (per-status) view by release date, soonest first, with tickets missing a matched
   release sorted last — no change needed here, this was already in place from an earlier round.
