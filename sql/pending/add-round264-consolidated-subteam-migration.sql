-- Round 264 — consolidated fix. Replaces add-round262-subteam-rework.sql,
-- add-round263-drop-marketing-subteam-rows.sql, and
-- add-round264-drop-subteams-table.sql — run THIS ONE instead of those
-- three (they're now stubbed out below to point here).
--
-- What happened: round 262's migration apparently never fully landed —
-- releases.subteam_tags_locked was missing, and round 263's "delete from
-- subteams" then failed with "relation subteams does not exist" (either
-- round 262 never created it, or round 264's drop already removed it).
-- Since the app no longer uses a `subteams` table at all (round 264
-- hardcoded every team's subteam list into code — see
-- lib/teamTypes.js's TEAM_SUBTEAMS and lib/projectTags.js's
-- MARKETING_SUBTEAM_TAGS), this script just does everything the app
-- actually needs, safe to run no matter what state your DB is
-- currently in — every step is idempotent (IF NOT EXISTS / IF EXISTS /
-- guarded existence checks), so running it twice, or after any subset
-- of the three old scripts, is harmless.

-- 1. profiles.subteam — needed regardless of round 262/263/264 history.
alter table profiles add column if not exists subteam text;

-- 2. Fold Youtube/Publishing/Operation segments back into OPS, moving the
--    old segment onto subteam (only if a profile doesn't already have a
--    subteam set some other way). No-op if this already ran.
update profiles
set subteam = coalesce(subteam, segment), segment = 'OPS'
where segment in ('Youtube', 'Publishing', 'Operation');

-- 3. releases.subteam_tags / subteam_tags_locked — the actual columns
--    the app reads and writes (app/releases/page.js, app/releases/[id]/
--    page.js). This is the pair that was missing.
alter table releases add column if not exists subteam_tags jsonb not null default '{}'::jsonb;
alter table releases add column if not exists subteam_tags_locked jsonb not null default '{}'::jsonb;

-- 4. Fold any legacy project_tag data (Round 258/260, retired) into the
--    new columns — guarded, since project_tag may or may not exist
--    depending on your DB's history.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'releases' and column_name = 'project_tag'
  ) then
    update releases
    set
      subteam_tags = subteam_tags || jsonb_build_object(project_tag, true),
      subteam_tags_locked = subteam_tags_locked || jsonb_build_object(project_tag, true)
    where project_tag is not null;
  end if;
end $$;

-- 5. Drop the now-fully-retired `subteams` table, whether or not it was
--    ever created.
drop table if exists subteams;
