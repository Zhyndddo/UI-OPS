-- Round 442 step 2 -- post-deploy verification. Read-only. Run this right
-- after applying add-round442-package-scope-content-entries.sql and
-- deploying the code, BEFORE anyone starts Summarizing/editing again.
--
-- Three checks. Paste all three result sets back.

-- ── Check 1: schema actually changed as expected ──────────────────────────
-- Expect: both rows present, is_nullable = 'NO' for package_id, and the
-- constraint_count row shows 1 for the new unique constraint.
select
  'media_booking_content_entries.package_id' as what,
  (select is_nullable from information_schema.columns
     where table_name = 'media_booking_content_entries' and column_name = 'package_id') as is_nullable
union all
select
  'media_booking_package_categories.package_id',
  (select is_nullable from information_schema.columns
     where table_name = 'media_booking_package_categories' and column_name = 'package_id')
union all
select
  'media_booking_package_categories_release_package_category_brand_key exists',
  (select count(*)::text from pg_constraint
     where conname = 'media_booking_package_categories_release_package_category_brand_key');

-- ── Check 2: no orphaned package_id (every row's package_id resolves to a
-- real media_booking_packages row, and that package belongs to the same
-- release the entry/rollup row says it does). Expect ZERO rows back. ──────
select 'content_entries' as table_name, e.id, e.release_id, e.package_id
from media_booking_content_entries e
left join media_booking_packages p on p.id = e.package_id
where p.id is null or p.release_id <> e.release_id
union all
select 'package_categories', r.id, r.release_id, r.package_id
from media_booking_package_categories r
left join media_booking_packages p on p.id = r.package_id
where p.id is null or p.release_id <> r.release_id;

-- ── Check 3: backfill-correctness spot check. Immediately after the
-- migration, and before anyone edits anything post-deploy, every package
-- on a release should still show the SAME total_posts/total_money for a
-- given category+brand as every other package on that release -- because
-- the backfill duplicated, it didn't diverge anything yet. If this comes
-- back with rows, something about the backfill (or a same-second real
-- edit that landed mid-migration) is off -- investigate before trusting
-- the migration. Once real Summarize activity starts happening per
-- package post-deploy, this check stops being meaningful (packages are
-- SUPPOSED to diverge from here on) -- only run it once, right after
-- deploy. ───────────────────────────────────────────────────────────────
select
  r.did as release_did,
  r.title as release_title,
  cat.name as category_name,
  rc.brand,
  count(distinct rc.package_id) as package_count,
  count(distinct (rc.total_posts, rc.total_money)) as distinct_value_combos,
  array_agg(distinct rc.total_posts) as total_posts_values
from media_booking_package_categories rc
join releases r on r.id = rc.release_id
join package_categories cat on cat.id = rc.category_id
group by r.did, r.title, cat.name, rc.brand, rc.release_id, rc.category_id
having count(distinct rc.package_id) > 1
   and count(distinct (rc.total_posts, rc.total_money)) > 1
order by r.title, cat.name, rc.brand;
