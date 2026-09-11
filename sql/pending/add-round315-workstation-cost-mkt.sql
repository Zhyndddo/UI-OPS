-- Round 315 — new Workstation item "Cost Marketing"
-- (app/workstation/cost-mkt/page.js), per explicit request + the
-- "workstation template.xlsx" reference sheet the team sent.
--
-- What this covers: a cost-tracking layer on TOP of data that mostly
-- already lives elsewhere in the app —
--   - TikTok Channel Partner bookings and Ads bookings (Facebook/YouTube/
--     TikTok/Spotify Ads), for the VIEENT TRẢ (package) side, read live
--     from media_booking_packages/media_booking_package_lines — same
--     "booked target" logic Booking Board's bookedFor() already uses
--     (see app/booking/page.js, now exporting makeBookedFor so this page
--     reuses it instead of a second hand-copied version).
--   - Booking Không Trong Package tickets, for the ARTIST TRẢ side, read
--     live from tickets.data (hangMuc/brand/soLuong) — no schema change
--     needed there, that ticket type already existed (Round 106).
-- What's genuinely new: the per-release, per-partner/ads-brand cost
-- fields the reference sheet adds on top of all that (Cost Dự Kiến, Cost
-- Thực Chạy, Tháng Chi Trả, Report Link, Vieent Hỗ Trợ, Artist Trả) plus
-- two manually-typed post counts (No. Booking Post / No. Support Post —
-- per explicit clarification, NOT derived from booked/added data, typed
-- in directly) and Sup Cashback (per explicit follow-up — the team's
-- reference sheet was missing a column for it; added here as its own
-- field specifically so it can be dropped again just as easily if it
-- turns out wrong — it's one column, not load-bearing for anything else
-- in this table).
--
-- One row per (release, funded_by, channel_kind, brand) — e.g. one row
-- for "release X, vieent, tiktok, EXT TIKTOK - BK MUSIC" and a separate
-- row for "release X, vieent, tiktok, EXT TIKTOK - DUCTH", matching the
-- sheet's "each partner/ads-brand gets its own cost row" layout
-- (confirmed explicitly — see this round's clarifying-questions answer).
--
-- Idempotent — safe to run again.
create table if not exists workstation_cost_mkt_entries (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references releases(id) on delete cascade,
  -- 'vieent' = BOOKING PACKAGE (VIEENT TRẢ), 'artist' = BOOKING KHÔNG
  -- PACKAGE (ARTIST TRẢ) — matches this page's two top-level tabs.
  funded_by text not null check (funded_by in ('vieent', 'artist')),
  -- 'tiktok' = TikTok Channel filter, 'ads' = Ads filter.
  channel_kind text not null check (channel_kind in ('tiktok', 'ads')),
  -- The TikTok partner brand (e.g. "EXT TIKTOK - BK MUSIC", matching
  -- app/booking/page.js's TIKTOK_CHANNEL_GROUPS.Partner) or the Ads brand
  -- (e.g. "Facebook Ads", matching that file's ADS_METRICS keys).
  brand text not null,
  -- Manually typed, NOT derived from booked/added post data — per
  -- explicit clarification, "total post = booked target" (read live,
  -- not stored) while these two are reconciled by hand.
  no_booking_post numeric,
  no_support_post numeric,
  cost_du_kien numeric,
  cost_thuc_chay numeric,
  -- Free text ("tự điền", the sheet's own example shows "08/2026") rather
  -- than a real date/month type — matches how loosely the sheet itself
  -- treats this field.
  thang_chi_tra text,
  report_link text,
  vieent_ho_tro numeric,
  artist_tra numeric,
  -- Round 315 follow-up — "Sup Cashback" the reference sheet's summary
  -- card expects but the detail sheet itself was missing a column for.
  sup_cashback numeric,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  unique (release_id, funded_by, channel_kind, brand)
);

create index if not exists workstation_cost_mkt_entries_release_id_idx
  on workstation_cost_mkt_entries(release_id);

comment on table workstation_cost_mkt_entries is
  'Round 315 — Workstation > Cost Marketing''s manually-tracked cost fields, one row per (release, funded_by, channel_kind, brand). Everything else that page shows (booked post targets, ads metric targets) is read live from media_booking_package_lines / booking_not_in_package tickets, not stored here.';
