-- Round 429 — diagnostic for the "Booking Board still shows an old
-- target (e.g. 0/4) after the number was deleted and Summarize was run
-- again" report ("Trăng Rằm Hội Sư"'s Facebook/TikTok · PAGE VPOP
-- columns, but the same class of bug could affect any release).
--
-- WHAT THIS IS FOR — read this before running anything below.
--
-- app/booking/page.js's Booking Board target ("Y" in "X / Y") comes from
-- media_booking_package_lines.brand_column_quantities. The app code
-- (app/tickets/media-booking/page.js's syncPackageLine, Round 429) now
-- self-heals this going forward: every Summarize collapses any duplicate
-- line for the same (package, category, brand) down to one row before
-- writing the fresh numbers into it. But that only fixes it the NEXT
-- time someone re-Summarizes an affected bracket — it doesn't retroactively
-- clean up whatever duplicates (if any) already exist in production right
-- now, and this file has no live database access to check that itself.
--
-- Root cause this targets: media_booking_package_lines has NO unique
-- constraint on (package_id, category_id, brand) — only a bare `id`
-- primary key (confirmed against sql/reference/prod_schema_clean.sql).
-- Its sibling table, media_booking_package_categories, DOES have a real
-- UNIQUE(release_id, category_id, brand) constraint. This asymmetry is
-- what made a duplicate *line* possible in the first place (a duplicate
-- *rollup row* in package_categories never could be — every upsert there
-- is enforced by the DB itself).
--
-- STEP 1 — run this SELECT first. It is 100% read-only and safe to run
-- any time. It lists every (package_id, category_id, brand) that
-- currently has MORE than one line — i.e. every place the display bug
-- could have been possible. An empty result means no duplicates exist at
-- all (the report may then be a different, not-yet-understood bug, or
-- may already be a genuine, structurally-consistent 0/4 for a reason
-- unrelated to duplicates — worth a second look at the specific release
-- rather than assuming this diagnostic is the whole story).

select
  r.title,
  r.did,
  pc.name as category_name,
  l.brand,
  count(*) as duplicate_line_count,
  array_agg(l.id) as line_ids,
  array_agg(l.quantity) as quantities,
  array_agg(l.brand_column_quantities) as brand_column_quantities_per_line
from media_booking_package_lines l
join media_booking_packages pkg on pkg.id = l.package_id
join releases r on r.id = pkg.release_id
join package_categories pc on pc.id = l.category_id
group by r.title, r.did, pc.name, l.brand, l.package_id, l.category_id
having count(*) > 1
order by r.title;

-- STEP 2 — ONLY if Step 1 actually returns rows, and only after someone
-- on the team has eyeballed them: for each duplicate group, keep ONE
-- line and delete the rest, then re-run Summarize (or the "Resync All
-- Releases" tool in Config → Media Booking Pricing) on that release so
-- the survivor gets the correct current numbers written into it — the
-- app-side fix does this automatically the moment anyone re-Summarizes,
-- so deleting the extra row(s) here is the only manual step needed; you
-- do NOT need to figure out by hand which duplicate has "the right"
-- numbers, since re-Summarizing overwrites whichever one survives with
-- the true current total anyway.
--
-- No blanket automatic DELETE is included here on purpose — which row to
-- keep when two duplicates both have real (but different, possibly both
-- stale) numbers isn't something this file can safely decide without a
-- human looking at Step 1's output first, and media_booking_package_lines
-- has no created_at/updated_at column to sort by even if it wanted to
-- guess. A safe, explicit per-row delete looks like:
--
--   delete from media_booking_package_lines where id = '<the-id-to-drop>';
--
-- STEP 3 — ONLY after confirming Step 1 returns ZERO rows (either it
-- already did, or you've cleaned up every duplicate Step 2 found): this
-- adds the missing constraint so this can never happen again at the
-- database level, matching media_booking_package_categories' own
-- UNIQUE(release_id, category_id, brand). Left commented out — running
-- this while duplicates still exist will fail outright (Postgres refuses
-- to add a UNIQUE constraint over rows that violate it), which is exactly
-- the safety check that makes it fine to leave uncommented once Step 1 is
-- clean.
--
-- alter table media_booking_package_lines
--   add constraint media_booking_package_lines_package_category_brand_key
--   unique (package_id, category_id, brand);
