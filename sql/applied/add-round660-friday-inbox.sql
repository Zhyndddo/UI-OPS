-- Round 660 — Friday inbox: DM outbox with quiet hours, ticket push + "xong" reply, /remind, /watch, /cover, /quiet.
-- Idempotent. Service role only (RLS on, no policies).

alter table public.tg_links
  add column if not exists quiet_from smallint,
  add column if not exists quiet_to smallint,
  add column if not exists quiet_weekend boolean not null default false;

create table if not exists public.tg_outbox (
  id bigserial primary key,
  profile_id uuid not null,
  dm_chat_id bigint not null,
  html text not null,
  markup jsonb,
  kind text,
  ref_id text,
  title text,
  not_before timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tg_outbox_pending_idx on public.tg_outbox (not_before) where sent_at is null;

create table if not exists public.tg_inbox (
  id bigserial primary key,
  profile_id uuid not null,
  kind text not null,                 -- 'ticket'
  ref_id text not null,
  title text,
  dm_chat_id bigint,
  dm_msg_id bigint,
  status text not null default 'open',   -- open | done | seen (seen = existed before the feature, never pushed)
  created_at timestamptz not null default now(),
  unique (profile_id, kind, ref_id)
);
create index if not exists tg_inbox_msg_idx on public.tg_inbox (dm_chat_id, dm_msg_id);

create table if not exists public.tg_remind_me (
  id bigserial primary key,
  profile_id uuid not null,
  dm_chat_id bigint not null,
  text text not null,
  due_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tg_remind_me_due_idx on public.tg_remind_me (due_at) where sent_at is null;

create table if not exists public.tg_watch (
  id bigserial primary key,
  profile_id uuid not null,
  release_id uuid not null,
  title text,
  stages_sent text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (profile_id, release_id)
);

create table if not exists public.tg_cover (
  profile_id uuid not null,
  cover_profile_id uuid not null,
  until date not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, cover_profile_id)
);

alter table public.tg_outbox enable row level security;
alter table public.tg_inbox enable row level security;
alter table public.tg_remind_me enable row level security;
alter table public.tg_watch enable row level security;
alter table public.tg_cover enable row level security;

-- Baseline so the first tick does NOT push every existing ticket: mark everything already assigned to a linked person as "seen".
insert into public.tg_inbox (profile_id, kind, ref_id, title, dm_chat_id, status)
select l.profile_id, 'ticket', t.id::text, null, l.dm_chat_id, 'seen'
from public.tg_links l
join public.tickets t on t.deleted_at is null and t.created_at >= '2026-07-01'
  and (t.pic_profile_id = l.profile_id or l.profile_id = any (coalesce(t.pic_profile_ids, '{}')))
on conflict (profile_id, kind, ref_id) do nothing;

-- 10-minute tick (07:00-21:50 VN). Reuses the URL + secret already stored in the evening digest job: nothing to retype.
do $$
declare cmd text;
begin
  select command into cmd from cron.job where jobname = 'tg-digest-evening';
  if cmd is null then raise exception 'tg-digest-evening job not found - schedule the digests first (round 601)'; end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'friday-tick';
  perform cron.schedule('friday-tick', '*/10 0-14 * * *', regexp_replace(cmd, 'telegram-digest\?slot=[a-z]+(&fallback=1)?', 'friday-tick'));
end $$;

-- VERIFY: one row, command contains friday-tick
select jobname, schedule, active, command like '%friday-tick%' as ok from cron.job where jobname = 'friday-tick';
-- UNDO: select cron.unschedule('friday-tick');
