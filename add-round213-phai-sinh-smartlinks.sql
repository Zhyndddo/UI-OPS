-- Round 213 — Phái Sinh Smartlink tracking, item 2 of the 3-item request.
-- Some phái sinh items (from a ticket, or not from one at all) need a
-- smartlink and the team wants it tracked alongside the release smartlink
-- table on the Re-Check workstation, per explicit request. Confirmed with
-- the team to live as ONE workstation location ("i want it to be one
-- workstation so the team won't be confused of where is the smartlink") —
-- Phase 2 tab, second table below the existing release-smartlink table —
-- rather than split between the workstation and the ticket page.
--
-- Deliberately its own table, not new columns on `tickets` or
-- `phai_sinh_batch_items`: a row here does not require a source ticket at
-- all ("some ... not from the phái sinh ticket"), and a single ticket can
-- reasonably need more than one smartlink over time. `source_ticket_id`
-- is populated when a row was created via the ticket picker (or the
-- "Track Smartlink" button on the ticket page itself), and left NULL for
-- rows entered fully manually — both flows share the same table and the
-- same workstation view.
--
-- id/song_title/artist/did/smartlink/note are plain fields, not gated
-- behind the ticket — the popup this feeds (lib/PhaiSinhSmartlinkPopup.js)
-- lets the team either pick a ticket (autofills song_title/artist/did from
-- tickets.data) or type them in directly.
--
-- FK types match the schema: tickets.id and profiles.id are both uuid.
create table if not exists phai_sinh_smartlinks (
  id uuid primary key default gen_random_uuid(),
  song_title text,
  artist text,
  did text,
  smartlink text,
  source_ticket_id uuid references tickets(id) on delete set null,
  pic_profile_id uuid references profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

-- Fast lookup when the ticket page wants to show "already has N
-- smartlink(s) tracked" against its own ticket.
create index if not exists phai_sinh_smartlinks_source_ticket_id_idx on phai_sinh_smartlinks (source_ticket_id);
