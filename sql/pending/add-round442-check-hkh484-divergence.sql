-- Round 442 follow-up -- read-only. Scoped to HKH#-26082026-0484 ("Hộp Kí
-- Ức"), the release this whole investigation started from.
--
-- Two things this answers:
--  1) Does package_id actually exist on these rows in THIS database right
--     now (settles whether the git-backed backup pipeline is reading a
--     different project, or is just stale).
--  2) For each category+brand this release's two packages share, what's
--     the CURRENT value per package, and when did each package's own
--     rollup row last change -- i.e. are they still sitting on the
--     backfill's duplicated (shared) numbers, or has anything actually
--     diverged since the fix went live.
select
  pkg.name as package_name,
  pkg.id as package_id,
  cat.name as category_name,
  rc.brand,
  rc.total_posts,
  rc.total_money,
  rc.updated_at as rollup_updated_at,
  rc.id as rollup_row_id
from media_booking_package_categories rc
join media_booking_packages pkg on pkg.id = rc.package_id
join package_categories cat on cat.id = rc.category_id
where rc.release_id = '8781f922-ab47-4be8-969d-e6df69b6a034'
order by cat.name, rc.brand, pkg.name;
