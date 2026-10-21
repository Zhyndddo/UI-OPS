-- Round 489 (OPTIONAL) — trim old notifications. ~21,000 rows existed at the last
-- backup, 92% unread, so nobody reads the old ones; every bell load scans this
-- table. Run STEP 1 first and look at the numbers. Only run STEP 2 if you are
-- happy to permanently delete notifications older than 30 days (the audit log /
-- tickets are untouched; only the bell entries go).
-- STEP 1 (read-only):
select count(*) as total,
       count(*) filter (where created_at < now() - interval '30 days') as older_than_30d,
       count(*) filter (where created_at >= now() - interval '30 days') as kept
from notifications;
-- STEP 2 (DELETES — uncomment to run):
-- delete from notifications where created_at < now() - interval '30 days';
