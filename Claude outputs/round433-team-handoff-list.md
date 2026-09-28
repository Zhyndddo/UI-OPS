# Round 433 — Lines for the team to fix by hand

9 locked-package lines, keyed by release DID. For each: the confirmed pre-corruption value (what it should be), the current value, and what looks off. None of these have been touched by any script.

## 1. `NĐH#-17092026-0081` — Nàng Đi Theo Anh (OST Án Mạng Xém Hoàn Hảo)
TikTok Channel, locked package "Độc Quyền 5 năm"
- Quantity (20), amount (₫14,000,000), and detail are already correct — team's earlier fix got those right.
- One extra entry that shouldn't be there: `TIKTOK VPOP::TIKTOK LYRICS: 5`. This wasn't in the pre-corruption data — it was injected by the corruption itself and never got cleaned up. Current full breakdown: `CAPCUT::TIKTOK CAPCUT: 5, TIKTOK VPOP::TIKTOK LYRICS: 5, TIKTOK BOLERO / MT::TIKTOK LYRICS: 0, EXT TIKTOK - BK GROUP::TIKTOK CAPCUT: 0, EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT: 10, EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT: 0`. Removing the VPOP entry (quantity total already correctly excludes it, so no other change needed) matches the pre-corruption state exactly.

## 2. `SLBL-14032028-0001` — Sống Lại Qua Cơn Bão Giông
Community, locked package "Độc Quyền Vĩnh Viễn"
- Should be: quantity 12, `PAGE INDIE::Facebook: 36` (unchanged — this line's only column was never the corrupted one; the corruption doubled/rewrote the total).
- Currently: quantity 36.

## 3. `GHL#-22082026-0441` — Gửi H
Community, locked package "Độc Quyền 2 năm"
- Should be: quantity 55, `PAGE INDIE::Thread: 3, PAGE INDIE::TikTok: 14, PAGE INDIE::Facebook: 14`, amount ₫11,000,000.
- Currently: quantity 103, brand mix rewritten with two extra PAGE VPOP columns added (`PAGE VPOP::TikTok: 36, PAGE VPOP::Facebook: 36`), amount ₫20,600,000.

## 4. `MĐTS-12082026-0492` — mục đích là gì
Ads / Facebook Ads, locked package "INT MEDIA"
- Should be: amount ₫150,000 (quantity/brand columns not used for this bracket; detail already correct).
- Currently: amount ₫500,000.

## 5. `ÁTCT-25092026-0088` — Ánh Trăng Bật Khóc
TikTok Channel, locked package "Độc Quyền 5 năm"
- Should be: `TIKTOK BOLERO / MT::TIKTOK LYRICS: 20, EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT: 10, EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT: 0` (quantity 30, amount ₫21,000,000 unchanged either way).
- Currently: `CAPCUT::TIKTOK CAPCUT: 3, TIKTOK BOLERO / MT::TIKTOK LYRICS: 15, EXT TIKTOK - BK MUSIC::TIKTOK CAPCUT: 10, EXT TIKTOK - CTV MẪU::TIKTOK CAPCUT: 2` — brand mix rewritten, extra CAPCUT column added.

## 6. `MLHK-11092026-0061` — Muốn Lấy Anh Làm Chồng (Community line — separate from its TikTok Channel line, which is already correct)
Community, locked package "Độc Quyền 5 năm"
- Should be: quantity 9, `PAGE BOLERO / MT::YouTube: 5, PAGE BOLERO / MT::Facebook: 4`, amount ₫1,800,000.
- Currently: quantity 0, both columns zeroed, amount ₫0.

## 7. `VNBL-06082026-0296` — Vượt Nghìn Cây Số
Community, locked package "INT MEDIA"
- Should be: `PAGE INDIE::TikTok: 2, PAGE INDIE::Facebook: 5, PAGE INDIE::Instagram: 3` (quantity 10, amount ₫2,000,000 unchanged either way).
- Currently: `PAGE INDIE::Thread: 1, PAGE INDIE::TikTok: 2, PAGE INDIE::Facebook: 4, PAGE INDIE::Instagram: 3` — extra Thread column, Facebook count off by one.

## 8. `TNTN-27082026-0010` — The Next Artist (Live at Final Stage)
Ads / Facebook Ads, locked package "Độc Quyền 5 năm"
- Should be: amount ₫3,000,000, `Lượt tiếp cận: 30,000`.
- Currently: amount ₫1,500,000, `Lượt tiếp cận: 15,000` — looks like an even halving.

## 9. `BYLN-20082026-0512` — Bình Yên Là Tự Rời Đi
Community, locked package "Độc Quyền 5 năm"
- Should be: quantity 4, `PAGE BOLERO / MT::YouTube: 3, PAGE BOLERO / MT::Facebook: 1`, amount ₫800,000.
- Currently: quantity 0, `PAGE BOLERO / MT::YouTube: 0` (Facebook column dropped entirely), amount ₫0.

---

## Already resolved, no action needed
- `MLHK-11092026-0061`'s **TikTok Channel** line (separate from #6 above) — already matches pre-corruption exactly.
- `ĐHKL-19092026-0080` — fixed via a targeted script that preserved the team's existing hand-fix and only restored the one missing column.
- 28 other lines — restored and independently verified via the Round 433 automated fix.

All of these were confirmed by diffing the release's git-backed 2-hourly Supabase backups (data-backups branch) across the exact corruption window (2026-09-23, 07h→13h) against current production.
