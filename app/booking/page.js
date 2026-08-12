"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, formatDetailText } from "../../lib/helpers";
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
const TIKTOK_SUBCHANNELS = ["TIKTOK NEWS", "TIKTOK CAPCUT", "MẪU CAPCUT", "TIKTOK REUP MV", "TIKTOK LYRICS"];

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
  "YouTube Ads": ["Thruplays (Views)"],
  "TikTok Ads": ["Lượt tiếp cận", "Lượt xem video", "Lượt theo dõi", "Lượt truy cập (Link click)"],
  "Spotify Ads": ["HPTO", "In-Stream Audio", "In-Stream Video", "In-Feed Display", "In-Feed Video"],
};

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
  const [expandedCell, setExpandedCell] = useState(null); // `${releaseId}:${categoryName}:${brand}` or null
  const [packagePreview, setPackagePreview] = useState(null); // release being previewed, or null
  const [bookingChannels, setBookingChannels] = useState([]); // booking_channels reference table — see BrandCell's Add Link popup
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
    const { data: rels } = await supabase
      .from("releases")
// Round 77 — gate_co_trong_net_youtube added: locks the YouTube Ads
      // Ads-brand column when the release hasn't opted into Có Trong Net
      // YouTube on its detail page (see AdsCell's ctnLocked prop below).
      // Round 92 — youtube_ads_url/youtube_ads_booking_note added: shown
      // (and editable) inside the YouTube Ads column's own popup, see
      // AdsCell's showYoutubeAdsFields prop below.
      .select("id, did, title, main_artist, release_date, link_phu_luc, phu_luc_ngay_gui, phu_luc_ngay_ky, label, project_type, package_locked, booking_note, link_media_report, media_report_status, gate_co_trong_net_youtube, youtube_ads_url, youtube_ads_booking_note, pseudo_package_parent_did")
      .order("release_date", { ascending: false });
    const { data: ents } = await supabase.from("media_booking_entries").select("*");
    const { data: cats } = await supabase.from("package_categories").select("id, name").order("sort_order");
    const { data: pkgs } = await supabase.from("media_booking_packages").select("id, release_id, name, media_booking_package_lines(category_id, brand, quantity)");
    const { data: targets } = await supabase.from("media_booking_dot2_targets").select("release_id");
    // Reference channel list (see /booking-channels) — lets the Add Link
    // popup below suggest a real channel + URL instead of OPS typing both
    // from scratch every time. Missing table/no rows just means no
    // suggestions show up; the popup still works exactly as before.
    const { data: chans } = await supabase.from("booking_channels").select("*");
    const { data: extLinks } = await supabase.from("app_settings").select("value").eq("key", ARTIST_PROFILE_LINKS_SETTING_KEY).maybeSingle();
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
    setLoading(false);
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

  function bookedFor(release, categoryName, brand) {
    const pkg = packageByRelease[release.id];
    if (!pkg) return null; // nothing locked in yet — no target to compare against
    const categoryId = categoryIdByName[categoryName];
    const lines = pkg.media_booking_package_lines || [];
    if (brand === null) {
      const matching = lines.filter((l) => l.category_id === categoryId); // "All" aggregate — every brand in this category
      if (matching.length === 0) return null;
      return matching.reduce((sum, l) => sum + (l.quantity || 0), 0);
    }
    const brandMatching = lines.filter((l) => l.category_id === categoryId && (l.brand || "") === (brand || ""));
    if (brandMatching.length > 0) {
      return brandMatching.reduce((sum, l) => sum + (l.quantity || 0), 0);
    }
    // Round 88 follow-up 3 — Social/Community/TikTok Channel all mush every
    // one of their sub-brands into ONE combined package line (brand: "")
    // when the package is built (see media-booking's groupSummarizedRows /
    // createPackage — "every OTHER Hạng Mục mushes its brand rows into ONE
    // combined package line"). Ads is the only category with a real
    // per-brand line. That meant drilling into a specific brand here always
    // came back with no match at all (a real target existed, just never
    // filed under that brand name) — bookedFor returned null for every
    // single one of that Hạng Mục's brand/sub-channel columns, which then
    // tripped the board's "only show releases with a requested number"
    // filter and hid the release completely, even though the aggregate
    // "All" column clearly showed a real number. Falling back to the
    // category's one combined line here means a specific-brand view now
    // shows that same real (shared, not brand-broken-out) target instead of
    // silently disappearing the release.
    const aggregateMatching = lines.filter((l) => l.category_id === categoryId && !l.brand);
    if (aggregateMatching.length === 0) return null;
    return aggregateMatching.reduce((sum, l) => sum + (l.quantity || 0), 0);
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

  const filteredReleases = useMemo(() => {
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
        const anyFilled = columns.some((c) => bookedFor(r, c.categoryName, c.brand) != null);
        if (!anyFilled) return false;
      }
      return true;
    });
  }, [roundFilteredReleases, search, month, typeFilter, labelFilter, hangMucFilter, columns, packageByRelease]);

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
    const channelTypeTag = categoryName === "TikTok Channel" ? tiktokGroupForBrand(brand) : null;
    const { data, error } = await supabase
      .from("media_booking_entries")
      .insert({
        release_id: releaseId, booking_round: round, channel_type: channelTypeTag,
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
    const channelTypeTag = categoryName === "TikTok Channel" ? tiktokGroupForBrand(brand) : null;
    const payload = (rows || [])
      .filter((row) => row.link && row.link.trim())
      .map((row) => ({
        release_id: releaseId, booking_round: round, channel_type: channelTypeTag,
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
        row.push(bookedFor(r, c.categoryName, c.brand) ?? "—");
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
          {(search || month || typeFilter || labelFilter) && (
            <button
              className={styles.btnSmall}
              style={{ borderColor: "#c0392b", color: "#e57373" }}
              onClick={() => { setSearch(""); setMonth(""); setTypeFilter(""); setLabelFilter(""); }}
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
          <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
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
                          booked={bookedFor(r, c.categoryName, c.brand)}
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
                    return (
                      <BrandCell
                        key={c.key}
                        release={r}
                        column={c}
                        booked={bookedFor(r, c.categoryName, c.brand)}
                        cellEntries={cellEntries}
                        expanded={expandedCell === `${r.id}:${c.key}`}
                        onToggle={() => setExpandedCell(expandedCell === `${r.id}:${c.key}` ? null : `${r.id}:${c.key}`)}
                        onAdd={(platform, link) => addEntry(r.id, c.categoryName, c.brand, c.platform || platform, link, c.subchannelType)}
                        onAddBulk={(rows) => addEntries(r.id, c.categoryName, c.brand, c.platform, c.subchannelType, rows)}
                        onCycleStatus={cycleStatus}
                        canAdd={hangMucFilter !== "All"}
                        cellBorderLeft={isGroupStart ? "2px solid #555" : "1px solid var(--border)"}
                        referenceChannels={bookingChannels}
                      />
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
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
                              booked={bookedFor(r, c.categoryName, c.brand)}
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
                        })() : (
                          <BrandCell
                            release={r}
                            column={c}
                            booked={bookedFor(r, c.categoryName, c.brand)}
                            cellEntries={cellEntries}
                            expanded={expandedCell === `${r.id}:${c.key}`}
                            onToggle={() => setExpandedCell(expandedCell === `${r.id}:${c.key}` ? null : `${r.id}:${c.key}`)}
                            onAdd={(platform, link) => addEntry(r.id, c.categoryName, c.brand, c.platform || platform, link, c.subchannelType)}
                            onAddBulk={(rows) => addEntries(r.id, c.categoryName, c.brand, c.platform, c.subchannelType, rows)}
                            onCycleStatus={cycleStatus}
                            canAdd={hangMucFilter !== "All"}
                            cellBorderLeft="none"
                            referenceChannels={bookingChannels}
                          />
                        )}
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
    <div style={{ position: "relative", display: "inline-block" }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
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

      {open && (
        <>
          <div onClick={cancelEdit} style={{ position: "fixed", inset: 0, zIndex: 299 }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: 6, zIndex: 300, width: 240,
              background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)", textAlign: "left",
            }}
          >
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
        </>
      )}
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
        const booked = bookedFor(release, c.name, null);
        const matchingEntries = entries.filter((e) => e.release_id === release.id && e.category_id === categoryIdByName[c.name]);
        // Ads sums quantity instead of counting rows — same fix as
        // addedFor above.
        const added = c.name === "Ads"
          ? matchingEntries.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0)
          : matchingEntries.length;
        let color = "#444"; // grey — not booked at all
        if (booked != null && booked > 0) {
          color = added >= booked ? "#7ee6a8" : "#ffca4d";
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

function BrandCell({ release, column, booked, cellEntries, expanded, onToggle, onAdd, onAddBulk, onCycleStatus, canAdd, cellBorderLeft, referenceChannels }) {
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [channels, setChannels] = useState([blankChannel()]);
  const [submitResult, setSubmitResult] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState(null);
  const [refSearch, setRefSearch] = useState("");
  const [showRefPicker, setShowRefPicker] = useState(false);
  const added = cellEntries.length;
  const isDone = booked != null && booked > 0 && added >= booked;
  const hasChannelCol = !column.platform;

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
      style={{
        verticalAlign: "top",
        minWidth: 130,
        position: "relative",
        borderLeft: cellBorderLeft || "1px solid var(--border)",
        // The Add Link popup below always opens to the RIGHT of this cell
        // (left: "100%"), which visually lands it on top of the NEXT
        // column over — easy to mistake for belonging to that column
        // instead of this one (reported: a popup titled "FACEBOOK" looked
        // like it came from the TikTok column next to it). Highlighting
        // the actual origin cell while its popup is open makes it
        // unambiguous which column the box belongs to, regardless of
        // where it visually overlaps.
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
      {expanded && (
        <div style={{ marginTop: 6, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
          {cellEntries.length === 0 && <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>No links yet.</div>}
          {cellEntries.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, marginBottom: 4, gap: 6 }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>
                {e.platform && <span style={{ color: "#ff9d5c", fontWeight: 700 }}>{e.platform}: </span>}
                <a href={e.link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-muted)" }}>{e.link}</a>
              </div>
              <button
                onClick={() => onCycleStatus(e)}
                style={{ background: "none", border: "none", cursor: "pointer", color: e.status === "Done" ? "#7ee6a8" : e.status === "Đã Gửi" ? "#ffca4d" : "var(--text-faint)", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}
              >
                {e.status}
              </button>
            </div>
          ))}
          {canAdd && (
            <button className={styles.btnSmall} style={{ marginTop: 4, width: "100%" }} onClick={() => setShowAddPopup(true)}>
              + Add Link
            </button>
          )}
        </div>
      )}

      {showAddPopup && (
        <>
          {/* Clicking outside used to discard whatever was typed — an easy
              misclick (this popup sits right over other cells/buttons) that
              silently threw away the whole batch. Outside click now saves
              exactly like "Done" instead of canceling: any non-empty rows
              get added, and if nothing was typed it just closes, so there's
              no path where a stray click loses work. */}
          <div onClick={() => (bulkMode ? setShowAddPopup(false) : submitChannels())} style={{ position: "fixed", inset: 0, zIndex: 299 }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: 0, left: "100%", marginLeft: 6, zIndex: 300, width: 300,
              background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
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
                {cellEntries.map((e) => (
                  <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, gap: 6 }}>
                    {/* Round 80 — minWidth: 0 lets a flex item actually
                        shrink to its parent instead of growing to fit a
                        long pasted link ("over-extend"). */}
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                      {e.platform && <span style={{ color: "#ff9d5c", fontWeight: 700 }}>{e.platform}: </span>}
                      <a href={e.link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-muted)" }}>{e.link}</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              className={styles.btnPrimary}
              onClick={() => (bulkMode ? setShowAddPopup(false) : submitChannels())}
              style={{ width: "100%", marginTop: 10 }}
            >
              Done
            </button>
          </div>
        </>
      )}
    </td>
  );
}

// Ads Hạng Mục cell — quantity + status instead of BrandCell's Add
// Link/URL flow, per explicit request ("the booking package is also
// number of different unit not number of url"). Click opens a small popup
// with a "Số lượng" number field and a 4-way status switch; the main cell
// shows the number itself colored by status (not the cell background).
function AdsCell({ column, booked, added, existingEntry, canEdit, locked, cellBorderLeft, onSave, showYoutubeAdsFields, youtubeAdsUrl, youtubeBookingNote, onSaveYoutubeAdsUrl, onSaveYoutubeBookingNote }) {
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

        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 299 }} />
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute", top: 0, left: "100%", marginLeft: 6, zIndex: 300, width: 250,
                background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: 12,
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              }}
            >
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
            </div>
          </>
        )}
      </td>
    );
  }

  return (
    <td
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

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 299 }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: 0, left: "100%", marginLeft: 6, zIndex: 300, width: 240,
              background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
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
          </div>
        </>
      )}
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
                  <td>{l.quantity != null ? l.quantity.toLocaleString("en-US") : "—"} {l.unit}</td>
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
