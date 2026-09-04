-- Round 247 — materialized rollup for Booking Board's "All" column, piece
-- (b) of claude/booking-board-lazy-load-pitch.md.
--
-- SCOPE, READ THIS FIRST: this only covers the "added" side of the "All"
-- column — how many entries (or, for Ads, how much quantity) exist per
-- (release, category, brand, platform/metric, subchannel). That's the
-- expensive, high-row-count table (media_booking_entries — the one that
-- already hit Supabase's 1000-row default cap once, see Round 142) that
-- app/booking/page.js's addedFor() currently re-sums from the full
-- in-memory `entries` array on every render.
--
-- It deliberately does NOT touch the "booked"/target side (bookedFor(),
-- reading media_booking_package_lines) — that table is small (a handful of
-- locked package lines per release, not thousands of rows), so it isn't the
-- performance problem, and its business logic is genuinely intricate
-- (Ads' multi-metric metric_quantities summing, Social/Community/TikTok
-- Channel's mushed-brand brand_column_quantities JSONB snapshot lookups —
-- see bookedFor()'s ~70 lines of category-specific special cases). Replicating
-- THAT in SQL blind, with no live data to diff-test against, risks a subtle
-- bug the whole team would see as a wrong number on the board — worse than
-- today's "correct but slow." Leave it client-side for now.
--
-- WHAT THIS DOES: a trigger-maintained rollup table, one row per
-- (release_id, category_id, channel_name, platform, subchannel_type),
-- holding entry_count (row count) and quantity_sum (SUM(quantity), for
-- Ads' numeric-quantity rows). Mirrors addedFor()'s own grouping key and
-- its "Ads sums quantity, everything else counts rows" rule exactly.
--
-- BEFORE THIS GOES LIVE:
-- 1. Run this whole file against a copy of real prod data (not prod itself
--    first).
-- 2. Diff entry_count/quantity_sum here against what addedFor() currently
--    computes client-side, across every release/category/brand/platform
--    combo — the same diff-test the pitch doc calls for, unchanged.
-- 3. Only THEN switch app/booking/page.js's read path to query this table
--    instead of re-summing the full `entries` array — that's a separate,
--    follow-up code change, not part of this SQL file.
-- 4. Confirm DB-level FK cascade behavior on releases/media_booking_entries
--    (the pitch doc flagged this as unverified from this session) — if a
--    release hard-delete cascades at the DB level, this trigger still fires
--    correctly per deleted row with no extra work, but worth confirming
--    that's really how the FK is defined before relying on it.

CREATE TABLE IF NOT EXISTS public.media_booking_entry_totals (
    release_id uuid NOT NULL,
    category_id uuid NOT NULL,
    channel_name text NOT NULL DEFAULT '',
    platform text NOT NULL DEFAULT '',
    subchannel_type text NOT NULL DEFAULT '',
    entry_count integer NOT NULL DEFAULT 0,
    quantity_sum numeric NOT NULL DEFAULT 0,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (release_id, category_id, channel_name, platform, subchannel_type)
);

COMMENT ON TABLE public.media_booking_entry_totals IS
  'Round 247 — trigger-maintained rollup of media_booking_entries, keyed to match app/booking/page.js''s addedFor() grouping exactly. See that function''s comment for the Ads-sums-quantity / everything-else-counts-rows rule. Draft only — not yet read by the app; see file header in sql/pending/add-round247-media-booking-entry-totals.sql for the required diff-test before cutover.';

-- Recomputes ONE group's row from scratch (re-aggregates from
-- media_booking_entries directly, rather than incrementing/decrementing) —
-- simplest correct option, and this table's row count per group is tiny, so
-- the extra read is cheap. Entries with no category_id are skipped: they
-- can never match any real Hạng Mục column in the UI (columns are always
-- built from real categories — see addedFor()'s categoryId lookup), so
-- they'd never contribute to any total the app actually shows.
CREATE OR REPLACE FUNCTION public.recompute_media_booking_entry_totals(
  p_release_id uuid, p_category_id uuid, p_channel_name text, p_platform text, p_subchannel_type text
) RETURNS void AS $$
BEGIN
  IF p_category_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.media_booking_entry_totals AS t
    (release_id, category_id, channel_name, platform, subchannel_type, entry_count, quantity_sum, updated_at)
  SELECT
    p_release_id, p_category_id, p_channel_name, p_platform, p_subchannel_type,
    COUNT(*)::integer,
    COALESCE(SUM(quantity), 0),
    now()
  FROM public.media_booking_entries
  WHERE release_id = p_release_id
    AND category_id = p_category_id
    AND COALESCE(channel_name, '') = p_channel_name
    AND COALESCE(platform, '') = p_platform
    AND COALESCE(subchannel_type, '') = p_subchannel_type
  ON CONFLICT (release_id, category_id, channel_name, platform, subchannel_type)
  DO UPDATE SET entry_count = EXCLUDED.entry_count, quantity_sum = EXCLUDED.quantity_sum, updated_at = now();

  -- Last row in the group was deleted (or updated away from this key) —
  -- the recompute above would have inserted/updated a 0-row group; clear
  -- it out instead of leaving a stale zero row around forever.
  DELETE FROM public.media_booking_entry_totals
  WHERE release_id = p_release_id AND category_id = p_category_id
    AND channel_name = p_channel_name AND platform = p_platform AND subchannel_type = p_subchannel_type
    AND entry_count = 0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.media_booking_entries_totals_trigger() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_media_booking_entry_totals(
      OLD.release_id, OLD.category_id, COALESCE(OLD.channel_name, ''), COALESCE(OLD.platform, ''), COALESCE(OLD.subchannel_type, ''));
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_media_booking_entry_totals(
      NEW.release_id, NEW.category_id, COALESCE(NEW.channel_name, ''), COALESCE(NEW.platform, ''), COALESCE(NEW.subchannel_type, ''));
    RETURN NEW;
  ELSE -- UPDATE — a row can change WHICH group it belongs to (e.g. its
       -- channel_name/platform edited), so both the new group and (if
       -- different) the old group need recomputing, not just one.
    PERFORM public.recompute_media_booking_entry_totals(
      NEW.release_id, NEW.category_id, COALESCE(NEW.channel_name, ''), COALESCE(NEW.platform, ''), COALESCE(NEW.subchannel_type, ''));
    IF (OLD.release_id, OLD.category_id, COALESCE(OLD.channel_name, ''), COALESCE(OLD.platform, ''), COALESCE(OLD.subchannel_type, ''))
       IS DISTINCT FROM
       (NEW.release_id, NEW.category_id, COALESCE(NEW.channel_name, ''), COALESCE(NEW.platform, ''), COALESCE(NEW.subchannel_type, '')) THEN
      PERFORM public.recompute_media_booking_entry_totals(
        OLD.release_id, OLD.category_id, COALESCE(OLD.channel_name, ''), COALESCE(OLD.platform, ''), COALESCE(OLD.subchannel_type, ''));
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_media_booking_entries_totals ON public.media_booking_entries;
CREATE TRIGGER trg_media_booking_entries_totals
AFTER INSERT OR UPDATE OR DELETE ON public.media_booking_entries
FOR EACH ROW EXECUTE FUNCTION public.media_booking_entries_totals_trigger();

-- One-time backfill so the table isn't empty until the next write —
-- ON CONFLICT DO NOTHING is safe/idempotent to re-run.
INSERT INTO public.media_booking_entry_totals
  (release_id, category_id, channel_name, platform, subchannel_type, entry_count, quantity_sum, updated_at)
SELECT
  release_id, category_id, COALESCE(channel_name, ''), COALESCE(platform, ''), COALESCE(subchannel_type, ''),
  COUNT(*)::integer, COALESCE(SUM(quantity), 0), now()
FROM public.media_booking_entries
WHERE category_id IS NOT NULL
GROUP BY release_id, category_id, COALESCE(channel_name, ''), COALESCE(platform, ''), COALESCE(subchannel_type, '')
ON CONFLICT (release_id, category_id, channel_name, platform, subchannel_type) DO NOTHING;
