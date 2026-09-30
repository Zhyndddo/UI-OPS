-- Round 439 v2 -- fixes the drift monitor's own false-positive flood.
-- Read-only. Same purpose and logic as
-- add-round439-locked-package-drift-monitor.sql; USE THIS VERSION GOING
-- FORWARD instead of the original.
--
-- What was wrong: add-round439-media-booking-lines-updated-at.sql added
-- media_booking_package_lines.updated_at with `default now()`, which
-- backfilled EVERY pre-existing row to the exact moment that migration
-- ran: 2026-09-30 10:35:47.462947+00. Because a locked line is *supposed*
-- to never be touched again, nothing overwrites that backfilled value for
-- most of them -- so on every run, forever, they keep looking "newer than
-- their last snapshot" even though nothing actually happened to them.
-- This is NOT a one-run fluke; it repeats indefinitely until fixed.
--
-- The fix: exclude that one exact, known backfill timestamp from the
-- comparison. This is safe to hardcode -- it's a real value that occurred
-- exactly once, and the BEFORE UPDATE trigger guarantees any genuine
-- future write to a line gets a fresh, distinct microsecond-precision
-- now() at write time, so there's no realistic way a real write collides
-- with it.
--
-- Everything else (purpose, "expect zero rows", how to read age_gap) is
-- unchanged from the v1 file's header comment.
with locked_package_per_release as (
  select
    r.id as release_id,
    (
      select p.id from media_booking_packages p
      where p.release_id = r.id
        and (
          (r.project_type = 'Chỉ Phát Hành' and p.name = 'INT MEDIA')
          or p.name = 'Internal Package'
          or p.name = r.project_type
        )
      order by
        case when r.project_type = 'Chỉ Phát Hành' and p.name = 'INT MEDIA' then 0
             when p.name = 'Internal Package' then 1
             else 2 end
      limit 1
    ) as locked_package_id
  from releases r
  where r.package_locked is true and r.project_type is not null
)
select
  r.did as release_did,
  r.title as release_title,
  pkg.name as package_name,
  cat.name as category_name,
  l.brand,
  l.id as line_id,
  l.quantity as current_quantity,
  l.amount as current_amount,
  l.updated_at as line_updated_at,
  snap.latest_snapshot as latest_entry_snapshot,
  (l.updated_at - coalesce(snap.latest_snapshot, 'epoch'::timestamptz)) as age_gap
from locked_package_per_release lpr
join releases r on r.id = lpr.release_id
join media_booking_packages pkg on pkg.id = lpr.locked_package_id
join media_booking_package_lines l on l.package_id = pkg.id
join package_categories cat on cat.id = l.category_id
left join lateral (
  select max(s.updated_at) as latest_snapshot
  from media_booking_package_entry_snapshots s
  where s.package_id = l.package_id and s.category_id = l.category_id
) snap on true
where lpr.locked_package_id is not null
  -- known one-time backfill artifact from add-round439-media-booking-lines-
  -- updated-at.sql's `default now()` -- not a real write, exclude it.
  and l.updated_at <> '2026-09-30 10:35:47.462947+00'::timestamptz
  and l.updated_at > coalesce(snap.latest_snapshot, 'epoch'::timestamptz) + interval '2 minutes'
order by age_gap desc, r.title, cat.name, l.brand;
