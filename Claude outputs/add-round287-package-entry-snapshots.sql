-- Round 287 — Booking Ticket item 4 ("when I click back to package 1, the
-- left [DSP grid] should read from the right [currently active package],
-- instead of just showing whatever I last typed for package 2").
--
-- The grid's live numbers (media_booking_content_entries) are, by design,
-- one shared pool per release — not per package — because they represent
-- ongoing live tracking data, and Summarize just snapshots whatever's
-- currently in that shared pool into whichever package tab is active at
-- the time. That part is unchanged and NOT something this migration
-- touches: the grid you type into always stays the one shared live pool,
-- editable regardless of which package tab is open.
--
-- What this adds is a read-only per-package HISTORY of what the grid
-- looked like at each Summarize: one snapshot row per (package, category,
-- real brand — the same real brand Summarize itself already groups by:
-- the TikTok Channel sub-brand, the Social/Community brand bracket, the
-- Ads platform brand, or '' for anything without a brand concept). The
-- app writes to this table right alongside its existing
-- media_booking_package_categories upsert in handleSummarize, and reads
-- it back to show "what actually built this package for this brand" the
-- instant you switch package tabs — see app/tickets/media-booking/page.js's
-- saveEntrySnapshot/snapshotEntriesFor and the "Grid snapshot from ..."
-- read-only block under the DSP grid.
--
-- Idempotent: safe to run more than once.
create table if not exists media_booking_package_entry_snapshots (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references media_booking_packages(id) on delete cascade,
  category_id uuid not null references package_categories(id),
  brand text not null default '',
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, category_id, brand)
);

create index if not exists idx_media_booking_package_entry_snapshots_package
  on media_booking_package_entry_snapshots(package_id);
