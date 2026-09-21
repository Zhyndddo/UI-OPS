-- Round 400 — Milestone workstation's Implement tab, item 3: "On What
-- happened / Chart name field, can we make a new table, to log the
-- unique values of chart, if they made a new chart, they can choose it
-- again later (also counting all the hard code chart)".
--
-- New reference table: every chart name the Implement tab's "What
-- happened / Chart name" field can suggest, so it's a searchable pick
-- (lib/ReferenceInputs.js's SharedLabelInput pattern — free text
-- underneath, not a hard foreign key, a dropdown of matches on top) instead
-- of retyping the same one-off chart name from scratch every time.
--
-- Seeded two ways:
--   1. Every chart name already hardcoded into PLATFORM_CHARTS in
--      app/workstation/milestone/page.js (the regular Input tab's fixed
--      chart list) — "also counting all the hard code chart", so those
--      show up as suggestions too, not just future one-offs.
--   2. Every DISTINCT chart value already sitting in milestone_chart_entries
--      (~20k+ historical rows plus ongoing daily ones) — anything anyone's
--      ever logged, hardcoded or not, becomes pickable going forward.
-- Going forward, ImplementPanel's own save (app/workstation/milestone/
-- page.js) upserts any brand-new typed value into this table too (on
-- conflict do nothing), so "if they made a new chart, they can choose it
-- again later" holds without a second migration.
--
-- Idempotent: `create table if not exists`, `on conflict do nothing` on
-- both seed inserts — safe to re-run.

create table if not exists milestone_chart_names (
  id bigint generated always as identity primary key,
  name text not null unique,
  -- Which of PLATFORM_CHARTS' fixed platforms this belongs to, when known
  -- (null for anything logged under a custom/"+" platform, or seeded from
  -- historical rows whose platform wasn't recorded/didn't match a known
  -- one). Informational only — the Implement tab's chart picker shows
  -- every name regardless of platform, per the request ("log the unique
  -- values of chart", not scoped per platform).
  platform text,
  created_at timestamptz not null default now()
);

-- Seed 1 — every hardcoded chart name from PLATFORM_CHARTS, as of this
-- round. If that constant changes later (a chart renamed/added/removed —
-- see e.g. add-round207-youtube-chart-renames.sql for how that's been
-- handled before), this seed does NOT need re-running for existing
-- entries; a genuinely new hardcoded chart added later will show up
-- automatically the first time anyone logs against it anyway (see going-
-- forward upsert above), or can be added here by hand.
insert into milestone_chart_names (name, platform) values
  ('ZMP3|ZING CHART', 'Zing'),
  ('ZMP3|BXH NHẠC MỚI', 'Zing'),
  ('WEEKLY TOP ALBUM', 'Spotify'),
  ('WEEKLY TOP ARTIST', 'Spotify'),
  ('WEEKLY TOP SONG', 'Spotify'),
  ('DAILY TOP SONG', 'Spotify'),
  ('DAILY TOP ARTIST', 'Spotify'),
  ('DAILY VIRAL SONGs', 'Spotify'),
  ('HANOI', 'Spotify'),
  ('LOCAL PULSE - HANOI', 'Spotify'),
  ('HOCHIMINH CITY', 'Spotify'),
  ('LOCAL PULSE - HOCHIMINH CITY', 'Spotify'),
  ('Playlist NEW MUSIC FRIDAY VIETNAM', 'Spotify'),
  ('Playlist Fresh Find Vietnam', 'Spotify'),
  ('Playlist Vsound Ngay Lúc Này', 'Spotify'),
  ('Playlist Thiên Hạ Nghe Gì', 'Spotify'),
  ('Playlist Đoá Hồng Nhạc Việt', 'Spotify'),
  ('Playlist Vietnam Ơi!', 'Apple'),
  ('Playlist New Music Daily', 'Apple'),
  ('APPLE MUSIC - Top ALBUMs Vietnam', 'Apple'),
  ('APPLE MUSIC - Top POP Albums', 'Apple'),
  ('APPLE MUSIC -Top HIPHOP/RAP Albums', 'Apple'),
  ('APPLE MUSIC - Top DANCE Albums', 'Apple'),
  ('APPLE MUSIC - Top ALTERNATIVE Albums', 'Apple'),
  ('Apple Music - Top Songs Vietnam', 'Apple'),
  ('Apple Music - Top POP Songs', 'Apple'),
  ('Apple - Top Alternative Songs', 'Apple'),
  ('Apple Music - Top Dance Songs', 'Apple'),
  ('Apple Music - Top Hiphop/Rap Songs', 'Apple'),
  ('Vietnam iTunes Top Songs', 'Apple'),
  ('Apple Daily Album', 'Apple'),
  ('New Release on Apple', 'Apple'),
  ('TIKTOK POPULAR', 'TikTok'),
  ('TIKTOK BREAKOUT', 'TikTok'),
  ('TIKTOK HOT', 'TikTok'),
  ('INSTAGRAM', 'Instagram'),
  ('YOUTUBE CHARTS | Trending Music', 'YouTube'),
  ('YOUTUBE CHARTS | Daily Top Music Videos', 'YouTube'),
  ('YOUTUBE CHARTS | Weekly Top Music Videos', 'YouTube'),
  ('YOUTUBE CHARTS | Weekly Top Artists', 'YouTube'),
  ('YOUTUBE CHARTS | Daily Top Songs on Shorts', 'YouTube'),
  ('PLAYLIST YOUTUBE MUSIC | The Hit List', 'YouTube'),
  ('PLAYLIST YOUTUBE MUSIC | RELEASED', 'YouTube'),
  ('Shazam Top Songs', 'Shazam')
on conflict (name) do nothing;

-- Seed 2 — every distinct chart value already logged historically,
-- hardcoded or not (covers real one-offs already sitting in the table
-- from before this feature existed, so they're immediately pickable too).
insert into milestone_chart_names (name, platform)
select distinct chart, platform from milestone_chart_entries
where chart is not null and chart <> ''
on conflict (name) do nothing;
