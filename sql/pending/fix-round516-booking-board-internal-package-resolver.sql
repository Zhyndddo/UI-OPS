-- Round 516 — Booking Board: releases whose package is "Internal Package" (INT MEDIA tier) are missing from the board.
-- Symptom: DVTS-07102026-0135 (project_type INT MEDIA, package "Internal Package") has a COMPLETE Media Booking ticket but
-- the Booking Board (INT, search "thịnh suy") shows 0 releases.
-- Cause (checked on a copy of the 13 Oct backup data): the board's server filter asks booking_pkg_for_release() which package
-- belongs to a release. If the live function is the OLD exact-name version (package name = release.project_type), an
-- "Internal Package" under project_type "INT MEDIA" finds nothing -> no target -> release hidden. With the Round 380 version
-- (below) the same data returns the release. The app code already resolves it correctly; only the database function matters.
--
-- STEP 1 (read-only): does the live function know about "Internal Package"? has_internal_rule = false means the old version.
select position('Internal Package' in pg_get_functiondef('booking_pkg_for_release(uuid)'::regprocedure)) > 0 as has_internal_rule;
-- and what it returns for this release (empty = the bug):
select r.did, r.project_type, (select name from media_booking_packages p where p.id = (select pkg_id from booking_pkg_for_release(r.id))) as resolved_package
from releases r where r.did = 'DVTS-07102026-0135';
-- how many INT MEDIA releases are affected (have an Internal Package but resolve to nothing):
select count(*) as affected_releases
from releases r
where r.project_type ~* 'int\s*media'
  and exists (select 1 from media_booking_packages p where p.release_id = r.id and p.name = 'Internal Package')
  and not exists (select 1 from booking_pkg_for_release(r.id));

-- STEP 2: re-apply the resolver (idempotent CREATE OR REPLACE — same as Round 380).
create or replace function booking_pkg_for_release(p_release_id uuid)
returns table(pkg_id uuid) language plpgsql stable as $$
declare
  v_project_type text;
  v_found_id uuid;
begin
  select r.project_type into v_project_type from releases r where r.id = p_release_id;

  -- 1. INT MEDIA follow-up override — only when the release was locked
  -- in as Chỉ Phát Hành (matches the JS's intMediaBuilt precondition).
  if v_project_type = 'Chỉ Phát Hành' then
    select mbp.id into v_found_id
    from media_booking_packages mbp
    where mbp.release_id = p_release_id and mbp.name = 'INT MEDIA'
    limit 1;
    if v_found_id is not null then
      pkg_id := v_found_id;
      return next;
      return;
    end if;
  end if;

  -- 2. Internal Package shortcut override — no project_type
  -- precondition, same as the JS.
  select mbp.id into v_found_id
  from media_booking_packages mbp
  where mbp.release_id = p_release_id and mbp.name = 'Internal Package'
  limit 1;
  if v_found_id is not null then
    pkg_id := v_found_id;
    return next;
    return;
  end if;

  -- 3. Normal case — exact name match to project_type, unchanged from
  -- Round 303.
  select mbp.id into v_found_id
  from media_booking_packages mbp
  where mbp.release_id = p_release_id and mbp.name = v_project_type
  limit 1;
  if v_found_id is not null then
    pkg_id := v_found_id;
    return next;
  end if;
  return;
end;
$$;

-- CHECK: re-run the two STEP 1 queries — has_internal_rule true, resolved_package "Internal Package", affected_releases 0.
-- Then reload the Booking Board: INT tab, search "thịnh suy" should list the release.
