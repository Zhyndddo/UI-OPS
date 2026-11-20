-- Round 669 — "Cancel product" (the artist pulled out). A cancelled release stays in the table but is hidden from the dashboard counters/lists,
-- calendar, workstations and Friday. RUN THIS BEFORE deploying the Round 669 code (the new queries filter on cancelled_at).
alter table public.releases add column if not exists cancelled_at timestamptz;
alter table public.releases add column if not exists cancel_reason text;
alter table public.releases add column if not exists cancelled_by uuid;
create index if not exists releases_cancelled_idx on public.releases (cancelled_at) where cancelled_at is not null;

-- VERIFY: 3 rows
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'releases' and column_name in ('cancelled_at','cancel_reason','cancelled_by');
-- UNDO: alter table public.releases drop column cancelled_at, drop column cancel_reason, drop column cancelled_by;
