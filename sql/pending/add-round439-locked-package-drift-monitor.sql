-- Round 439 -- the repeatable, going-forward answer to "is the bug gone".
-- Read-only. Requires add-round439-media-booking-lines-updated-at.sql to
-- have been run first (needs media_booking_package_lines.updated_at).
--
-- Unlike Round 433's step6 (which checks specific line ids against
-- specific hardcoded historical values -- a one-time forensic tool for
-- THAT corruption event), this has no hardcoded targets at all, so it
-- keeps working for any release, indefinitely. Run this anytime --
-- weekly, or after every "Resync All Releases" click -- to check whether
-- anything is touching a locked package's lines without a matching human
-- Summarize.
--
-- Logic: for every release with a resolvable locked package (same name-
-- match rule as resolveLockedPackageId() in lib/mediaBookingResync.js and
-- buildPackageByRelease() in app/booking/page.js), find every line in
-- that package whose updated_at is NEWER than the most recent matching
-- media_booking_package_entry_snapshots row for the SAME package+category.
-- A real Summarize always writes both together in the same request (see
-- handleSummarize -> syncPackageLine + saveEntrySnapshot); a line moving
-- without a fresh snapshot alongside it is the exact signature the
-- original "Resync All" bug had, and would catch any future variant of
-- it (a different bulk tool, a stray script, a raw SQL edit) too.
--
-- Expect ZERO rows in the normal case. A returned row doesn't
-- automatically mean corruption -- check age_gap first: a locked package
-- line legitimately NEVER needing to move is common (that's the whole
-- point of "locked"), and a huge age_gap on a line that's simply never
-- been re-Summarized since entry-snapshots started existing (Round 287,
-- 2026-09-09) is expected staleness, not a bypass. What's suspicious is a
-- SMALL age_gap alongside a genuinely surprising value, or the same
-- pattern repeating across many releases at once (the bulk-write
-- signature) -- read the flagged rows' actual numbers, don't just alert
-- on the row count.
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
  -- flag anything where the line moved more recently than its own
  -- package's last real Summarize for that category (by more than a
  -- couple minutes, to allow for the snapshot/line writes' own small
  -- sequencing gap within one handleSummarize call).
  and l.updated_at > coalesce(snap.latest_snapshot, 'epoch'::timestamptz) + interval '2 minutes'
order by age_gap desc, r.title, cat.name, l.brand;
