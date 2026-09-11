-- Round 308 — "Ads Perform" REPLACES "Promotion Package", it doesn't sit
-- alongside it.
--
-- SUPERSEDED by Round 309 (add-round309-restore-promotion-package-url.sql):
-- immediate follow-up correction reversed this — they really are two
-- separate urls after all, not one renamed field. DO NOT run this file on
-- its own; if it already ran, Round 309 recreates promotion_package_url
-- and recovers its value (see that file's header for the exact mechanics
-- and its one caveat). Kept here only for history.
--
-- Round 307 added releases.ads_perform_url as a field SEPARATE from
-- releases.promotion_package_url, on the (incorrect) read that the team
-- wanted both tracked independently. Per immediate explicit correction:
-- "the url promotion package is to be replace by the new ones. Still 1
-- url per song across every ads." There is supposed to be exactly ONE url
-- per release, shared across every Ads brand's popup (Facebook/YouTube/
-- TikTok/Spotify Ads) — same "one release-level field, edited from any of
-- several popups" shape it always had — just renamed/relabeled from
-- Promotion Package to Ads Perform, not duplicated into two columns.
--
-- This migration is safe to run whether or not Round 307's migration
-- (add-round307-ads-perform-url.sql) already ran:
--   1. Ensures ads_perform_url exists (creates it fresh if Round 307
--      never ran).
--   2. Backfills ads_perform_url from any existing promotion_package_url
--      value, for every release that has one and doesn't already have an
--      ads_perform_url set (covers the case where Round 307 already ran
--      and left ads_perform_url empty, and the case where this is the
--      very first touch of either column).
--   3. Drops promotion_package_url — it's retired everywhere in the app
--      (Booking Board's Ads popups, the release detail page's URL tab and
--      header link, and the Media Report magic link's Ads card all read/
--      write ads_perform_url now, see Round 308's app changes).
--
-- Idempotent — safe to run again (the backfill only touches rows where
-- ads_perform_url is still empty, and the drop is a no-op once the column
-- is gone).
alter table releases add column if not exists ads_perform_url text;

update releases
set ads_perform_url = promotion_package_url
where promotion_package_url is not null
  and promotion_package_url <> ''
  and (ads_perform_url is null or ads_perform_url = '');

alter table releases drop column if exists promotion_package_url;

comment on column releases.ads_perform_url is
  'Round 307 introduced this column; Round 308 made it the single release-level ads/promotion url, replacing the retired promotion_package_url (renamed, backfilled, then dropped — see add-round308-rename-promotion-package-to-ads-perform.sql). One url per release, entered from any Ads brand''s popup on the Booking Board (Facebook/YouTube/TikTok/Spotify Ads all share it) or the release detail page''s URL tab. Shown on the Media Report magic link''s Ads category card ("the table where the ads part lives"), not the Booking Board itself.';
