-- Round 442 -- make media_booking_content_entries and
-- media_booking_package_categories PACKAGE-scoped, not just
-- release-scoped, so different packages on the same release (e.g. a
-- release with both "Độc Quyền 2 năm" and "Độc Quyền 5 năm") can carry
-- genuinely independent quantities for the rollup categories (Community,
-- Social, TikTok Channel, Ads) instead of silently converging.
--
-- ROOT CAUSE: both tables have only ever been keyed by
-- (release_id, category_id, brand) -- there is no package_id column on
-- either one. media_booking_package_lines (the actual built package line
-- items) already has package_id and is correctly package-scoped; these
-- two tables never got the same treatment. So when a user clicks
-- "Summarize" on ANY package's tab for a given category+brand, it reads
-- and writes the ONE shared release-wide row in
-- media_booking_package_categories (and the DSP grid itself,
-- media_booking_content_entries, is the same shared release-wide rows
-- too) -- any two packages on the same release that both get Summarized
-- for the same category+brand inevitably end up showing identical
-- quantities, because they are literally reading/writing the same rows.
-- This was NOT desired (confirmed with the team) and is systemic, not a
-- one-off: a forensic sweep found 44 of 46 releases with 2+ packages
-- already show this convergence (161 converged line-pairs). See
-- claude/round433-full-sweep-report.md and round433-team-handoff-list.md
-- for that sweep.
--
-- FIX: add a nullable package_id to both tables, backfill it, then make
-- it NOT NULL and fold it into each table's natural key.
--
-- BACKFILL STRATEGY -- why DUPLICATE instead of assigning to one package:
-- Every existing row is currently shared across every package a release
-- has. Assigning it to just one of those packages would silently ZERO OUT
-- every OTHER package's on-screen numbers for that category+brand the
-- instant this migration runs -- a real data-loss regression nobody asked
-- for and the exact opposite of what round433's forensic sweep flagged as
-- a problem worth fixing carefully. Instead, this backfill DUPLICATES each
-- existing row once per media_booking_packages row that already exists
-- for that release_id -- i.e. every package that was silently sharing one
-- rollup/grid row now gets its OWN independent copy of the exact same
-- numbers it was already showing on screen. Nothing on screen changes the
-- moment this migration runs; every package just stops being tied to
-- every other package's future edits. This is also exactly what
-- app/tickets/media-booking/page.js's "Clone Package" flow now does going
-- forward (see its Round 442 comment) for a package cloned after this
-- migration -- so the backfill and the app's own clone behavior use the
-- same "independent copy" model.
--
-- A release with a package created AFTER this migration runs simply
-- starts with zero content_entries/package_categories rows for that new
-- package -- built up via the UI same as any package always has been. No
-- special-casing needed for that in this script.
--
-- Idempotent / safe to run more than once:
--   * "add column if not exists" for package_id itself.
--   * The backfill INSERT is guarded by "where package_id is null" (via
--     the temporary nullable column staying null until backfilled) --
--     once every row has a real package_id, re-running the backfill
--     SELECT finds nothing left to duplicate FROM (its own source rows
--     already all have package_id set), so it's a safe no-op on a second
--     run.
--   * Constraint/index drops use "if exists" before re-adding.
-- Wrapped in a single transaction so it either fully applies or not at
-- all.

begin;

-- ── 1. Add the new column (nullable for now -- backfilled below, then
--       locked to NOT NULL at the end). ──────────────────────────────────
alter table media_booking_content_entries
  add column if not exists package_id uuid references media_booking_packages(id) on delete cascade;

alter table media_booking_package_categories
  add column if not exists package_id uuid references media_booking_packages(id) on delete cascade;

-- ── 1b. Drop the OLD UNIQUE(release_id, category_id, brand) constraint
--       BEFORE the backfill below -- the backfill deliberately inserts
--       several rows that share the same (release_id, category_id, brand)
--       (one per package), which is exactly what this old constraint
--       exists to prevent. Dropping it here, rather than down in step 5
--       where it originally lived, is the actual fix for the
--       "duplicate key value violates ... release_id_category_id_brand_key"
--       error this migration hit on its first real run -- the old
--       constraint can't still be in place while the backfill runs. ──────
alter table media_booking_package_categories
  drop constraint if exists media_booking_package_categori_release_id_category_id_brand_key;

-- ── 2. Backfill: duplicate every still-unscoped row once per package the
--       row's release already has. Guarded by "package_id is null" on the
--       SOURCE side, so a second run of this script (after the first run
--       already gave every row a package_id) finds no unscoped source rows
--       left and inserts nothing. ─────────────────────────────────────────

-- media_booking_content_entries: duplicate each null-package_id row once
-- per media_booking_packages row on its release_id. created_at is left to
-- its own default (now()) on the copies -- these are new rows, not a
-- history rewrite.
insert into media_booking_content_entries (
  release_id, package_id, category_id, channel_id, platform, brand,
  channel_count, count_tung_hint, count_out_now, count_listen_now,
  count_addin_post, count_posts, channel_count_dot2, count_posts_dot2,
  unit_price, sort_order
)
select
  e.release_id, p.id, e.category_id, e.channel_id, e.platform, e.brand,
  e.channel_count, e.count_tung_hint, e.count_out_now, e.count_listen_now,
  e.count_addin_post, e.count_posts, e.channel_count_dot2, e.count_posts_dot2,
  e.unit_price, e.sort_order
from media_booking_content_entries e
join media_booking_packages p on p.release_id = e.release_id
where e.package_id is null;

-- The original (still-null) rows are now redundant -- every package that
-- was reading them has its own copy above. Delete them so package_id can
-- go NOT NULL below. (If a release somehow has content_entries rows but
-- ZERO media_booking_packages rows yet, the join above produces no copies
-- for it and this delete would silently drop that release's grid data --
-- guarded against explicitly, see the check right before the delete.)
do $$
declare
  orphaned_count integer;
begin
  select count(*) into orphaned_count
  from media_booking_content_entries e
  where e.package_id is null
    and not exists (select 1 from media_booking_packages p where p.release_id = e.release_id);

  if orphaned_count > 0 then
    raise exception 'Round 442 backfill: % media_booking_content_entries row(s) belong to a release with NO media_booking_packages row yet -- cannot backfill package_id for them without picking a package. Investigate before re-running (e.g. does that release need a package created first?).', orphaned_count;
  end if;
end $$;

delete from media_booking_content_entries where package_id is null;

-- media_booking_package_categories: same duplicate-per-package strategy.
insert into media_booking_package_categories (
  release_id, package_id, category_id, brand, total_posts, unit_price,
  total_money, detail_text, tier_type, skipped, metric_quantities,
  platform_quantities
)
select
  r.release_id, p.id, r.category_id, r.brand, r.total_posts, r.unit_price,
  r.total_money, r.detail_text, r.tier_type, r.skipped, r.metric_quantities,
  r.platform_quantities
from media_booking_package_categories r
join media_booking_packages p on p.release_id = r.release_id
where r.package_id is null;

do $$
declare
  orphaned_count integer;
begin
  select count(*) into orphaned_count
  from media_booking_package_categories r
  where r.package_id is null
    and not exists (select 1 from media_booking_packages p where p.release_id = r.release_id);

  if orphaned_count > 0 then
    raise exception 'Round 442 backfill: % media_booking_package_categories row(s) belong to a release with NO media_booking_packages row yet -- cannot backfill package_id for them without picking a package. Investigate before re-running.', orphaned_count;
  end if;
end $$;

delete from media_booking_package_categories where package_id is null;

-- ── 3. Lock package_id NOT NULL now that every row has one. ──────────────
alter table media_booking_content_entries
  alter column package_id set not null;

alter table media_booking_package_categories
  alter column package_id set not null;

-- ── 4. Replace the old non-unique lookup index on content_entries with
--       one that includes package_id (matches the new query shape: every
--       fetch now filters by release_id + package_id + category_id). ─────
drop index if exists idx_mb_content_entries_lookup;
create index idx_mb_content_entries_lookup on media_booking_content_entries (release_id, package_id, category_id);

-- ── 5. Add the NEW unique constraint, including package_id -- the old one
--       was already dropped in step 1b above, before the backfill ran.
--       This is what makes Summarize's upsert (onConflict:
--       "release_id,package_id,category_id,brand") land on a row scoped
--       to just the active package. Guarded so a second run (constraint
--       already added) doesn't error. ───────────────────────────────────
alter table media_booking_package_categories
  drop constraint if exists media_booking_package_categories_release_package_category_brand_key;

alter table media_booking_package_categories
  add constraint media_booking_package_categories_release_package_category_brand_key
  unique (release_id, package_id, category_id, brand);

-- media_booking_content_entries never had a UNIQUE constraint (only the id
-- pkey + the non-unique lookup index recreated in step 4 above) -- a
-- release/package/category/brand can have many manually-added rows (one
-- per DSP/platform row the user added with "+Platform"), so no unique
-- constraint is added here; this matches the pre-migration shape exactly,
-- just with package_id folded into the lookup index.

commit;
