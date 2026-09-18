-- Round 380 — follow-up to Round 378/379. User confirmed the release now
-- shows on the Board (under INT), but every column reads "0 / —" even
-- though a real package should be backing it ("it should have one. The
-- INT package, wherever that is written too").
--
-- ROOT CAUSE #3 — booking_pkg_for_release() (Round 303) finds "the
-- package actually locked in for a release" by exact name match to
-- releases.project_type:
--   where mbp.release_id = p_release_id and mbp.name = r.project_type
--
-- But app/pick-package/[token]/page.js has a documented override this
-- never accounted for (see that file's "INT MEDIA follow-up override"
-- comment, ~line 579): once Marketing builds a real "INT MEDIA" package
-- for a release that was originally locked as "Chỉ Phát Hành", that
-- built package REPLACES the plain Chỉ Phát Hành pick on the magic
-- link — but releases.project_type is deliberately left as "Chỉ Phát
-- Hành" forever ("This never touches releases.project_type... purely
-- what's shown on this page"). A second, similar shortcut exists too:
-- "Internal Package" (app/releases/[id]/page.js's
-- sendInternalPackageTicket), which overrides regardless of
-- project_type, INT MEDIA taking precedence if both exist.
--
-- So for a release using either override, booking_pkg_for_release kept
-- searching for a package literally named "Chỉ Phát Hành" (or whatever
-- project_type actually is) — which never exists, since SIMPLE_OPTIONS
-- packages (Chỉ Phát Hành) never get a built package row at all. It
-- always returned null, so every booked/target number for that release
-- read null/"—" regardless of a real, built INT MEDIA or Internal
-- Package sitting right there with real media_booking_package_lines.
-- This is a pre-existing gap in the Round 303 port, not specific to
-- Round 378/379's changes — it would affect ANY release using either
-- follow-up override, not just Chỉ Phát Hành ones.
--
-- FIX — CREATE OR REPLACE booking_pkg_for_release(), ported branch for
-- branch from the JS's intMediaBuilt / internalPackageBuilt / followUpBuilt
-- resolution:
--   1. If project_type = 'Chỉ Phát Hành' and a package named 'INT MEDIA'
--      exists for this release, use it.
--   2. Else if a package named 'Internal Package' exists for this
--      release (regardless of project_type), use it.
--   3. Else, the original behavior: match by exact name to project_type.
-- Every other function (booking_booked_for, booking_brand_has_any_target,
-- etc.) already calls booking_pkg_for_release and needs no changes of its
-- own — they inherit the fix automatically.
--
-- Same caveats as every migration in this pending/ folder — I have no
-- live database access in this environment. Please:
--   1. Run this on a copy/staging project first if at all possible.
--   2. After deploying, confirm this release's columns now show real
--      target numbers (not "—") matching the INT MEDIA package's actual
--      line quantities, and that "added" still correctly reflects
--      whatever's actually been logged via the Board's Add Link popup
--      (0 if nothing's been logged there yet — that part was already
--      correct and is untouched by this fix).
--   3. Spot-check a couple of OTHER releases that went through the same
--      INT MEDIA/Internal Package follow-up flow (not just this one) —
--      this fix applies to all of them, so their numbers may change too
--      (from wrong-zero to correct) once this is deployed.
--
-- Idempotent: CREATE OR REPLACE, safe to re-run.

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
