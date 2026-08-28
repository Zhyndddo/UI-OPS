-- Round 226 — normalize legacy "Apple Music" / "iTunes" platform values
-- on milestone_chart_entries to the app's one canonical "Apple" platform.
--
-- app/workstation/milestone/page.js's PLATFORM_CHARTS has always saved
-- every Apple-family chart ("Apple Music - Top Songs Vietnam", "Vietnam
-- iTunes Top Songs", "New Release on Apple", etc.) under the single
-- platform "Apple" — there has never been a separate "Apple Music"
-- platform in that map. A handful of older rows (most likely pre-dating
-- that convention, or written by the TOTAL_STREAK import) were saved
-- with the raw chart-provider name instead. That went unnoticed until
-- round 226's new platform-tabs split on the Performance report surfaced
-- it as its own near-empty "Apple Music" tab sitting next to "Apple".
--
-- The app now also normalizes this in JS at read time (see
-- normalizePlatform() in lib/PerformanceReport.js), so the UI is already
-- correct without this migration. Run this when convenient to clean up
-- the stored data itself — no functional change either way once it's
-- run, just keeps the raw table honest for anyone querying it directly.
--
-- Safe to run more than once (WHERE clause only matches the stale rows).

update milestone_chart_entries
set platform = 'Apple'
where platform is not null
  and lower(trim(platform)) in ('apple music', 'itunes');
