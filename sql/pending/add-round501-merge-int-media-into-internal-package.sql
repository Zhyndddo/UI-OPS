-- Round 501 — INT MEDIA and Internal Package are one tier now, labelled
-- "Internal Package". The app already treats both names the same; this just
-- renames old packages so the data matches. Run PART 1 first (preview).

-- PART 1 — preview: INT MEDIA packages, and which ones clash with an
-- existing Internal Package on the same release (those are skipped).
select p.id, r.did, p.name,
       exists (select 1 from media_booking_packages x
               where x.release_id = p.release_id and x.name = 'Internal Package') as clashes
from media_booking_packages p
join releases r on r.id = p.release_id
where p.name = 'INT MEDIA'
order by r.did;

-- PART 2 — rename (skips clashes).
update media_booking_packages p
set name = 'Internal Package'
where p.name = 'INT MEDIA'
  and not exists (select 1 from media_booking_packages x
                  where x.release_id = p.release_id and x.name = 'Internal Package');
