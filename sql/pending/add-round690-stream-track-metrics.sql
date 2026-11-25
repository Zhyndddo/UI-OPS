-- Round 690 — Streaming workstation: one metrics row per TRACK of an EP / Album.
-- The product row's numbers become the sum of its tracks (computed and saved by the page into release_stream_metrics,
-- so the media report / pick-package / performance report that read release_stream_metrics keep working unchanged).
create table if not exists public.release_track_stream_metrics (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null unique references public.release_tracks(id) on delete cascade,
  release_id uuid not null references public.releases(id) on delete cascade,
  current_spotify text,
  views_tiktok text,
  creations_tiktok text,
  current_zing text,
  current_nct text,
  current_ytb text,
  current_ytb_music text,
  views_fb text,
  creations_fb text,
  updated_at timestamptz not null default now()
);
create index if not exists release_track_stream_metrics_release on public.release_track_stream_metrics (release_id);

alter table public.release_track_stream_metrics enable row level security;
drop policy if exists rtsm_all on public.release_track_stream_metrics;
create policy rtsm_all on public.release_track_stream_metrics for all to authenticated using (true) with check (true);
revoke all on public.release_track_stream_metrics from public, anon;
grant select, insert, update, delete on public.release_track_stream_metrics to authenticated;
