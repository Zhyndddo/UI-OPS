"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, formatDetailText, fetchAllRows } from "../../lib/helpers";
import TypeSwitcher from "../../lib/TypeSwitcher";
import { usePagination } from "../../lib/usePagination";
import Pagination from "../../lib/Pagination";
import { useIsMobile } from "../../lib/useIsMobile";
import { ARTIST_PROFILE_LINKS_SETTING_KEY, DEFAULT_LINKFIRE_URL } from "../../lib/externalTools";
import YoutubeAdsFields from "../../lib/YoutubeAdsFields";
import styles from "../shared.module.css";

// Every Hạng Mục here uses the same 2-layer pattern: pick a sub-filter
// (a brand, or a brand group), and THAT determines the columns shown.
// CATEGORY_SUBFILTERS is layer 1 — MUST stay in sync with the equivalent
// Per explicit request — highlight rows releasing today, so they're easy
// to spot while scanning the board. release_date is a plain `date` column
// (YYYY-MM-DD, no time), so a string-prefix compare against a local
// YYYY-MM-DD avoids any UTC/local timezone drift a Date-object compare
// could introduce.
function isReleasingToday(release) {
  if (!release?.release_date) return false;
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return String(release.release_date).slice(0, 10) === todayStr;
}

// Round 149 — the Release column's info rows (link_ugc, and now
// promotion_package_url below) are shown as full clickable URLs, which for
// a long link either forces the fixed-width column wider or wraps onto
// several lines, pushing every row's height up just for one long URL.
// Truncating the DISPLAYED text (the href/title stay the full real URL —
// only the visible label is shortened) keeps every row a predictable
// height regardless of link length.
function truncateUrlDisplay(url, max = 22) {
  if (!url) return "";
  return url.length > max ? `${url.slice(0, max)}…` : url;
}

// Round 155 item 4 — link_ugc (Link Sound TikTok) can now hold multiple
// URLs, one per line (same newline-joined-string convention as lib/
// UrlField.js — no schema change). This display-only spot (the Booking
// Board's table + card rows, both non-editable) used to assume a single
// URL and render one <a href={r.link_ugc}>; a real multi-line value would
// have produced one broken link with embedded newlines in its href.
// Splits and renders one clickable link per line instead, stacked, same
// truncated-display-text idiom as promotion_package_url right below it so
// a long URL still can't stretch the row.
function LinkUgcLines({ value, color }) {
  const urls = (value || "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (urls.length === 0) return null;
  return (
    <>
      {urls.map((u, i) => (
        <div key={i} title={u}>
          <a href={u} target="_blank" rel="noopener noreferrer" style={{ color, fontSize: 11 }}>
            {truncateUrlDisplay(u)}
          </a>
        </div>
      ))}
    </>
  );
}

// brand constants in app/tickets/media-booking/page.js (BRANDS,
// COMMUNITY_BRANDS, TIKTOK_GROUPS, ADS_BRANDS).
const CATEGORY_SUBFILTERS = {
  "Social": ["VIEENT", "ENVI"],
  "Community": ["PAGE BOLERO / MT", "PAGE VPOP", "PAGE INDIE"],
  "Ads": ["Facebook Ads", "YouTube Ads", "TikTok Ads", "Spotify Ads"],
  "TikTok Channel": ["In-house", "Partner"], // a group pick, not a single brand — see TIKTOK_CHANNEL_GROUPS
};

// Sub-filter button labels — Social's are shown prefixed ("SOCIAL VIEENT"),
// everything else is shown as-is.
function subfilterLabel(categoryName, value) {
  return categoryName === "Social" ? `SOCIAL ${value}` : value;
}

// TikTok Channel: layer 1 picks the group, layer 2 picks the group's real
// brand — same grouping/brand lists as TIKTOK_GROUPS in the media-booking
// ticket.
const TIKTOK_CHANNEL_GROUPS = {
  "In-house": ["TIKTOK BOLERO / MT", "TIKTOK VPOP", "TIKTOK INDIE", "CAPCUT"],
  "Partner": ["EXT TIKTOK - BK MUSIC", "EXT TIKTOK - DUCTH", "EXT TIKTOK - BK GROUP", "EXT TIKTOK - CTV MẪU"],
};

// TikTok Channel: layer 3 (columns, once a brand is picked) is this fixed
// subchannel-type list — same list, same labels, as TIKTOK_SUBCHANNELS in
// the media-booking ticket's Package Builder ("+ TIKTOK NEWS" etc.), so a
// link added here is tagged with the exact same vocabulary the target was
// planned against. MUST stay in sync with that file's copy.
// Round 124 — reordered per explicit team request ("re-order the column
// so the one they care more actually go first") — was TIKTOK NEWS, TIKTOK
// CAPCUT, MẪU CAPCUT, TIKTOK REUP MV, TIKTOK LYRICS. MUST stay in sync
// with the equivalent copy in app/tickets/media-booking/page.js.
const TIKTOK_SUBCHANNELS = ["TIKTOK CAPCUT", "TIKTOK LYRICS", "MẪU CAPCUT", "TIKTOK NEWS", "TIKTOK REUP MV"];

function tiktokGroupForBrand(brand) {
  if (TIKTOK_CHANNEL_GROUPS["In-house"].includes(brand)) return "In-house";
  if (TIKTOK_CHANNEL_GROUPS["Partner"].includes(brand)) return "Partner";
  return null;
}

// Social & Community: layer 1 picks the brand, layer 2 (columns) is this
// same fixed platform list for either one. Instagram was missing here even
// though it's already a real pickable platform on the Media Booking ticket
// itself (see PLATFORMS in app/tickets/media-booking/page.js) — any
// Instagram entries logged there had nowhere to show up on this Board for
// Social or Community, for any of their brands.
const PLATFORM_COLUMNS = ["Facebook", "Instagram", "TikTok", "YouTube", "Thread"];

// Ads: layer 1 picks the ad-platform brand, layer 2 (columns) is that
// brand's own fixed metric list — same lists as ADS_METRICS in the
// media-booking ticket (the metric name doubles as media_booking_entries'
// "platform" value here, same as it doubles as the entry-row label there).
const ADS_METRICS = {
  "Facebook Ads": ["Lượt tiếp cận", "Lượt tương tác", "Lượt truy cập (Link click)"],
  "YouTube Ads": ["Thruplay (Views)"],
  "TikTok Ads": ["Lượt tiếp cận", "Lượt xem video", "Lượt theo dõi", "Lượt truy cập (Link click)"],
  "Spotify Ads": ["HPTO", "In-Stream Audio", "In-Stream Video", "In-Feed Display", "In-Feed Video"],
};

// Round 168 — Ads' "All" aggregate (the Result-column dot AND the Done/
// Not-done toggle, whenever hangMucFilter is "All") used to blindly sum
// every metric's booked target and every entry's added quantity into one
// lump ratio — meaningless across metrics that measure completely
// different things (Lượt tiếp cận vs Thruplay views vs In-Stream Audio,
// etc across 4 different brands), so a release with a few metrics
// massively over-delivered and others still untouched could read as
// "done" purely by netting out, or the reverse. Per explicit request:
// DONE now means every real per-metric column (across every Ads brand)
// is itself individually done (added >= that column's own booked
// target, same "number result, not a link count" comparison AdsCell
// already uses per-column) — a column with no target at all doesn't
// count against it either way, so this returns null (no target
// anywhere, matches every other category's "grey — not booked" state)
// rather than true/false when nothing was ever requested.
function adsAllViewStatus(release, bookedFor, entries, categoryIdByName) {
  const categoryId = categoryIdByName["Ads"];
  let anyTarget = false;
  let anyDone = false;
  let allDoneOrUntargeted = true;
  Object.entries(ADS_METRICS).forEach(([brand, metrics]) => {
    metrics.forEach((metric) => {
      const booked = bookedFor(release, "Ads", brand, metric, null);
      if (booked == null || booked <= 0) return; // no target — doesn't count either way
      anyTarget = true;
      const added = entries
        .filter((e) => e.release_id === release.id && e.category_id === categoryId && (e.channel_name || "") === brand && (e.platform || "") === metric)
        .reduce((sum, e) => sum + (Number(e.quantity) || 0), 0);
      if (added >= booked) anyDone = true;
      else allDoneOrUntargeted = false;
    });
  });
  if (!anyTarget) return null;
  return anyDone && allDoneOrUntargeted;
}

// Ads results are a metric COUNT, not a posted URL — per explicit request,
// Ads cells take a quantity + a run-status instead of the Add Link popup
// every other Hạng Mục uses. Own vocabulary/colors, distinct from the
// link-status colors (Chưa Booking/Đã Gửi/Done) used everywhere else.
// Round 77 — "Cancel" added: the forced status for the YouTube Ads column
// on a release that hasn't ticked Có Trong Net YouTube on its detail page
// (see AdsCell's ctnLocked prop) — not a manually-pickable option, so it's
// not in ADS_STATUS_OPTIONS (the popup's own status-picker list), only in
// the color map so the locked cell can still render in this vocabulary.
const ADS_STATUS_OPTIONS = ["Chưa Chạy", "Đang Chạy", "Đã Chạy", "Pending"];
const ADS_STATUS_COLORS = {
  "Chưa Chạy": "var(--text-faint)",
  "Đang Chạy": "#ffca4d",
  "Đã Chạy": "#7ee6a8",
  "Pending": "#ff9d5c",
  "Cancel": "var(--text-dim)",
};

const ROUNDS = ["INT", "Đợt 1", "Đợt 2"];

// Soft brand matching between this Board's own column brand names (e.g.
// "PAGE VPOP", "TIKTOK BOLERO / MT", "EXT TIKTOK - BK MUSIC") and
// booking_channels.brand, which stores the reference sheet's raw grouping
// instead (e.g. "VPOP", "ENVI - MIỀN TÂY/BOLERO"). The two vocabularies
// were never meant to match exactly — this only ever RANKS suggestions in
// the Add Link popup, never hides any, so a token that doesn't overlap
// just means "not sorted to the top," not "invisible." Search always finds
// a channel by name regardless of this matching.
function brandTokens(value) {
  return new Set(
    (value || "")
      .toUpperCase()
      .replace(/[^A-ZÀ-Ỹ0-9]+/g, " ")
      .split(" ")
      .filter((t) => t && !["PAGE", "TIKTOK", "EXT", "SOCIAL", "BK", "CTV", "MT"].includes(t))
  );
}
function brandsLikelyMatch(a, b) {
  const ta = brandTokens(a);
  const tb = brandTokens(b);
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

export default function BookingBoard() {
  const [releases, setReleases] = useState([]);
  const [entries, setEntries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [packages, setPackages] = useState([]); // media_booking_packages + their lines, for every release
  const [dot2ReleaseIds, setDot2ReleaseIds] = useState(new Set()); // releases with a Đợt 2 targets row
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [round, setRound] = useState("Đợt 1"); // 'INT' | 'Đợt 1' | 'Đợt 2' — now a RELEASE-level (row) filter, see roundFilteredReleases
  const [hangMucFilter, setHangMucFilter] = useState("All"); // 'All' | a category name — determines the columns
  const [subFilter, setSubFilter] = useState(null); // layer-1 pick within hangMucFilter (a brand, or a brand group) — only relevant when CATEGORY_SUBFILTERS[hangMucFilter] exists; resets whenever hangMucFilter changes, see effect below
  const [tiktokBrandFilter, setTiktokBrandFilter] = useState(null); // layer-2 pick, TikTok Channel only — which of the picked group's 4 brands; columns (layer 3) are then that brand's 5 fixed subchannel types. Resets whenever hangMucFilter or subFilter (the group) changes, see effect below.
  const [typeFilter, setTypeFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  // Round 94 — top-of-board Done/Not Done counter+filter. 'done' means
  // every column CURRENTLY shown (respects hangMucFilter/subFilter/brand
  // drill-down, same `columns` the table itself renders) that actually has
  // a requested/booked target has added >= booked; a release with no
  // target on any shown column doesn't count as done (nothing to finish).
  // null = no filter, just show the two counts.
  const [doneFilter, setDoneFilter] = useState(null); // null | 'done' | 'not_done'
  const [expandedCell, setExpandedCell] = useState(null); // `${releaseId}:${categoryName}:${brand}` or null
  const [packagePreview, setPackagePreview] = useState(null); // release being previewed, or null
  const [bookingChannels, setBookingChannels] = useState([]); // booking_channels reference table — see BrandCell's Add Link popup
  // Round 125 — item 1: per-cell run status (Chưa Chạy/Đang Chạy/Đã Chạy/
  // Pending, same vocabulary as Ads) for TikTok Channel Partner-group
  // columns — see media_booking_channel_status. Keyed the same way the
  // table is uniqued: `${release_id}:${category_id}:${brand}:${column_key}`.
  const [channelStatuses, setChannelStatuses] = useState({});
  // Round 91 — Linkfire's URL, admin-editable in Config → External Tool
  // Links (same app_settings row Spotify/Apple Music/Discovery Mode
  // already live in) instead of hardcoded here — Linkfire can change their
  // own URL without needing another round. Starts at the known-good
  // default and gets overwritten by load() below the moment the setting
  // row is read, so the button is never dead while that fetch is in
  // flight.
  const [linkfireUrl, setLinkfireUrl] = useState(DEFAULT_LINKFIRE_URL);
  // Round 87 — mobile plan phase, part 2: Booking Board is the busiest
  // table in the app (fixed columns + a dynamic per-DSP column set,
  // sticky first column, wide enough it needs minWidth:900 even on
  // desktop) — side-scrolling it on a phone works but means constantly
  // swiping back and forth to compare columns on the same row. Below the
  // breakpoint it renders as a stacked list of per-release cards instead,
  // reusing the exact same cell components (ResultCell/MediaReportCell/
  // BrandCell/AdsCell) with the exact same props as the table version —
  // only the layout around them changes, not their behavior.
  const isMobile = useIsMobile();

  useEffect(() => {
    const options = CATEGORY_SUBFILTERS[hangMucFilter];
    setSubFilter(options ? options[0] : null);
  }, [hangMucFilter]);

  // tiktokBrandFilter tracks whichever group subFilter is currently picked
  // — resets to that group's first brand both when the Hạng Mục changes
  // (e.g. away from TikTok Channel and back) and when the group itself
  // changes (In-house <-> Partner), so it's never left pointing at a brand
  // that belongs to the OTHER group.
  useEffect(() => {
    if (hangMucFilter === "TikTok Channel" && TIKTOK_CHANNEL_GROUPS[subFilter]) {
      setTiktokBrandFilter(TIKTOK_CHANNEL_GROUPS[subFilter][0]);
    } else {
      setTiktokBrandFilter(null);
    }
  }, [hangMucFilter, subFilter]);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    // Round 150 — load-reduction pass, item "Booking Board still feels
    // heavy". These 8 queries are all independent — none reads a result
    // from another — but were previously awaited one at a time in series,
    // so total wait time was the SUM of all 8 round trips. Switched to
    // Promise.all so they all fire concurrently instead; total wait time
    // becomes roughly the SLOWEST single query rather than the sum of all
    // of them. No query, column, or pagination behavior changed — same
    // fetchAllRows pagination on media_booking_entries as before (Round
    // 142), same column lists, same filters. See project doc
    // "load-reduction-additional-ideas.md" for the fuller writeup.
    const [
      { data: rels },
      { data: ents },
      { data: cats },
      { data: pkgs },
      { data: targets },
      { data: chans },
      { data: extLinks },
      { data: chanStatuses },
    ] = await Promise.all([
      supabase
        .from("releases")
        // Round 77 — gate_co_trong_net_youtube added: locks the YouTube Ads
        // Ads-brand column when the release hasn't opted into Có Trong Net
        // YouTube on its detail page (see AdsCell's ctnLocked prop below).
        // Round 92 — youtube_ads_url/youtube_ads_booking_note added: shown
        // (and editable) inside the YouTube Ads column's own popup, see
        // AdsCell's showYoutubeAdsFields prop below.
        // Round 146 — link_ugc added: shown as a clickable 3rd row under
        // the Release column's title/artist/DID line (both table and card
        // views), same pattern as Pitching ticket's link_lbm row.
        // Round 149 — promotion_package_url added, same pattern, one more
        // row below link_ugc.
        .select("id, did, title, main_artist, release_date, link_phu_luc, phu_luc_ngay_gui, phu_luc_ngay_ky, label, project_type, package_locked, booking_note, link_media_report, media_report_status, gate_co_trong_net_youtube, youtube_ads_url, youtube_ads_booking_note, pseudo_package_parent_did, link_ugc, promotion_package_url")
        .order("release_date", { ascending: false }),
      // Round 142 — item 1: PostgREST caps a plain select() at 1000 rows and
      // truncates silently, no error (see lib/helpers.js's fetchAllRows
      // comment / DATA_FIXES.md round 59-60 for the original discovery of
      // this bug class elsewhere in the app). This table easily blows past
      // 1000 rows across 797 releases' worth of Social/Community/Ads/TikTok
      // Channel links, and with no explicit .order() the DB was free to
      // return rows in whatever order it liked — including one that could
      // cut off freshly-inserted rows entirely. That's exactly the reported
      // symptom: bulk-add a batch of links, "DONE" shows immediately off the
      // optimistic local state, but a refresh re-runs this same truncated
      // query and the newly added rows (never actually lost — still sitting
      // in the DB) just don't come back in the first 1000. Paginates through
      // every row instead, ordered by `id` for stable .range() paging.
      // Round 150 — load-reduction pass, further column pruning: was
      // select("*"), now pruned to exactly the columns this file reads off
      // an entry row (verified by an exhaustive grep of every e./entry./
      // cellEntries/matchingEntries/roundEntries field access, including
      // insert-payload keys since inserted rows flow straight into this
      // same `entries` state). `channel_type` is write-only in this file
      // today (set on insert, never read back here) but kept in the select
      // since inserted rows carry it into state regardless.
      fetchAllRows(() =>
        supabase
          .from("media_booking_entries")
          .select("id, release_id, category_id, channel_name, platform, subchannel_type, quantity, status, booking_round, link, channel_type")
          .order("id")
      ),
      supabase.from("package_categories").select("id, name").order("sort_order"),
      // Round 114 — metric_quantities added: real per-metric Ads targets
      // (Facebook/TikTok/Spotify Ads), read by bookedFor() below instead of
      // always returning null for these brands' subchannel columns.
      // Round 120 — brand_column_quantities added: the real per-brand
      // per-platform/per-subchannel breakdown for Social/Community/TikTok
      // Channel's mushed line, snapshotted at Summarize time (see
      // packageLineColumnTarget below).
      supabase.from("media_booking_packages").select("id, release_id, name, media_booking_package_lines(category_id, brand, quantity, metric_quantities, brand_column_quantities)"),
      supabase.from("media_booking_dot2_targets").select("release_id"),
      // Reference channel list (see /booking-channels) — lets the Add Link
      // popup below suggest a real channel + URL instead of OPS typing both
      // from scratch every time. Missing table/no rows just means no
      // suggestions show up; the popup still works exactly as before.
      // Round 150 — pruned from select("*") to the columns this file
      // actually reads off a reference-channel row (id, platform, name,
      // brand, note, follower_count, url — verified by grep).
      supabase.from("booking_channels").select("id, platform, name, brand, note, follower_count, url"),
      supabase.from("app_settings").select("value").eq("key", ARTIST_PROFILE_LINKS_SETTING_KEY).maybeSingle(),
      // Round 125 — item 1: TikTok Channel Partner columns' status coloring.
      // Round 150 — pruned from select("*"): this query's result is only
      // ever destructured into (release_id, category_id, brand, column_key,
      // status) a few lines below, immediately after the fetch, before
      // being discarded — narrowed the select to match.
      supabase.from("media_booking_channel_status").select("release_id, category_id, brand, column_key, status"),
    ]);
    // Round 79 — pseudo-package tracks (releases linked to a parent EP/Album
    // via pseudo_package_parent_did) skip the whole booking process and
    // never appear on the Booking board at all.
    const filteredRels = (rels || []).filter((r) => !r.pseudo_package_parent_did);
    setReleases(filteredRels);
    setEntries(ents || []);
    setCategories(cats || []);
    setPackages(pkgs || []);
    setDot2ReleaseIds(new Set((targets || []).map((t) => t.release_id)));
    setBookingChannels(chans || []);
    if (extLinks?.value?.linkfire) setLinkfireUrl(extLinks.value.linkfire);
    const statusMap = {};
    (chanStatuses || []).forEach((s) => {
      statusMap[`${s.release_id}:${s.category_id}:${s.brand}:${s.column_key}`] = s.status;
    });
    setChannelStatuses(statusMap);
    setLoading(false);
  }

  // Round 125 — item 1: save a TikTok Channel Partner column's status,
  // upserting on the same (release, category, brand, column) key the
  // table is uniqued on — same "unfamiliar row -> insert, existing row ->
  // update" idiom as saveAdsQuantity above, just against the new table.
  async function saveChannelStatus(releaseId, categoryId, brand, columnKey, status) {
    const key = `${releaseId}:${categoryId}:${brand}:${columnKey}`;
    setChannelStatuses((prev) => ({ ...prev, [key]: status }));
    await supabase
      .from("media_booking_channel_status")
      .upsert(
        { release_id: releaseId, category_id: categoryId, brand, column_key: columnKey, status, updated_at: new Date().toISOString() },
        { onConflict: "release_id,category_id,brand,column_key" }
      );
  }

  async function updateReleaseNote(release, value) {
    setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, booking_note: value } : r)));
    await supabase.from("releases").update({ booking_note: value }).eq("id", release.id);
  }

  // Round 92 — YouTube URL / Booking note, edited straight from the
  // YouTube Ads column's own popup (see AdsCell) — same shared
  // youtube_ads_url/youtube_ads_booking_note columns the release detail
  // page's Có Trong Net YouTube panel and the Media Booking ticket also
  // read/write, so a value entered from any of the 3 places shows up in
  // the other 2 immediately (next load — this table doesn't subscribe to
  // realtime changes, same as every other field here).
  async function updateYoutubeAdsField(release, field, value) {
    setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, [field]: value } : r)));
    await supabase.from("releases").update({ [field]: value }).eq("id", release.id);
  }

  // Round 54 — item B.1: "Convert Media Report" turns this release's
  // magic link from a "Package Offer" into a "Media Report" everywhere it's
  // named (see release.media_report_status, read by app/pick-package,
  // app/releases/[id], and the media-booking ticket). 'ready' shows
  // "Send Artist" here next; clicking that is one-time — it flips to
  // 'sent' (locked, no more clicks) and marks the release complete.
  async function convertMediaReport(release) {
    setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, media_report_status: "ready" } : r)));
    await supabase.from("releases").update({ media_report_status: "ready" }).eq("id", release.id);
  }

  async function sendArtistMediaReport(release) {
    setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, media_report_status: "sent" } : r)));
    await supabase.from("releases").update({ media_report_status: "sent", status: "Hoàn thành" }).eq("id", release.id);
  }

  // Mirrors phu_luc_status() in schema.sql
  function phuLucStatus(r) {
    if (r.link_phu_luc && r.phu_luc_ngay_ky) return "Đã Ký";
    if (r.link_phu_luc && r.phu_luc_ngay_gui) return "Chờ Ký";
    if (r.link_phu_luc) return "Đã Soạn";
    return "Chưa Soạn";
  }

  const categoryIdByName = useMemo(() => {
    const map = {};
    categories.forEach((c) => (map[c.name] = c.id));
    return map;
  }, [categories]);

  // The package that's actually locked in for a release — matched by name
  // to release.project_type, same as how the magic-link confirm flow sets
  // it. Only real built packages (incl. INT MEDIA) have lines; the simple
  // options (Chỉ Phát Hành, Không Độc Quyền) never got a row here.
  const packageByRelease = useMemo(() => {
    const map = {};
    packages.forEach((p) => {
      if (!map[p.release_id]) map[p.release_id] = [];
      map[p.release_id].push(p);
    });
    const resolved = {};
    releases.forEach((r) => {
      resolved[r.id] = (map[r.id] || []).find((p) => p.name === r.project_type) || null;
    });
    return resolved;
  }, [packages, releases]);

  // Round 103 — added `platform`, optional (every existing call site that
  // doesn't care still works unchanged). Fixes a second, related instance
  // of the same "shows a number that isn't really that column's" family of
  // bug Round 96 already fixed one layer up: every Ads brand EXCEPT
  // YouTube Ads mushes several metrics into ONE combined package line with
  // a single lump `quantity` (see syncPackageLine in the Media Booking
  // ticket — `qty` is only ever real for YouTube Ads, null for every other
  // Ads brand's line) — there is no structured per-metric number stored
  // anywhere. The Booking Board's drilled-into-Ads columns are per-metric
  // (Lượt tiếp cận / Lượt tương tác / Lượt truy cập, each its own column),
  // but every one of those columns shares the exact same (categoryName,
  // brand) pair — before this fix, bookedFor() ignored platform entirely,
  // so all 3 sibling metric columns for a brand showed the exact SAME
  // number the instant ANY of them had one (e.g. a real Facebook Ads
  // Lượt tiếp cận of 5000 was also shown, wrongly, under Lượt tương tác and
  // Lượt truy cập for that same release). Per explicit request ("no fall
  // back... show null correctly" if a column doesn't really have a
  // number): a platform-specific column on a multi-metric Ads brand now
  // always reads as no-target, full stop — regardless of what the brand's
  // combined line's `quantity` happens to be, since that figure was never
  // that specific metric's number to begin with.
  // Round 108 — same "ghost number" fix as Round 96/103/104's Ads case,
  // now also applied to TikTok Channel: media_booking_package_lines has
  // exactly ONE quantity per (category, brand) — never split per
  // subchannel — so a real target of e.g. 15 for "TikTok Channel —
  // TIKTOK BOLERO/MT" was showing as 15 under EVERY one of that brand's 5
  // subchannel columns (TikTok News/CapCut/Mẫu CapCut/Reup MV/Lyrics), not
  // just the one(s) that actually have 15 booked. Per the same explicit
  // "no fall back... show null correctly" rule: a subchannel-drilled
  // TikTok Channel column now always reads as no-target — the real
  // brand-level total is still visible in the package popup and the "All"
  // Hạng Mục aggregate rollup, just not fabricated across all 5 siblings.
  // Round 119 (superseded by Round 120 below) briefly read this live off
  // media_booking_content_entries — reverted per explicit follow-up
  // request: pin to the last Summarize instead of showing whatever's
  // currently typed into the ticket's grid before anyone's re-Summarized.
  //
  // Round 120 — real per-brand/per-column targets for the 3 Hạng Mục whose
  // package line is always mushed to brand "" (Social, Community, TikTok
  // Channel — see the Round 118 comments above for the root cause). Reads
  // media_booking_package_lines.brand_column_quantities — a jsonb map
  // keyed "brand::column" (e.g. "SOCIAL VIENT::Facebook") — which the
  // Media Booking ticket now writes on every Summarize (see
  // syncPackageLine/groupSummarizedRows there), same "recompute in full
  // from the latest rollup rows" treatment quantity/amount already get.
  // This is deliberately a SNAPSHOT, not live: it only updates the next
  // time someone (re-)Summarizes that Hạng Mục, same staleness contract as
  // every other number this board already shows (quantity, metric_quantities).
  // A package still has to be chosen/locked for the release first — see
  // bookedFor's own `if (!pkg) return null` gate above this, unchanged.
  //
  // Community's column identity is carried on `subchannelType` (not
  // `platform` — see the columns useMemo's Round-108-era comment on why),
  // but brand_column_quantities' keys always use whatever column name
  // Summarize itself used (Community's own `platform` field, same
  // PLATFORM_COLUMNS vocabulary) — so this matches against whichever of
  // the two the caller actually passed.
  function packageLineColumnTarget(release, categoryName, brand, platform, subchannelType) {
    const pkg = packageByRelease[release.id];
    if (!pkg) return null;
    const categoryId = categoryIdByName[categoryName];
    const lines = pkg.media_booking_package_lines || [];
    const line = lines.find((l) => l.category_id === categoryId && (l.brand || "") === "");
    if (!line || !line.brand_column_quantities) return null;
    const columnKey = categoryName === "TikTok Channel" ? subchannelType : (platform ?? subchannelType);
    const qty = line.brand_column_quantities[`${brand || ""}::${columnKey || ""}`];
    return qty != null ? qty : null;
  }

  function bookedFor(release, categoryName, brand, platform, subchannelType) {
    const pkg = packageByRelease[release.id];
    if (!pkg) return null; // nothing locked in yet — no target to compare against
    const categoryId = categoryIdByName[categoryName];
    const lines = pkg.media_booking_package_lines || [];
    if (brand === null) {
      const matching = lines.filter((l) => l.category_id === categoryId); // "All" aggregate — every brand in this category
      if (matching.length === 0) return null;
      // Round 114 — a multi-metric Ads brand's line has quantity: null
      // (see above), so before this it silently contributed 0 to the "All"
      // aggregate even when it had real per-metric numbers. Fall back to
      // summing metric_quantities' values when quantity itself is null.
      return matching.reduce((sum, l) => {
        if (l.quantity != null) return sum + l.quantity;
        if (l.metric_quantities) return sum + Object.values(l.metric_quantities).reduce((s, v) => s + (v || 0), 0);
        return sum;
      }, 0);
    }
    if (categoryName === "Ads" && platform && (ADS_METRICS[brand] || []).length > 1) {
      // Round 114 — this used to always return null: every multi-metric
      // Ads brand's combined line only ever had one lump `quantity`, never
      // a real per-metric number (see the long comment above). That's
      // fixed at the source now — media_booking_package_lines.metric_quantities
      // carries the real { metric: count } map from Summarize (Round 114's
      // SQL + app/tickets/media-booking/page.js changes) — so read that
      // instead of fabricating (Round 96/103's fix) or silently staying
      // blank forever (the gap this closes). Still returns null (no
      // target) when a brand's line exists but this particular metric was
      // never filled in — same "no fall back, show null correctly" rule
      // as everywhere else in this function.
      const brandMatching = lines.filter((l) => l.category_id === categoryId && (l.brand || "") === (brand || ""));
      if (brandMatching.length === 0) return null;
      let total = 0;
      let any = false;
      brandMatching.forEach((l) => {
        const v = l.metric_quantities?.[platform];
        if (v != null) { total += v; any = true; }
      });
      return any ? total : null;
    }
    if (categoryName === "TikTok Channel" && subchannelType) {
      // Round 120 — used to unconditionally return null here (see the
      // long Round 108 comment above: the package line has no real
      // per-subchannel breakdown in its plain `quantity` field). Now reads
      // the real number from the line's brand_column_quantities snapshot
      // instead — see packageLineColumnTarget above.
      return packageLineColumnTarget(release, categoryName, brand, platform, subchannelType);
    }
    if (categoryName === "Social" || categoryName === "Community") {
      // Round 120 — same fix as TikTok Channel just above: these two also
      // only ever have a mushed brand-"" package line (see Round 118's
      // comments), so the generic exact-brand-match lookup below would
      // always find nothing for a real brand. Read the brand_column_quantities
      // snapshot instead, same as TikTok Channel.
      return packageLineColumnTarget(release, categoryName, brand, platform, subchannelType);
    }
    // Round 96 — reverted Round 88 follow-up 3's fallback to the category's
    // combined ("" brand) line. Per explicit request: that fallback made
    // every specific-brand column show the same shared combined number
    // whenever a real per-brand line didn't exist, which papered over
    // exactly the cases (like the round 89 screenshot) that need to be
    // caught and fixed one at a time via SQL instead of silently smoothed
    // over here. Back to: no real brand-specific target line means no
    // number for this brand's column, full stop — same as before round 88
    // follow-up 3.
    const brandMatching = lines.filter((l) => l.category_id === categoryId && (l.brand || "") === (brand || ""));
    if (brandMatching.length === 0) return null;
    return brandMatching.reduce((sum, l) => sum + (l.quantity || 0), 0);
  }

  // Round 108 follow-up — the subchannel-null fix above means a release
  // whose TikTok Channel brand DOES have a real lump target, but hasn't
  // been split into any per-subchannel number, would silently disappear
  // from the filtered list once drilled into that brand (every column's
  // bookedFor reads null, so the "at least one column has a number" filter
  // below excluded it) — per explicit follow-up request, that's wrong:
  // the row should stay visible (with every subchannel column blank) so
  // the team can SEE it has a target and go decide which subchannel to
  // actually book it under, instead of the release just vanishing from
  // view. This checks the brand-level line directly, bypassing the
  // subchannel-forces-null rule — only used for the "should this row show
  // at all" filter, never for what a column itself displays.
  // Round 118 — Social, Community, and TikTok Channel package lines are
  // ALWAYS stored mushed under brand: "" (see groupSummarizedRows in the
  // Media Booking ticket — its group key for these 3 Hạng Mục is the
  // category id alone, brand is never part of it; Ads is the one
  // exception, keeping one real line per ad-platform brand on purpose).
  // Before this fix, brandHasAnyTarget compared the mushed line's brand
  // ("") against the caller's REAL brand string (e.g. "SOCIAL VIENT",
  // "TIKTOK BOLERO/MT") — which can never match, so this fallback silently
  // found nothing for a release that genuinely HAS a real, tool-built
  // package, and the release vanished entirely ("Không tìm thấy") the
  // instant the board was filtered into any specific brand under these 3
  // categories — exactly the reported bug (package "Gửi H" showing correct
  // 0/30 Social / 0/38 Community targets on the "All" tab, then empty once
  // filtered to a real brand). Check the mushed "" line instead for these
  // 3 categories — Ads is untouched, still checking the real brand as
  // before, since it never mushes.
  const MUSHED_BRAND_CATEGORIES = new Set(["Social", "Community", "TikTok Channel"]);
  function brandHasAnyTarget(release, categoryName, brand) {
    const pkg = packageByRelease[release.id];
    if (!pkg) return false;
    const categoryId = categoryIdByName[categoryName];
    const lines = pkg.media_booking_package_lines || [];
    const effectiveBrand = MUSHED_BRAND_CATEGORIES.has(categoryName) ? "" : brand;
    return lines.some((l) => l.category_id === categoryId && (l.brand || "") === (effectiveBrand || ""));
  }

  function addedFor(release, categoryName, brand, platform, subchannelType, entryPool) {
    const categoryId = categoryIdByName[categoryName];
    const matching = entryPool.filter((e) =>
      e.release_id === release.id &&
      e.category_id === categoryId &&
      (brand === null || (e.channel_name || "") === (brand || "")) &&
      (platform == null || (e.platform || "") === platform) &&
      (subchannelType == null || (e.subchannel_type || "") === subchannelType)
    );
    // Ads — sum the quantity number(s) instead of counting rows (there's
    // normally exactly one row per brand/metric, but this sums cleanly
    // either way, including the "All"/aggregate view where brand is null).
    if (categoryName === "Ads") return matching.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0);
    return matching.length;
  }

  // Round is still an entry-level tag (which "phase" a given link belongs
  // to), so it still filters which entries count for "already added" —
  // AND it now also filters which releases show up as rows (see below).
  const roundEntries = useMemo(() => {
    return entries.filter((e) => e.booking_round === round);
  }, [entries, round]);

  // Row-level round filter: INT = an INT MEDIA package was chosen; Đợt 1 =
  // any real chosen package that isn't INT MEDIA or the Chỉ Phát Hành-only
  // pick; Đợt 2 = releases that actually have Đợt 2 targets set (TikTok
  // Channel's Skip/summarize flow — see media-booking's Đợt 2 popup).
  //
  // isIntType matches loosely (contains "int media", case-insensitive)
  // rather than an exact "INT MEDIA" string — legacy/imported releases can
  // carry a slightly different label for the same thing (seen in practice:
  // "INT Media Support"), and those were slipping into the Đợt 1 view
  // instead of being excluded from it and only showing under INT.
  const roundFilteredReleases = useMemo(() => {
    return releases.filter((r) => {
      const isIntType = !!r.project_type && /int\s*media/i.test(r.project_type);
      if (round === "INT") return isIntType;
      if (round === "Đợt 1") return !!r.project_type && r.project_type !== "Chỉ Phát Hành" && !isIntType;
      if (round === "Đợt 2") return dot2ReleaseIds.has(r.id);
      return true;
    });
  }, [releases, round, dot2ReleaseIds]);

  // Columns: one per Hạng Mục when "All" is picked (aggregate ratio across
  // every brand in that category). Otherwise every Hạng Mục is a multi-
  // layer pick: subFilter (a brand, or — for TikTok Channel — a brand
  // group) determines what the columns actually are:
  //  - TikTok Channel: a 3rd layer — tiktokBrandFilter, the specific brand
  //    within the picked group — narrows further; columns are then that
  //    brand's 5 fixed subchannel types (TIKTOK NEWS/CAPCUT/MẪU CAPCUT/
  //    REUP MV/LYRICS — see TIKTOK_SUBCHANNELS), tagged via the entry's
  //    own `subchannel_type` column (kept separate from `platform`, which
  //    still holds the actual channel/account name picked or typed in the
  //    Add Link popup — see BrandCell). booked (the target) is looked up
  //    by brand only, same aggregate total for every one of that brand's
  //    5 subchannel columns — the underlying target itself isn't split by
  //    subchannel on the ticket side either (media_booking_package_lines
  //    has one quantity per brand, built by summing all its DSP rows).
  //  - Social / Community: columns = the fixed platform list, all scoped
  //    to the one brand picked in subFilter.
  //  - Ads: columns = that ad brand's own fixed metric list (the metric
  //    name doubles as the "platform" value on media_booking_entries).
  // Declared before filteredReleases below since the always-on
  // "has a requested number" filter needs to know the current columns
  // to check against.
  const columns = useMemo(() => {
    if (hangMucFilter === "All") {
      return categories.map((c) => ({ key: c.name, label: c.name, categoryName: c.name, brand: null, platform: null, subchannelType: null }));
    }
    if (hangMucFilter === "TikTok Channel") {
      if (!tiktokBrandFilter) return [];
      return TIKTOK_SUBCHANNELS.map((sub) => ({
        key: `${hangMucFilter}:${tiktokBrandFilter}:${sub}`,
        label: sub,
        categoryName: hangMucFilter,
        brand: tiktokBrandFilter,
        platform: null,
        subchannelType: sub,
      }));
    }
    if (hangMucFilter === "Ads") {
      return (ADS_METRICS[subFilter] || []).map((m) => ({
        key: `${hangMucFilter}:${subFilter}:${m}`,
        label: m,
        categoryName: hangMucFilter,
        brand: subFilter,
        platform: m,
        subchannelType: null,
      }));
    }
    if (hangMucFilter === "Social") {
      return PLATFORM_COLUMNS.map((p) => ({
        key: `${hangMucFilter}:${subFilter}:${p}`,
        label: p,
        categoryName: hangMucFilter,
        brand: subFilter,
        platform: p,
        subchannelType: null,
      }));
    }
    if (hangMucFilter === "Community") {
      // Per explicit request, Community uses the same channel-name + URL
      // combo as TikTok Channel's columns instead of Social's plain-URL
      // style — same shape as TikTok Channel's columns above: platform
      // left null (so BrandCell's hasChannelCol is true and shows a
      // Channel Name field) and subchannelType carries the fixed column
      // identity instead (here, the platform name itself).
      return PLATFORM_COLUMNS.map((p) => ({
        key: `${hangMucFilter}:${subFilter}:${p}`,
        label: p,
        categoryName: hangMucFilter,
        brand: subFilter,
        platform: null,
        subchannelType: p,
      }));
    }
    return [];
  }, [hangMucFilter, categories, subFilter, tiktokBrandFilter]);

  // Round 94 — whether EVERY currently-shown column with a real target is
  // fully booked (added >= booked). Columns with no target at all (booked
  // null or 0) don't count either way — nothing to compare against. A
  // release with no targeted column among those currently shown is never
  // "done" (there's nothing finished to report), which matches how such a
  // release already gets filtered out by the anyFilled check below anyway.
  function isReleaseDone(r) {
    // Round 168 — the "All" filter's own Ads column (categoryName "Ads",
    // brand null — see the columns useMemo's hangMucFilter==="All"
    // branch) is a special case: its target/done-ness comes from
    // adsAllViewStatus's per-metric-column check, not the generic sum-
    // based bookedFor/addedFor comparison every other column uses. See
    // that function's comment for why.
    const targeted = columns.filter((c) => {
      if (c.categoryName === "Ads" && c.brand === null) {
        return adsAllViewStatus(r, bookedFor, roundEntries, categoryIdByName) !== null;
      }
      const booked = bookedFor(r, c.categoryName, c.brand, c.platform, c.subchannelType);
      return booked != null && booked > 0;
    });
    if (targeted.length === 0) return false;
    return targeted.every((c) => {
      if (c.categoryName === "Ads" && c.brand === null) {
        return adsAllViewStatus(r, bookedFor, roundEntries, categoryIdByName) === true;
      }
      const booked = bookedFor(r, c.categoryName, c.brand, c.platform, c.subchannelType);
      const added = addedFor(r, c.categoryName, c.brand, c.platform, c.subchannelType, roundEntries);
      return added >= booked;
    });
  }

  // Split in two: preDoneFilteredReleases is everything the board would
  // show BEFORE the Done/Not Done toggle narrows it further — the counts
  // on those two buttons are computed off this set, so the numbers stay
  // accurate to "what's currently in view" regardless of which done state
  // (if any) is picked.
  const preDoneFilteredReleases = useMemo(() => {
    return roundFilteredReleases.filter((r) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (![r.title, r.main_artist, r.did].some((f) => (f || "").toLowerCase().includes(q))) return false;
      }
      if (month && r.release_date) {
        if (!r.release_date.startsWith(month)) return false;
      }
      if (typeFilter && r.project_type !== typeFilter) return false;
      if (labelFilter && r.label !== labelFilter) return false;
      // Per the team's confirmed default: ALWAYS show only releases that
      // actually have a requested/booked number for at least one of the
      // columns currently shown — no toggle, this is just how the board
      // works now. (Replaces the earlier "Chưa có yêu cầu" / "Đã có yêu
      // cầu" toggle buttons.) This also applies on "All" — its columns are
      // one aggregate-per-category entry (brand: null), so a release with
      // no package/target anywhere (still sitting at BRIEF & DATA) has
      // every one of those come back null and correctly gets filtered out
      // there too, not just once you drill into a specific Hạng Mục/Brand.
      if (columns.length > 0) {
        let anyFilled = columns.some((c) => bookedFor(r, c.categoryName, c.brand, c.platform, c.subchannelType) != null);
        // Round 108 follow-up — TikTok Channel's subchannel columns always
        // read null now (see bookedFor), so also count the brand's own
        // lump target here — keeps a release visible (blank subchannel
        // cells and all) as long as it has SOME real target for the
        // brand, instead of it vanishing the moment you drill in.
        if (!anyFilled && hangMucFilter === "TikTok Channel" && tiktokBrandFilter) {
          anyFilled = brandHasAnyTarget(r, "TikTok Channel", tiktokBrandFilter);
        }
        // Round 108 follow-up 2 — same treatment for Ads, per explicit
        // request to make this consistent: a multi-metric Ads brand's own
        // per-metric columns always read null too (see bookedFor's Ads
        // branch), so a release with only that brand's lump total used to
        // disappear entirely once drilled into its metric columns. Now it
        // stays visible (every metric column blank) so the team can see
        // there's an unassigned number and go decide which metric it's
        // really for — same reasoning, same fix shape as TikTok Channel
        // above. YouTube Ads is unaffected either way — it always had a
        // real per-metric quantity, so its column was never forced null.
        if (!anyFilled && hangMucFilter === "Ads" && subFilter) {
          anyFilled = brandHasAnyTarget(r, "Ads", subFilter);
        }
        // Round 118 — same treatment now for Social and Community: their
        // columns are always exact-brand null too (bookedFor's generic
        // exact-match branch, since these categories' lines only ever
        // exist under brand ""), so without this a release with a real
        // combined target used to disappear entirely once drilled into a
        // specific real brand. See brandHasAnyTarget's Round 118 comment
        // for the root cause (package lines mushed to brand "").
        if (!anyFilled && hangMucFilter === "Social" && subFilter) {
          anyFilled = brandHasAnyTarget(r, "Social", subFilter);
        }
        if (!anyFilled && hangMucFilter === "Community" && subFilter) {
          anyFilled = brandHasAnyTarget(r, "Community", subFilter);
        }
        if (!anyFilled) return false;
      }
      return true;
    });
  }, [roundFilteredReleases, search, month, typeFilter, labelFilter, hangMucFilter, subFilter, tiktokBrandFilter, columns, packageByRelease]);

  const doneCounts = useMemo(() => {
    let done = 0;
    preDoneFilteredReleases.forEach((r) => { if (isReleaseDone(r)) done++; });
    return { done, notDone: preDoneFilteredReleases.length - done };
  }, [preDoneFilteredReleases, columns, roundEntries, packageByRelease]);

  const filteredReleases = useMemo(() => {
    if (!doneFilter) return preDoneFilteredReleases;
    return preDoneFilteredReleases.filter((r) => (doneFilter === "done" ? isReleaseDone(r) : !isReleaseDone(r)));
  }, [preDoneFilteredReleases, doneFilter, columns, roundEntries, packageByRelease]);

  const { pageRows: pagedReleases, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(filteredReleases);

  // Per-round release counts (INT / Đợt 1 / Đợt 2) — replaces the old
  // Done/Đang Booking/Chưa Booking status counters, per explicit request.
  // Mirrors roundFilteredReleases' own membership rules exactly, but
  // computed for all three rounds at once (not just the currently-picked
  // one) so all four stat cards can show simultaneously. INT and Đợt 1 are
  // mutually exclusive (same isIntType branching as roundFilteredReleases);
  // Đợt 2 membership is independent (dot2ReleaseIds), so a release can
  // count toward both Đợt 1 and Đợt 2 at once, same as before.
  const stats = useMemo(() => {
    const total = releases.length;
    let int = 0, dot1 = 0, dot2 = 0;
    releases.forEach((r) => {
      const isIntType = !!r.project_type && /int\s*media/i.test(r.project_type);
      if (isIntType) int++;
      else if (!!r.project_type && r.project_type !== "Chỉ Phát Hành") dot1++;
      if (dot2ReleaseIds.has(r.id)) dot2++;
    });
    return { total, int, dot1, dot2 };
  }, [releases, dot2ReleaseIds]);

  // Every added link counts toward "already added" regardless of status —
  // status (Chưa Booking / Đã Gửi / Done) is tracked per link but doesn't
  // gate the ratio, matching "already added" literally.
  async function addEntry(releaseId, categoryName, brand, platform, link, subchannelType) {
    if (!link.trim()) return;
    // channel_type is only meaningful for TikTok Channel (its In-house vs
    // Partner split) — derived straight from the brand so it always agrees
    // with the group the column actually belongs to, never a leftover
    // global toggle. Every other Hạng Mục just gets null.
    //
    // Round 131 fix (re-applied — this line regressed back to the pre-fix
    // version somewhere around Round 132's edits; caught live again via
    // the exact same error: `null value in column "channel_type" ...
    // violates not-null constraint`) — passing that null straight into
    // the insert as `channel_type: channelTypeTag` overrides the column's
    // own "not null default 'Direct'" for every non-TikTok-Channel
    // category and fails outright. Only include the key when there's a
    // real tag, otherwise omit it entirely so the column's own default
    // applies — same fix Round 93 already used for saveAdsQuantity's
    // insert below.
    const channelTypeTag = categoryName === "TikTok Channel" ? tiktokGroupForBrand(brand) : null;
    const { data, error } = await supabase
      .from("media_booking_entries")
      .insert({
        release_id: releaseId, booking_round: round,
        ...(channelTypeTag ? { channel_type: channelTypeTag } : {}),
        category_id: categoryIdByName[categoryName] || null, channel_name: brand || null,
        platform: platform || null, subchannel_type: subchannelType || null, link, status: "Chưa Booking",
      })
      .select()
      .single();
    if (!error && data) setEntries((prev) => [...prev, data]);
  }

  // Same insert shape as addEntry, but for N rows at once — used by the
  // "Bulk Add" textarea and the CSV import path in BrandCell's popup, so
  // pasting/importing a batch of channels+URLs doesn't mean N round trips.
  // `rows` is [{ channelName, link }]; platformFixed mirrors addEntry's
  // `platform` arg (the column's own fixed metric name for Ads-like
  // columns, or null everywhere else where each row's own channelName is
  // what actually becomes the entry's `platform` field). subchannelType is
  // the column's fixed TikTok Channel subchannel tag (TIKTOK NEWS/etc, or
  // null for every non-TikTok-Channel column) — unlike platform, it's
  // never derived from the row, since the row's channelName is still the
  // real channel/account name and both need to be stored independently.
  async function addEntries(releaseId, categoryName, brand, platformFixed, subchannelType, rows) {
    // Round 131 fix (re-applied — see addEntry's comment above for why).
    const channelTypeTag = categoryName === "TikTok Channel" ? tiktokGroupForBrand(brand) : null;
    const payload = (rows || [])
      .filter((row) => row.link && row.link.trim())
      .map((row) => ({
        release_id: releaseId, booking_round: round,
        ...(channelTypeTag ? { channel_type: channelTypeTag } : {}),
        category_id: categoryIdByName[categoryName] || null, channel_name: brand || null,
        platform: platformFixed || row.channelName || null, subchannel_type: subchannelType || null,
        link: row.link.trim(), status: "Chưa Booking",
      }));
    if (payload.length === 0) return { count: 0 };
    const { data, error } = await supabase.from("media_booking_entries").insert(payload).select();
    if (!error && data) setEntries((prev) => [...prev, ...data]);
    return { count: error ? 0 : payload.length, error };
  }

  async function cycleStatus(entry) {
    const order = ["Chưa Booking", "Đã Gửi", "Done"];
    const next = order[(order.indexOf(entry.status) + 1) % order.length];
    await supabase.from("media_booking_entries").update({ status: next }).eq("id", entry.id);
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: next } : e)));
  }

  // Round 142 — item 2: TikTok Channel columns (every brand group, not
  // just Partner) now show ONE status for the whole column instead of a
  // separate cycle button per URL — per explicit request, editing a
  // single link's status one at a time didn't make sense once a column
  // could hold 20+ of them. Same 3-step vocabulary/order as cycleStatus
  // above, just applied to every entry in the column at once — advances
  // from whatever the FIRST entry's current status is (the column's own
  // "representative" status once this control is the only way to change
  // it going forward). Social/Community columns are unaffected — they
  // keep the original per-row cycleStatus behavior.
  async function cycleStatusAll(entriesInColumn) {
    if (entriesInColumn.length === 0) return;
    const order = ["Chưa Booking", "Đã Gửi", "Done"];
    const next = order[(order.indexOf(entriesInColumn[0].status) + 1) % order.length];
    const ids = entriesInColumn.map((e) => e.id);
    await supabase.from("media_booking_entries").update({ status: next }).in("id", ids);
    setEntries((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, status: next } : e)));
  }

  // Round 132 — per explicit request: once a link was added under any
  // BrandCell column (Social/Community/TikTok Channel — every column that
  // goes through addEntry/addEntries, not just Ads' AdsCell which already
  // supports re-saving via handleSave), there was no way to fix a typo or
  // wrong URL, or the channel name on a hasChannelCol column (TikTok
  // Channel/Community) — only the status could be changed (cycleStatus
  // above), and a wrong entry could never be removed at all. These two
  // close that gap, used by BrandCell's new inline edit/delete UI.
  async function updateEntry(entry, patch) {
    const { error } = await supabase.from("media_booking_entries").update(patch).eq("id", entry.id);
    if (!error) setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, ...patch } : e)));
    return { error };
  }

  async function deleteEntry(entry) {
    const { error } = await supabase.from("media_booking_entries").delete().eq("id", entry.id);
    if (!error) setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    return { error };
  }

  // Ads quantity + status — upserts by finding the one existing row for
  // this exact (release, round, Ads category, brand, metric) combo first
  // (there's no DB-level unique constraint, this is app-level), rather
  // than always inserting a new row like addEntry/addEntries do for links.
  async function saveAdsQuantity(releaseId, brand, platform, quantity, status, existingEntry) {
    if (existingEntry) {
      const { error } = await supabase.from("media_booking_entries").update({ quantity, status }).eq("id", existingEntry.id);
      if (!error) setEntries((prev) => prev.map((e) => (e.id === existingEntry.id ? { ...e, quantity, status } : e)));
      return { error };
    }
    // Round 93 fix — this insert used to pass channel_type: null explicitly,
    // which overrides the column's "not null default 'Direct'" and made
    // EVERY first-time Ads save fail outright with a not-null violation
    // (confirmed against a local Postgres 16 instance). Ads rows don't
    // really have a Direct/Partner distinction, so just let the column's
    // own default apply by omitting the key entirely, instead of forcing
    // it to null.
    const { data, error } = await supabase
      .from("media_booking_entries")
      .insert({
        release_id: releaseId, booking_round: round,
        category_id: categoryIdByName["Ads"] || null, channel_name: brand || null,
        platform: platform || null, subchannel_type: null, link: null, quantity, status,
      })
      .select()
      .single();
    if (!error && data) setEntries((prev) => [...prev, data]);
    return { error };
  }

  function exportCsv() {
    const rows = [["DID", "Title", "Artist", ...columns.flatMap((c) => [`${c.label} Added`, `${c.label} Booked`])]];
    filteredReleases.forEach((r) => {
      const row = [r.did || "", r.title, r.main_artist];
      columns.forEach((c) => {
        row.push(addedFor(r, c.categoryName, c.brand, c.platform, c.subchannelType, roundEntries));
        row.push(bookedFor(r, c.categoryName, c.brand, c.platform, c.subchannelType) ?? "—");
      });
      rows.push(row);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "booking-board.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 1400 }}>
        <TypeSwitcher kind="workstation" current="booking" />
        <div className={styles.topRow}>
          <div>
            <div className={styles.eyebrow}>// Booking Tracker</div>
            <h1 className={styles.title} style={{ marginBottom: 0 }}>Booking Board</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Round 91 — Marketing's own external tool for actually
                CREATING a link (Linkfire), opened right next to Export CSV
                so it's in the same place they're already looking, instead
                of hunting down the URL themselves each time. Plain new-tab
                link, not an embed/iframe — Linkfire itself isn't part of
                this app, this is just a fast door to it. URL is now
                admin-editable (Config → External Tool Links) rather than
                hardcoded — see linkfireUrl/load() above. */}
            <a
              href={linkfireUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.btnSecondary}
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              🔗 Linkfire
            </a>
            <button className={styles.btnSecondary} onClick={exportCsv}>⇩ Export CSV</button>
          </div>
        </div>

        {/* Round 108 — the "Showing X–Y of Z" count used to only live at
            the bottom of the table (inside Pagination), which meant
            scrolling all the way down just to see how many rows are in the
            current filtered view — per explicit request, moved up here,
            top-right, right under the topbar. Pagination itself still
            renders at the bottom for the actual prev/next controls, with
            hideCount so the count isn't shown twice. */}
        {totalRows > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, marginTop: -8 }}>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalRows)} of {totalRows}
            </div>
          </div>
        )}

        {/* Scoped to this page only (inline override, not a shared.module.css
            change) — bumped from the default 22px so the 4 headline numbers
            read at a glance, without affecting stat cards on other pages
            that reuse the same .statValue class. */}
        <div className={styles.statRow} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Tổng Releases</div>
            <div className={styles.statValue} style={{ fontSize: 34 }}>{stats.total}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>INT</div>
            <div className={styles.statValue} style={{ fontSize: 34, color: "#7ee6a8" }}>{stats.int}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Đợt 1</div>
            <div className={styles.statValue} style={{ fontSize: 34, color: "#ffca4d" }}>{stats.dot1}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Đợt 2</div>
            <div className={styles.statValue} style={{ fontSize: 34, color: "var(--text-faint)" }}>{stats.dot2}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <input
            className={styles.input}
            style={{ width: 240 }}
            placeholder="Tìm tên bài, nghệ sĩ, DID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            type="month"
            className={styles.input}
            style={{ width: 160 }}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden" }}>
            {ROUNDS.map((r) => (
              <button
                key={r}
                onClick={() => setRound(r)}
                style={{
                  padding: "9px 16px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                  background: round === r ? "#ff6b1a" : "transparent", color: round === r ? "#0a0a0a" : "var(--text-muted)",
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden", flexWrap: "wrap" }}>
            <button
              onClick={() => setHangMucFilter("All")}
              style={{ padding: "9px 14px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: hangMucFilter === "All" ? "#ff6b1a" : "transparent", color: hangMucFilter === "All" ? "#0a0a0a" : "var(--text-muted)" }}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setHangMucFilter(c.name)}
                style={{ padding: "9px 14px", fontSize: 12, fontWeight: 700, border: "none", borderLeft: "1px solid #333", cursor: "pointer", background: hangMucFilter === c.name ? "#ff6b1a" : "transparent", color: hangMucFilter === c.name ? "#0a0a0a" : "var(--text-muted)" }}
              >
                {c.name}
              </button>
            ))}
          </div>
          {CATEGORY_SUBFILTERS[hangMucFilter] && (
            <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden", flexWrap: "wrap" }}>
              {CATEGORY_SUBFILTERS[hangMucFilter].map((v) => (
                <button
                  key={v}
                  onClick={() => setSubFilter(v)}
                  style={{ padding: "9px 16px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: subFilter === v ? "#ff6b1a" : "transparent", color: subFilter === v ? "#0a0a0a" : "var(--text-muted)" }}
                >
                  {subfilterLabel(hangMucFilter, v)}
                </button>
              ))}
            </div>
          )}
          {/* Layer 2 for TikTok Channel only — picks the specific brand
              within the group just picked above. Columns (layer 3) only
              appear once this is set — see the columns useMemo. */}
          {hangMucFilter === "TikTok Channel" && subFilter && (
            <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden", flexWrap: "wrap" }}>
              {(TIKTOK_CHANNEL_GROUPS[subFilter] || []).map((b) => (
                <button
                  key={b}
                  onClick={() => setTiktokBrandFilter(b)}
                  style={{ padding: "9px 16px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: tiktokBrandFilter === b ? "#ff6b1a" : "transparent", color: tiktokBrandFilter === b ? "#0a0a0a" : "var(--text-muted)" }}
                >
                  {b}
                </button>
              ))}
            </div>
          )}
          <select className={styles.select} style={{ maxWidth: 170 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Type — all</option>
            {[...new Set(releases.map((r) => r.project_type).filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={styles.select} style={{ maxWidth: 170 }} value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)}>
            <option value="">Label — all</option>
            {[...new Set(releases.map((r) => r.label).filter(Boolean))].map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {/* Round 94 — Done/Not Done counter+filter. Done = every column
              currently shown (respects the Hạng Mục/brand drill-down above)
              that has a real target is fully booked; Not Done = at least
              one shown column is still short. Click again to clear back to
              showing both. Counts always reflect the current drill-down/
              search/month/type/label filters, just not each other. */}
          <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden" }}>
            <button
              onClick={() => setDoneFilter(doneFilter === "done" ? null : "done")}
              title="Every shown column with a target is fully booked"
              style={{
                padding: "9px 14px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                background: doneFilter === "done" ? "#2e7d32" : "transparent",
                color: doneFilter === "done" ? "#eafaea" : "#7ee6a8",
              }}
            >
              ✓ Done ({doneCounts.done})
            </button>
            <button
              onClick={() => setDoneFilter(doneFilter === "not_done" ? null : "not_done")}
              title="At least one shown column is still under its target"
              style={{
                padding: "9px 14px", fontSize: 12, fontWeight: 700, border: "none", borderLeft: "1px solid #333", cursor: "pointer",
                background: doneFilter === "not_done" ? "#c0392b" : "transparent",
                color: doneFilter === "not_done" ? "#fde8e8" : "#e57373",
              }}
            >
              Not Done ({doneCounts.notDone})
            </button>
          </div>
          {(search || month || typeFilter || labelFilter || doneFilter) && (
            <button
              className={styles.btnSmall}
              style={{ borderColor: "#c0392b", color: "#e57373" }}
              onClick={() => { setSearch(""); setMonth(""); setTypeFilter(""); setLabelFilter(""); setDoneFilter(null); }}
            >
              ✕ Clear
            </button>
          )}
        </div>

        {hangMucFilter === "TikTok Channel" && subFilter === "Partner" && (
          <div className={styles.errorBox} style={{ background: "var(--bg-hover)", borderColor: "#5a4a1a", color: "#ffca4d", marginBottom: 16 }}>
            ⚠ Partner booking should wait for releases whose Phụ Lục isn't signed yet — check the badge next to each release below. Not a hard block yet, just a heads up.
          </div>
        )}

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : filteredReleases.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#1c1c1c", letterSpacing: 4 }}>EMPTY</div>
            <div style={{ color: "var(--text-dim)", marginTop: -12 }}>Không tìm thấy</div>
          </div>
        ) : isMobile ? (
          <>
          <BookingBoardCards
            releases={pagedReleases}
            categories={categories}
            columns={columns}
            bookedFor={bookedFor}
            addedFor={addedFor}
            roundEntries={roundEntries}
            categoryIdByName={categoryIdByName}
            hangMucFilter={hangMucFilter}
            subFilter={subFilter}
            round={round}
            phuLucStatus={phuLucStatus}
            setPackagePreview={setPackagePreview}
            updateReleaseNote={updateReleaseNote}
            convertMediaReport={convertMediaReport}
            sendArtistMediaReport={sendArtistMediaReport}
            expandedCell={expandedCell}
            setExpandedCell={setExpandedCell}
            addEntry={addEntry}
            addEntries={addEntries}
            cycleStatus={cycleStatus}
            bookingChannels={bookingChannels}
            saveAdsQuantity={saveAdsQuantity}
            updateYoutubeAdsField={updateYoutubeAdsField}
          />
          <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} hideCount />
          </>
        ) : (
          <>
          <div className={styles.scrollBox} style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh" }}>
          {/* The sticky-header box-shadow (and the border-collapse:separate
              it depends on to render safely) now lives in shared.module.css's
              .table class itself, so every workstation gets it — this page
              no longer needs its own copy. See the comment on .table in
              shared.module.css for why collapse had to change first. */}
          <table className={styles.table} style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 21, background: "var(--bg)", borderRight: "2px solid var(--accent)", width: 288, minWidth: 288, maxWidth: 288 }}>Release</th>
                <th style={{ borderRight: "2px solid var(--accent)", width: 154, minWidth: 154, maxWidth: 154 }}>Package</th>
                <th style={{ borderRight: "2px solid var(--accent)" }}>Result</th>
                {/* Fixed column, next to Result — kept out of the dynamic
                    per-Hạng-Mục column set below so it stays in the same
                    place regardless of which filter is active. */}
                <th style={{ borderRight: "2px solid var(--accent)", width: 140, minWidth: 140 }}>Note</th>
                {/* Round 54 — item B.1: fixed column, same reasoning as
                    Note above — stays put regardless of which Hạng Mục
                    filter/subfilter is active ("in all filter page"). */}
                <th style={{ borderRight: "2px solid var(--accent)", width: 150, minWidth: 150 }}>Media Report</th>
                {columns.map((c, i) => {
                  const prev = columns[i - 1];
                  const isGroupStart = prev && prev.categoryName !== c.categoryName;
                  return (
                    <th
                      key={c.key}
                      style={{
                        textAlign: "center",
                        borderLeft: isGroupStart ? "2px solid #555" : "1px solid var(--border)",
                      }}
                    >
                      {c.label}
                      <div style={{ fontWeight: 400, color: "var(--text-faint)", fontSize: 10 }}>{round}{subFilter ? ` · ${subfilterLabel(hangMucFilter, subFilter)}` : ""}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pagedReleases.map((r) => {
                const releasingToday = isReleasingToday(r);
                return (
                <tr key={r.id} style={releasingToday ? { background: "var(--highlight-row-tint)" } : undefined}>
                  <td style={{ position: "sticky", left: 0, zIndex: 1, background: releasingToday ? "var(--highlight-bg)" : "var(--bg)", borderRight: "2px solid var(--accent)", width: 288, minWidth: 288, maxWidth: 288, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {/* Round 77 — now the shared highlight tokens
                        (globals.css) instead of hardcoded hex — same
                        values as before, just centralized so Upload's
                        identical box could be fixed the same way instead
                        of carrying its own separate (and, until this
                        round, broken-on-light-theme) copy. .rowLink is
                        `color: inherit`, which on a light theme is dark —
                        forcing var(--highlight-text) here instead of
                        relying on inherit is what keeps this readable. */}
                    <Link href={`/releases/${r.id}`} className={styles.rowLink} style={releasingToday ? { color: "var(--highlight-text)" } : undefined}>{r.title}</Link>
                    <div style={{ fontSize: 11, color: releasingToday ? "var(--highlight-text-faint)" : "var(--text-faint)" }}>
                      {r.main_artist} · {r.did} · {fmtDate(r.release_date)}
                      {releasingToday && <span style={{ color: "#ff6b1a", fontWeight: 700, marginLeft: 6 }}>· TODAY</span>}
                    </div>
                    {/* Round 146 — Link Sound TikTok (link_ugc) as a
                        clickable 3rd row, same pattern as Pitching
                        ticket's link_lbm row. */}
                    <LinkUgcLines value={r.link_ugc} color={releasingToday ? "var(--highlight-text-faint)" : "var(--accent-soft)"} />
                    {/* Round 149 — Promotion Package URL as a clickable
                        4th row (3rd added row, after link_ugc) — display
                        text truncated to ~22 chars so a long URL can't
                        widen the column or wrap the row onto extra lines;
                        the link itself still points at the full URL. */}
                    {r.promotion_package_url && (
                      <div title={r.promotion_package_url}>
                        <a href={r.promotion_package_url} target="_blank" rel="noopener noreferrer" style={{ color: releasingToday ? "var(--highlight-text-faint)" : "var(--accent-soft)", fontSize: 11 }}>
                          {truncateUrlDisplay(r.promotion_package_url)}
                        </a>
                      </div>
                    )}
                    {hangMucFilter === "TikTok Channel" && subFilter === "Partner" && (
                      <span
                        className={styles.statusBadge}
                        style={{
                          marginTop: 4, display: "inline-block",
                          background: phuLucStatus(r) === "Đã Ký" ? "rgba(76,175,80,0.15)" : "rgba(244,67,54,0.15)",
                          color: phuLucStatus(r) === "Đã Ký" ? "#7ee6a8" : "#ff8a80",
                        }}
                      >
                        Phụ Lục: {phuLucStatus(r)}
                      </span>
                    )}
                  </td>
                  <td style={{ verticalAlign: "top", borderRight: "2px solid var(--accent)", width: 154, minWidth: 154, maxWidth: 154, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.project_type ? (
                      <button onClick={() => setPackagePreview(r)} style={{ background: "none", border: "none", color: "var(--accent-soft)", cursor: "pointer", fontSize: 12, textAlign: "left", padding: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", display: "block" }}>
                        {r.project_type}
                      </button>
                    ) : (
                      <span style={{ color: "var(--text-faint)", fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td style={{ verticalAlign: "top", borderRight: "2px solid var(--accent)" }}>
                    <ResultCell release={r} categories={categories} bookedFor={bookedFor} entries={roundEntries} categoryIdByName={categoryIdByName} />
                  </td>
                  <td style={{ verticalAlign: "top", borderRight: "2px solid var(--accent)", width: 140, minWidth: 140, textAlign: "center" }}>
                    <NoteCell release={r} onSave={updateReleaseNote} />
                  </td>
                  <td style={{ verticalAlign: "top", borderRight: "2px solid var(--accent)", width: 150, minWidth: 150 }}>
                    <MediaReportCell release={r} onConvert={convertMediaReport} onSendArtist={sendArtistMediaReport} />
                  </td>
                  {columns.map((c, i) => {
                    const prev = columns[i - 1];
                    const isGroupStart = prev && prev.categoryName !== c.categoryName;
                    const cellEntries = roundEntries.filter((e) =>
                      e.release_id === r.id &&
                      e.category_id === categoryIdByName[c.categoryName] &&
                      (c.brand === null || (e.channel_name || "") === (c.brand || "")) &&
                      (c.platform == null || (e.platform || "") === c.platform) &&
                      (c.subchannelType == null || (e.subchannel_type || "") === c.subchannelType)
                    );
                    if (c.categoryName === "Ads") {
                      // Round 77 — item 3: YouTube Ads is locked (no
                      // interaction, forced "Cancel" display) on any
                      // release that hasn't ticked Có Trong Net YouTube on
                      // its detail page — that gate is what actually
                      // authorizes running YouTube ads for a release at
                      // all. Locked = no entry ever gets created for it,
                      // so it naturally sums to 0 in the "All" aggregate
                      // alongside its Ads siblings, instead of needing any
                      // special-case math there.
                      const ctnLocked = c.brand === "YouTube Ads" && r.gate_co_trong_net_youtube !== "true";
                      return (
                        <AdsCell
                          key={c.key}
                          column={c}
                          booked={bookedFor(r, c.categoryName, c.brand, c.platform, c.subchannelType)}
                          added={addedFor(r, c.categoryName, c.brand, c.platform, c.subchannelType, roundEntries)}
                          existingEntry={cellEntries[0] || null}
                          canEdit={hangMucFilter !== "All"}
                          locked={ctnLocked}
                          showYoutubeAdsFields={c.brand === "YouTube Ads"}
                          youtubeAdsUrl={r.youtube_ads_url}
                          youtubeBookingNote={r.youtube_ads_booking_note}
                          onSaveYoutubeAdsUrl={(v) => updateYoutubeAdsField(r, "youtube_ads_url", v)}
                          onSaveYoutubeBookingNote={(v) => updateYoutubeAdsField(r, "youtube_ads_booking_note", v)}
                          cellBorderLeft={isGroupStart ? "2px solid #555" : "1px solid var(--border)"}
                          onSave={(quantity, status) => saveAdsQuantity(r.id, c.brand, c.platform, quantity, status, cellEntries[0] || null)}
                        />
                      );
                    }
                    // Round 125 — item 1: TikTok Channel Partner-group
                    // columns (all 4 sub-brands, all 5 subchannel columns)
                    // additionally show/edit a run status, same 4-way
                    // vocabulary/coloring as the YouTube Ads column — on
                    // top of, not instead of, the existing Add Link popup
                    // (explicit "Keep links, just add status coloring").
                    const isPartnerTikTok = c.categoryName === "TikTok Channel" && TIKTOK_CHANNEL_GROUPS.Partner.includes(c.brand);
                    const channelStatusKey = `${r.id}:${categoryIdByName[c.categoryName]}:${c.brand}:${c.subchannelType}`;
                    return (
                      <BrandCell
                        key={c.key}
                        release={r}
                        column={c}
                        booked={bookedFor(r, c.categoryName, c.brand, c.platform, c.subchannelType)}
                        cellEntries={cellEntries}
                        expanded={expandedCell === `${r.id}:${c.key}`}
                        onToggle={() => setExpandedCell(expandedCell === `${r.id}:${c.key}` ? null : `${r.id}:${c.key}`)}
                        onAdd={(platform, link) => addEntry(r.id, c.categoryName, c.brand, c.platform || platform, link, c.subchannelType)}
                        onAddBulk={(rows) => addEntries(r.id, c.categoryName, c.brand, c.platform, c.subchannelType, rows)}
                        onCycleStatus={cycleStatus}
                        onCycleStatusAll={cycleStatusAll}
                        onUpdateEntry={updateEntry}
                        onDeleteEntry={deleteEntry}
                        canAdd={hangMucFilter !== "All"}
                        cellBorderLeft={isGroupStart ? "2px solid #555" : "1px solid var(--border)"}
                        referenceChannels={bookingChannels}
                        showStatus={isPartnerTikTok}
                        channelStatus={channelStatuses[channelStatusKey]}
                        onSaveStatus={(status) => saveChannelStatus(r.id, categoryIdByName[c.categoryName], c.brand, c.subchannelType, status)}
                      />
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} hideCount />
          </>
        )}
      </div>
    </div>

    {packagePreview && (
      <PackagePreviewPopup release={packagePreview} categories={categories} onClose={() => setPackagePreview(null)} />
    )}
    </AppShell>
  );
}

// Round 87 — mobile card view for Booking Board (see the isMobile comment
// above BookingBoard's own state). One card per release instead of one
// table row; the fixed columns (Package/Result/Note/Media Report) become
// labeled blocks, and the dynamic per-DSP columns are grouped by their
// Hạng Mục (categoryName) the same way the table groups them with a
// thicker border — here that's a small section header instead. Every
// interactive cell (ResultCell/MediaReportCell/BrandCell/AdsCell) is the
// EXACT SAME component the table uses, same props — this only changes
// what wraps them, not how they behave or save.
function BookingBoardCards({
  releases, categories, columns, bookedFor, addedFor, roundEntries, categoryIdByName,
  hangMucFilter, subFilter, round, phuLucStatus, setPackagePreview, updateReleaseNote,
  convertMediaReport, sendArtistMediaReport, expandedCell, setExpandedCell, addEntry, addEntries,
  cycleStatus, bookingChannels, saveAdsQuantity, updateYoutubeAdsField,
}) {
  // Same grouping the table's header uses (columns are already sorted by
  // category upstream in the `columns` useMemo) — just collected into
  // named sections instead of a border-left marker between <th>s.
  const groups = [];
  columns.forEach((c) => {
    const last = groups[groups.length - 1];
    if (last && last.categoryName === c.categoryName) last.cols.push(c);
    else groups.push({ categoryName: c.categoryName, cols: [c] });
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {releases.map((r) => {
        const releasingToday = isReleasingToday(r);
        return (
          <div
            key={r.id}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 14,
              background: releasingToday ? "var(--highlight-bg)" : "var(--bg-card)",
            }}
          >
            <Link href={`/releases/${r.id}`} className={styles.rowLink} style={{ fontSize: 14, fontWeight: 700, ...(releasingToday ? { color: "var(--highlight-text)" } : {}) }}>
              {r.title}
            </Link>
            <div style={{ fontSize: 11, color: releasingToday ? "var(--highlight-text-faint)" : "var(--text-faint)", marginTop: 2 }}>
              {r.main_artist} · {r.did} · {fmtDate(r.release_date)}
              {releasingToday && <span style={{ color: "#ff6b1a", fontWeight: 700, marginLeft: 6 }}>· TODAY</span>}
            </div>
            {/* Round 146 — Link Sound TikTok (link_ugc) as a clickable
                3rd row, same pattern as the table view above. */}
            <div style={{ marginTop: 2 }}>
              <LinkUgcLines value={r.link_ugc} color={releasingToday ? "var(--highlight-text-faint)" : "var(--accent-soft)"} />
            </div>
            {/* Round 149 — Promotion Package URL as a clickable row, same
                pattern as the table view above (truncated display text,
                full URL still linked). */}
            {r.promotion_package_url && (
              <div style={{ marginTop: 2 }} title={r.promotion_package_url}>
                <a href={r.promotion_package_url} target="_blank" rel="noopener noreferrer" style={{ color: releasingToday ? "var(--highlight-text-faint)" : "var(--accent-soft)", fontSize: 11 }}>
                  {truncateUrlDisplay(r.promotion_package_url)}
                </a>
              </div>
            )}
            {hangMucFilter === "TikTok Channel" && subFilter === "Partner" && (
              <span
                className={styles.statusBadge}
                style={{
                  marginTop: 6, display: "inline-block",
                  background: phuLucStatus(r) === "Đã Ký" ? "rgba(76,175,80,0.15)" : "rgba(244,67,54,0.15)",
                  color: phuLucStatus(r) === "Đã Ký" ? "#7ee6a8" : "#ff8a80",
                }}
              >
                Phụ Lục: {phuLucStatus(r)}
              </span>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 4 }}>Package</div>
                {r.project_type ? (
                  <button onClick={() => setPackagePreview(r)} style={{ background: "none", border: "none", color: "var(--accent-soft)", cursor: "pointer", fontSize: 12, textAlign: "left", padding: 0 }}>
                    {r.project_type}
                  </button>
                ) : (
                  <span style={{ color: "var(--text-faint)", fontSize: 12 }}>—</span>
                )}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 4 }}>Media Report</div>
                <MediaReportCell release={r} onConvert={convertMediaReport} onSendArtist={sendArtistMediaReport} />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 4 }}>Result</div>
              <ResultCell release={r} categories={categories} bookedFor={bookedFor} entries={roundEntries} categoryIdByName={categoryIdByName} />
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 4 }}>Note</div>
              <NoteCell release={r} onSave={updateReleaseNote} />
            </div>

            {groups.map((group) => (
              <div key={group.categoryName} style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>
                  {group.categoryName}
                  <span style={{ fontWeight: 400, color: "var(--text-faint)", fontSize: 10, textTransform: "none", marginLeft: 6 }}>
                    {round}{subFilter ? ` · ${subfilterLabel(hangMucFilter, subFilter)}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {group.cols.map((c) => {
                    const cellEntries = roundEntries.filter((e) =>
                      e.release_id === r.id &&
                      e.category_id === categoryIdByName[c.categoryName] &&
                      (c.brand === null || (e.channel_name || "") === (c.brand || "")) &&
                      (c.platform == null || (e.platform || "") === c.platform) &&
                      (c.subchannelType == null || (e.subchannel_type || "") === c.subchannelType)
                    );
                    return (
                      <div key={c.key}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{c.label}</div>
                        {c.categoryName === "Ads" ? (() => {
                          const ctnLocked = c.brand === "YouTube Ads" && r.gate_co_trong_net_youtube !== "true";
                          return (
                            <AdsCell
                              column={c}
                              booked={bookedFor(r, c.categoryName, c.brand, c.platform, c.subchannelType)}
                              added={addedFor(r, c.categoryName, c.brand, c.platform, c.subchannelType, roundEntries)}
                              existingEntry={cellEntries[0] || null}
                              canEdit={hangMucFilter !== "All"}
                              locked={ctnLocked}
                              showYoutubeAdsFields={c.brand === "YouTube Ads"}
                              youtubeAdsUrl={r.youtube_ads_url}
                              youtubeBookingNote={r.youtube_ads_booking_note}
                              onSaveYoutubeAdsUrl={(v) => updateYoutubeAdsField(r, "youtube_ads_url", v)}
                              onSaveYoutubeBookingNote={(v) => updateYoutubeAdsField(r, "youtube_ads_booking_note", v)}
                              cellBorderLeft="none"
                              onSave={(quantity, status) => saveAdsQuantity(r.id, c.brand, c.platform, quantity, status, cellEntries[0] || null)}
                            />
                          );
                        })() : (() => {
                          // Round 125 — item 1: same Partner-group status
                          // coloring as the desktop table version above.
                          const isPartnerTikTok = c.categoryName === "TikTok Channel" && TIKTOK_CHANNEL_GROUPS.Partner.includes(c.brand);
                          const channelStatusKey = `${r.id}:${categoryIdByName[c.categoryName]}:${c.brand}:${c.subchannelType}`;
                          return (
                            <BrandCell
                              release={r}
                              column={c}
                              booked={bookedFor(r, c.categoryName, c.brand, c.platform, c.subchannelType)}
                              cellEntries={cellEntries}
                              expanded={expandedCell === `${r.id}:${c.key}`}
                              onToggle={() => setExpandedCell(expandedCell === `${r.id}:${c.key}` ? null : `${r.id}:${c.key}`)}
                              onAdd={(platform, link) => addEntry(r.id, c.categoryName, c.brand, c.platform || platform, link, c.subchannelType)}
                              onAddBulk={(rows) => addEntries(r.id, c.categoryName, c.brand, c.platform, c.subchannelType, rows)}
                              onCycleStatus={cycleStatus}
                              onCycleStatusAll={cycleStatusAll}
                              onUpdateEntry={updateEntry}
                              onDeleteEntry={deleteEntry}
                              canAdd={hangMucFilter !== "All"}
                              cellBorderLeft="none"
                              referenceChannels={bookingChannels}
                              showStatus={isPartnerTikTok}
                              channelStatus={channelStatuses[channelStatusKey]}
                              onSaveStatus={(status) => saveChannelStatus(r.id, categoryIdByName[c.categoryName], c.brand, c.subchannelType, status)}
                            />
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Green if fully booked (added >= booked and booked > 0), orange if a
// target exists but isn't met yet (including added === 0), grey if
// nothing was ever booked for that Hạng Mục. Always all 4 Hạng Mục,
// unaffected by the Hạng Mục column filter — this is the "at a glance,
// which Hạng Mục on this release still need work" column.
// Laid out 2-per-row instead of 1-per-row (4 stacked lines) — a 4-line
// Result cell made every row in this table roughly twice as tall as an
// ordinary row, which is what caused rows to visibly "peek out" partially
// underneath the sticky header mid-scroll (the header can only fully cover
// a row that's scrolled entirely past it — a much taller row spends more
// scroll distance half-covered/half-showing). Halving the cell's height
// doesn't eliminate that effect (inherent to any sticky header + row
// taller than one line) but cuts it roughly in half.
// Round 122 — shared click-to-open popup, rendered via a portal into
// document.body instead of `position: absolute` inside the cell's own
// `<td>`. Every one of these popups used to be clipped whenever the
// table's scroll container (`.scrollBox`, `overflowY: "auto"`) was
// shorter than the popup's own content — which happens any time a filter
// narrows the board down to just a few rows, since that container only
// sizes itself to what's actually in it, not a fixed viewport height.
// `overflow: auto` on an ancestor clips ANY absolutely-positioned
// descendant that would extend past its bounds, so the popup got cut off
// mid-content instead of just scrolling into view — reported as "very
// difficult to see if the height is low, like only one row." A portal
// escapes that clipping entirely: it renders outside the scroll
// container's DOM subtree, positioned with `position: fixed` computed
// from the trigger element's own on-screen position, so it always has the
// full viewport to render into regardless of how short the table is.
// Repositions on scroll (capture: true, so it catches the internal
// scrollBox's scroll too — scroll events don't bubble to window by
// default) and resize; hidden (not yet positioned) for one frame on open
// to avoid a flash at (0,0) before the real position is measured.
function CellPopup({ anchorRef, open, onClose, placement = "right", width, children }) {
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) { setPos(null); return; }
    function compute() {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const margin = 12;
      // Round 142 — item 3: this used to always anchor `top` at the
      // trigger cell's own top, with no regard for how much room was left
      // below it. A popup with ~20 entries (real reported case) is taller
      // than that remaining space once the anchor is more than a
      // screenful down the page, and being `position: fixed` it just ran
      // off the bottom of the viewport with no way to scroll it into
      // view — reported as having to zoom out 25% just to see the Done/
      // Add Link button. Cap how tall the popup is allowed to be to
      // whatever actually fits on screen, and slide `top` upward (same
      // idea a dropdown menu uses) so the WHOLE popup — not just its top
      // edge — stays on screen; overflowY:auto below still scrolls
      // anything past that cap.
      const desiredMaxHeight = Math.min(window.innerHeight * 0.8, 560);
      if (placement === "below-center") {
        const top = Math.min(rect.bottom + 6, window.innerHeight - margin - 100);
        setPos({ top, left: rect.left + rect.width / 2, maxHeight: Math.max(160, window.innerHeight - top - margin) });
      } else {
        const top = Math.max(margin, Math.min(rect.top, window.innerHeight - desiredMaxHeight - margin));
        setPos({ top, left: rect.right + 6, maxHeight: Math.min(desiredMaxHeight, window.innerHeight - top - margin) });
      }
    }
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open, anchorRef, placement]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 299 }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          transform: placement === "below-center" ? "translateX(-50%)" : "none",
          visibility: pos ? "visible" : "hidden",
          zIndex: 300, width,
          background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          maxHeight: pos?.maxHeight ?? "80vh", overflowY: "auto", boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

// Round 88 follow-up 4 — Note column, was a plain always-visible text
// input in every row (the busiest table in the app, so that meant a full
// input box's worth of width in every single row whether or not anyone had
// typed anything). Now a small icon button instead: dimmed gray when
// empty, accent-colored once a note exists — same on/off-color convention
// as the © Copyright icon added to New Release Setup. Hovering shows the
// current note read-only in a small floating panel (no click needed just
// to check what's there); clicking opens a real edit popup with a
// textarea + explicit Save/Cancel, replacing the old save-on-blur input.
function NoteCell({ release, onSave }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [text, setText] = useState(release.booking_note || "");
  const [saving, setSaving] = useState(false);
  const hasNote = !!(release.booking_note || "").trim();
  const anchorRef = useRef(null);

  useEffect(() => {
    setText(release.booking_note || "");
  }, [release.booking_note]);

  async function handleSave() {
    setSaving(true);
    await onSave(release, text);
    setSaving(false);
    setOpen(false);
  }

  function cancelEdit() {
    setText(release.booking_note || "");
    setOpen(false);
  }

  return (
    <div ref={anchorRef} style={{ position: "relative", display: "inline-block" }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={hasNote ? "Click to edit" : "Click to add a note"}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 0, color: hasNote ? "var(--accent-soft)" : "var(--text-faint)" }}
      >
        📝
      </button>

      {/* View-only hover preview — only when there's something to show and
          the edit popup isn't already open (no point showing both). */}
      {hover && !open && hasNote && (
        <div
          style={{
            position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: 6, zIndex: 250, width: 200,
            background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: 8,
            fontSize: 11, color: "var(--text-muted)", whiteSpace: "pre-line", lineHeight: 1.4, boxShadow: "0 4px 14px rgba(0,0,0,0.3)", pointerEvents: "none",
          }}
        >
          {release.booking_note}
        </div>
      )}

      <CellPopup anchorRef={anchorRef} open={open} onClose={cancelEdit} placement="below-center" width={240}>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 8 }}>Note</div>
          <textarea
            className={styles.input}
            style={{ width: "100%", minHeight: 70, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className={styles.btnPrimary} style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
              {saving ? "Đang lưu…" : "Save"}
            </button>
            <button className={styles.btnSmall} onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      </CellPopup>
    </div>
  );
}

// Round 54 — item B.1: 3-state fixed cell.
//   no magic link yet        → nothing to convert, shows a dash
//   link exists, not yet     → "Convert Media Report" button (special
//     converted                accent styling per explicit request)
//   media_report_status      → "Send Artist" button
//     === "ready"
//   media_report_status      → locked "Artist Sent" label, no more clicks
//     === "sent"
function MediaReportCell({ release, onConvert, onSendArtist }) {
  if (!release.link_media_report) {
    return <span style={{ color: "var(--text-faint)", fontSize: 12 }}>—</span>;
  }
  if (release.media_report_status === "sent") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#7ee6a8", fontWeight: 700 }}>
        ✓ Artist Sent
      </span>
    );
  }
  if (release.media_report_status === "ready") {
    return (
      <button
        className={styles.btnSmall}
        onClick={() => { if (window.confirm("Send this Media Report to the artist? This can only be done once, and marks the product as complete.")) onSendArtist(release); }}
        style={{ border: "1px solid #ffca4d", color: "#ffca4d" }}
      >
        Send Artist
      </button>
    );
  }
  return (
    <button
      onClick={() => onConvert(release)}
      style={{
        border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3,
        cursor: "pointer", color: "#0a0a0a", background: "linear-gradient(135deg, #ff9d5c, #ff6b1a)",
      }}
    >
      Convert Media Report
    </button>
  );
}

function ResultCell({ release, categories, bookedFor, entries, categoryIdByName }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 10, rowGap: 3 }}>
      {categories.map((c) => {
        let color = "#444"; // grey — not booked at all
        if (c.name === "Ads") {
          // Round 168 — per-metric-column completeness (adsAllViewStatus)
          // instead of one blind summed ratio across every Ads metric —
          // see that function's comment.
          const status = adsAllViewStatus(release, bookedFor, entries, categoryIdByName);
          if (status !== null) color = status ? "#7ee6a8" : "#ffca4d";
        } else {
          const booked = bookedFor(release, c.name, null);
          const matchingEntries = entries.filter((e) => e.release_id === release.id && e.category_id === categoryIdByName[c.name]);
          const added = matchingEntries.length;
          if (booked != null && booked > 0) {
            color = added >= booked ? "#7ee6a8" : "#ffca4d";
          }
        }
        return (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
            <span style={{ color: "var(--text-faint)" }}>{c.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// Shared by the Bulk Add textarea and CSV import — one row per line,
// `channel,url` when the column doesn't have a fixed platform (comma
// splits on the FIRST comma only, so URLs are never truncated), or just
// `url` per line when it does. Blank lines and a header line matching the
// template's own column names are skipped so pasting the template back in
// (with or without its header) never creates a junk row.
function parseBulkLinks(text, hasChannelCol) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(channel_name|channel|url)\s*,?\s*(url)?$/i.test(line))
    .map((line) => {
      if (!hasChannelCol) return { channelName: "", link: line };
      const idx = line.indexOf(",");
      if (idx === -1) return { channelName: "", link: line.trim() };
      return { channelName: line.slice(0, idx).trim(), link: line.slice(idx + 1).trim() };
    })
    .filter((row) => row.link);
}

// One blank channel — { channelName, urls: [""] } — a channel typically
// carries 5-6 URLs (per the team), so it starts with one URL field and
// grows via its own "+" rather than asking for a count upfront.
function blankChannel() {
  return { channelName: "", urls: [""] };
}

function BrandCell({ release, column, booked, cellEntries, expanded, onToggle, onAdd, onAddBulk, onCycleStatus, onCycleStatusAll, onUpdateEntry, onDeleteEntry, canAdd, cellBorderLeft, referenceChannels, showStatus, channelStatus, onSaveStatus }) {
  const anchorRef = useRef(null);
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [channels, setChannels] = useState([blankChannel()]);
  const [submitResult, setSubmitResult] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState(null);
  const [refSearch, setRefSearch] = useState("");
  const [showRefPicker, setShowRefPicker] = useState(false);
  // Round 132 — inline edit state for an already-added entry. `editingId`
  // is the one entry (if any) currently showing input fields instead of
  // its read-only link — only one at a time, same "one thing open" idiom
  // as showAddPopup/bulkMode above.
  const [editingId, setEditingId] = useState(null);
  const [editChannelName, setEditChannelName] = useState("");
  const [editLink, setEditLink] = useState("");
  const [editError, setEditError] = useState(null);
  const added = cellEntries.length;
  const isDone = booked != null && booked > 0 && added >= booked;
  const hasChannelCol = !column.platform;
  // Round 142 — item 2: TikTok Channel columns get ONE status for the
  // whole column instead of a per-URL cycle button — see cycleStatusAll's
  // comment in the parent component. Social/Community are unaffected.
  const isTikTokChannelColumn = column.categoryName === "TikTok Channel";
  const STATUS_ORDER = ["Chưa Booking", "Đã Gửi", "Done"];
  const STATUS_COLOR = { "Done": "#7ee6a8", "Đã Gửi": "#ffca4d" };
  const columnStatus = cellEntries[0]?.status || STATUS_ORDER[0];

  function startEdit(e) {
    setEditingId(e.id);
    setEditChannelName(e.platform || "");
    setEditLink(e.link || "");
    setEditError(null);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }
  async function saveEdit(e) {
    const link = editLink.trim();
    if (!link) { setEditError("URL can't be empty — use the ✕ to delete instead."); return; }
    // Only hasChannelCol columns (TikTok Channel/Community) carry a
    // per-entry channel name in `platform` — every other column's
    // `platform` is the column's own fixed metric name, not something
    // this row owns, so it's left untouched here (same distinction
    // addEntry already draws between `c.platform` and a typed channel
    // name — see its own comment).
    const patch = hasChannelCol ? { platform: editChannelName.trim() || null, link } : { link };
    const { error } = await onUpdateEntry(e, patch);
    if (error) { setEditError(error.message || "Save failed."); return; }
    setEditingId(null);
    setEditError(null);
  }
  async function handleDelete(e) {
    if (!window.confirm(`Delete this link?\n${e.link}`)) return;
    await onDeleteEntry(e);
    if (editingId === e.id) setEditingId(null);
  }

  // Round 132 — one shared row renderer for both places an added entry
  // shows up (the expanded-cell list below the added/booked count, and
  // the recap list inside the "Add Link" popup itself) — same edit/delete
  // behavior either way, `showStatusCycle` just toggles whether the
  // status-cycling button (only meaningful in the expanded-cell view,
  // where it's always been) also renders.
  function renderEntryRow(e, { showStatusCycle }) {
    if (editingId === e.id) {
      return (
        <div key={e.id} style={{ fontSize: 11, marginBottom: 6, padding: 6, background: "var(--bg)", border: "1px solid var(--accent)", borderRadius: 4 }}>
          {hasChannelCol && (
            <input
              className={styles.input}
              style={{ width: "100%", boxSizing: "border-box", fontSize: 11, padding: "3px 6px", marginBottom: 4 }}
              placeholder="Channel name"
              value={editChannelName}
              onChange={(ev) => setEditChannelName(ev.target.value)}
            />
          )}
          <input
            className={styles.input}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 11, padding: "3px 6px" }}
            placeholder="URL"
            value={editLink}
            onChange={(ev) => setEditLink(ev.target.value)}
            autoFocus={!hasChannelCol}
          />
          {editError && <div style={{ color: "#ff6b6b", fontSize: 10, marginTop: 3 }}>{editError}</div>}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button className={styles.btnSmall} style={{ flex: 1 }} onClick={() => saveEdit(e)}>Save</button>
            <button className={styles.btnSmall} onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      );
    }
    return (
      <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, marginBottom: 4, gap: 6 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {e.platform && <span style={{ color: "#ff9d5c", fontWeight: 700 }}>{e.platform}: </span>}
          <a href={e.link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-muted)" }}>{e.link}</a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {showStatusCycle && (
            <button
              onClick={() => onCycleStatus(e)}
              style={{ background: "none", border: "none", cursor: "pointer", color: e.status === "Done" ? "#7ee6a8" : e.status === "Đã Gửi" ? "#ffca4d" : "var(--text-faint)", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}
            >
              {e.status}
            </button>
          )}
          <button onClick={() => startEdit(e)} title="Edit" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", fontSize: 11, padding: "0 2px" }}>✎</button>
          <button onClick={() => handleDelete(e)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", fontSize: 11, padding: "0 2px" }}>✕</button>
        </div>
      </div>
    );
  }

  function updateChannelName(ci, value) {
    setChannels((prev) => prev.map((c, i) => (i === ci ? { ...c, channelName: value } : c)));
  }
  function updateUrl(ci, ui, value) {
    setChannels((prev) => prev.map((c, i) => (i !== ci ? c : { ...c, urls: c.urls.map((u, j) => (j === ui ? value : u)) })));
  }
  function addUrlField(ci) {
    setChannels((prev) => prev.map((c, i) => (i !== ci ? c : { ...c, urls: [...c.urls, ""] })));
  }
  function addChannel() {
    setChannels((prev) => [...prev, blankChannel()]);
  }

  // Reference picker — see /booking-channels and app/booking/page.js's
  // load(). TikTok Channel columns (hasChannelCol) don't carry a fixed
  // platform of their own, but every real channel in that Hạng Mục is a
  // TikTok one, so those columns match against platform "TikTok" directly.
  // Sorted (not filtered) by whether the channel's own brand grouping
  // likely matches this column's brand — see brandsLikelyMatch's comment
  // for why this never hides anything, only ranks.
  // Community columns now also leave `platform` null (see the columns
  // useMemo — same channel+URL combo shape as TikTok Channel), so the old
  // blanket "no platform means TikTok Channel" fallback no longer holds.
  // TikTok Channel's own columns still fall back to "TikTok"; every other
  // no-platform column (i.e. Community) matches on its own subchannelType
  // instead, which is where the real platform name (Facebook/Instagram/…)
  // now lives.
  const matchPlatform = column.platform || (column.categoryName === "TikTok Channel" ? "TikTok" : column.subchannelType);
  const refMatches = useMemo(() => {
    const platformRows = (referenceChannels || []).filter((c) => c.platform === matchPlatform);
    const q = refSearch.trim().toLowerCase();
    const filtered = q
      ? platformRows.filter((c) => `${c.name} ${c.brand || ""} ${c.note || ""}`.toLowerCase().includes(q))
      : platformRows;
    return filtered
      .map((c) => ({ c, likely: brandsLikelyMatch(c.brand, column.brand) }))
      .sort((a, b) => (b.likely - a.likely) || (b.c.follower_count || 0) - (a.c.follower_count || 0))
      .slice(0, 25);
  }, [referenceChannels, refSearch, matchPlatform, column.brand]);

  // Picking a suggestion fills the first still-blank channel row instead
  // of always appending a new one, so the common "open popup, pick one
  // channel" case doesn't leave a stray empty row behind. Only the
  // CHANNEL NAME is filled in from the reference list — the URL field is
  // always left blank for the team to type/paste themselves. The
  // reference list's own `url` is informational only (so the team knows
  // which channel a given handle points to); it was previously also
  // auto-filled into the actual booking link, which meant the real
  // booking link silently defaulted to a value nobody typed and could go
  // stale/wrong without anyone noticing.
  function pickReferenceChannel(ch) {
    setChannels((prev) => {
      const blankIdx = prev.findIndex((c) => !c.channelName && c.urls.every((u) => !u.trim()));
      const entry = { channelName: ch.name, urls: [""] };
      if (blankIdx === -1) return [...prev, entry];
      return prev.map((c, i) => (i === blankIdx ? entry : c));
    });
    setRefSearch("");
  }

  // "Done" saves every non-empty URL across every channel row in one batch
  // (reuses the same bulk insert as CSV import), then closes the popup —
  // this is the primary add flow now, not a secondary "bulk" mode.
  async function submitChannels() {
    const rows = channels.flatMap((c) => c.urls.filter((u) => u.trim()).map((u) => ({ channelName: c.channelName, link: u.trim() })));
    if (rows.length === 0) { setShowAddPopup(false); return; }
    const { count, error } = await onAddBulk(rows);
    if (error) { setSubmitResult({ error: error.message }); return; }
    setChannels([blankChannel()]);
    setSubmitResult(null);
    setShowAddPopup(false);
  }

  async function submitBulk() {
    const rows = parseBulkLinks(bulkText, hasChannelCol);
    if (rows.length === 0) { setBulkResult({ count: 0, error: "No valid rows found." }); return; }
    const { count, error } = await onAddBulk(rows);
    setBulkResult({ count, error: error?.message });
    if (!error) setBulkText("");
  }

  function handleCsvFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBulkText((prev) => (prev ? prev + "\n" : "") + String(reader.result || ""));
    reader.readAsText(file);
    e.target.value = "";
  }

  function downloadTemplate() {
    const csv = hasChannelCol ? "channel_name,url\nKênh chính,https://…\n" : "url\nhttps://…\n";
    const a = document.createElement("a");
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = "booking-links-template.csv";
    a.click();
  }

  return (
    <td
      ref={anchorRef}
      style={{
        verticalAlign: "top",
        minWidth: 130,
        position: "relative",
        borderLeft: cellBorderLeft || "1px solid var(--border)",
        // Round 122 — highlighting the origin cell while its popup is open
        // (now rendered via a portal elsewhere in the DOM, see CellPopup)
        // is still worth keeping: it's the only remaining visual link back
        // to which cell a floating "FACEBOOK" popup title etc. belongs to.
        boxShadow: showAddPopup ? "inset 0 0 0 2px var(--accent)" : "none",
      }}
    >
      <div
        onClick={onToggle}
        style={{ cursor: "pointer", fontSize: 17, textAlign: "center", fontWeight: isDone ? 800 : 600 }}
        title={cellEntries.map((e) => `${e.platform ? e.platform + ": " : ""}${e.status}: ${e.link}`).join("\n")}
      >
        {isDone ? (
          <span style={{ color: "#7ee6a8" }}>DONE</span>
        ) : booked != null ? (
          <span style={{ color: "var(--text-muted)" }}>{added} / {booked}</span>
        ) : (
          <span style={{ color: "var(--text-faint)" }}>{added} / —</span>
        )}
      </div>
      {/* Round 125 — item 1: run status pill for TikTok Channel
          Partner-group columns, same 4-way vocabulary/coloring as the
          YouTube Ads column — purely additive, doesn't touch the added/
          booked readout or the Add Link flow above/below it. */}
      {showStatus && (
        <div
          onClick={onToggle}
          style={{ cursor: "pointer", fontSize: 10, fontWeight: 700, textAlign: "center", marginTop: 2, color: ADS_STATUS_COLORS[channelStatus || ADS_STATUS_OPTIONS[0]] }}
        >
          {channelStatus || ADS_STATUS_OPTIONS[0]}
        </div>
      )}
      {/* Round 134 — this used to render inline, directly in the table
          cell's normal document flow. A long URL (e.g. a full Google
          Sheets link) has no natural break point, so even with
          overflow/ellipsis on the row itself, the unbounded flex
          container around it just grew to fit — stretching the `<td>`
          and pushing every column to its right out of alignment (real
          symptom reported, screenshot showed FACEBOOK's row list
          overlapping into INSTAGRAM's column). Now a real floating popup
          (same CellPopup used for Add Link below), portaled to <body> and
          width-locked to 300px regardless of how long any entry's URL
          is — it can never affect the table's own layout again. */}
      {/* open is gated on !showAddPopup so this and the Add Link popup
          below (same anchorRef, same placement) never render on top of
          each other at once — clicking "+ Add Link" effectively swaps
          this one out rather than stacking a second floating panel
          exactly over the first. */}
      <CellPopup anchorRef={anchorRef} open={expanded && !showAddPopup} onClose={onToggle} placement="right" width={300}>
        {/* Round 142 — item 2: sticky so it stays visible (and the popup
            itself stays open, per explicit request "click the pop up and
            it on top, add stuff and it's still there") while scrolling a
            long entries list below — same position:sticky idiom, just
            scoped to this popup's own scroll container instead of the
            page. */}
        <div style={{ position: "sticky", top: -12, background: "var(--bg-card)", zIndex: 1, marginTop: -12, paddingTop: 12, marginLeft: -12, paddingLeft: 12, marginRight: -12, paddingRight: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: isTikTokChannelColumn ? 6 : 8 }}>
            {column.label}
          </div>
          {isTikTokChannelColumn && (
            <button
              onClick={() => onCycleStatusAll(cellEntries)}
              disabled={cellEntries.length === 0}
              style={{
                width: "100%",
                marginBottom: 8,
                padding: "4px 8px",
                borderRadius: 4,
                border: `1px solid ${STATUS_COLOR[columnStatus] || "var(--text-faint)"}`,
                background: "none",
                color: STATUS_COLOR[columnStatus] || "var(--text-faint)",
                fontSize: 11,
                fontWeight: 700,
                cursor: cellEntries.length === 0 ? "default" : "pointer",
                opacity: cellEntries.length === 0 ? 0.5 : 1,
              }}
              title="Status for every link in this column — click to advance"
            >
              {columnStatus}
            </button>
          )}
        </div>
        {cellEntries.length === 0 && <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>No links yet.</div>}
        {cellEntries.map((e) => renderEntryRow(e, { showStatusCycle: !isTikTokChannelColumn }))}
        {canAdd && (
          <button className={styles.btnSmall} style={{ marginTop: 4, width: "100%" }} onClick={() => setShowAddPopup(true)}>
            + Add Link
          </button>
        )}
      </CellPopup>

      {/* Clicking outside used to discard whatever was typed — an easy
          misclick (this popup sits right over other cells/buttons) that
          silently threw away the whole batch. Outside click now saves
          exactly like "Done" instead of canceling: any non-empty rows get
          added, and if nothing was typed it just closes, so there's no
          path where a stray click loses work. */}
      <CellPopup anchorRef={anchorRef} open={showAddPopup} onClose={() => (bulkMode ? setShowAddPopup(false) : submitChannels())} placement="right" width={300}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>
                Add Link — {column.label}
              </div>
              <button
                onClick={() => { setBulkMode((m) => !m); setBulkResult(null); }}
                style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 10, cursor: "pointer", textDecoration: "underline" }}
              >
                {bulkMode ? "channels" : "bulk / CSV"}
              </button>
            </div>

            {/* Round 125 — item 1: run status picker, same vocabulary as
                the YouTube Ads column, saves immediately on click (same
                idiom as onCycleStatus's per-link status below) — the Add
                Link flow underneath is completely unchanged. */}
            {showStatus && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Status</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {ADS_STATUS_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onSaveStatus(s)}
                      style={{
                        padding: "5px 8px", fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: "pointer",
                        border: `1px solid ${ADS_STATUS_COLORS[s]}`,
                        background: (channelStatus || ADS_STATUS_OPTIONS[0]) === s ? ADS_STATUS_COLORS[s] : "transparent",
                        color: (channelStatus || ADS_STATUS_OPTIONS[0]) === s ? "#0a0a0a" : ADS_STATUS_COLORS[s],
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reference picker — pulls from booking_channels (see
                /booking-channels) instead of typing a channel name + URL
                from scratch every time. Only shown in the normal (non-bulk)
                flow; collapsed by default since most cells won't need it
                open. Picking a channel fills the first blank row below —
                free typing still works exactly as before either way. */}
            {!bulkMode && referenceChannels && referenceChannels.length > 0 && (
              <div style={{ marginBottom: 10, border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
                <button
                  onClick={() => setShowRefPicker((s) => !s)}
                  style={{ background: "none", border: "none", color: "var(--accent-soft)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, width: "100%", textAlign: "left" }}
                >
                  {showRefPicker ? "▾" : "▸"} Pick from reference list
                </button>
                {showRefPicker && (
                  <div style={{ marginTop: 6 }}>
                    <input
                      className={styles.input}
                      style={{ width: "100%", padding: "5px 8px", fontSize: 11, boxSizing: "border-box", marginBottom: 6 }}
                      placeholder="Search channel name…"
                      value={refSearch}
                      onChange={(e) => setRefSearch(e.target.value)}
                    />
                    <div style={{ maxHeight: 140, overflowY: "auto", display: "grid", gap: 2 }}>
                      {refMatches.length === 0 && (
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>No matching channels.</div>
                      )}
                      {refMatches.map(({ c, likely }) => (
                        <button
                          key={c.id}
                          onClick={() => pickReferenceChannel(c)}
                          title={c.url || ""}
                          style={{
                            display: "block", width: "100%", textAlign: "left", background: likely ? "var(--bg-hover)" : "none",
                            border: "none", borderRadius: 4, padding: "4px 6px", cursor: "pointer", color: "var(--text)", fontSize: 11,
                          }}
                        >
                          {c.name}
                          {c.brand && <span style={{ color: "var(--text-faint)" }}> · {c.brand}</span>}
                          {c.follower_count != null && <span style={{ color: "var(--text-faint)" }}> · {c.follower_count.toLocaleString()}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!bulkMode ? (
              <div>
                {channels.map((c, ci) => (
                  <div key={ci} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "flex-start" }}>
                    {hasChannelCol && (
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Channel Name</label>
                        <input
                          className={styles.input}
                          style={{ width: "100%", padding: "6px 8px", fontSize: 12, boxSizing: "border-box" }}
                          placeholder="e.g. Kênh chính"
                          value={c.channelName}
                          onChange={(e) => updateChannelName(ci, e.target.value)}
                        />
                      </div>
                    )}
                    <div style={{ flex: 1.4 }}>
                      {c.urls.map((u, ui) => (
                        <div key={ui} style={{ display: "flex", gap: 6, marginBottom: ui === c.urls.length - 1 ? 0 : 6 }}>
                          <div style={{ flex: 1 }}>
                            {ui === 0 && <label style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>URL</label>}
                            <input
                              autoFocus={ci === 0 && ui === 0}
                              className={styles.input}
                              style={{ width: "100%", padding: "6px 8px", fontSize: 12, boxSizing: "border-box" }}
                              placeholder="https://…"
                              value={u}
                              onChange={(e) => updateUrl(ci, ui, e.target.value)}
                            />
                          </div>
                          {ui === c.urls.length - 1 && (
                            <button
                              onClick={() => addUrlField(ci)}
                              title="Add another URL for this channel — usually 5-6 per channel"
                              style={{
                                alignSelf: ui === 0 ? "flex-end" : "center",
                                background: "var(--accent)", border: "none", borderRadius: 6, color: "#fff",
                                width: 28, height: 28, fontSize: 16, fontWeight: 800, lineHeight: 1, cursor: "pointer", flexShrink: 0,
                              }}
                            >
                              +
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button className={styles.btnSmall} onClick={addChannel} style={{ width: "100%", marginBottom: 8 }}>
                  + Add Channel
                </button>
                {submitResult?.error && (
                  <div style={{ fontSize: 11, color: "#ff6b6b", marginBottom: 6 }}>Error: {submitResult.error}</div>
                )}
              </div>
            ) : (
              <div>
                <label style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>
                  {hasChannelCol ? "One per line: channel name, url" : "One URL per line"}
                </label>
                <textarea
                  className={styles.textarea}
                  style={{ width: "100%", fontSize: 11, minHeight: 90, boxSizing: "border-box" }}
                  placeholder={hasChannelCol ? "Kênh chính, https://…\nKênh phụ, https://…" : "https://…\nhttps://…"}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <label style={{ fontSize: 10, color: "var(--accent-soft)", cursor: "pointer", textDecoration: "underline" }}>
                    Import CSV
                    <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} style={{ display: "none" }} />
                  </label>
                  <button onClick={downloadTemplate} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 10, cursor: "pointer", textDecoration: "underline" }}>
                    Download template
                  </button>
                </div>
                <button className={styles.btnPrimary} onClick={submitBulk} style={{ width: "100%", marginTop: 8 }}>
                  Add All
                </button>
                {bulkResult && (
                  <div style={{ fontSize: 11, marginTop: 6, color: bulkResult.error ? "#ff6b6b" : "#7ee6a8" }}>
                    {bulkResult.error ? `Error: ${bulkResult.error}` : `Added ${bulkResult.count} link${bulkResult.count === 1 ? "" : "s"}.`}
                  </div>
                )}
              </div>
            )}
            {cellEntries.length > 0 && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8, display: "grid", gap: 4, maxHeight: 140, overflowY: "auto" }}>
                {/* Round 132 — already-added links now editable/deletable
                    right here too (not just the expanded-cell view below),
                    since this recap list is what's actually visible while
                    the Add Link popup itself is open. */}
                {cellEntries.map((e) => renderEntryRow(e, { showStatusCycle: false }))}
              </div>
            )}
            <button
              className={styles.btnPrimary}
              onClick={() => (bulkMode ? setShowAddPopup(false) : submitChannels())}
              style={{ width: "100%", marginTop: 10 }}
            >
              Done
            </button>
      </CellPopup>
    </td>
  );
}

// Ads Hạng Mục cell — quantity + status instead of BrandCell's Add
// Link/URL flow, per explicit request ("the booking package is also
// number of different unit not number of url"). Click opens a small popup
// with a "Số lượng" number field and a 4-way status switch; the main cell
// shows the number itself colored by status (not the cell background).
function AdsCell({ column, booked, added, existingEntry, canEdit, locked, cellBorderLeft, onSave, showYoutubeAdsFields, youtubeAdsUrl, youtubeBookingNote, onSaveYoutubeAdsUrl, onSaveYoutubeBookingNote }) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(existingEntry?.quantity ?? "");
  const [status, setStatus] = useState(existingEntry?.status || ADS_STATUS_OPTIONS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setQuantity(existingEntry?.quantity ?? "");
    setStatus(existingEntry?.status || ADS_STATUS_OPTIONS[0]);
  }, [existingEntry]);

  const isDone = booked != null && booked > 0 && added >= booked;
  const numColor = existingEntry ? ADS_STATUS_COLORS[existingEntry.status] || "var(--text-muted)" : "var(--text-faint)";

  async function handleSave() {
    setSaving(true);
    const q = quantity === "" ? null : Number(quantity);
    // Round 88 follow-up 3 — locked stays forced to "Cancel" no matter what
    // status was picked (there's no status picker in the locked popup below
    // anyway) — entering a number here doesn't quietly authorize the run;
    // it just records the result so it isn't lost while waiting on the gate.
    const { error } = await onSave(q, locked ? "Cancel" : status);
    setSaving(false);
    // Round 93 fix — a failed save (e.g. the not-null violation this round
    // fixed, or any future DB error) used to close the popup silently as if
    // it worked, so the "result number isn't saving" bug had no visible
    // symptom to go on. Now a failed save stays open with the number intact
    // and tells the user plainly, instead of pretending it went through.
    if (error) {
      window.alert(`Save failed: ${error.message || error}. The number is still in the box — try Save again.`);
      return;
    }
    setOpen(false);
    if (locked) {
      window.alert('Saved. Remember to tick "Có Trong Net YouTube" on this release\'s detail page — until then this stays locked and shown as Cancel here.');
    }
  }

  // Round 77 — item 3, revised Round 88 follow-up 3: locked (Có Trong Net
  // YouTube not ticked on the release) still shows "Cancel" as the cell's
  // resting label, since that's the real forced status until the gate is
  // ticked — but per explicit request, it's no longer fully closed off.
  // Clicking it opens the same quantity popup as an unlocked cell (minus
  // the status picker, since status stays forced to "Cancel"), with a
  // banner reminding whoever's filling it in to go tick the gate — so a
  // result number doesn't get lost just because nobody remembered to check
  // that box first.
  if (locked) {
    return (
      <td
        ref={anchorRef}
        style={{
          verticalAlign: "top", minWidth: 130, position: "relative",
          borderLeft: cellBorderLeft || "1px solid var(--border)",
          boxShadow: open ? "inset 0 0 0 2px var(--accent)" : "none",
        }}
      >
        <div
          onClick={() => canEdit && setOpen(true)}
          style={{ cursor: canEdit ? "pointer" : "default", fontSize: 17, textAlign: "center", fontWeight: 600, color: ADS_STATUS_COLORS["Cancel"] }}
          title={`Cancel — locked (Có Trong Net YouTube not ticked on the release detail page)${existingEntry?.quantity != null ? ` — ${existingEntry.quantity}` : ""}${canEdit ? ". Click to enter a number anyway." : ""}`}
        >
          Cancel{existingEntry?.quantity != null ? ` (${existingEntry.quantity})` : ""}
        </div>

        <CellPopup anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} placement="right" width={250}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 8 }}>
            {column.label}
          </div>
          <div style={{ fontSize: 11, color: "#ffca4d", background: "rgba(255,202,77,0.1)", border: "1px solid #5a4a1a", borderRadius: 6, padding: "6px 8px", marginBottom: 10 }}>
            ⚠ Locked — "Có Trong Net YouTube" isn't ticked on this release yet. You can still save a number below, but it stays shown as Cancel here until that's ticked on the release detail page.
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Số lượng</label>
            <input
              type="number"
              className={styles.input}
              style={{ width: "100%", boxSizing: "border-box" }}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
            />
          </div>
          {showYoutubeAdsFields && (
            // Round 93 — the AR team's YouTube URL + Booking request
            // fields, per explicit request ("booking board, click to
            // the youtube ads column, pop up show up, they live
            // there"). Writes straight to the release (immediate save,
            // no relation to the Số lượng/Status Save button below).
            <div style={{ marginBottom: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <YoutubeAdsFields
                styles={styles}
                url={youtubeAdsUrl}
                bookingNote={youtubeBookingNote}
                onChangeUrl={onSaveYoutubeAdsUrl}
                onChangeBookingNote={onSaveYoutubeBookingNote}
                compact
              />
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className={styles.btnPrimary} style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
              {saving ? "Đang lưu…" : "Save"}
            </button>
            <button className={styles.btnSmall} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </CellPopup>
      </td>
    );
  }

  return (
    <td
      ref={anchorRef}
      style={{
        verticalAlign: "top", minWidth: 130, position: "relative",
        borderLeft: cellBorderLeft || "1px solid var(--border)",
        boxShadow: open ? "inset 0 0 0 2px var(--accent)" : "none",
      }}
    >
      <div
        onClick={() => canEdit && setOpen(true)}
        style={{ cursor: canEdit ? "pointer" : "default", fontSize: 17, textAlign: "center", fontWeight: isDone ? 800 : 600 }}
        title={existingEntry ? `${existingEntry.status}${existingEntry.quantity != null ? ` — ${existingEntry.quantity}` : ""}` : "Chưa nhập số lượng"}
      >
        {isDone ? (
          <span style={{ color: "#7ee6a8" }}>DONE</span>
        ) : booked != null ? (
          <span style={{ color: numColor }}>{added} / {booked}</span>
        ) : (
          <span style={{ color: numColor }}>{added} / —</span>
        )}
      </div>

      <CellPopup anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} placement="right" width={240}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 10 }}>
          {column.label}
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Số lượng</label>
          <input
            type="number"
            className={styles.input}
            style={{ width: "100%", boxSizing: "border-box" }}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            autoFocus
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Status</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {ADS_STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                style={{
                  padding: "5px 8px", fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: "pointer",
                  border: `1px solid ${ADS_STATUS_COLORS[s]}`,
                  background: status === s ? ADS_STATUS_COLORS[s] : "transparent",
                  color: status === s ? "#0a0a0a" : ADS_STATUS_COLORS[s],
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        {showYoutubeAdsFields && (
          // Round 93 — same YouTube URL + Booking request fields as the
          // locked popup above, immediate-save straight to the release.
          <div style={{ marginBottom: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <YoutubeAdsFields
              styles={styles}
              url={youtubeAdsUrl}
              bookingNote={youtubeBookingNote}
              onChangeUrl={onSaveYoutubeAdsUrl}
              onChangeBookingNote={onSaveYoutubeBookingNote}
              compact
            />
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className={styles.btnPrimary} style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Đang lưu…" : "Save"}
          </button>
          <button className={styles.btnSmall} onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </CellPopup>
    </td>
  );
}

// Read-only view of a release's locked package — same data shape as the
// magic-link picker, minus the picking. INT MEDIA shows names only (no
// numbers), matching how it renders everywhere else; simple options
// (Chỉ Phát Hành, Không Độc Quyền) have no itemized breakdown at all.
function PackagePreviewPopup({ release, categories, onClose }) {
  const [pkg, setPkg] = useState(undefined); // undefined = loading, null = simple option / not found
  const isIntMedia = release.project_type === "INT MEDIA";

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("media_booking_packages")
        .select("*, media_booking_package_lines(*)")
        .eq("release_id", release.id)
        .eq("name", release.project_type)
        .maybeSingle();
      setPkg(data || null);
    })();
  }, [release]);

  const categoryNameById = {};
  categories.forEach((c) => (categoryNameById[c.id] = c.name));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20, maxWidth: 480, width: "100%", maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div className={styles.eyebrow}>// Package</div>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{release.project_type}</h3>
            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{release.title}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        {pkg === undefined ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : pkg === null ? (
          <div className={styles.emptyState}>No itemized breakdown for this pick.</div>
        ) : isIntMedia ? (
          <div style={{ display: "grid", gap: 6 }}>
            {(pkg.media_booking_package_lines || []).map((l) => (
              <div key={l.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
                {categoryNameById[l.category_id] || l.platform || "—"}{l.brand ? ` — ${l.brand}` : ""}
              </div>
            ))}
          </div>
        ) : (
          <table className={styles.table}>
            <thead><tr><th>Hạng Mục</th><th>Số Lượng</th><th>Chi Tiết</th><th>Thành Tiền</th></tr></thead>
            <tbody>
              {(pkg.media_booking_package_lines || []).map((l) => (
                <tr key={l.id}>
                  <td style={{ fontSize: 12 }}>{categoryNameById[l.category_id] || l.platform || "—"}{l.brand ? ` — ${l.brand}` : ""}</td>
                  <td>
                    {l.quantity != null ? (
                      <>{l.quantity.toLocaleString("en-US")} {l.unit}</>
                    ) : l.metric_quantities && Object.keys(l.metric_quantities).length > 0 ? (
                      // Round 114 — this used to always show a bare "—" for
                      // every Ads brand but YouTube Ads, since none of them
                      // ever had a real `quantity`. The real per-metric
                      // numbers are now persisted (metric_quantities) — show
                      // that breakdown instead of implying there's no data.
                      <span style={{ fontSize: 11 }}>
                        {Object.entries(l.metric_quantities).map(([m, q]) => `${q} ${m}`).join(", ")}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "pre-line" }}>{formatDetailText(l.detail) || "—"}</td>
                  <td>{l.amount != null ? new Intl.NumberFormat("vi-VN").format(l.amount) + " đ" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
