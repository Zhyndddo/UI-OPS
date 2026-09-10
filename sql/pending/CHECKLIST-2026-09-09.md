# SQL catch-up — run tonight (2026-09-09)

You haven't run/pushed anything since Round 274, so here's everything pending, consolidated.

## 1. Run this first: `consolidated-2026-09-09.sql`

One file, 17 migrations concatenated in a safe order, each section labeled with which
original file it came from. All idempotent (`if not exists` guards throughout) — safe to run
even if you already applied some of these individually. Just run the whole file once.

What's in it (in order): performance share links (222), normalize Apple platform (226), tool
directory preview-tool safety net (229), digest custom note (232), media booking entry totals
rollup (247), project tag INDIE/VPOP/ENVI/VIEENT/NONE (260), subteam tags consolidated (264),
secret messages (269), phai sinh album_name column (270), phai sinh rights columns (270), pitching
PIC list addition (274), tickets pic_profile_ids array (279), bo sung data snooze (280), bo sung
data ticket type (280), audit log + requester attribution + auto-assign (281), media booking
package entry snapshots (287, this round's per-package grid fix), publishing composer column
(290, this round's Composer field).

## 2. Skip these — do NOT run them individually if you already ran the consolidated file

These are the source files the consolidated script pulled from — running them again is harmless
(idempotent) but unnecessary:

`add-round222-performance-share-links.sql`, `add-round226-normalize-apple-platform.sql`,
`add-round229-tool-directory-preview-tool.sql`, `add-round232-digest-custom-note.sql`,
`add-round247-media-booking-entry-totals.sql`, `add-round260-project-tag.sql`,
`add-round264-consolidated-subteam-migration.sql`, `add-round269-secret-messages.sql`,
`add-round270-phai-sinh-album-name-column.sql`, `add-round270-phai-sinh-rights-columns.sql`,
`add-round274-pitching-pic-anh-lan.sql`, `add-round279-tickets-pic-profile-ids.sql`,
`add-round280-bo-sung-data-snooze.sql`, `add-round280-bo-sung-data-ticket-type.sql`,
`add-round281-audit-log-requester-and-autoassign.sql`, `add-round287-package-entry-snapshots.sql`,
`add-round290-publishing-composer.sql`

## 3. Never run these — genuinely superseded, left in the folder for history only

- `add-round258-indie-flag.sql` — replaced by Round 260's `project_tag` column (checked both
  files in full: Round 260 doesn't depend on Round 258 either way, so this is skippable outright,
  not just redundant). If you never ran Round 258, there's nothing to backfill — just skip it.
- `add-round262-subteam-rework.sql`, `add-round263-drop-marketing-subteam-rows.sql`,
  `add-round264-drop-subteams-table.sql` — each file says so in its own header; Round 264's
  consolidated migration (in the combined script above) replaces all three.
- `add-round261-subteam-tags.sql` — not marked superseded in its header, but Round 264's
  consolidated migration's `do $$ ... $$` block fully and idempotently subsumes both of its
  `alter table add column` statements. Safe to run too if you want belt-and-suspenders, just
  redundant.

## 4. Handle separately, on purpose: `round240-milestone-wipe-reinstate.sql`

**Do not fold this into the batch above.** It's a different kind of file — not a schema
migration, a one-time 2.4MB / ~21,000-line bulk data reload: a `DELETE FROM
milestone_chart_entries WHERE entry_date <= '2026-08-26'` followed by a ~20,862-row `INSERT`,
generated from a CSV export. It's wrapped in its own `BEGIN;...COMMIT;`, so it's atomic — but it
is destructive (it deletes real rows first) and one-time by nature. Run it deliberately, by
itself, when you're ready to review what it's doing — not as part of tonight's routine catch-up
batch.

## After running

Move `consolidated-2026-09-09.sql` (or the individual files, if you prefer to track them one by
one) into `sql/applied/`, or just tell me and I'll move them next round.
