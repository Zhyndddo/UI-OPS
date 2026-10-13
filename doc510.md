# Round 510 — manual_lock guard + restore of merged package lines

## Root cause (see round509 doc for earlier findings)
Each tier's stored line (total + Cells) can be rebuilt from that tier's DSP grid by Summarize, Clone and Config "Resync All Releases". The grids were copied identically into every tier (old release-wide model + the 1 Oct Round 442 backfill: 844 rollup rows stamped 2026-10-01 03:53). Merges recorded in git backup history: 173 lines (47 releases) changed to equal a sibling tier — 119 on 23 Sep, 49 on 30 Sep, 1 on 21 Sep, 3 on 24 Sep, 1 on 1 Oct — i.e. almost all BEFORE the Round 442 fix. Artist magic-link pick writes no lines; it only switches which tier the Booking Board / Cost MKT read.

## Built
- SQL add-round510-line-manual-lock.sql: media_booking_package_lines.manual_lock boolean default false.
- lib/mediaBookingResync.js: resync skips lines with manual_lock (report.manualLockedSkipped).
- app/tickets/media-booking/page.js: typing a total into a line sets manual_lock (falls back to a plain write if the column is missing); Summarize on a locked line asks before replacing (compares total AND per-column Cells) and unlocks on OK; 🔒 badge in the Packages panel quantity cell, click to unlock.
- SQL restore-round510-package-lines-from-backups.sql: worklist table package_lines_restore_r510 (173 lines, values from backup history), backup table package_lines_backup_r510, preview, guarded update (only lines still at the merged value), sets manual_lock=true, UNDO block. Tested on a stand-in Postgres 16.
- CSV package-merge-restore-candidates.csv (review list), package-numbers-at-risk.csv.

## Caveats
- Restoring a line does not fix that tier's grid copy; the lock prevents rebuilds until someone confirms a Summarize.
- Before-values come from the last earlier backup; if two merges happened between backups, the earlier value may itself be older than intended.
- Round 418 resync: not needed (do NOT run Resync All before locks are in place).
