-- Round 264 — consolidated fix, v2. Replaces
-- add-round262-subteam-rework.sql, add-round263-drop-marketing-subteam-
-- rows.sql, and add-round264-drop-subteams-table.sql — run THIS ONE
-- instead of those three (they're now stubbed out to point here).
--
-- v2 change: the whole thing is now ONE atomic `do $$ ... $$` block
-- instead of several separate statements. The first version kept
-- failing with "column releases.subteam_tags_locked does not exist"
-- even after being told to fix it — the most likely cause is the
-- separate statements getting run out of order or only partially (e.g.
-- pasting/running just the later UPDATE without the ALTER TABLE above
-- it, or an earlier statement erroring and rolling back everything after
-- it in the same paste). A single DO block can't be run "half" — select
-- this ENTIRE file and run it as ONE query. It's still fully idempotent
-- (safe to run again, or after any subset of the old three scripts ever
-- applied).
--
-- What it does: adds profiles.subteam; folds Youtube/Publishing/
-- Operation segments back into OPS (moving the old segment onto
-- subteam); adds releases.subteam_tags and subteam_tags_locked (the pair
-- the app actually reads/writes — app/releases/page.js, app/releases/
-- [id]/page.js); folds any legacy project_tag data into them (guarded —
-- works whether or not that retired column still exists); and drops the
-- now-unused `subteams` table.

do $$
begin
  execute 'alter table profiles add column if not exists subteam text';

  update profiles
  set subteam = coalesce(subteam, segment), segment = 'OPS'
  where segment in ('Youtube', 'Publishing', 'Operation');

  execute 'alter table releases add column if not exists subteam_tags jsonb not null default ''{}''::jsonb';
  execute 'alter table releases add column if not exists subteam_tags_locked jsonb not null default ''{}''::jsonb';

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

  execute 'drop table if exists subteams';
end $$;
