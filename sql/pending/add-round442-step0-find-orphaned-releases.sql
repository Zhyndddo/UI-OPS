-- Round 442 step 0 -- read-only. Run this BEFORE re-running
-- add-round442-package-scope-content-entries.sql, to find the release(s)
-- whose media_booking_content_entries rows have no media_booking_packages
-- row to backfill into. The migration aborted (transaction rolled back,
-- nothing changed) rather than guess/drop these.
select
  r.id as release_id,
  r.did as release_did,
  r.title as release_title,
  r.project_type,
  r.package_locked,
  count(e.id) as orphaned_entry_rows,
  array_agg(distinct cat.name) as categories_involved
from media_booking_content_entries e
join releases r on r.id = e.release_id
join package_categories cat on cat.id = e.category_id
where not exists (
  select 1 from media_booking_packages p where p.release_id = e.release_id
)
group by r.id, r.did, r.title, r.project_type, r.package_locked
order by r.title;
