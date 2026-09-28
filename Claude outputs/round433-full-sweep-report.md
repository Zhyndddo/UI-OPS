# Round 433 — Full sweep results & manual-review list

Built from the `data-backups` GitHub branch (2-hourly Supabase snapshots), comparing every release with `release_date >= 2026-08-01` across the confirmed corruption boundary: **2026-09-23, between the 07h and 13h backups**. Locked package per release was resolved using the CURRENT (2026-09-28 04h backup) `project_type`/package-name match — the same rule `buildPackageByRelease()` uses on the Booking Board — not the value it had back on 09-23, since several releases' `project_type` has since moved on from placeholder pipeline stages ("DEALING", "BRIEF & DATA") to a real resolved package name.

## Headline numbers

- **211–216 releases** fall in scope (release_date ≥ 2026-08-01).
- Of those, **118–130 currently resolve to one locked package** — the rest are either still mid-pipeline (no package locked in yet) or use "Chỉ Phát Hành" without an INT MEDIA package, so there's nothing to protect.
- Across all of those locked packages' lines, **39 lines across 20 releases** show a real value change (quantity, amount, detail, or the brand/metric breakdown) exactly at the 07h→13h boundary — this is the full corrupted-locked-line list, found by diffing real historical values rather than the original coincidental cross-package-match heuristic (which had returned 113 candidates across 33 releases, most of them false positives).
- **Note on your recollection of "~400 packages":** that number is almost certainly the *whole* resync's footprint — every non-locked package legitimately got recomputed too, which is correct/intended behavior, not corruption. The actual bug (a locked package getting silently overwritten) only hit **39 lines**.

## Split: auto-fix vs. manual review

- **36 of the 39 lines still show the exact corrupted (13h) value** as of the latest backup (2026-09-28 04h) — nothing has touched them since the incident, so they're safe to restore automatically. This includes all 28 lines from the Step 3 restore already delivered, plus **8 net-new lines** the fuller sweep caught that the original heuristic missed.
  → **`sql/pending/add-round433-step5-full-restore-36-locked-lines.sql`** restores all 36 (supersedes Step 3 — no need to run both).
  → Run **`sql/pending/add-round433-step4-full-sweep-verify-current.sql`** first (read-only) and paste the result back, so I can confirm none of the 36 changed in the few hours since the backup before you run Step 5.

- **3 lines have already diverged from the corrupted value** — meaning someone already hand-fixed them (partially, in every case). These are listed below for your team to check by hand; an automatic restore is intentionally skipped for these so it doesn't clobber real manual work.

## Manual review list (3 lines — already partially hand-fixed, do not auto-restore)

### 1. `NĐH#-17092026-0081` — Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo)
TikTok Channel, locked package "Độc Quyền 5 năm"
- Pre-corruption: quantity 20, `EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT` = 10
- Corrupted: quantity 10, `EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT` = 0
- Current: quantity 20 (restored), `EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT` = 10 (restored) — **but** a `TIKTOK VPOP::TIKTOK LYRICS: 5` entry that the corruption introduced is still present and was never in the original. Worth a second look — may be a legitimate later addition, may be corruption debris.

### 2. `MLHK-11092026-0061` — Muốn Lấy Anh Làm Chồng
TikTok Channel, locked package "Độc Quyền 5 năm"
- Pre-corruption: quantity 20, `EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT` = 10
- Corrupted: quantity 10, `EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT` = 0
- Current: quantity 20, `EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT` = 10 — matches pre-corruption exactly. This one looks fully and correctly hand-restored already; flagged here only so your team can confirm and close it out, no action needed otherwise.
- Note: this same release also has a separate Community-category locked line that's still corrupted (quantity 9→0) and IS in the Step 5 auto-restore list — different line, different bracket.

### 3. `ĐHKL-19092026-0080` — Đồng Hương Đồng Nai
TikTok Channel, locked package "Độc Quyền Vĩnh Viễn"
- Pre-corruption: quantity 37, `TIKTOK BOLERO / MT::TIKTOK LYRICS` = 15, `EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT` = 20
- Corrupted: quantity 22, `TIKTOK BOLERO / MT::TIKTOK LYRICS` = 10, `EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT` = 10
- Current: quantity 32, `TIKTOK BOLERO / MT::TIKTOK LYRICS` = 10 (still at corrupted value), `EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT` = 20 (restored) — a partial fix. `TIKTOK BOLERO / MT::TIKTOK LYRICS` still looks off versus the pre-corruption value of 15; worth a second pass.

## Files delivered this round
- `sql/pending/add-round433-step4-full-sweep-verify-current.sql` — read-only, re-verify all 39 lines against live production
- `sql/pending/add-round433-step5-full-restore-36-locked-lines.sql` — transaction-wrapped restore of the 36 safe lines (supersedes Step 3)
- This report
