-- Round 463 — SAHG-19082026-0514 "Số Ai Người Đó Xài" is project_type
-- 'Chỉ Phát Hành' (locked, int_media_requested = false) but carries a
-- 'INT MEDIA' draft package (3 lines, created 2026-10-01) that nobody can
-- delete from the Package Builder. Backup 2026-10-01_03h confirms the package
-- (id 653a480e-...) and its 3 lines; lines/rollups/snapshots cascade-delete.
--
-- STEP 1 — look first (read-only):
select p.id, p.name, p.status, p.created_at, r.did, r.project_type, r.int_media_requested,
       (select count(*) from media_booking_package_lines l where l.package_id = p.id) as lines
from media_booking_packages p join releases r on r.id = p.release_id
where r.did = 'SAHG-19082026-0514';

-- STEP 2 — delete it. Guarded so it only removes an INT MEDIA package on this
-- exact release while it is still Chỉ Phát Hành and no INT MEDIA follow-up was
-- requested. Safe to re-run (second run deletes 0 rows).
delete from media_booking_packages p
using releases r
where r.id = p.release_id
  and r.did = 'SAHG-19082026-0514'
  and r.project_type = 'Chỉ Phát Hành'
  and coalesce(r.int_media_requested, false) = false
  and p.name = 'INT MEDIA'
returning p.id, p.name;
