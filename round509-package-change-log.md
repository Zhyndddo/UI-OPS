# Round 509 — package change log (DB triggers) + findings so far

## Why
Package numbers "change at some point". Backups (6h-ish) can't show who/when, and the audit_log only records quantity/amount/unit_price, never Cells (brand_column_quantities).

## Findings before this round (read-only analysis, 7–13 Oct backups)
- Magic link confirm writes only releases (project_type/package_locked/package_total_value) + release_package_items; never lines/cells. Snapshot matches the picked tier.
- What changes at pick time is which tier the Booking Board / Cost MKT read (release resolves from "DEALING"/none to the picked tier).
- All line edits in the window came from the Package Builder (one account), audited — except Cell-only changes (audit blind to bcq).
- AMKV-16102026-0121: all 3 tiers (Vĩnh Viễn / 5 năm / 2 năm) hold identical totals+cells (cloned), while Chi Tiết text differs per tier (40 / 30 / 15 vs total 30). Nothing wrote since 30 Sep. Chi Tiết is a free/template text, total+cells come from the grid — no link between them.
- Decision (user): option 3 = per-tier numbers + Chi Tiết generated from cells + Cell auditing. Not built yet; dig further first.

## Built
- sql/pending/add-round509-package-change-log.sql: table package_change_log + triggers on media_booking_packages, _package_lines, _package_categories, media_booking_content_entries, release_package_items, releases (only project_type/package_locked/package_total_value/int_media_requested). Stores changed columns old/new, actor_kind (staff / artist_guest / non_human), unexpected flag (non_human always; artist_guest on package/grid tables), db_role, db_user, user-agent/origin/x-client-info, trigger_depth. View package_change_log_unexpected. Tested on a local Postgres 16 stand-in.
- scripts/backup.js: package_change_log added as OPTIONAL table (skipped if SQL not run yet).
- Backup workflow still every 3h (unchanged).

## Needs Round 418 resync? No.
## Next
Run the SQL, deploy, wait for the next number change, then: select * from package_change_log_unexpected; and per release by release_id.
