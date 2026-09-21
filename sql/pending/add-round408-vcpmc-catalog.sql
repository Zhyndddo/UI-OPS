-- Round 408 — item 2 from the Round 404 request, finally built: a
-- read-only reference list of VCPMC's catalog (song title / music author /
-- lyrics author / singer), searchable from the app, with a lightweight way
-- for anyone to suggest a missing row or flag one that looks wrong —
-- rather than a raw catalog dump nobody can correct.
--
-- Per explicit decision this round, the initial ~178k rows ship via
-- scripts/import-vcpmc-catalog.js (same "dry-run by default, --confirm to
-- write, dev runs it locally against the real Supabase project" pattern as
-- every other scripts/import-*.js in this repo) rather than embedded in
-- this SQL file — a single INSERT script with ~178k rows of Vietnamese
-- text would be tens of MB or a very slow SQL Editor paste; the Node
-- script streams it in manageable batches with progress output instead.
-- Run THIS file first (schema only, fast) — the import script assumes the
-- table already exists.
--
-- Idempotent: `create table if not exists` / `create extension if not
-- exists` — safe to re-run.

-- Needed for a fast "contains" search across ~178k Vietnamese titles
-- (plain ILIKE '%...%' can't use a btree index at all past a trivial row
-- count) — pg_trgm is a standard, Supabase-allowed extension, not a
-- custom one.
create extension if not exists pg_trgm;

create table if not exists vcpmc_catalog (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- "Tác giả nhạc" / "Tác giả lời" in the source sheet — kept as two
  -- separate fields rather than merged, matching VCPMC's own distinction
  -- between the music and the lyrics author (often the same person, but
  -- not always — see the source CSV's own many single-author rows where
  -- both columns just repeat the same name).
  composer text,
  lyricist text,
  singer text,
  -- "Tìm thấy qua" in the source sheet — the search term VCPMC's own tool
  -- matched this row on when it was pulled together. Free-form, shown for
  -- context only, never matched/filtered on by the app.
  source_note text,
  -- 'active' = normal, searchable row. 'flagged' = has at least one open
  -- report against it (see vcpmc_catalog_reports below) — still shown
  -- (never hidden — the point is surfacing it needs a look, not hiding
  -- data), just visually marked in the UI.
  status text not null default 'active' check (status in ('active', 'flagged')),
  -- 'import' = came from the original bulk load. 'manual' = added later
  -- via the app's own "+ Add Entry" button — kept distinct so the catalog
  -- page can show provenance without a separate table.
  source text not null default 'import' check (source in ('import', 'manual')),
  added_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vcpmc_catalog_title_trgm on vcpmc_catalog using gin (title gin_trgm_ops);
create index if not exists idx_vcpmc_catalog_composer_trgm on vcpmc_catalog using gin (composer gin_trgm_ops);
create index if not exists idx_vcpmc_catalog_lyricist_trgm on vcpmc_catalog using gin (lyricist gin_trgm_ops);
create index if not exists idx_vcpmc_catalog_status on vcpmc_catalog(status);

-- "Report wrong row" — a lightweight flag + note, not a delete/edit (no
-- one's own report should be able to silently alter or remove official
-- catalog data). Keeps every report on record even after it's resolved,
-- same soft-review pattern the rest of this app uses elsewhere (Secret
-- Messages' clear-for-recipient, etc.) rather than deleting the report row.
create table if not exists vcpmc_catalog_reports (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references vcpmc_catalog(id) on delete cascade,
  reported_by uuid references profiles(id) on delete set null,
  note text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_by uuid references profiles(id) on delete set null,
  resolved_at timestamptz
);

create index if not exists idx_vcpmc_catalog_reports_catalog on vcpmc_catalog_reports(catalog_id);
create index if not exists idx_vcpmc_catalog_reports_status on vcpmc_catalog_reports(status);
