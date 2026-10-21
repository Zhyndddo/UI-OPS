-- Round 507 — channel name on each URL added in the NON-PACKAGE BOOKING workstation (TikTok cells).
-- Additive + idempotent. No Round 418 resync. Without it, adding URLs still works only if no channel name is given.
alter table non_package_booking_entries add column if not exists channel_name text;

-- CHECK: 1 row
select column_name from information_schema.columns where table_name = 'non_package_booking_entries' and column_name = 'channel_name';
