-- Round 444 -- one-off cleanup, scoped to a single package on a single
-- release: HKH#-26082026-0484 ("Hộp Kí Ức"), package "Độc Quyền 2 năm"
-- (5ac4d8ef-1ecb-4312-829f-c478ed57edae).
--
-- WHY: handleSummarize's Ads branch in
-- app/tickets/media-booking/page.js only ever ADDED/UPDATED a brand's
-- media_booking_package_categories rollup row and media_booking_
-- package_lines line -- it never had a path that REMOVED either one once
-- a brand's DSP-grid entries were deleted back down to zero. Reported
-- directly: entries for Facebook Ads and Spotify Ads were deleted from
-- this package's DSP grid (this package should only carry YouTube Ads
-- under Hạng Mục Ads), Summarize was re-run, but the old Facebook
-- Ads / Spotify Ads rows stayed. The code gap itself is fixed (see the
-- "Round 444" comment in handleSummarize's Ads loop -- a brand with zero
-- entries now gets its rollup row and any stale line(s) deleted instead
-- of silently skipped), so this won't recur. This script is the one-time
-- cleanup for the rows that already exist from before that fix.
--
-- SCOPE: exactly this one package, this one category (Ads), these two
-- brands. Nothing else is touched -- not even this same package's own
-- YouTube Ads row, and not the locked "Độc Quyền 5 năm" package's rows
-- (which legitimately keep Facebook/Spotify/YouTube Ads all three).
--
-- SAFE TO RUN WHETHER OR NOT THE LINE WAS ALREADY HAND-DELETED VIA THE
-- UI'S "Delete" BUTTON: the media_booking_package_lines delete below is a
-- no-op if that row is already gone (RETURNING will just show 0 rows for
-- it). The media_booking_package_categories delete is the part the UI's
-- per-line Delete button never touches, since that rollup row isn't
-- rendered anywhere -- this is the part that actually needed a script.
--
-- Read the two RETURNING result sets after running -- they list exactly
-- which row(s) got removed, so you can confirm it matches what you expect
-- (should be: 1 package_categories row for Facebook Ads, 1 for Spotify
-- Ads, and 0 or 1 package_lines row per brand depending on whether you'd
-- already deleted the line by hand).

begin;

delete from media_booking_package_categories
where release_id = '8781f922-ab47-4be8-969d-e6df69b6a034'
  and package_id = '5ac4d8ef-1ecb-4312-829f-c478ed57edae'
  and category_id = 'e9949f46-19b6-417e-a567-e18625a3af94'
  and brand in ('Facebook Ads', 'Spotify Ads')
returning release_id, package_id, category_id, brand, total_posts, total_money, updated_at;

delete from media_booking_package_lines
where package_id = '5ac4d8ef-1ecb-4312-829f-c478ed57edae'
  and category_id = 'e9949f46-19b6-417e-a567-e18625a3af94'
  and brand in ('Facebook Ads', 'Spotify Ads')
returning id, package_id, category_id, brand, amount, quantity, updated_at;

commit;
