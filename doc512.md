# Round 512 — Resync removed; restore reconciliation

## Decision (user): remove the resync
- Removed the Config "Resync All Releases" section and lib/mediaBookingResync.js.
- Removed the automatic recompute after "Clone from another product" (cloneFromRelease): a clone now keeps the source's lines (total, Cells) exactly as they are. Round 418's reason for it (stale source lines after a clone) is therefore back; if a cloned release shows stale Cells, fix by Summarize per tier.
- Root cause recap (Round 511 doc): bulk resync protected only the picked tier and rewrote all others from grid copies.
- Round 418 resync: no longer exists.

## Restore reconciliation (Round 510 SQL)
173 merge events found in backup history:
- 99 still merged -> restored + locked by Step 2 (matches the "99" the user saw)
- 46 already equal to the before-value (people fixed them since, e.g. the 12 Oct corrections)
- 25 edited since to a different value -> deliberately untouched (see merged-lines-edited-since-25.csv)
- 3 lines no longer exist

## Added: narrow "fill missing Cells after clone" (lib/cloneFillCells.js)
Replaces the removed post-clone resync for the one real gap (clone from an old source whose lines have a total but no per-column Cells -> Booking Board "—", the HIRAKI II case).
- Runs at the end of cloneFromRelease, best-effort, on the NEW packages only.
- Fills ONLY brand_column_quantities, ONLY for Social / Community / TikTok Channel blank-brand lines that have a total > 0, no Cells and are not locked, and ONLY when the tier's own grid total equals the line's total. Never changes a total, amount, price, Chi Tiết, another tier or a line with Cells.
- Math tested on the 13 Oct backup: 645 lines with Cells + grid; 606 grid totals equal the line total, and in all 606 the computed Cells are identical to the stored Cells (0 differences). 39 have a different total and would be skipped.
- Round 418 resync: not needed; no resync exists any more.
Push order: Round 510 SQLs (add-round510-line-manual-lock, restore — done), then deploy round512.zip (contains 510 + 511 + 512).
