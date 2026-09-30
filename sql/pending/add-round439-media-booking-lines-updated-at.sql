-- Round 439 -- the actual fix for "how do we know if the bug is back"
-- without me manually diffing git backup history every time.
--
-- media_booking_package_lines has never had an updated_at column. Every
-- other timestamp this session has used to tell a real Summarize apart
-- from a bypass write (media_booking_package_categories.updated_at,
-- media_booking_package_entry_snapshots.updated_at) lives on a DIFFERENT
-- table, so proving when a LINE itself last changed has only ever been
-- possible by comparing 2-hourly git-backed Supabase snapshots -- slow,
-- retroactive, and only as fine-grained as the backup schedule.
--
-- This adds updated_at directly, set by a DB trigger (not app code) so it
-- catches EVERY write path unconditionally: a normal Summarize click
-- (syncPackageLine), the admin bulk resync tool, a future code path nobody
-- has written yet, AND a raw SQL UPDATE run directly in Supabase (like the
-- Round 433 restore itself, or god forbid a repeat of the original
-- corruption). A trigger is used instead of relying on the app to
-- remember to set it, specifically because "something bypassing the app
-- entirely" is the exact failure mode this is meant to catch.
--
-- Idempotent: safe to run more than once.
alter table media_booking_package_lines
  add column if not exists updated_at timestamptz not null default now();

create or replace function set_media_booking_package_lines_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_media_booking_package_lines_updated_at on media_booking_package_lines;
create trigger trg_media_booking_package_lines_updated_at
  before update on media_booking_package_lines
  for each row
  execute function set_media_booking_package_lines_updated_at();

comment on column media_booking_package_lines.updated_at is
  'Round 439 -- set unconditionally by trg_media_booking_package_lines_updated_at on every UPDATE, including direct SQL. Used by add-round439-locked-package-drift-monitor.sql to tell a real human Summarize (which also touches media_booking_package_entry_snapshots for the same package+category, at the same moment) apart from any other write to a locked package''s line.';
