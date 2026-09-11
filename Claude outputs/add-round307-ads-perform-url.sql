-- Round 307 — Ads Perform URL, genuinely its own field.
--
-- Round 286 had put a read-only "Ads Perform" column on the Booking Board
-- that actually just displayed releases.promotion_package_url (the same
-- field edited inside every Ads popup's "URL Promotion Package" input, and
-- shown on the Media Report magic link's "Promotion Package" line). Round
-- 306 removed that column as a duplicate of the magic link's own
-- Promotion Package line — but per explicit correction, that was wrong:
-- "The ads perform url is now its own url, separated from the promotion
-- package entirely as per the team requested." Ads Perform and Promotion
-- Package are two different links the team wants to track separately, not
-- one field shown twice.
--
-- This adds the real, separate column. Idempotent — safe to run again.
alter table releases add column if not exists ads_perform_url text;

comment on column releases.ads_perform_url is
  'Round 307 — a link to the ads performance report (e.g. an ads platform''s own results/analytics view), entered per-release from any Ads brand''s popup on the Booking Board (Facebook/YouTube/TikTok/Spotify Ads all share this one release-level field, same "one field, every Ads popup" shape as promotion_package_url). Deliberately separate from promotion_package_url — that one is the package OFFER link; this one is the ads RESULTS link. Shown on the Media Report magic link''s Ads category card (the "table where the ads part lives"), not the Booking Board itself (hidden there per Round 306, same reasoning: no point duplicating a link that already lives on the magic link everyone shares externally).';
