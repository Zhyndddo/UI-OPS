-- Round 153 — item 2: Spotify Banner's new "Link Drive" field, the one
-- additional field the Round 106 comment in app/workstation/pitching/page.js
-- already flagged as coming "later" (same "priority spotify" template + one
-- extra field pattern already used for Priority's own ISRC field).
--
-- Safe to run multiple times / against a database that already has this
-- column (IF NOT EXISTS guards it).

ALTER TABLE releases
  ADD COLUMN IF NOT EXISTS pitching_spotify_banner_drive_link text;
