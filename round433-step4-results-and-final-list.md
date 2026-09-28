# Round 433 Step 4 results — Step 3 confirmed final, 8 more lines for manual review

## Step 4 result, checked

I diffed your Step 4 paste against production and against the 07h/13h backup snapshots:

- **0 of the 36 candidate lines moved** since the 2026-09-28 04h backup — everything is exactly where the sweep expected it. Nothing needs to be re-classified for staleness.
- **All 3 of the manual-review lines are still diverged live**, confirming the team's partial hand-fixes are still in place and untouched (`NĐH#-17092026-0081`, `MLHK-11092026-0061`'s TikTok Channel line, `ĐHKL-19092026-0080`).
- I re-ran your exact rule from the second ask — "check if in a package there are more than 1 package inside and their terms are exactly the same, then apply the fix, otherwise report" — live, against production, for all 36 "still corrupted" candidates.

## Result of applying your rule: the auto-fix list is exactly the 28 lines already in Step 3

Of the 36, **28 still have a live duplicate-quantity sibling package** — the exact fingerprint your rule asks for — and those 28 are, line for line, identical to the 28 already delivered and confirmed in `add-round433-step3-restore-corrupted-locked-lines.sql`. **Run Step 3 as-is — nothing needs to change there.** (Step 5, which I'd built to cover all 36, is now superseded — don't use it; use Step 3.)

## The other 8: pass the "was it corrupted" check but fail the duplicate-sibling test — held for manual review

These 8 lines show the same corruption pattern (values that shifted right at the 09-23 07h→13h boundary, in the same halved-number/rewritten-brand-mix way as the confirmed 28) but **no other package on the release currently shares their exact quantity**, so they don't pass your stricter rule. Per your instruction, these go to your team instead of being auto-fixed:

| DID | Release | Category / Brand | Package | Pre-corruption | Corrupted/current |
|---|---|---|---|---|---|
| `SLBL-14032028-0001` | Sống Lại Qua Cơn Bão Giông | Community | Độc Quyền Vĩnh Viễn | qty 12 | qty 36 |
| `GHL#-22082026-0441` | Gửi H | Community | Độc Quyền 2 năm | qty 55, ₫11,000,000 | qty 103, ₫20,600,000 |
| `MĐTS-12082026-0492` | mục đích là gì | Ads / Facebook Ads | INT MEDIA | ₫150,000 | ₫500,000 |
| `ÁTCT-25092026-0088` | Ánh Trăng Bật Khóc | TikTok Channel | Độc Quyền 5 năm | brand mix: BOLERO/MT 20, BK MUSIC 10, CTV MẪU 0 | brand mix rewritten: CAPCUT 3, BOLERO/MT 15, BK MUSIC 10, CTV MẪU 2 (qty unchanged at 30) |
| `MLHK-11092026-0061` | Muốn Lấy Anh Làm Chồng | Community | Độc Quyền 5 năm | qty 9, ₫1,800,000 | qty 0, ₫0 |
| `VNBL-06082026-0296` | Vượt Nghìn Cây Số | Community | INT MEDIA | brand mix: TikTok 2, FB 5, IG 3 | brand mix rewritten: +Thread 1, FB 4, IG 3 (qty unchanged at 10) |
| `TNTN-27082026-0010` | The Next Artist (Live at Final Stage) | Ads / Facebook Ads | Độc Quyền 5 năm | ₫3,000,000 | ₫1,500,000 |
| `BYLN-20082026-0512` | Bình Yên Là Tự Rời Đi | Community | Độc Quyền 5 năm | qty 4, ₫800,000 | qty 0, ₫0 |

## Full manual-review list is now 11 lines
The 3 already-partially-hand-fixed lines from before, plus these 8. All 11 are flagged by DID above and in the earlier report; none should be touched by SQL.

## What to run
Just **Step 3** (`add-round433-step3-restore-corrupted-locked-lines.sql`) — the 28-line restore, unchanged, now double-confirmed by two independent methods (the original coincidental-match heuristic and this full historical sweep). Ignore Step 5 — it was built before applying your stricter rule and is superseded by this result.
