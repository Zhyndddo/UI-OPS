-- Round 279 — PIC → tag system (multiple PICs per ticket), phase 1.
--
-- Adds tickets.pic_profile_ids (uuid[]), additive alongside the existing
-- tickets.pic_profile_id (uuid, single FK) — NOT a replacement. The old
-- column stays the source of truth for every ticket-list page not yet
-- converted to the new tag UI (task-table attribution, auto-advance-on-
-- PIC-pick logic, etc. all still read it). A page that's been converted to
-- the tag input writes BOTH columns on every PIC change — the array (the
-- real multi-PIC list) and pic_profile_id set to the array's first entry
-- (or null if the array is empty) — so every unconverted page keeps
-- reading a sane single value even on a ticket that was actually tagged
-- with several people elsewhere.
--
-- Idempotent: safe to run more than once.
alter table if exists tickets
  add column if not exists pic_profile_ids uuid[];

comment on column tickets.pic_profile_ids is
  'Round 279 — multi-PIC tag list. pic_profile_id (singular) is kept in sync as the array''s first entry by every page that writes this column, for backward compatibility with pages not yet converted to the tag UI.';
