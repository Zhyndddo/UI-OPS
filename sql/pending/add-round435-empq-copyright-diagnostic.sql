-- Round 435 -- read-only diagnostic for the "Q1: TBU · Q2: TBU · Q3: TBU"
-- report on EMPQ-27092026-0071 ("Em Muốn"). Confirms (or refutes) the
-- theory: the release-level copyright_checklist is stale leftover data
-- from before this release was set up as EP/Album, while the real,
-- fully-declared rights live per-track in release_tracks -- and the
-- Releases list ("Booking Board") subrow was reading the stale column
-- because it never checked single_album_ep. Nothing here writes anything.

-- 1. The release's own type + its (likely stale) release-level checklist.
select
  id,
  did,
  title,
  single_album_ep,
  copyright_checklist
from releases
where did = 'EMPQ-27092026-0071';

-- 2. Every track's own checklist -- expect 5 rows, each with owner/
--    contract/validity actually filled in (matching the "5/5 tracks fully
--    declared" badge on the Copyrights tab).
select
  t.id,
  t.sort_order,
  t.track_name,
  t.copyright_checklist
from release_tracks t
join releases r on r.id = t.release_id
where r.did = 'EMPQ-27092026-0071'
order by t.sort_order;
