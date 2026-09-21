-- Round 404 — shared infrastructure for 3 of this round's 4 features:
--
--   1. Weekly task reminder popup (Task Table)
--   2. Release critical-info-changed notice
--   3. Bổ Sung DATA daily undone-ticket digest
--
-- All three are "the app generated this on its own, not a person," so
-- rather than routing them through Secret Messages (admin-composed,
-- permanent audit record, team-scoped sending — a different concern, see
-- lib/secretMessages.js), they get their own lighter table: auto-resolves
-- for its recipients after 24h, but every row stays forever for dev to
-- read in the new /system-log page (app/system-log/page.js) — same
-- "recipient can lose it, dev never does" split Secret Messages already
-- has via its own hide-vs-delete distinction, just automatic here instead
-- of a manual dev delete.
--
-- Idempotent: `create table if not exists` — safe to re-run.

create table if not exists system_messages (
  id uuid primary key default gen_random_uuid(),
  -- Free text tag for the dev log's filter/grouping — 'weekly_task_reminder',
  -- 'release_critical_change', 'bo_sung_data_digest' this round; open to more
  -- later without a schema change.
  kind text not null,
  title text not null,
  body text not null,
  -- Optional deep link (an app-relative path, e.g. "/releases/<id>") so the
  -- popup/log row can jump straight to the relevant page.
  link text,
  -- Who this is for. An array (not one row per recipient) because the
  -- bulk-generated ones (the daily digest, in particular) often share the
  -- exact same content across several recipients (e.g. every AR admin gets
  -- the same "unassigned tickets" list) — one row, N recipients, instead of
  -- N duplicate rows.
  recipient_profile_ids uuid[] not null default '{}',
  -- Free-form context for the dev log (release id, ticket ids, etc.) —
  -- never read by the recipient-facing popup, purely a debugging aid.
  source jsonb default '{}',
  created_at timestamptz not null default now(),
  -- Recipient-facing cutoff — lib/systemMessages.js's active-message query
  -- filters on this; dev's log page (app/system-log/page.js) ignores it and
  -- shows everything. Whoever inserts a row sets this explicitly (typically
  -- created_at + 24h) rather than relying on a fixed default, since a
  -- future producer might reasonably want a different window.
  expires_at timestamptz not null
);

create index if not exists idx_system_messages_created_at on system_messages(created_at desc);
create index if not exists idx_system_messages_recipients on system_messages using gin (recipient_profile_ids);
create index if not exists idx_system_messages_kind_created on system_messages(kind, created_at desc);

-- Round 404 item 1 — "thêm task weekly cho task table... Allow to add
-- (free text) weekly task." Per explicit decision: an admin adds a weekly
-- task for anyone on their OWN team (not dev) — no self-serve add. The
-- counter ("bộ đếm cho các task lập lại") counts how many weekly cycles
-- this task has gone through, not a completion streak — see
-- lib/weeklyTasks.js's rollForwardIfNeeded for how repeat_count/week_start
-- advance.
create table if not exists weekly_tasks (
  id uuid primary key default gen_random_uuid(),
  -- The admin's own team (profiles.segment) at creation time — scopes who
  -- can see/manage it in the Task Table UI; matches assignee_profile_id's
  -- own segment at creation (an admin can only assign within their team).
  team text not null,
  -- FK named weekly_tasks_assignee_profile_id_fkey by Postgres's default
  -- naming convention — app/task-table/page.js's WeeklyTasksSection relies
  -- on that exact name for its PostgREST embed
  -- (profiles!weekly_tasks_assignee_profile_id_fkey) to pull the
  -- assignee's name in the same query as the tasks themselves.
  assignee_profile_id uuid not null references profiles(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  text text not null,
  -- How many weekly cycles this task has been through, counting its first
  -- week as 1. Advances (and week_start/done reset together) the next time
  -- anyone with this task active loads the app after that week's Monday —
  -- see lib/weeklyTasks.js, no cron needed.
  repeat_count int not null default 1,
  -- The Monday (GMT+7, matching the rest of this app's "local" date
  -- convention) that `done` currently applies to.
  week_start date not null default (current_date - (extract(dow from current_date)::int + 6) % 7),
  done boolean not null default false,
  -- Admin-retired tasks are kept (audit trail, matches the rest of this
  -- app's soft-delete convention) but drop out of the active list/reminder.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_weekly_tasks_assignee on weekly_tasks(assignee_profile_id) where active;
create index if not exists idx_weekly_tasks_team on weekly_tasks(team) where active;
