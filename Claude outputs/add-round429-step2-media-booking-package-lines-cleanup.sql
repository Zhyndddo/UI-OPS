-- Round 429, Step 2 — actual cleanup, generated from the Step 1 diagnostic
-- output the user ran against production on 2026-09-24 (see
-- add-round429-media-booking-package-lines-dedup-check.sql for the full
-- background/root-cause writeup — read that file first if you haven't).
--
-- Step 1 found 15 releases with a duplicate media_booking_package_lines
-- row for the same (package, category, brand) — 14 in Ads, 1 in Social
-- ("Sống Lại Qua Cơn Bão Giông", the TikTok/Facebook·PAGE VPOP-style case
-- that started this whole investigation). For each group below, one id is
-- kept and the rest are deleted — which one survives doesn't matter (see
-- Step 1's own comment: the numbers on the survivor are stale either way
-- until the release is re-Summarized, see the REQUIRED FOLLOW-UP note at
-- the bottom of this file).
--
-- Safe to run as one transaction — every id here was read directly off
-- Step 1's own output, not guessed.

begin;

-- Album Rainbow (ARJN170526-0464) — Ads
delete from media_booking_package_lines where id = 'fc33c1c8-4ffb-43c7-89ff-ea74ef64dd34';

-- Ánh Sao Việt Nam (ÁSVM200426-0401) — Ads
delete from media_booking_package_lines where id = '85b8a8b6-03f4-4d53-8266-d875e931ee5f';

-- Cảm Ơn Đã Chung Đường (CƠBD060526-0486) — Ads
delete from media_booking_package_lines where id = '946bba14-006e-48b5-9d4c-9898414690ee';

-- Có Bác Trong Tim (CBXX220426-0500) — Ads
delete from media_booking_package_lines where id = '03e0b403-6806-4405-b9cb-681e46e7ce5d';

-- Dắt Nhau Lên Rừng (DNNP300726-0297) — Ads
delete from media_booking_package_lines where id = '800f5fc4-288a-4271-85ac-8a756d5e7aa7';

-- Dịu Dàng Dịu Dàng (DDÁP220726-0308) — Ads
delete from media_booking_package_lines where id = 'b2396d9b-646d-49e2-992d-4b8bfb3822d1';

-- Fun Fiction (FFK0150626-0390) — Ads (3-way duplicate, keep one, drop two)
delete from media_booking_package_lines where id in (
  '9f6d23ee-de0f-43b0-be2f-f59ead738818',
  'c74b1c2f-d448-4ecf-bdc7-e6ca7de61204'
);

-- Níu Kéo Mãi Không Phải Cách (NKBA250626-0358) — Ads
delete from media_booking_package_lines where id = 'fe097a23-5a47-4618-8d42-1ec4bc98c5cb';

-- Sống Lại Qua Cơn Bão Giông (SLBL-14032028-0001) — Social (the reported case)
delete from media_booking_package_lines where id = '6660c49c-cc96-400c-824c-a9919e967869';

-- Thôn Đông Thôn Đoài (TĐHM290126-0651) — Ads
delete from media_booking_package_lines where id = '57524df9-5119-4bf1-a678-ea321b382edb';

-- Tiễn Người Tôi Yêu (OST Đại Tiệc Trăng Máu 8) (TNML140426-0513) — Ads
delete from media_booking_package_lines where id = '3a5134d2-2095-46af-8f21-8bbc524dfd98';

-- Tiếng Ru Then (OST Phí Phông) (TR50130426-0516) — Ads
delete from media_booking_package_lines where id = '6e3c98e8-19d1-42bd-a4a2-e97d069dff14';

-- Tre Trăm Đốt (TTO0270526-0443) — Ads
delete from media_booking_package_lines where id = '00da9d3a-340c-40e5-b15e-58d9b2859156';

-- Vì Em Còn Bé (VETN050526-0487) — Ads
delete from media_booking_package_lines where id = '6dfb0957-eb52-485c-9842-b80bc240b252';

-- Xuân Ca (XCC0050226-0622) — Ads (3-way duplicate, keep one, drop two)
delete from media_booking_package_lines where id in (
  '9cc7ff22-4549-41c1-95b0-355bd60cd8ec',
  '97142b78-9299-4911-b3d6-b80246651bed'
);

-- Sanity check before committing — should return zero rows. If it
-- doesn't, ROLLBACK instead of COMMIT and send the output back.
select
  r.title, r.did, pc.name as category_name, l.brand, count(*) as still_duplicated
from media_booking_package_lines l
join media_booking_packages pkg on pkg.id = l.package_id
join releases r on r.id = pkg.release_id
join package_categories pc on pc.id = l.category_id
where l.id in (
  '4022e963-9f57-450b-aa13-0d110e558f86', '1496fb1f-8b56-4388-aed3-0d9150a93c4a',
  'f7701b99-5b92-4efe-ad26-e95cd7ade616', 'be3daf30-06ca-4ccd-8c34-159b7f08ab5e',
  '8d930d11-50d2-42b1-b05f-e0cdb05d9e35', 'db3e170b-906a-4af6-a4cb-a782f99ed4d5',
  'eb6056c0-ec92-47b9-b59e-fe4f1bd6dde1', '48251d9c-3023-4b29-83b0-5a48f8a0e11b',
  'adac1ead-e938-4d58-af4d-055eef753711', '9e695392-4c86-48b0-810a-e1636b12700b',
  '008ff759-a764-4f0e-87ee-38af55828bbc', '96580ad8-4c26-4556-9503-c36354401df7',
  '94868dd8-9c57-41fa-9ebd-dc3618eeb823', 'db7b4abe-c489-4d05-90cd-b43cbd598a52',
  '8a766578-65aa-4980-a01a-27d3a65b36aa'
)
group by r.title, r.did, pc.name, l.brand, l.package_id, l.category_id
having count(*) > 1;

commit;

-- REQUIRED FOLLOW-UP — do this for all 15 releases above, not optional:
--
-- Deleting the extra row does NOT fix the number on the survivor — it
-- just removes the duplicate. The survivor could just as easily have kept
-- the wrong (stale) quantity of the two/three that existed. Every one of
-- these 15 releases needs to be re-Summarized (open the release in
-- app/tickets/media-booking, hit Summarize again for the affected
-- category/brand) OR run through Config → Media Booking Pricing →
-- "Resync All Releases" (the Round 418 tool) so the survivor gets
-- overwritten with today's true total from the entry grid. Until that
-- happens, the Booking Board number for these releases may still be
-- wrong even though it's no longer duplicated.
--
-- After all 15 are re-Summarized/resynced, re-run Step 1's original
-- SELECT (add-round429-media-booking-package-lines-dedup-check.sql) once
-- more to confirm zero duplicates, THEN run that file's Step 3 (the
-- unique constraint) so this can't happen again.
