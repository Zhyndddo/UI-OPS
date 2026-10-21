-- Round 491 — mark every Booking (Media Booking) ticket whose PRODUCT'S RELEASE DATE
-- is before 15 Aug 2026 as COMPLETE: their package + results were backfilled already.
-- Touches only tickets.status / status_log / updated_at of that one ticket type.
-- Needs NO Round 418 resync. Safe to re-run (already-COMPLETE rows are skipped).
--
-- Tickets whose release has NO release date, or whose DID matches no release, are left alone.
-- STEP 1 — read-only preview. Look at the numbers first (backup estimate: ~361 REQUESTED + 23 already COMPLETE).
select t.status, count(*) as tickets, min(r.release_date) as oldest_release, max(r.release_date) as newest_release
from tickets t
join releases r on r.did = t.data ->> 'releaseId'
where t.tab_id = (select id from ticket_tabs where key = 'media_booking')
  and t.deleted_at is null
  and r.release_date < date '2026-08-15'
group by t.status order by t.status;

-- STEP 2 — the update. Run this whole block (it is one transaction).
begin;

create temp table _r491_done on commit drop as
select t.id from tickets t
join releases r on r.did = t.data ->> 'releaseId'
where t.tab_id = (select id from ticket_tabs where key = 'media_booking')
  and t.deleted_at is null
  and t.status is distinct from 'COMPLETE'
  and r.release_date < date '2026-08-15';

update tickets
set status = 'COMPLETE',
    status_log = coalesce(status_log, '{}'::jsonb) || jsonb_build_object('COMPLETE', now()),
    updated_at = now()
where id in (select id from _r491_done);

-- the backfill must not ping anyone: any completion notification the update
-- triggered was created in THIS transaction, so its created_at = now()
delete from notifications
where type = 'ticket_complete'
  and ticket_id in (select id from _r491_done)
  and created_at >= now();

select count(*) as marked_complete from _r491_done;
commit;

-- CHECK (read-only): should now show only COMPLETE (plus REFUND/CANCELED if any) for old tickets.
select t.status, count(*) from tickets t
join releases r on r.did = t.data ->> 'releaseId'
where t.tab_id = (select id from ticket_tabs where key = 'media_booking') and t.deleted_at is null
  and r.release_date < date '2026-08-15'
group by t.status;
