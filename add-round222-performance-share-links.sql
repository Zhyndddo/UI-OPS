-- Round 222 — Performance report: a new admin+-only "Performance" tab on
-- /report (app/report/page.js) that accumulates one artist's or one
-- song's performance across this app (song count, best chart rank ever
-- hit, milestones, streaming numbers, package cost), plus a temporary
-- (72h) shareable read-only link generated from it
-- (app/performance-report/[token]/page.js).
--
-- Deliberately NOT a data snapshot — per explicit request ("Zero data
-- log I think, since this is just a computed formatted sheet"), this
-- table stores only the FILTER (which artist, or which release/song)
-- and the link's own lifecycle (token, who generated it, when it
-- expires). The public page re-runs the same live rollup query every
-- time it's opened, against whatever the underlying data currently
-- says — same "always current, nothing frozen" idiom as every magic
-- link elsewhere in this app (see `magic_links`), just with a real
-- expiry this time — `magic_links` itself explicitly never expires
-- (app/releases/[id]/page.js: "Magic links never expire once
-- created"); this is the first link table in this app that does.
--
-- This same table doubles as its own small history log, per explicit
-- request ("in case there are more than 1 people, we can store a small
-- history log... otherwise just store as a row (nothing more)") — the
-- admin Performance tab lists every row here as a plain history list,
-- active vs expired judged purely by `expires_at` at read time. No
-- separate access-count/view-log table, no cleanup job needed — an
-- expired row simply stops being viewable through the public page and
-- reads as "Expired" in the history list.
--
-- query_type/query_value are deliberately unconstrained text (no CHECK
-- constraint), matching this schema's existing convention for
-- short-enum text columns (see add-round211-link-lbm-source.sql) —
-- validated in the app layer, not the database. query_type is "artist"
-- or "song"; query_value is the exact artist name (matched against
-- releases.main_artist_tags / releases.main_artist) or a release id
-- (matched against releases.id) depending on query_type.
-- query_label is a plain display string (artist name, or "Song —
-- Artist") so the history list can render without re-resolving
-- query_value on every load.
create table if not exists performance_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null default generate_base36_token(),
  query_type text not null,
  query_value text not null,
  query_label text,
  created_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '72 hours')
);

create unique index if not exists performance_share_links_token_idx on performance_share_links (token);
