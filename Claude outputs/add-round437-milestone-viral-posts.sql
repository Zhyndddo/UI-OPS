-- Round 437 -- Milestone workstation, Marketing view: new "Viral Posts"
-- tab, per explicit request. A NEW table, deliberately separate from
-- milestone_chart_entries (the existing Input/Implement/Report/Log data):
-- viral posts aren't a chart rank, they're a running log of social-post
-- URLs per release, each one getting re-checked over time for view/
-- reaction counts. One row per SNAPSHOT (append-only, never UPDATEd in
-- place) -- "each time they update with new (higher number per url) use
-- that" means the UI always inserts a fresh row and picks the
-- highest-views one per url when it needs to show a single current
-- number, not that an existing row gets its numbers overwritten. That
-- keeps the full history (every check-in) sitting in the table even
-- though every reader of it only ever wants the current-best snapshot per
-- url.
--
-- did/track_title/artist are denormalized copies of the matched
-- release's own did/title/main_artist, same convention
-- milestone_chart_entries already uses (see that table's own columns) --
-- lets the Log tab's existing artist/song filter (ilike against
-- milestone_chart_entries.artist/track_title) run the exact same kind of
-- query against this table too, no join required.
create table if not exists milestone_viral_posts (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references releases(id) on delete cascade,
  did text,
  track_title text,
  artist text,
  platform text,
  channel_name text,
  url text not null,
  views numeric,
  reactions numeric,
  entry_date date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index if not exists milestone_viral_posts_release_id_idx
  on milestone_viral_posts(release_id);
-- Backs the Log tab's artist/song filter and the media report magic
-- link's per-release lookup.
create index if not exists milestone_viral_posts_url_idx
  on milestone_viral_posts(url);

comment on table milestone_viral_posts is
  'Round 437 -- Milestone workstation "Viral Posts" tab (Marketing view). One row per snapshot check-in of a social-post URL''s view/reaction count for a release. Append-only -- readers collapse to the highest-views row per url themselves (see the workstation page, LogTable, and the pick-package magic link page).';
