-- Round 309 — Promotion Package and Ads Perform ARE two separate urls
-- after all. Restores releases.promotion_package_url alongside
-- releases.ads_perform_url.
--
-- Timeline: Round 307 added ads_perform_url as a field separate from
-- promotion_package_url. Round 308, on a further (incorrect)
-- clarification, treated them as ONE field renamed and DROPPED
-- promotion_package_url after backfilling its values into
-- ads_perform_url. Immediate follow-up correction settles it: they really
-- are two separate urls —
--   * promotion_package_url — the package OFFER link. Edited on the
--     release detail page's URL tab only. Shown there, and on the Media
--     Report magic link among the Streaming & Milestone rows.
--   * ads_perform_url — the ads RESULTS/performance link. One url per
--     release, shared across every Ads brand's popup on the Booking Board
--     (Facebook/YouTube/TikTok/Spotify Ads) — that's the ONLY place it's
--     edited on the Booking Board (also editable from the release detail
--     page's URL tab for convenience). Shown on the Media Report magic
--     link's Ads category card.
--
-- Safe to run regardless of which prior rounds already ran on this
-- database:
--   - If Round 308 never ran: promotion_package_url already exists
--     untouched (the `add column if not exists` below is a no-op) and the
--     backfill finds nothing to do (nothing has promotion_package_url
--     null while also holding a real ads_perform_url from this specific
--     history).
--   - If Round 308 DID run: promotion_package_url is gone and its old
--     value was copied into ads_perform_url at that point. This
--     recreates promotion_package_url and copies ads_perform_url's value
--     back into it for any release where promotion_package_url is empty.
--     This is an approximation — the two columns held the same value at
--     the moment Round 308 ran, so this is correct for every release
--     that hasn't been touched since — but if anyone entered a genuinely
--     different Ads Perform value on the Booking Board between Round 308
--     running and this migration, that value will incorrectly also land
--     in promotion_package_url for that release. Given how close together
--     these corrections landed, that window should be empty in practice,
--     but it's worth a quick manual glance at any release where both
--     columns now hold the exact same value before trusting either blindly.
alter table releases add column if not exists promotion_package_url text;
alter table releases add column if not exists ads_perform_url text;

update releases
set promotion_package_url = ads_perform_url
where (promotion_package_url is null or promotion_package_url = '')
  and ads_perform_url is not null
  and ads_perform_url <> '';

comment on column releases.promotion_package_url is
  'The package OFFER link. Edited on the release detail page''s URL tab. Shown there, and on the Media Report magic link among the Streaming & Milestone rows (not the Ads card — that''s ads_perform_url). Separate from ads_perform_url — see that column''s comment.';
comment on column releases.ads_perform_url is
  'The ads RESULTS/performance link — one url per release, shared across every Ads brand''s popup on the Booking Board (Facebook/YouTube/TikTok/Spotify Ads all write this same column) and also editable from the release detail page''s URL tab. Shown on the Media Report magic link''s Ads category card, not the Booking Board itself. Separate from promotion_package_url — see that column''s comment.';
