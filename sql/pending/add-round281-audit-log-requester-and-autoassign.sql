-- Round 281 — audit logging + requester attribution + workstation auto-assign.
--
-- Context: investigated why Media Booking tickets were reverting to
-- REQUESTED (turned out to be 4 legitimate UI-driven paths, no bug) — that
-- surfaced that nothing in the app records WHO changed a ticket, only when
-- (status_log is timestamp-only). The team asked to fix this properly:
--   1. Requester attribution on tickets (today only requester_segment/
--      requester_name free text exist — no real profile link) + a durable
--      audit trail of create/status-change/reopen/complete/delete/reassign/
--      deadline-change events.
--   2. Workstation rows with nobody assigned auto-assign to that segment's
--      team lead, falling back to an admin on the same segment if there's
--      no single team lead (zero or more than one).
--   3. New Release Setup records who submitted the form, so that person can
--      be used as requester_profile_id on every ticket auto-created for
--      that release afterward.
--
-- `audit_log` (actor/action/entity/entity_id/field/before_val/after_val)
-- already existed in the schema, unused since it was added — see
-- claude/audit-log-and-requester-attribution.md for the write-path design
-- (lib/auditLog.js) and which call sites use it as of this round.

-- 1. Requester attribution — additive alongside the existing free-text
-- requester_segment/requester_name (same "old field stays for back-compat,
-- new field is the structured source going forward" pattern Round 279 used
-- for pic_profile_ids). A page that still lets a human type/pick a
-- different requester manually keeps doing so — requester_profile_id is
-- the auto-derived default (the ticket creator, or the release's creator
-- for tickets auto-generated off a release), not a replacement for that
-- override.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS requester_profile_id uuid REFERENCES profiles(id);
CREATE INDEX IF NOT EXISTS idx_tickets_requester_profile_id ON tickets(requester_profile_id);

-- 2. Who submitted the New Release Setup form for this release — drives
-- requester_profile_id on every ticket auto-created off the release
-- afterward (Send Upload, Sony Publish, Publishing, Media Booking, etc.)
-- when nothing more specific overrides it.
ALTER TABLE releases ADD COLUMN IF NOT EXISTS created_by_profile_id uuid REFERENCES profiles(id);
CREATE INDEX IF NOT EXISTS idx_releases_created_by_profile_id ON releases(created_by_profile_id);

-- Note: tickets.deleted_by (text) already exists in the schema and was
-- simply never written to — no migration needed, just wiring the app code
-- to populate it on soft-delete (this round). Same for the audit_log table
-- itself — already fully defined, including its lookup index
-- (idx_audit_log_lookup on created_at/actor/entity), just never inserted
-- into until this round.
--
-- IMPORTANT — Round 283 caught and fixed a real breakage this migration
-- would otherwise have caused: `tickets` already had exactly one FK to
-- `profiles` (tickets_pic_profile_id_fkey), so every page's
-- `.select("*, profiles(name)")` (16 call sites, mostly bespoke ticket-type
-- list pages + lib/TicketListPage.js) relied on Supabase/PostgREST being
-- able to infer that single relationship implicitly. Adding
-- requester_profile_id as a SECOND FK to profiles makes that inference
-- ambiguous — PostgREST refuses with "more than one relationship was
-- found" at query time (not caught by `next build`, which never talks to
-- the DB). Every one of those call sites was updated to the explicit form
-- (`profiles!tickets_pic_profile_id_fkey(name)`) before this migration was
-- handed off — this migration is safe to run as-is, but if it's ever run
-- against a DB whose app code predates that fix (i.e. this migration was
-- somehow applied before the Round 283 commit), every one of those pages
-- will break with a live query error until the app code catches up.
