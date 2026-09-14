-- Round 319 — unified release tag system (see lib/releaseTags.js).
--
-- One new array column on `releases`, replacing the old single-select
-- `project_rights_type` (PRJ_INHOUSE/PRJ_LICENSED/PRJ_OWNED) as the
-- primary storage for that tag going forward, while adding two brand
-- new required categories (PUB, LBL) plus room for any number of
-- freeform extra tags — all three live together in this one array.
--
-- `project_rights_type` is DELIBERATELY NOT dropped or renamed here.
-- Reasons:
--   1. It's still read as a fallback by lib/releaseTags.js's
--      effectiveReleaseTags() for any release this backfill hasn't
--      reached yet (this session has no live DB access to verify the
--      backfill against real data before shipping the app code that
--      depends on it).
--   2. Dropping a column is destructive and one-way — safer to leave it
--      in place, confirm the new `tags` column is correct against real
--      data, and drop `project_rights_type` in a later, separate
--      migration once that's verified.
-- The 3 OTHER places PRJ independently lives — app/new-release/page.js's
-- own `releases.project_rights_type` write on a brand new release,
-- `batch_phai_sinh_items.project_rights_type`, and
-- `tickets.data.projectRightsType` on the Phái Sinh ticket — are
-- explicitly OUT of scope for this migration per direct instruction:
-- those are each their own independent value with no DID/UPC to
-- backfill against, not something this array should absorb.
--
-- Idempotent: safe to run more than once. Both statements below are
-- no-ops on a second run (`add column if not exists`, and the update's
-- own `where ... not (... = any(tags))` guard skips rows already
-- carrying that PRJ code).

alter table releases add column if not exists tags text[] not null default '{}';

-- Backfill: every release with an existing project_rights_type value
-- gets that same code pushed into the new tags array (as its PRJ entry),
-- so nothing already tagged goes blank the moment the app switches to
-- reading `tags` first.
update releases
set tags = array_append(tags, project_rights_type)
where project_rights_type is not null
  and not (project_rights_type = any(tags));
