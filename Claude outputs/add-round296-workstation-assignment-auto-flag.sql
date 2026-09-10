-- Round 296 — follow-up to Round 295's PIC precedence fix. Round 295 made
-- Config → PIC Defaults block FUTURE auto-assigns, but couldn't do
-- anything about releases the Round 281 auto-assign had ALREADY written a
-- real workstation_assignments row for before a config default existed —
-- per explicit question ("what if we have auto-assign already in, then i
-- set the config. would it still fix it until they manually do the other
-- thing?") the answer was no, and the user asked for that fixed too.
--
-- Adds workstation_assignments.auto_assigned (boolean) so the app can tell
-- a system-written row apart from a human's own pick — a manual pick
-- always wins and is never touched by this; an auto_assigned row is now
-- the thing a later-set config default can revert. See the 3 wired
-- workstation pages (upload/confirm/pre-release) for the "self-healing"
-- read: on load, if a config default is set for a workstation/phase, any
-- existing auto_assigned=true row is deleted so the release falls back to
-- showing the config default again — same trigger point as the existing
-- Round 281 auto-assign call, just the opposite direction.
--
-- The backfill below marks every row Round 281's auto-assign already
-- wrote (found via its own audit_log entries — action='auto_assign',
-- entity='workstation_assignment', entity_id='<workstation>:<release_id>')
-- as auto_assigned=true retroactively, so the self-healing behavior above
-- applies immediately to the existing backlog too, not just new rows going
-- forward.
--
-- Idempotent: safe to run more than once.
alter table if exists workstation_assignments
  add column if not exists auto_assigned boolean not null default false;

update workstation_assignments wa
set auto_assigned = true
where wa.release_id is not null
  and wa.auto_assigned = false
  and exists (
    select 1 from audit_log al
    where al.entity = 'workstation_assignment'
      and al.action = 'auto_assign'
      and al.entity_id = wa.workstation || ':' || wa.release_id::text
  );
