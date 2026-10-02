-- Round 457 — multi-PIC, applied globally to workstation_assignments
-- (§3b-prime of the Task Tracker/KPI overhaul spec).
--
-- workstation_assignments today is single-PIC (pic_profile_id uuid NOT
-- NULL), one row per (workstation, column_key, release_id). This widens it
-- the same additive way Round 279 widened tickets: a new pic_profile_ids
-- uuid[] column alongside the existing singular one. The singular column
-- is NOT dropped and stays NOT NULL — every row (including the
-- column_key='all' / release_id=null "config default" rows) keeps a
-- backward-compatible single value, kept in sync as the array's first
-- entry by every page writing this table going forward.
--
-- Covers all 7 workstations that use this table: the 3 already wired
-- (upload, confirm_phase1, confirm_phase2, pre_release) AND the config
-- default rows (Config -> PIC Defaults) for all of them, including the 4
-- not yet wired to their own page (milestone, package_price, cost_mkt,
-- stream, booking) — those get real rows once Phase 1's §3b work lands,
-- but the column needs to exist table-wide regardless.
--
-- Idempotent: safe to run more than once.
alter table if exists workstation_assignments
  add column if not exists pic_profile_ids uuid[];

update workstation_assignments
  set pic_profile_ids = array[pic_profile_id]
  where pic_profile_id is not null
    and pic_profile_ids is null;

comment on column workstation_assignments.pic_profile_ids is
  'Round 457 — multi-PIC tag list, same shape as tickets.pic_profile_ids (Round 279). pic_profile_id (singular, still NOT NULL) is kept in sync as the array''s first entry by every page that writes this table.';
