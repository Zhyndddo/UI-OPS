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
