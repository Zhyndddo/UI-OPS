-- Round 510 — manual_lock on package lines. ADDITIVE + idempotent. No Round 418 resync.
-- A locked line is never rebuilt by Resync, and Summarize asks before replacing it.
-- Run this BEFORE (or together with) deploying round510. The app still works if it is not run yet (lock just isn't saved).
alter table media_booking_package_lines add column if not exists manual_lock boolean not null default false;
-- CHECK: 1 row
select column_name from information_schema.columns where table_name = 'media_booking_package_lines' and column_name = 'manual_lock';
