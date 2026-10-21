-- Round 522 — create the Phụ Lục tickets that never got made because the
-- artist's package pick failed on the notification permission (fixed in
-- round 521). Targets: every release that is locked into a package (not in a
-- pipeline stage) and has NO live Phụ Lục ticket — at the time of writing
-- that's TMNX-20102026-0163 and KMP#-16102026-0117.
--
-- Mã PL follows the app's own rule (lib/phuLucCounter.js): per LABEL, next
-- number after the highest existing "PL_<n>" for that label; several missing
-- releases in one label get consecutive numbers.
--
-- Safe to re-run (a release that already has a live ticket is skipped).
-- STEP 1 = read-only preview. STEP 2 = insert. CHECK. UNDO at the bottom.
-- Run STEP 2 AFTER the round-521 SQL, so the new-ticket notification can be written.

-- ───────── STEP 1: preview (read-only) ─────────
with tab as (select id from ticket_tabs where key = 'phu_luc'),
live as (
  select t.data->>'releaseId' as rid, t.data->>'maPL' as mapl
  from tickets t, tab where t.tab_id = tab.id and t.deleted_at is null
),
missing as (
  select r.id, r.did, r.title, r.label, r.project_type,
         row_number() over (partition by coalesce(r.label,'') order by r.created_at, r.id) as rn
  from releases r
  where r.project_type is not null
    and r.project_type not in ('BRIEF & DATA','SENT TO MARKETING','DEALING')
    and r.package_locked
    and not exists (select 1 from live where live.rid = r.id::text)
),
maxpl as (
  select coalesce(r.label,'') as label,
         max((regexp_match(l.mapl, '^PL_(\d+)$'))[1]::int) as mx
  from live l join releases r on r.id::text = l.rid
  group by 1
)
select m.did, m.title, m.label, m.project_type,
       'PL_' || (coalesce(x.mx,0) + m.rn) as new_ma_pl
from missing m left join maxpl x on x.label = coalesce(m.label,'')
order by m.label, m.rn;

-- ───────── STEP 2: insert ─────────
create table if not exists phu_luc_backfill_r522 (ticket_id uuid primary key, release_id uuid, ma_pl text, created_at timestamptz default now());

with tab as (select id from ticket_tabs where key = 'phu_luc'),
live as (
  select t.data->>'releaseId' as rid, t.data->>'maPL' as mapl
  from tickets t, tab where t.tab_id = tab.id and t.deleted_at is null
),
missing as (
  select r.id, r.label,
         row_number() over (partition by coalesce(r.label,'') order by r.created_at, r.id) as rn
  from releases r
  where r.project_type is not null
    and r.project_type not in ('BRIEF & DATA','SENT TO MARKETING','DEALING')
    and r.package_locked
    and not exists (select 1 from live where live.rid = r.id::text)
),
maxpl as (
  select coalesce(r.label,'') as label,
         max((regexp_match(l.mapl, '^PL_(\d+)$'))[1]::int) as mx
  from live l join releases r on r.id::text = l.rid
  group by 1
),
ins as (
  insert into tickets (tab_id, data)
  select (select id from tab),
         jsonb_build_object('releaseId', m.id, 'maPL', 'PL_' || (coalesce(x.mx,0) + m.rn))
  from missing m left join maxpl x on x.label = coalesce(m.label,'')
  returning id, (data->>'releaseId')::uuid as release_id, data->>'maPL' as ma_pl
)
insert into phu_luc_backfill_r522 (ticket_id, release_id, ma_pl)
select id, release_id, ma_pl from ins;

-- ───────── CHECK ─────────
select r.did, r.title, r.label, t.status, t.data->>'maPL' as ma_pl, t.created_at
from phu_luc_backfill_r522 b
join tickets t on t.id = b.ticket_id
join releases r on r.id = b.release_id
order by t.created_at;

-- Nothing should still be missing (expect 0 rows):
select r.did from releases r
where r.project_type is not null
  and r.project_type not in ('BRIEF & DATA','SENT TO MARKETING','DEALING')
  and r.package_locked
  and not exists (select 1 from tickets t join ticket_tabs tb on tb.id = t.tab_id
                  where tb.key = 'phu_luc' and t.deleted_at is null and t.data->>'releaseId' = r.id::text);

-- ───────── UNDO (only if needed) ─────────
-- delete from tickets where id in (select ticket_id from phu_luc_backfill_r522);
-- (the new-ticket notifications it created stay; delete them from `notifications` by ticket_id if you want)
