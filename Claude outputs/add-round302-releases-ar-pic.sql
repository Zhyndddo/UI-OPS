-- Round 302 — the Releases dashboard's own AR PIC field, per explicit
-- correction: Round 300 originally built the release detail page's PIC
-- control reusing the New Release Setup / Upload workstation's PIC data
-- (workstation_assignments, workstation="upload", an OPS field) — wrong.
-- "shooot, dashboard PIC is AR team, can you make the change, it's
-- currently ops team members" / "NEW release setup is for OPS, the
-- dashboard and its detail pages is for AR". This is a separate, new
-- field for that AR PIC — the Upload workstation's own OPS PIC is
-- untouched.
--
-- Plain column on releases (uuid, FK to profiles), same shape as Round
-- 281's releases.created_by_profile_id. NOTE this is now a SECOND FK from
-- releases to profiles — if any query ever does an implicit
-- `.select("*, profiles(name)")` embed off releases in the future,
-- PostgREST will refuse it as ambiguous (see Round 283's writeup of the
-- same issue on `tickets`) and need the explicit
-- `profiles!releases_ar_pic_profile_id_fkey(name)` form instead. No
-- existing code does that today (checked via grep before writing this),
-- so nothing breaks right now.
--
-- Idempotent: safe to run more than once.
alter table if exists releases
  add column if not exists ar_pic_profile_id uuid references profiles(id);

create index if not exists idx_releases_ar_pic_profile_id on releases(ar_pic_profile_id);
