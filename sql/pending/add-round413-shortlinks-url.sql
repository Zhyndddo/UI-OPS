-- Round 413 — "add this url in place of the linkfire of booking ticket
-- and bookingboard since we change to shortlink recently.
-- https://internal.vieent.com/short-links"
--
-- Booking Board (app/booking/page.js) and the Media Booking ticket
-- (app/tickets/media-booking/page.js) both read their "🔗 Short Links"
-- button's URL from app_settings.value->>'linkfire' on the
-- "artist_profile_links" row (field name kept as "linkfire" on purpose —
-- see lib/externalTools.js's DEFAULT_LINKFIRE_URL comment for why it
-- wasn't renamed). The app code's fallback default was updated this round
-- too, but a fallback only applies when this row has NEVER been saved —
-- if it already has, this UPDATE is what actually changes what the button
-- opens for everyone.
--
-- CAVEAT — this session has no live database access. This has NOT been
-- run against production. Run it yourself, ideally against staging
-- first. It's also the same thing you can now do from the app itself,
-- with no SQL at all: Tools Directory → OPS tab → Artist Profile → "Short
-- Links Tool" card (dev-only edit mode) — this file is only needed if you
-- want it fixed before opening that page, or prefer doing it in SQL.
--
-- Idempotent: safe to re-run: if the row doesn't exist yet, this simply
-- updates 0 rows (the app's hardcoded default already covers that case);
-- it does NOT insert a fresh row, since every OTHER field already on
-- app_settings.value for this key (spotify/apple/discoveryMode) would be
-- lost by a blind upsert here.

update app_settings
set value = jsonb_set(coalesce(value, '{}'::jsonb), '{linkfire}', '"https://internal.vieent.com/short-links"', true)
where key = 'artist_profile_links';
