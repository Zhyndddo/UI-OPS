"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, formatDetailText } from "../../lib/helpers";
import TypeSwitcher from "../../lib/TypeSwitcher";
import { usePagination } from "../../lib/usePagination";
import Pagination from "../../lib/Pagination";
import styles from "../shared.module.css";

// Every Hạng Mục here uses the same 2-layer pattern: pick a sub-filter
// (a brand, or a brand group), and THAT determines the columns shown.
// CATEGORY_SUBFILTERS is layer 1 — MUST stay in sync with the equivalent
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
  const [unrequestedOnly, setUnrequestedOnly] = useState(false); // only relevant once a specific Hạng Mục is picked (not "All") — see below
  const [bookingChannels, setBookingChannels] = useState([]); // booking_channels reference table — see BrandCell's Add Link popup

  useEffect(() => {
    const options = CATEGORY_SUBFILTERS[hangMucFilter];
    setSubFilter(options ? options[0] : null);
    setUnrequestedOnly(false);
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
      .select("id, did, title, main_artist, release_date, link_phu_luc, phu_luc_ngay_gui, phu_luc_ngay_ky, label, project_type, package_locked")
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
    setReleases(rels || []);
    setEntries(ents || []);
    setCategories(cats || []);
    setPackages(pkgs || []);
    setDot2ReleaseIds(new Set((targets || []).map((t) => t.release_id)));
    setBookingChannels(chans || []);
    setLoading(false);
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
    const matching = brand === null
      ? lines.filter((l) => l.category_id === categoryId) // "All" aggregate — every brand in this category
      : lines.filter((l) => l.category_id === categoryId && (l.brand || "") === (brand || ""));
    if (matching.length === 0) return null;
    return matching.reduce((sum, l) => sum + (l.quantity || 0), 0);
  }

  function addedFor(release, categoryName, brand, platform, subchannelType, entryPool) {
    const categoryId = categoryIdByName[categoryName];
    return entryPool.filter((e) =>
      e.release_id === release.id &&
      e.category_id === categoryId &&
      (brand === null || (e.channel_name || "") === (brand || "")) &&
      (platform == null || (e.platform || "") === platform) &&
      (subchannelType == null || (e.subchannel_type || "") === subchannelType)
    ).length;
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
  // Declared before filteredReleases below since the "Chưa có yêu cầu"
  // filter needs to know the current columns to check.
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
    if (hangMucFilter === "Social" || hangMucFilter === "Community") {
      return PLATFORM_COLUMNS.map((p) => ({
        key: `${hangMucFilter}:${subFilter}:${p}`,
        label: p,
        categoryName: hangMucFilter,
        brand: subFilter,
        platform: p,
        subchannelType: null,
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
      // "Chưa có yêu cầu" — only meaningful once a specific Hạng Mục is
      // picked (columns is empty for "All", so this can't apply there).
      // A release only counts as "no request" if EVERY currently-shown
      // brand/column under this Hạng Mục has no booked target at all
      // (bookedFor returns null when there's no package line for that
      // brand) — not just some of them.
      if (unrequestedOnly && hangMucFilter !== "All" && columns.length > 0) {
        const allNull = columns.every((c) => bookedFor(r, c.categoryName, c.brand) == null);
        if (!allNull) return false;
      }
      return true;
    });
  }, [roundFilteredReleases, search, month, typeFilter, labelFilter, unrequestedOnly, hangMucFilter, columns, packageByRelease]);

  const { pageRows: pagedReleases, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(filteredReleases);

  const stats = useMemo(() => {
    const total = releases.length;
    let done = 0, notBooked = 0, inProgress = 0;
    roundFilteredReleases.forEach((r) => {
      const relEntries = roundEntries.filter((e) => e.release_id === r.id);
      if (relEntries.length === 0) { notBooked++; return; }
      const pkg = packageByRelease[r.id];
      const totalBooked = (pkg?.media_booking_package_lines || []).reduce((sum, l) => sum + (l.quantity || 0), 0);
      if (totalBooked > 0 && relEntries.length >= totalBooked) done++;
      else inProgress++;
    });
    return { total, done, inProgress, notBooked };
  }, [releases, roundFilteredReleases, roundEntries, packageByRelease]);

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
          <button className={styles.btnSecondary} onClick={exportCsv}>⇩ Export CSV</button>
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
            <div className={styles.statLabel}>Done ({round})</div>
            <div className={styles.statValue} style={{ fontSize: 34, color: "#7ee6a8" }}>{stats.done}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Đang Booking</div>
            <div className={styles.statValue} style={{ fontSize: 34, color: "#ffca4d" }}>{stats.inProgress}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Chưa Booking</div>
            <div className={styles.statValue} style={{ fontSize: 34, color: "var(--text-faint)" }}>{stats.notBooked}</div>
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
          {hangMucFilter !== "All" && (
            <button
              onClick={() => setUnrequestedOnly((v) => !v)}
              className={styles.btnSmall}
              style={unrequestedOnly ? { borderColor: "#ff6b1a", color: "#ff6b1a", background: "rgba(255,107,26,0.1)" } : undefined}
              title="Only show releases with no requested number at all for this Hạng Mục — every brand/column shown is empty (—), nothing booked."
            >
              Chưa có yêu cầu
            </button>
          )}
          <select className={styles.select} style={{ maxWidth: 170 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Type — all</option>
            {[...new Set(releases.map((r) => r.project_type).filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={styles.select} style={{ maxWidth: 170 }} value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)}>
            <option value="">Label — all</option>
            {[...new Set(releases.map((r) => r.label).filter(Boolean))].map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {(search || month || typeFilter || labelFilter || unrequestedOnly) && (
            <button
              className={styles.btnSmall}
              style={{ borderColor: "#c0392b", color: "#e57373" }}
              onClick={() => { setSearch(""); setMonth(""); setTypeFilter(""); setLabelFilter(""); setUnrequestedOnly(false); }}
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
        ) : (
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
              {pagedReleases.map((r) => (
                <tr key={r.id}>
                  <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--bg)", borderRight: "2px solid var(--accent)", width: 288, minWidth: 288, maxWidth: 288, overflow: "hidden", textOverflow: "ellipsis" }}>
                    <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.main_artist} · {r.did} · {fmtDate(r.release_date)}</div>
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
                  {columns.map((c, i) => {
                    const prev = columns[i - 1];
                    const isGroupStart = prev && prev.categoryName !== c.categoryName;
                    return (
                      <BrandCell
                        key={c.key}
                        release={r}
                        column={c}
                        booked={bookedFor(r, c.categoryName, c.brand)}
                        cellEntries={roundEntries.filter((e) =>
                          e.release_id === r.id &&
                          e.category_id === categoryIdByName[c.categoryName] &&
                          (c.brand === null || (e.channel_name || "") === (c.brand || "")) &&
                          (c.platform == null || (e.platform || "") === c.platform) &&
                          (c.subchannelType == null || (e.subchannel_type || "") === c.subchannelType)
                        )}
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
              ))}
            </tbody>
          </table>
          </div>
          <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
        )}
      </div>
    </div>

    {packagePreview && (
      <PackagePreviewPopup release={packagePreview} categories={categories} onClose={() => setPackagePreview(null)} />
    )}
    </AppShell>
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
function ResultCell({ release, categories, bookedFor, entries, categoryIdByName }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 10, rowGap: 3 }}>
      {categories.map((c) => {
        const booked = bookedFor(release, c.name, null);
        const added = entries.filter((e) => e.release_id === release.id && e.category_id === categoryIdByName[c.name]).length;
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
  const matchPlatform = column.platform || "TikTok";
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
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20, width: 480, maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
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
                  <td>{l.quantity ?? "—"} {l.unit}</td>
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
