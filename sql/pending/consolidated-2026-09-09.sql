-- ============================================================
-- CONSOLIDATED HANDOFF — everything pending as of 2026-09-09
-- Combines all pending, non-superseded, non-destructive migrations
-- into one script, in a safe run order. Idempotent throughout —
-- safe to run even if some of these were already partially applied.
--
-- NOT included here (run separately / do not run — see the checklist):
--   - add-round258-indie-flag.sql        (superseded by round260 below)
--   - add-round261-subteam-tags.sql      (redundant, subsumed by round264-consolidated below)
--   - add-round262/263/264-drop-*.sql    (explicit stubs, superseded by round264-consolidated below)
--   - round240-milestone-wipe-reinstate.sql   (huge, destructive DELETE+INSERT — run on its own, see checklist)
-- ============================================================

-- ------------------------------------------------------------
-- FROM: add-round222-performance-share-links.sql
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- FROM: add-round226-normalize-apple-platform.sql
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- FROM: add-round229-tool-directory-preview-tool.sql
-- ------------------------------------------------------------
-- Round 229 — safety net for adding "New Release Preview" as a real tool
-- entry in the `upload` bucket of lib/toolDirectory.js's tool directory
-- (alongside Label Master and Linkfire).
--
-- mergeToolDirectory() (lib/toolDirectory.js) uses a saved bucket's
-- `tools` array WHOLESALE once any dev has ever saved it through the
-- Tools Directory page's edit mode (app/tool-directory/page.js) — the
-- new default third tool added in the app code will silently NOT show
-- up in that case, since the saved JSON in app_settings simply doesn't
-- know about it yet.
--
-- This migration only matters if the `upload` bucket was ever saved
-- that way. If it was never saved (still running on the code defaults),
-- this is a no-op — the WHERE clause below only matches a row that
-- exists and only appends when the tool isn't already present, so it's
-- safe to run regardless, and safe to run more than once.

update app_settings
set value = jsonb_set(
  value,
  '{upload,tools}',
  (value -> 'upload' -> 'tools') || '[{"key":"newReleasePreview","label":"New Release Preview","generator":"newReleasePreviewNote"}]'::jsonb
)
where key = 'tool_directory_links'
  and value ? 'upload'
  and value -> 'upload' ? 'tools'
  and not exists (
    select 1
    from jsonb_array_elements(value -> 'upload' -> 'tools') t
    where t ->> 'key' = 'newReleasePreview'
  );


-- ------------------------------------------------------------
-- FROM: add-round232-digest-custom-note.sql
-- ------------------------------------------------------------
-- Round 232 — a free-text note field for the daily digest email, editable
-- from Config -> Notifications, per explicit request ("add a field ...
-- so I can change the email content when things get more developed").
-- Rendered near the top of the digest (below the title, above Tickets)
-- when non-empty; blank/null shows nothing, same as today.

alter table notification_settings add column if not exists digest_custom_note text;


-- ------------------------------------------------------------
-- FROM: add-round247-media-booking-entry-totals.sql
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- FROM: add-round260-project-tag.sql
-- ------------------------------------------------------------
-- Round 260 — replaces Round 258's plain boolean INDIE flag with a real
-- single-choice project tag, per explicit request/follow-ups: "click on
-- it will cycle through ... 'INDIE'; 'VPOP'; 'ENVI', 'VIEENT', 'NONE'"
-- (values corrected in chat from an initial 'MITA' -> 'ENVI', then VIEENT
-- added) — these 4 real values line up with booking_channels.brand's own
-- raw grouping vocabulary (see that column's comment: "VIEENT / ENVI -
-- MIỀN TÂY/BOLERO / INDIE / VPOP / capcut"), which is also what the new
-- automatic-flag check (app/releases/[id]/page.js) reads against.
--
-- project_tag_locked tracks whether a human has ever manually set this
-- release's tag (via the dashboard's flag icon or the detail page's
-- switch) OR the automatic Indie-flag check has already fired once —
-- either way, once locked, nothing auto-sets this release's tag again;
-- only another manual action can change it. This is what makes the
-- automatic flag genuinely "one time, no change unless manually
-- unflag[ged]" instead of re-firing forever.
--
-- If Round 258's is_indie column was already applied and has real data on
-- it, backfill it manually after this migration:
--   update releases set project_tag = 'INDIE', project_tag_locked = true
--     where is_indie = true and project_tag is null;
-- (left as a manual step, not run automatically here, since is_indie may
-- not exist at all if Round 258 was never deployed — this migration
-- doesn't depend on it either way.)

alter table releases add column if not exists project_tag text;
alter table releases add column if not exists project_tag_locked boolean not null default false;


-- ------------------------------------------------------------
-- FROM: add-round264-consolidated-subteam-migration.sql
-- ------------------------------------------------------------
-- Round 264 — consolidated fix, v2. Replaces
-- add-round262-subteam-rework.sql, add-round263-drop-marketing-subteam-
-- rows.sql, and add-round264-drop-subteams-table.sql — run THIS ONE
-- instead of those three (they're now stubbed out to point here).
--
-- v2 change: the whole thing is now ONE atomic `do $$ ... $$` block
-- instead of several separate statements. The first version kept
-- failing with "column releases.subteam_tags_locked does not exist"
-- even after being told to fix it — the most likely cause is the
-- separate statements getting run out of order or only partially (e.g.
-- pasting/running just the later UPDATE without the ALTER TABLE above
-- it, or an earlier statement erroring and rolling back everything after
-- it in the same paste). A single DO block can't be run "half" — select
-- this ENTIRE file and run it as ONE query. It's still fully idempotent
-- (safe to run again, or after any subset of the old three scripts ever
-- applied).
--
-- What it does: adds profiles.subteam; folds Youtube/Publishing/
-- Operation segments back into OPS (moving the old segment onto
-- subteam); adds releases.subteam_tags and subteam_tags_locked (the pair
-- the app actually reads/writes — app/releases/page.js, app/releases/
-- [id]/page.js); folds any legacy project_tag data into them (guarded —
-- works whether or not that retired column still exists); and drops the
-- now-unused `subteams` table.

do $$
begin
  execute 'alter table profiles add column if not exists subteam text';

  update profiles
  set subteam = coalesce(subteam, segment), segment = 'OPS'
  where segment in ('Youtube', 'Publishing', 'Operation');

  execute 'alter table releases add column if not exists subteam_tags jsonb not null default ''{}''::jsonb';
  execute 'alter table releases add column if not exists subteam_tags_locked jsonb not null default ''{}''::jsonb';

  if exists (
    select 1 from information_schema.columns
    where table_name = 'releases' and column_name = 'project_tag'
  ) then
    update releases
    set
      subteam_tags = subteam_tags || jsonb_build_object(project_tag, true),
      subteam_tags_locked = subteam_tags_locked || jsonb_build_object(project_tag, true)
    where project_tag is not null;
  end if;

  execute 'drop table if exists subteams';
end $$;


-- ------------------------------------------------------------
-- FROM: add-round269-secret-messages.sql
-- ------------------------------------------------------------
-- Round 269 — Secret Messages: dev-only, targeted messages (one person, a
-- whole segment/team, a subteam, a role, or everyone) that show up as a
-- sidebar item + a one-time popup for whoever they're targeted at, and stay
-- there until dev deletes them. Delete is a SOFT delete (deleted_at set,
-- row kept) so dev retains a hidden audit trail of what was sent/to whom/
-- when — recipients never see a deleted row again, but dev's own list in
-- Config still shows it (greyed out) for that history. Idempotent — safe
-- to run again.

create table if not exists secret_messages (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references profiles(id),
  -- 'individual' | 'segment' | 'subteam' | 'role' | 'all'
  target_type text not null,
  -- profiles.id (as text) for 'individual', a segment name for 'segment', a
  -- subteam name for 'subteam', a role name for 'role', null for 'all'.
  target_value text,
  message text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists secret_messages_target_idx on secret_messages (target_type, target_value);
create index if not exists secret_messages_active_idx on secret_messages (deleted_at);


-- ------------------------------------------------------------
-- FROM: add-round270-phai-sinh-album-name-column.sql
-- ------------------------------------------------------------
-- Round 270 — fix "Could not find the 'album_name' column of
-- 'phai_sinh_batch_items' in the schema cache" reported by the user while
-- importing a Kho Nhạc batch file.
--
-- Root cause: Round 116 added "Tên Album" (album_name) to
-- BATCH_ITEM_COLUMNS / FIELD_KEYS in lib/phaiSinhBatchParse.js, and Round
-- 117 moved it to the front of that list. Every batch-paste and
-- batch-file-upload row built since then includes an album_name key
-- (cellsToItem() maps FIELD_KEYS[i] -> cells[i] for every key, unconditionally),
-- and app/tickets/batch-phai-sinh/[id]/page.js inserts those rows as-is
-- into phai_sinh_batch_items. No migration was ever written to add the
-- column itself — grepping the whole sql/ tree for "album_name" turns up
-- zero hits before this file, and sql/reference/prod_schema_clean.sql's
-- own CREATE TABLE for phai_sinh_batch_items has no such column. So this
-- has been a live gap since Round 116/117; it only surfaces once a batch
-- actually includes an Album value in that column and gets inserted.
--
-- Nullable text, matching every other optional free-text field on this
-- table (version, the_loai, artist, composer, ...) — album isn't always
-- applicable (single-track Phái Sinh requests with no parent album).
alter table if exists phai_sinh_batch_items
  add column if not exists album_name text;


-- ------------------------------------------------------------
-- FROM: add-round270-phai-sinh-rights-columns.sql
-- ------------------------------------------------------------
-- Round 270 — split the batch table's single "Tác quyền" free-text field
-- into 3 columns, one per right, matching New Release's Copyright
-- Checklist breakdown (Q1 Bản ghi / Q2 Người biểu diễn / Q3 Tác giả), per
-- explicit request ("a column copyrights for each row (3 rights just
-- like the new release)"). Scope deliberately limited to Owner-per-right
-- text — not the full Owner/Contract/Validity structure New Release
-- uses on releases.copyright_checklist — since the batch table is a flat
-- spreadsheet-style grid (paste/file-import + inline cell edit), not a
-- per-track popup editor.
--
-- The existing `tac_quyen` column is left as-is, untouched: any row
-- imported before this round keeps its value there and still displays
-- fine (that column simply stops being written to by new imports/edits
-- going forward — see lib/phaiSinhBatchParse.js and
-- app/tickets/batch-phai-sinh/[id]/page.js).
alter table if exists phai_sinh_batch_items
  add column if not exists tac_quyen_master text,
  add column if not exists tac_quyen_vocal text,
  add column if not exists tac_quyen_author text;


-- ------------------------------------------------------------
-- FROM: add-round274-pitching-pic-anh-lan.sql
-- ------------------------------------------------------------
-- Round 274 — adds anh.lan@vieent.vn to the Pitching PIC List
-- (global_settings.pitching_pic_list, see lib/pitchingPicList.js), per
-- explicit request. Paired with the same round's code change widening
-- that list to apply to ANY profile once configured (previously it was
-- always intersected with the OPS/AR team filter first, so a
-- non-OPS/AR pick here would have silently never shown up as an
-- assignable PIC on the workstation regardless of this row).
--
-- Idempotent: safe to run more than once — skips if the id is already
-- in the list, and upserts the settings row either way (creates it if
-- Config → Pitching → PIC List has never been saved before).
do $$
declare
  target_id text;
  current_val text;
  ids jsonb;
begin
  select id::text into target_id from profiles where email = 'anh.lan@vieent.vn';
  if target_id is null then
    raise notice 'No profile found for anh.lan@vieent.vn — nothing added. Check the email is correct and that a profile row exists for them.';
    return;
  end if;

  select value into current_val from global_settings where key = 'pitching_pic_list';
  ids := coalesce(current_val::jsonb, '[]'::jsonb);

  if not (ids ? target_id) then
    ids := ids || to_jsonb(target_id);
  end if;

  insert into global_settings (key, value, updated_at)
  values ('pitching_pic_list', ids::text, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;


-- ------------------------------------------------------------
-- FROM: add-round279-tickets-pic-profile-ids.sql
-- ------------------------------------------------------------
-- Round 279 — PIC → tag system (multiple PICs per ticket), phase 1.
--
-- Adds tickets.pic_profile_ids (uuid[]), additive alongside the existing
-- tickets.pic_profile_id (uuid, single FK) — NOT a replacement. The old
-- column stays the source of truth for every ticket-list page not yet
-- converted to the new tag UI (task-table attribution, auto-advance-on-
-- PIC-pick logic, etc. all still read it). A page that's been converted to
-- the tag input writes BOTH columns on every PIC change — the array (the
-- real multi-PIC list) and pic_profile_id set to the array's first entry
-- (or null if the array is empty) — so every unconverted page keeps
-- reading a sane single value even on a ticket that was actually tagged
-- with several people elsewhere.
--
-- Idempotent: safe to run more than once.
alter table if exists tickets
  add column if not exists pic_profile_ids uuid[];

comment on column tickets.pic_profile_ids is
  'Round 279 — multi-PIC tag list. pic_profile_id (singular) is kept in sync as the array''s first entry by every page that writes this column, for backward compatibility with pages not yet converted to the tag UI.';


-- ------------------------------------------------------------
-- FROM: add-round280-bo-sung-data-snooze.sql
-- ------------------------------------------------------------
-- Round 280 — daily reminder popup for outstanding Bổ Sung DATA rows (see
-- lib/BoSungDataReminder.js). Ticking "Don't remind me today" writes
-- now() + 24h here; the reminder stays suppressed for that profile until
-- this timestamp passes, then starts showing again on their next session.
--
-- Idempotent: safe to run more than once.
alter table if exists profiles
  add column if not exists bo_sung_data_snooze_until timestamptz;


-- ------------------------------------------------------------
-- FROM: add-round280-bo-sung-data-ticket-type.sql
-- ------------------------------------------------------------
-- Round 280 — new ticket type "Bổ Sung DATA" (bo_sung_data).
--
-- Requester: OPS. Executor: AR. Deliberately just 2 statuses — this ticket
-- has no manual status workflow at all; PENDING -> COMPLETE is set
-- automatically by the app (app/tickets/bo-sung-data/page.js) the moment
-- every one of the release's 6 Metadata Checklist fields (see
-- lib/metadataChecklist.js — the SAME columns/values the release detail
-- page's own Metadata Checklist reads/writes) is resolved: the 4 required
-- ones (Audio/Artwork/Lyric/Metadata) at "true", the other 2 (Working
-- Files/MV) at either "true" or "false" (not "update"/blank). No REFUND/
-- CANCELED/PROCESS in between — there's nothing manual to advance through.
--
-- Idempotent: safe to run more than once.
insert into ticket_tabs (key, label, segment, status_options, default_status, sort_order, executor_team)
values ('bo_sung_data', 'Bổ Sung DATA', 'OPS', array['PENDING', 'COMPLETE'], 'PENDING', 0, 'AR')
on conflict (key) do nothing;


-- ------------------------------------------------------------
-- FROM: add-round281-audit-log-requester-and-autoassign.sql
-- ------------------------------------------------------------
-- Round 281 — audit logging + requester attribution + workstation auto-assign.
--
-- Context: investigated why Media Booking tickets were reverting to
-- REQUESTED (turned out to be 4 legitimate UI-driven paths, no bug) — that
-- surfaced that nothing in the app records WHO changed a ticket, only when
-- (status_log is timestamp-only). The team asked to fix this properly:
--   1. Requester attribution on tickets (today only requester_segment/
--      requester_name free text exist — no real profile link) + a durable
--      audit trail of create/status-change/reopen/complete/delete/reassign/
--      deadline-change events.
--   2. Workstation rows with nobody assigned auto-assign to that segment's
--      team lead, falling back to an admin on the same segment if there's
--      no single team lead (zero or more than one).
--   3. New Release Setup records who submitted the form, so that person can
--      be used as requester_profile_id on every ticket auto-created for
--      that release afterward.
--
-- `audit_log` (actor/action/entity/entity_id/field/before_val/after_val)
-- already existed in the schema, unused since it was added — see
-- claude/audit-log-and-requester-attribution.md for the write-path design
-- (lib/auditLog.js) and which call sites use it as of this round.

-- 1. Requester attribution — additive alongside the existing free-text
-- requester_segment/requester_name (same "old field stays for back-compat,
-- new field is the structured source going forward" pattern Round 279 used
-- for pic_profile_ids). A page that still lets a human type/pick a
-- different requester manually keeps doing so — requester_profile_id is
-- the auto-derived default (the ticket creator, or the release's creator
-- for tickets auto-generated off a release), not a replacement for that
-- override.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS requester_profile_id uuid REFERENCES profiles(id);
CREATE INDEX IF NOT EXISTS idx_tickets_requester_profile_id ON tickets(requester_profile_id);

-- 2. Who submitted the New Release Setup form for this release — drives
-- requester_profile_id on every ticket auto-created off the release
-- afterward (Send Upload, Sony Publish, Publishing, Media Booking, etc.)
-- when nothing more specific overrides it.
ALTER TABLE releases ADD COLUMN IF NOT EXISTS created_by_profile_id uuid REFERENCES profiles(id);
CREATE INDEX IF NOT EXISTS idx_releases_created_by_profile_id ON releases(created_by_profile_id);

-- Note: tickets.deleted_by (text) already exists in the schema and was
-- simply never written to — no migration needed, just wiring the app code
-- to populate it on soft-delete (this round). Same for the audit_log table
-- itself — already fully defined, including its lookup index
-- (idx_audit_log_lookup on created_at/actor/entity), just never inserted
-- into until this round.
--
-- IMPORTANT — Round 283 caught and fixed a real breakage this migration
-- would otherwise have caused: `tickets` already had exactly one FK to
-- `profiles` (tickets_pic_profile_id_fkey), so every page's
-- `.select("*, profiles(name)")` (16 call sites, mostly bespoke ticket-type
-- list pages + lib/TicketListPage.js) relied on Supabase/PostgREST being
-- able to infer that single relationship implicitly. Adding
-- requester_profile_id as a SECOND FK to profiles makes that inference
-- ambiguous — PostgREST refuses with "more than one relationship was
-- found" at query time (not caught by `next build`, which never talks to
-- the DB). Every one of those call sites was updated to the explicit form
-- (`profiles!tickets_pic_profile_id_fkey(name)`) before this migration was
-- handed off — this migration is safe to run as-is, but if it's ever run
-- against a DB whose app code predates that fix (i.e. this migration was
-- somehow applied before the Round 283 commit), every one of those pages
-- will break with a live query error until the app code catches up.


-- ------------------------------------------------------------
-- FROM: add-round287-package-entry-snapshots.sql
-- ------------------------------------------------------------
-- Round 287 — Booking Ticket item 4 ("when I click back to package 1, the
-- left [DSP grid] should read from the right [currently active package],
-- instead of just showing whatever I last typed for package 2").
--
-- The grid's live numbers (media_booking_content_entries) are, by design,
-- one shared pool per release — not per package — because they represent
-- ongoing live tracking data, and Summarize just snapshots whatever's
-- currently in that shared pool into whichever package tab is active at
-- the time. That part is unchanged and NOT something this migration
-- touches: the grid you type into always stays the one shared live pool,
-- editable regardless of which package tab is open.
--
-- What this adds is a read-only per-package HISTORY of what the grid
-- looked like at each Summarize: one snapshot row per (package, category,
-- real brand — the same real brand Summarize itself already groups by:
-- the TikTok Channel sub-brand, the Social/Community brand bracket, the
-- Ads platform brand, or '' for anything without a brand concept). The
-- app writes to this table right alongside its existing
-- media_booking_package_categories upsert in handleSummarize, and reads
-- it back to show "what actually built this package for this brand" the
-- instant you switch package tabs — see app/tickets/media-booking/page.js's
-- saveEntrySnapshot/snapshotEntriesFor and the "Grid snapshot from ..."
-- read-only block under the DSP grid.
--
-- Idempotent: safe to run more than once.
create table if not exists media_booking_package_entry_snapshots (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references media_booking_packages(id) on delete cascade,
  category_id uuid not null references package_categories(id),
  brand text not null default '',
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, category_id, brand)
);

create index if not exists idx_media_booking_package_entry_snapshots_package
  on media_booking_package_entry_snapshots(package_id);


-- ------------------------------------------------------------
-- FROM: add-round290-publishing-composer.sql
-- ------------------------------------------------------------
-- Round 290 — Publishing ticket, item 3: "when tick yes in the product
-- detail page to create the ticket, also do a popup new fields, label
-- composer... free text for now."
--
-- releases.publishing_composer backs the release detail page's
-- gate_publishing popup (see lib/GateFields.js's TEXT_GATE_FIELDS —
-- extraField, alongside the existing publishing_gia_tri/"Tỉ Lệ Sở Hữu"
-- field) and app/new-release/page.js's own copy of that same popup for a
-- release still being created. Carried into the auto-created Publishing
-- ticket's data.composer either way (app/releases/[id]/page.js's saveTab,
-- app/new-release/page.js's create flow) — same pattern giaTri already
-- uses. The manual "New Ticket" form (app/tickets/publishing/new/page.js)
-- has its own independent Composer input, writing straight to
-- data.composer, not this column.
--
-- Idempotent: safe to run more than once.
alter table if exists releases
  add column if not exists publishing_composer text;


