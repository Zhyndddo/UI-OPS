-- Round 561 — kworb Vietnam Spotify chart crawl (Milestone -> "Spotify VN"). Additive, idempotent, safe to re-run.
-- Run order: this file only (after the code is pushed; the 12-hour cron reports an error until it exists).
-- Not connected to any report. The cron / button write with the service role; staff can read, and can only change the review columns.
--
-- UNDO: drop table if exists kworb_vn_snapshots, kworb_vn_tracks;  (and remove the cron line from vercel.json)

create table if not exists kworb_vn_tracks (
  track_id    text primary key,                  -- Spotify track id (from kworb's track link)
  artist      text not null default '',
  title       text not null default '',
  artist_id   text,
  status      text not null check (status in ('ours','suspect')),
  release_id  uuid,                              -- the release it matched (ours / same-title suspects)
  did         text,
  reason      text,                              -- why a suspect was flagged
  in_chart    boolean not null default true,     -- false = no longer on the kworb page
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  review      text check (review in ('follow_up','dismissed')),   -- manual decision on a suspect (null = not decided)
  reviewed_by text,
  reviewed_at timestamptz,
  note        text
);
create index if not exists kworb_vn_tracks_status_idx on kworb_vn_tracks (status, review);

create table if not exists kworb_vn_snapshots (
  track_id     text not null references kworb_vn_tracks(track_id) on delete cascade,
  chart_date   date not null,                    -- the chart day kworb says it covers up to
  taken_at     timestamptz not null default now(),
  days         integer, t10 integer, peak integer, peak_x integer,
  peak_streams bigint,
  total        bigint,                           -- cumulative Spotify streams on the VN daily chart
  primary key (track_id, chart_date)
);

alter table kworb_vn_tracks enable row level security;
alter table kworb_vn_snapshots enable row level security;
drop policy if exists kworb_tracks_sel on kworb_vn_tracks;
create policy kworb_tracks_sel on kworb_vn_tracks for select to authenticated using (true);
drop policy if exists kworb_tracks_upd on kworb_vn_tracks;
create policy kworb_tracks_upd on kworb_vn_tracks for update to authenticated using (true) with check (true);
drop policy if exists kworb_snap_sel on kworb_vn_snapshots;
create policy kworb_snap_sel on kworb_vn_snapshots for select to authenticated using (true);

revoke all on kworb_vn_tracks, kworb_vn_snapshots from public, anon, authenticated;
grant select on kworb_vn_tracks, kworb_vn_snapshots to authenticated;
grant update (review, reviewed_by, reviewed_at, note) on kworb_vn_tracks to authenticated;

-- VERIFY (expect two tables, RLS on)
select c.relname, c.relrowsecurity from pg_class c where c.relname in ('kworb_vn_tracks','kworb_vn_snapshots') order by 1;
