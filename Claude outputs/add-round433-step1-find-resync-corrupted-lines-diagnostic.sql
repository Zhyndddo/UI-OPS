-- Round 433 Step 1 — DIAGNOSTIC ONLY. No writes, safe to run directly.
--
-- Context: "Resync All Releases" was run last Friday, before Round 433's
-- fix. The pre-fix resyncReleasePackages() pushed the SAME computed
-- quantity into EVERY package's matching line for a given
-- release+category+brand — including whichever package the artist had
-- already locked in on the Booking Board with a deliberately different
-- (often smaller) chosen number. Round 433 stops this going forward, but
-- can't tell you which rows that Friday run may already have overwritten,
-- since media_booking_package_lines has no created_at/updated_at and
-- there's no audit_log entry for this tool.
--
-- This query can't prove which rows were touched by that specific run
-- either — but it narrows the field to a short, reviewable list using the
-- same fingerprint you described from the TikTok Channel bug report: a
-- release's LOCKED package (the one the Booking Board actually reads —
-- INT MEDIA / Internal Package / exact project_type name match, same
-- resolution as buildPackageByRelease() in app/booking/page.js) has a
-- quantity for some category+brand bracket that exactly matches at least
-- one other, non-locked package's quantity for that same bracket. Two
-- packages coinciding on a number can happen legitimately, so this is a
-- candidate list for manual review, not a confirmed-corrupted list.
--
-- Paste the result back and we'll go row by row: for any that really do
-- look like Friday's resync artifact, the fix would be a targeted restore
-- of just that media_booking_package_lines row from a Supabase
-- backup/point-in-time-recovery snapshot taken before Friday's run — never
-- a full-table rollback, since that would also undo any legitimate edits
-- made since then. That follow-up SQL will need the pre-Friday value
-- pulled from that snapshot; I have no live DB access to look it up
-- myself.

with locked_pkg as (
  select
    r.id as release_id,
    coalesce(
      (select p.id from media_booking_packages p
        where p.release_id = r.id and p.name = 'INT MEDIA' and r.project_type = 'Chỉ Phát Hành'
        limit 1),
      (select p.id from media_booking_packages p
        where p.release_id = r.id and p.name = 'Internal Package'
        limit 1),
      (select p.id from media_booking_packages p
        where p.release_id = r.id and p.name = r.project_type
        limit 1)
    ) as locked_package_id
  from releases r
  where exists (select 1 from media_booking_packages p where p.release_id = r.id)
),
lines_with_context as (
  select
    l.id as line_id,
    l.package_id,
    l.category_id,
    l.brand,
    l.quantity,
    pkg.release_id,
    pkg.name as package_name,
    lp.locked_package_id,
    (pkg.id = lp.locked_package_id) as is_locked_package
  from media_booking_package_lines l
  join media_booking_packages pkg on pkg.id = l.package_id
  join locked_pkg lp on lp.release_id = pkg.release_id
  where l.quantity is not null
)
select
  r.title as release_title,
  lwc.release_id,
  cat.name as category_name,
  lwc.brand,
  lwc.quantity,
  lwc.package_name,
  lwc.is_locked_package,
  lwc.line_id
from lines_with_context lwc
join package_categories cat on cat.id = lwc.category_id
join releases r on r.id = lwc.release_id
where
  -- the locked package's line for this bracket has a twin: some OTHER
  -- package on the same release, same category+brand, same quantity
  exists (
    select 1
    from lines_with_context locked_line
    join lines_with_context other
      on other.release_id = locked_line.release_id
     and other.category_id = locked_line.category_id
     and coalesce(other.brand, '') = coalesce(locked_line.brand, '')
     and other.line_id <> locked_line.line_id
     and other.quantity = locked_line.quantity
    where locked_line.release_id = lwc.release_id
      and locked_line.category_id = lwc.category_id
      and coalesce(locked_line.brand, '') = coalesce(lwc.brand, '')
      and locked_line.is_locked_package
  )
order by r.title, cat.name, lwc.brand, lwc.is_locked_package desc;
