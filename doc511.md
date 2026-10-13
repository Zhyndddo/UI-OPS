# Round 511 — bulk Resync no longer rewrites non-picked tiers (the "other tiers become the chosen tier" bug)

## User report
After the artist picks a package on the magic link, on releases with >1 tier the tiers OTHER than the chosen one get their lines changed to the chosen tier's numbers.

## Root cause (data + code)
- The magic-link confirm writes NO package lines (releases + release_package_items only).
- Resync (Config "Resync All Releases", and the recompute after Clone) rebuilds each tier's line total + Cells from that tier's own DSP grid. It SKIPS only the tier the artist picked (resolveLockedPackageId matches release.project_type). Before a pick no tier is skipped; after a pick, the picked tier is protected and every other tier is rewritten.
- Every tier's grid was a copy of the same release-wide grid (pre-R442 model + R442 backfill, 844 rollup rows stamped 2026-10-01 03:53), i.e. the chosen tier's numbers. So the rewrite makes other tiers = chosen tier.
- Backup history evidence: line changes cluster in single backup windows — 2026-09-23_13h (94 other-tier / 56 chosen / 10 unpicked), 2026-09-30_10h and _17h (69 other-tier) — the bulk-run signature. 118 of 173 merge events hit releases whose artist pick was weeks earlier; the pick itself was not the trigger, it only decides which tier is protected.
- No DB trigger touches lines (checked prod schema reference). Server/GitHub jobs only insert.

## Fix (code only, no SQL)
- lib/mediaBookingResync.js: preserveDifferingTotals (default ON for the bulk tool, OFF for the post-clone recompute): never change a line whose own total differs from its tier's grid; only refreshes Cells where the total already agrees, or fills a line with no total. Report counts totalMismatchSkipped. Locked (manual_lock) lines skipped (R510).
- app/config/page.js: explanation + "Kept N lines as they were" result line.
- Round 510 manual_lock + restore SQL remain the repair path for the 170 merged lines (user confirmed the 3 questionable ones: remove them from the worklist as advised).

## Round 418 resync
Do NOT run "Resync All Releases" until Rounds 510 + 511 are deployed. After that it is safe (won't change totals).
