-- Round 461 — Phase 3 of task-tracker-kpi-overhaul-spec.md: KPI history.
-- Additive only (2 new tables, nothing existing touched). Run before/with
-- the round461 zip; the cron route and /kpi History mode degrade
-- gracefully (empty / error JSON) until this exists.

-- One row per (day, person, type). Store SUMS not averages so any
-- weekly/monthly/quarterly/yearly rollup can re-average correctly.
-- type = ticket tab key | 'batch_phai_sinh' | 'ws:<workstation key>'.
create table if not exists task_kpi_daily_snapshots (
  snapshot_date    date    not null,
  profile_id       uuid    not null references profiles(id) on delete cascade,
  type             text    not null,
  throughput       integer not null default 0,
  on_time_eligible integer not null default 0,
  on_time_count    integer not null default 0,
  cycle_ms_sum     bigint  not null default 0,
  cycle_ms_count   integer not null default 0,
  open_count       integer not null default 0,  -- live gauge as of the run (0 on backfilled days)
  overdue_count    integer not null default 0,  -- live gauge as of the run (0 on backfilled days)
  created_at       timestamptz not null default now(),
  primary key (snapshot_date, profile_id, type)
);
create index if not exists idx_task_kpi_snap_profile_date on task_kpi_daily_snapshots (profile_id, snapshot_date);

-- Remembers each workstation row's last-seen done state so the daily job can
-- see the not-done -> done flip (workstation rows have no completion
-- timestamp). First sighting of a row only SEEDS this table (no throughput
-- is credited) so the existing backlog doesn't all count as "done today".
create table if not exists task_kpi_workstation_state (
  workstation text    not null,
  release_id  uuid    not null,
  done        boolean not null,
  updated_at  timestamptz not null default now(),
  primary key (workstation, release_id)
);
