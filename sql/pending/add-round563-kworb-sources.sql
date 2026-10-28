-- Round 563 — kworb crawl now reads 3 pages: Spotify totals (vn_daily_totals), Spotify daily chart (vn_daily), YouTube trending (vn).
-- RUN ORDER: 1) add-round561-kworb-vn.sql (if not run yet)  2) this file  3) push code.  Additive + idempotent.
-- UNDO: drop table if exists kworb_vn_video_snapshots, kworb_vn_videos;  alter table kworb_vn_snapshots drop column if exists pos, drop column if exists streams, drop column if exists streams_7d;

-- Spotify daily chart: real per-day streams (no more guessing from the change in total)
alter table kworb_vn_snapshots add column if not exists pos integer;
alter table kworb_vn_snapshots add column if not exists streams bigint;       -- streams on that chart day
alter table kworb_vn_snapshots add column if not exists streams_7d bigint;    -- kworb's rolling 7-day streams

-- YouTube trending videos that are ours or suspicious (matched on the video TITLE; the page has no channel name)
create table if not exists kworb_vn_videos (
  video_id    text primary key,
  title       text not null default '',
  status      text not null check (status in ('ours','suspect')),
  release_id  uuid,
  did         text,
  reason      text,
  in_chart    boolean not null default true,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  review      text check (review in ('follow_up','dismissed')),
  reviewed_by text,
  reviewed_at timestamptz,
  note        text
);
create index if not exists kworb_vn_videos_status_idx on kworb_vn_videos (status, review);

create table if not exists kworb_vn_video_snapshots (
  video_id  text not null references kworb_vn_videos(video_id) on delete cascade,
  seen_on   date not null,
  list_no   integer not null default 1,        -- which table on the kworb page (1 = the main trending list)
  rank      integer,
  taken_at  timestamptz not null default now(),
  primary key (video_id, seen_on, list_no)
);

alter table kworb_vn_videos enable row level security;
alter table kworb_vn_video_snapshots enable row level security;
drop policy if exists kworb_videos_sel on kworb_vn_videos;
create policy kworb_videos_sel on kworb_vn_videos for select to authenticated using (true);
drop policy if exists kworb_videos_upd on kworb_vn_videos;
create policy kworb_videos_upd on kworb_vn_videos for update to authenticated using (true) with check (true);
drop policy if exists kworb_vsnap_sel on kworb_vn_video_snapshots;
create policy kworb_vsnap_sel on kworb_vn_video_snapshots for select to authenticated using (true);

revoke all on kworb_vn_videos, kworb_vn_video_snapshots from public, anon, authenticated;
grant select on kworb_vn_videos, kworb_vn_video_snapshots to authenticated;
grant update (review, reviewed_by, reviewed_at, note) on kworb_vn_videos to authenticated;

-- VERIFY (expect 4 tables, RLS on, and the 3 new snapshot columns)
select c.relname, c.relrowsecurity from pg_class c where c.relname in ('kworb_vn_tracks','kworb_vn_snapshots','kworb_vn_videos','kworb_vn_video_snapshots') order by 1;
select column_name from information_schema.columns where table_name = 'kworb_vn_snapshots' and column_name in ('pos','streams','streams_7d') order by 1;
