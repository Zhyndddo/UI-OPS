"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { usePagination } from "../../../lib/usePagination";
import Pagination from "../../../lib/Pagination";
import styles from "../../shared.module.css";

function fmtVnd(n) {
  if (n === null || n === undefined || n === "") return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

// This IS the package-building tool (the "workstation" it was briefly
// pulled out into moved back in here) — clicking a row opens the builder:
// pick a template, edit the itemized numbers live, generate the magic
// link as a final check. The executor flipping status PROCESS -> DONE is
// what actually sends that link forward to the release's detail page.
export default function MediaBookingList() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [releasesByDid, setReleasesByDid] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [openTicket, setOpenTicket] = useState(null);

  const isExecutorView = !profile?.segment || profile.segment === "Marketing";

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.from("profiles").select("id, name").order("name").then(({ data }) => setProfiles(data || []));
  }, []);

  async function load() {
    setLoading(true);
    const { data: tabRow } = await supabase.from("ticket_tabs").select("*").eq("key", "media_booking").single();
    setTab(tabRow);
    if (tabRow && !statusFilter) setStatusFilter(tabRow.status_options[0]);
    const { data } = tabRow
      ? await supabase.from("tickets").select("*, profiles(name)").eq("tab_id", tabRow.id).is("deleted_at", null).order("created_at", { ascending: false })
      : { data: [] };
    setTickets(data || []);

    const dids = [...new Set((data || []).map((t) => t.data?.releaseId).filter(Boolean))];
    if (dids.length > 0) {
      const { data: rels } = await supabase.from("releases").select("did, title, main_artist, label, release_date, release_time").in("did", dids);
      const map = {};
      (rels || []).forEach((r) => { map[r.did] = r; });
      setReleasesByDid(map);
    }
    setLoading(false);
  }

  async function updatePic(t, profileId) {
    const patch = { pic_profile_id: profileId || null };
    if (profileId && t.status === tab.default_status) {
      const nextStatus = tab.status_options[1];
      if (nextStatus) { patch.status = nextStatus; patch.status_log = { ...t.status_log, [nextStatus]: new Date().toISOString() }; }
    }
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
    load();
  }

  async function updateStatus(t, newStatus) {
    const newLog = { ...t.status_log, [newStatus]: new Date().toISOString() };
    const patch = { status: newStatus, status_log: newLog };
    if (newStatus === "REFUND") patch.pic_profile_id = null;
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("tickets").update(patch).eq("id", t.id);
  }

  // Auto-sort by release date, farthest-out first (descending — per
  // explicit request, e.g. 31/12/2026 before 01/01/2026) instead of the
  // query's default created_at desc. Tickets with no matching release
  // (releaseId missing, or the release wasn't found in releasesByDid) sort
  // last regardless of direction, rather than being pulled to the top by a
  // missing/undefined date. "for now" per your ask — a real column-picker
  // sort can replace this later if release date isn't always the right
  // axis.
  function byReleaseDate(a, b) {
    const da = releasesByDid[a.data?.releaseId]?.release_date;
    const db = releasesByDid[b.data?.releaseId]?.release_date;
    if (!da && !db) return 0;
    // Missing dates always sort last, in EITHER direction — a ticket with
    // no matched release shouldn't jump to the top just because "no date"
    // technically sorts high in a descending compare.
    if (!da) return 1;
    if (!db) return -1;
    // Descending — farthest-out release date first (e.g. 31/12/2026 before
    // 01/01/2026), per explicit request.
    return db.localeCompare(da);
  }

  const visibleTickets = useMemo(() => {
    if (!tab) return [];
    if (isExecutorView) return tickets.filter((t) => t.status === statusFilter).sort(byReleaseDate);
    // Sort by release date first, then a STABLE re-sort pulling REFUND
    // tickets to the top — Array.sort is stable, so the release-date
    // order survives within each of the two groups.
    return [...tickets].sort(byReleaseDate).sort((a, b) => (a.status === "REFUND" ? 0 : 1) - (b.status === "REFUND" ? 0 : 1));
  }, [tickets, tab, isExecutorView, statusFilter, releasesByDid]);

  const { pageRows: pagedTickets, page, setPage, pageSize, setPageSize, totalPages, totalRows } = usePagination(visibleTickets);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1100 }}>
          <TypeSwitcher kind="ticket" current="media_booking" />
          <div className={styles.topRow}>
            <div>
              <div className={styles.eyebrow}>// Ticket</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>Media Booking</h1>
            </div>
            <Link href="/tickets/media-booking/new" className={styles.btnPrimary}>+ New Ticket</Link>
          </div>

          {isExecutorView && tab && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
              {tab.status_options.map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`${styles.tabBtn} ${statusFilter === s ? styles.tabBtnActive : ""}`} style={{ border: "1px solid var(--border)", borderRadius: 6 }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : visibleTickets.length === 0 ? (
            <div className={styles.emptyState}>{isExecutorView ? `No tickets with status "${statusFilter}".` : "No tickets yet."}</div>
          ) : (
            <>
            <table className={styles.table}>
              <thead>
                <tr><th>Release (DID)</th><th>Release</th><th>Propose Package</th><th>PIC</th><th>Deadline</th><th>Status</th></tr>
              </thead>
              <tbody>
                {pagedTickets.map((t) => {
                  const color = statusColor(t.status);
                  const rel = releasesByDid[t.data?.releaseId];
                  return (
                    <tr key={t.id} onClick={() => setOpenTicket(t)} style={{ cursor: "pointer" }}>
                      <td><span className={styles.rowLink}>{t.data?.releaseId}</span></td>
                      <td style={{ fontSize: 11, lineHeight: 1.5 }}>
                        {rel ? (
                          <>
                            <div style={{ color: "var(--text-muted)", fontWeight: 700 }}>{rel.title} - {rel.main_artist}</div>
                            <div style={{ color: "var(--text-faint)" }}>Label: {rel.label || "—"}</div>
                            <div style={{ color: "var(--text-faint)" }}>{fmtDate(rel.release_date)} {rel.release_time || ""}</div>
                          </>
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>
                      <td>{t.data?.proposedPackage || "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isExecutorView ? (
                          <select className={styles.select} style={{ padding: "4px 8px", fontSize: 12 }} value={t.pic_profile_id || ""} onChange={(e) => updatePic(t, e.target.value)}>
                            <option value="">— Unassigned —</option>
                            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        ) : (t.profiles?.name || "—")}
                      </td>
                      <td>{fmtDate(t.deadline)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isExecutorView ? (
                          <select value={t.status} onChange={(e) => updateStatus(t, e.target.value)} style={{ background: color.bg, color: color.fg, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>
                            {tab.status_options.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span className={styles.statusBadge} style={{ background: color.bg, color: color.fg }}>{t.status}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} totalPages={totalPages} totalRows={totalRows} styles={styles} />
            </>
          )}
        </div>
      </div>

      {openTicket && (
        <PackageBuilderPopup
          ticket={openTicket}
          onClose={() => setOpenTicket(null)}
          onStatusChange={(newStatus) => { updateStatus(openTicket, newStatus); setOpenTicket((t) => ({ ...t, status: newStatus })); }}
        />
      )}
    </AppShell>
  );
}

const CATEGORY_ORDER = ["Social", "Community", "Ads"];
const PLATFORMS = ["Facebook", "Instagram", "TikTok", "YouTube", "Thread"];
const PHASES = [
  ["count_tung_hint", "Tung Hint"],
  ["count_out_now", "Out Now"],
  ["count_listen_now", "Listen Now"],
  ["count_addin_post", "Add-in Post"],
];
const PHASE_GROUPS = [["Pre-release", 1], ["Release", 2], ["Post-release", 1]];
// Which phase key starts each group — used to draw a real separator line
// through the sub-header AND every body row, not just the top label row
// (a label-only border doesn't actually look like a separator once there's
// data underneath it).
const PHASE_GROUP_START_KEYS = new Set((() => {
  const starts = [];
  let idx = 0;
  for (const [, span] of PHASE_GROUPS) {
    starts.push(PHASES[idx][0]);
    idx += span;
  }
  return starts;
})());
const BRANDS = ["VIEENT", "ENVI"];
// Community's own brand bracket — flat list (no In-house/Partner grouping
// like TikTok Channel), same pattern as Social's VIEENT/ENVI toggle.
const COMMUNITY_BRANDS = ["PAGE BOLERO / MT", "PAGE VPOP", "PAGE INDIE"];

// TikTok Channel's structure — 2 fixed groups, each with 4 fixed brands,
// each brand always has the same 5 fixed sub-channel rows. Not
// user-configurable (unlike package_categories/booking_channels), these
// are specific to this one Hạng Mục.
const TIKTOK_GROUPS = {
  "In-house": ["TIKTOK BOLERO / MT", "TIKTOK VPOP", "TIKTOK INDIE", "CAPCUT"],
  "Partner": ["EXT TIKTOK - BK MUSIC", "EXT TIKTOK - DUCTH", "EXT TIKTOK - BK GROUP", "EXT TIKTOK - CTV MẪU"],
};
const TIKTOK_ALL_BRANDS = Object.values(TIKTOK_GROUPS).flat();
const TIKTOK_SUBCHANNELS = ["TIKTOK NEWS", "TIKTOK CAPCUT", "MẪU CAPCUT", "TIKTOK REUP MV", "TIKTOK LYRICS"];

// Ads' 4 ad-platform groups — always shown together (no single "selected
// brand" toggle like Social/Community/TikTok), each with its own fixed
// metric list and its own color. Metric names double as the row label
// (entry.platform) AND the pickable "+ button" tag; entry.brand holds the
// group name. Unlike every other Hạng Mục, pricing (Đơn Giá) happens right
// here at the entry level, not later in the package-line stage — see
// handleSummarize's Ads branch and BuildPackagePopup's Ads-line special
// case for why.
const ADS_BRANDS = ["Facebook Ads", "YouTube Ads", "TikTok Ads", "Spotify Ads"];
const ADS_BRAND_COLORS = {
  "Facebook Ads": "#1a7a4c",
  "YouTube Ads": "#c9b91a",
  "TikTok Ads": "#e0672c",
  "Spotify Ads": "#3f7de0",
};
const ADS_METRICS = {
  "Facebook Ads": ["Lượt tiếp cận", "Lượt tương tác", "Lượt truy cập (Link click)"],
  "YouTube Ads": ["Thruplays (Views)"],
  "TikTok Ads": ["Lượt tiếp cận", "Lượt xem video", "Lượt theo dõi", "Lượt truy cập (Link click)"],
  "Spotify Ads": ["HPTO", "In-Stream Audio", "In-Stream Video", "In-Feed Display", "In-Feed Video"],
};

// Reference layout (team-supplied picture): EXTERNAL group first (= the
// "Partner" group internally), then INTERNAL (= "In-house"), each brand
// cell colored distinctly. Display order/labels differ from TIKTOK_GROUPS'
// own keys, so mapped here rather than renamed at the source.
const TIKTOK_COUNTS_GROUP_ORDER = ["Partner", "In-house"];
const TIKTOK_COUNTS_GROUP_LABELS = { "Partner": "EXTERNAL", "In-house": "INTERNAL" };
const TIKTOK_COUNTS_BRAND_COLORS = {
  "EXT TIKTOK - BK MUSIC": "#5b7fdb",
  "EXT TIKTOK - DUCTH": "#5b7fdb",
  "EXT TIKTOK - BK GROUP": "#5b7fdb",
  "EXT TIKTOK - CTV MẪU": "#5b7fdb",
  "TIKTOK BOLERO / MT": "#2f6b4f",
  "TIKTOK VPOP": "#d9c22e",
  "TIKTOK INDIE": "#3fa7a0",
  "CAPCUT": "#e07b39",
};

// The small "how many things has been added per Hạng Mục" popup that sits
// right below the DSP grid once a category has been summarized at least
// once. Shape differs per category: TikTok Channel groups by
// External/Internal → brand (matches the reference picture exactly);
// Social (VIEENT/ENVI) and Community (PAGE BOLERO/MT, PAGE VPOP, PAGE
// INDIE) are both flat brand rows via brandList/currentBrand; Ads has no
// brand bracket at all, so it's a single total.
function CategoryCountsPopup({ isTikTokChannel, isAds, brandList, currentBrand, categoryTotals, tiktokBrandTotals, tiktokBrand }) {
  if (isTikTokChannel) {
    const orderedBrands = TIKTOK_COUNTS_GROUP_ORDER.flatMap((g) => TIKTOK_GROUPS[g]);
    return (
      <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "flex" }}>
          {TIKTOK_COUNTS_GROUP_ORDER.map((g) => (
            <div key={g} style={{ flex: TIKTOK_GROUPS[g].length, background: "#141414", color: "#fff", textAlign: "center", fontSize: 11, fontWeight: 700, padding: "6px 0", letterSpacing: 0.5 }}>
              {TIKTOK_COUNTS_GROUP_LABELS[g]}
            </div>
          ))}
        </div>
        <div style={{ display: "flex" }}>
          {orderedBrands.map((b) => (
            <div key={b} style={{ flex: 1, background: TIKTOK_COUNTS_BRAND_COLORS[b], color: "#fff", textAlign: "center", fontSize: 10, fontWeight: 700, padding: "6px 4px" }}>
              {b}
            </div>
          ))}
        </div>
        <div style={{ display: "flex" }}>
          {orderedBrands.map((b) => (
            <div key={b} style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 700, padding: "8px 4px", background: b === tiktokBrand ? "rgba(255,107,26,0.1)" : "var(--bg-card)", borderTop: "1px solid var(--border)" }}>
              {tiktokBrandTotals[b] || 0}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (brandList && brandList.length > 0) {
    return (
      <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "flex" }}>
          {brandList.map((b) => (
            <div key={b} style={{ flex: 1, background: "#141414", color: "#fff", textAlign: "center", fontSize: 11, fontWeight: 700, padding: "6px 4px" }}>{b}</div>
          ))}
        </div>
        <div style={{ display: "flex" }}>
          {brandList.map((b) => (
            <div key={b} style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 700, padding: "8px 0", background: b === currentBrand ? "rgba(255,107,26,0.1)" : "var(--bg-card)", borderTop: "1px solid var(--border)" }}>{categoryTotals[b] || 0}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{isAds ? "Tổng Số Lượng (mọi metric)" : "Số Lượng Bài Đăng"}</span>
      <strong style={{ fontSize: 15 }}>{categoryTotals[""] || 0}</strong>
    </div>
  );
}

// This is the corrected, from-scratch rebuild, now living inside the
// Media Booking ticket (replacing the old Template/Content-Plan modes
// entirely) — gated the same way the ticket itself always was, not by
// Send Upload.
function PackageBuilderPopup({ ticket, onClose, onStatusChange }) {
  const [release, setRelease] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [brand, setBrand] = useState("VIEENT");
  const [communityBrand, setCommunityBrand] = useState(COMMUNITY_BRANDS[0]);
  const [adsBrand, setAdsBrand] = useState(ADS_BRANDS[0]); // which of the 4 colored ad-platform groups is shown — display only, doesn't filter what's fetched/summarized (Ads still mushes all 4 into one rollup)
  const [tiktokGroup, setTiktokGroup] = useState("In-house");
  const [tiktokBrand, setTiktokBrand] = useState(TIKTOK_GROUPS["In-house"][0]);
  const [tiktokBrandTotals, setTiktokBrandTotals] = useState({}); // brand name -> total_posts, for the live comparison popup
  const [categoryTotals, setCategoryTotals] = useState({}); // brand ("" for non-branded categories) -> total_posts, for the currently selected non-TikTok category
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [summarizedCategoryIds, setSummarizedCategoryIds] = useState(new Set()); // which categories have EVER been summarized (persisted)
  const [skippedCategoryIds, setSkippedCategoryIds] = useState(new Set()); // subset of the above that were Skip'd rather than really summarized
  const [dot2Targets, setDot2Targets] = useState(null); // { creation_target, links_paid_target } for TikTok Channel on this release, or null if never set
  const [showDot2Popup, setShowDot2Popup] = useState(false);
  const [magicLinkUrl, setMagicLinkUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBuildPopup, setShowBuildPopup] = useState(false);

  // Package-building state — lives here now (not in a separate BuildPackagePopup
  // overlay) so the DSP grid (the real live data tool) and the Packages panel
  // sit side by side in ONE screen, and an "Add to Package" button next to
  // Summarize/Skip can act on whichever Hạng Mục/brand is currently selected.
  const [summarizedRows, setSummarizedRows] = useState([]); // full media_booking_package_categories rows (with category name) for package building
  const [packages, setPackages] = useState([]);
  const [activePackageId, setActivePackageId] = useState(null);
  const [referenceTiers, setReferenceTiers] = useState([]);
  const [namePopup, setNamePopup] = useState(null); // null | "create" | "clone"
  const [generatingLink, setGeneratingLink] = useState(false);
  const [priceDefaults, setPriceDefaults] = useState(DEFAULT_UNIT_PRICES); // overridden by Config → Media Booking Pricing once saved there

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const isSocial = selectedCategory?.name === "Social";
  const isCommunity = selectedCategory?.name === "Community";
  const isTikTokChannel = selectedCategory?.name === "TikTok Channel";
  const isAds = selectedCategory?.name === "Ads";
  const rowOptions = isTikTokChannel ? TIKTOK_SUBCHANNELS : PLATFORMS;
  const currentBrand = isSocial ? brand : isCommunity ? communityBrand : isAds ? adsBrand : null;
  // Ads now rolls up per ad-platform brand (Facebook/YouTube/TikTok/Spotify
  // Ads), not one mushed '' total — see handleSummarize's Ads branch — so
  // it needs a real brandList too, same as Social/Community, for the
  // counts popup below Summarize to show real per-brand numbers.
  const brandList = isSocial ? BRANDS : isCommunity ? COMMUNITY_BRANDS : isAds ? ADS_BRANDS : null;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: rel } = await supabase.from("releases").select("*").eq("did", ticket.data?.releaseId).maybeSingle();
      setRelease(rel);
      const { data: cats } = await supabase.from("package_categories").select("*").order("sort_order");
      setCategories(cats || []);
      if (cats && cats.length > 0) setSelectedCategoryId(cats[0].id);

      // Round 54 — Config-editable default Đơn Giá (falls back to
      // DEFAULT_UNIT_PRICES above if never saved, or if global_settings
      // itself doesn't have this key yet).
      const { data: priceSetting } = await supabase.from("global_settings").select("value").eq("key", UNIT_PRICE_DEFAULTS_SETTING_KEY).maybeSingle();
      if (priceSetting?.value) {
        try {
          const parsed = JSON.parse(priceSetting.value);
          setPriceDefaults({ categories: { ...DEFAULT_UNIT_PRICES.categories, ...(parsed.categories || {}) }, ads: { ...DEFAULT_UNIT_PRICES.ads, ...(parsed.ads || {}) } });
        } catch {
          // malformed value — keep the hardcoded fallback rather than crash
        }
      }
      if (rel) {
        const [{ data: rollups }, { data: pkgs }, { data: tiers }, { data: link }] = await Promise.all([
          supabase.from("media_booking_package_categories").select("*, package_categories(name)").eq("release_id", rel.id),
          supabase.from("media_booking_packages").select("*, media_booking_package_lines(*)").eq("release_id", rel.id).order("sort_order"),
          supabase.from("contract_type_packages").select("contract_type, items"),
          supabase.from("magic_links").select("token").eq("release_id", rel.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        setSummarizedRows(rollups || []);
        setSummarizedCategoryIds(new Set((rollups || []).map((r) => r.category_id)));
        // A category can have both a real (non-skipped) row and a skipped
        // row across different brands — only treat it as "skipped" in the
        // sidebar if every row for it is a skip, not a real Summarize.
        const byCategory = {};
        (rollups || []).forEach((r) => { byCategory[r.category_id] = byCategory[r.category_id] ?? true; byCategory[r.category_id] = byCategory[r.category_id] && r.skipped; });
        setSkippedCategoryIds(new Set(Object.keys(byCategory).filter((id) => byCategory[id])));
        setPackages(pkgs || []);
        if (pkgs && pkgs.length > 0) setActivePackageId(pkgs[0].id);
        setReferenceTiers(tiers || []);
        if (link) setMagicLinkUrl(`${window.location.origin}/pick-package/${link.token}`);
      }
      setLoading(false);
    })();
  }, []);

  // Re-fetches just the rollup rows — called after handleSummarize/handleSkip
  // write new totals, so the "Add to Package" button and the grouped
  // package-building data always reflect the latest Summarize, without a
  // full-page reload.
  async function refreshSummarizedRows() {
    if (!release) return [];
    const { data: rollups } = await supabase.from("media_booking_package_categories").select("*, package_categories(name)").eq("release_id", release.id);
    setSummarizedRows(rollups || []);
    return rollups || [];
  }

  useEffect(() => {
    if (!selectedCategoryId || !release) return;
    (async () => {
      if (isTikTokChannel) {
        // Rows are user-added now (picker of the 5 sub-channel names, same
        // pattern as every other Hạng Mục's +Platform buttons) — no more
        // auto-inserting a fixed 5 per brand.
        const { data } = await supabase
          .from("media_booking_content_entries")
          .select("*")
          .eq("release_id", release.id)
          .eq("category_id", selectedCategoryId)
          .eq("brand", tiktokBrand)
          .order("sort_order");
        setEntries(data || []);
        setSummary(null);

        // Live totals for every brand, for the comparison popup below Summarize.
        const { data: rollups } = await supabase.from("media_booking_package_categories").select("brand, total_posts").eq("release_id", release.id).eq("category_id", selectedCategoryId);
        const totals = {};
        TIKTOK_ALL_BRANDS.forEach((b) => (totals[b] = 0));
        (rollups || []).forEach((r) => { if (r.brand) totals[r.brand] = r.total_posts; });
        setTiktokBrandTotals(totals);

        // Đợt 2 targets — scoped to (release, category), not brand.
        const { data: targets } = await supabase.from("media_booking_dot2_targets").select("creation_target, links_paid_target").eq("release_id", release.id).eq("category_id", selectedCategoryId).maybeSingle();
        setDot2Targets(targets || null);
        return;
      }

      let query = supabase.from("media_booking_content_entries").select("*").eq("release_id", release.id).eq("category_id", selectedCategoryId);
      if (isSocial) query = query.eq("brand", brand);
      if (isCommunity) query = query.eq("brand", communityBrand);
      const { data } = await query.order("sort_order");
      setEntries(data || []);
      setSummary(null);

      // Live per-brand totals for this category, for the small counts popup
      // below Summarize. Social/Community have real brand brackets; Ads
      // always rolls up under the empty-string brand — see lesson in §7
      // about NULL vs '' inside the composite unique constraint.
      const { data: rollups } = await supabase.from("media_booking_package_categories").select("brand, total_posts").eq("release_id", release.id).eq("category_id", selectedCategoryId);
      const totals = {};
      if (brandList) brandList.forEach((b) => (totals[b] = 0));
      else totals[""] = 0;
      (rollups || []).forEach((r) => { totals[r.brand ?? ""] = r.total_posts; });
      setCategoryTotals(totals);
    })();
  }, [selectedCategoryId, brand, communityBrand, tiktokBrand, release]);

  // brandOverride is only used by Ads — its "brand" is picked per-click
  // (which of the 4 colored ad-group mini-tables the + button lives in),
  // not from a single selected-brand state like every other category.
  async function addRow(platform, brandOverride) {
    const rowBrand = brandOverride ?? (isSocial ? brand : isCommunity ? communityBrand : isTikTokChannel ? tiktokBrand : "");
    // Round 54 — Ads rows seed their Đơn Giá from the configured default
    // for this (ad brand, metric) pair instead of starting at 0, so
    // whoever's filling this in doesn't have to look the price up and
    // type it in by hand every time. Still freely editable afterward —
    // this is only what a brand-new row starts at.
    const defaultUnitPrice = isAds ? priceDefaults.ads[rowBrand]?.[platform] ?? null : null;
    const { data } = await supabase
      .from("media_booking_content_entries")
      .insert({ release_id: release.id, category_id: selectedCategoryId, platform, brand: rowBrand, unit_price: defaultUnitPrice, sort_order: entries.length })
      .select()
      .single();
    if (data) setEntries((prev) => [...prev, data]);
    setSummary(null);
  }

  // Fixed the real bug — every phase count lives on the same row now, so
  // editing one never touches the others.
  async function updateEntryCount(entry, field, value) {
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, [field]: value } : e)));
    await supabase.from("media_booking_content_entries").update({ [field]: value }).eq("id", entry.id);
    setSummary(null);
  }

  async function removeEntry(entry) {
    await supabase.from("media_booking_content_entries").delete().eq("id", entry.id);
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    setSummary(null);
  }

  // Summarize both computes the on-screen rollup AND persists a
  // lightweight marker (total posts) — that persisted marker is what the
  // "all 4 categories" gate below checks, so it survives closing and
  // reopening the ticket. TikTok Channel uses a different formula (per-row
  // (sum of phases) × channel count, not just an additive row count) and
  // rolls up per-brand instead of per-platform.
  async function handleSummarize() {
    if (isTikTokChannel) {
      // Đợt 1 only — Số Kênh × Số Bài per row. Đợt 2's own pair is tracked
      // separately (see saveDot2Targets) and never feeds this total.
      const rows = entries.map((e) => ({
        ...e,
        totalPosts: (e.channel_count || 0) * (e.count_posts || 0),
      }));
      setSummary(rows);
      const brandTotal = rows.reduce((sum, r) => sum + r.totalPosts, 0);

      await supabase.from("media_booking_package_categories").upsert(
        { release_id: release.id, category_id: selectedCategoryId, brand: tiktokBrand, total_posts: brandTotal, skipped: false, updated_at: new Date().toISOString() },
        { onConflict: "release_id,category_id,brand" }
      );
      setTiktokBrandTotals((prev) => ({ ...prev, [tiktokBrand]: brandTotal }));
      setSummarizedCategoryIds((prev) => new Set(prev).add(selectedCategoryId));
      setSkippedCategoryIds((prev) => { const next = new Set(prev); next.delete(selectedCategoryId); return next; });
      // Sync into the active package with the CUMULATIVE total across every
      // sub-brand summarized so far (not just this one), same total the
      // old manual "Add to Package" button used — mushed across all 8
      // TikTok Channel sub-brands into one package line.
      const freshRows = await refreshSummarizedRows();
      const freshGroup = groupSummarizedRows(freshRows).find((g) => g.categoryId === selectedCategoryId);
      await syncPackageLine(freshGroup);
      return;
    }

    if (isAds) {
      // Pricing lives at the entry level here (Số Lượng × Đơn Giá per
      // metric row). Rolls up PER ad-platform brand now (Facebook/
      // YouTube/TikTok/Spotify Ads each get their own row) rather than one
      // mushed '' total — matches the package builder now keeping Ads as
      // separate brand lines while every other Hạng Mục combines into one
      // (see BuildPackagePopup). Only brands with at least one filled-in
      // metric get a row — an ad-platform group nobody touched doesn't
      // leave a stray 0 row behind.
      const rows = entries.map((e) => ({ ...e, amount: (e.count_posts || 0) * (e.unit_price || 0) }));
      setSummary(rows);

      const totalsByBrand = {};
      for (const adsBrandKey of ADS_BRANDS) {
        const brandRows = rows.filter((r) => r.brand === adsBrandKey);
        const totalMoney = brandRows.reduce((sum, r) => sum + r.amount, 0);
        const totalQty = brandRows.reduce((sum, r) => sum + (r.count_posts || 0), 0);
        // Round 54 — item A.5: include the actual số lượng in each piece,
        // not just the metric name, so the right-panel Chi Tiết reads
        // "SL 30 Lượt tiếp cận; SL 300 Lượt tương tác" instead of just
        // naming which metrics were filled in.
        const detailText = brandRows.filter((r) => (r.count_posts || 0) > 0).map((r) => `SL ${r.count_posts} ${r.platform}`).join("; ");
        if (brandRows.length === 0 || (totalQty === 0 && !detailText)) continue;
        totalsByBrand[adsBrandKey] = totalQty;
        await supabase.from("media_booking_package_categories").upsert(
          { release_id: release.id, category_id: selectedCategoryId, brand: adsBrandKey, total_posts: totalQty, total_money: totalMoney, detail_text: detailText || null, skipped: false, updated_at: new Date().toISOString() },
          { onConflict: "release_id,category_id,brand" }
        );
        // Ads never mushes brands together — sync this brand's own line
        // straight in, using the numbers just computed (no refetch needed).
        await syncPackageLine({ key: `${selectedCategoryId}::${adsBrandKey}`, categoryId: selectedCategoryId, categoryName: "Ads", isAds: true, brand: adsBrandKey, totalMoney, detailText });
      }
      setCategoryTotals((prev) => ({ ...prev, ...totalsByBrand }));
      setSummarizedCategoryIds((prev) => new Set(prev).add(selectedCategoryId));
      setSkippedCategoryIds((prev) => { const next = new Set(prev); next.delete(selectedCategoryId); return next; });
      await refreshSummarizedRows();
      return;
    }

    const byPlatform = {};
    PLATFORMS.forEach((p) => (byPlatform[p] = { platform: p, channelCount: 0, totalPosts: 0 }));
    entries.forEach((e) => {
      if (!e.platform) return;
      // channel_count defaults to 1 and stays that way for Social (no
      // Số Kênh column there) — so summing it is equivalent to counting
      // rows for every category except Community, where it's now editable.
      byPlatform[e.platform].channelCount += e.channel_count || 1;
      byPlatform[e.platform].totalPosts += PHASES.reduce((sum, [key]) => sum + (e[key] || 0), 0);
    });
    const rows = PLATFORMS.map((p) => byPlatform[p]).filter((r) => r.channelCount > 0);
    setSummary(rows);

    const totalPosts = rows.reduce((sum, r) => sum + r.totalPosts, 0);
    const rollupBrand = isSocial ? brand : isCommunity ? communityBrand : "";
    await supabase.from("media_booking_package_categories").upsert(
      { release_id: release.id, category_id: selectedCategoryId, brand: rollupBrand, total_posts: totalPosts, skipped: false, updated_at: new Date().toISOString() },
      { onConflict: "release_id,category_id,brand" }
    );
    setCategoryTotals((prev) => ({ ...prev, [rollupBrand]: totalPosts }));
    setSummarizedCategoryIds((prev) => new Set(prev).add(selectedCategoryId));
    setSkippedCategoryIds((prev) => { const next = new Set(prev); next.delete(selectedCategoryId); return next; });
    // Social/Community mush every brand bracket together into ONE package
    // line, same as TikTok Channel above — sync with the cumulative total
    // across every brand summarized so far for this Hạng Mục, not just the
    // one just saved.
    const freshRows = await refreshSummarizedRows();
    const freshGroup = groupSummarizedRows(freshRows).find((g) => g.categoryId === selectedCategoryId);
    await syncPackageLine(freshGroup);
  }

  // "Skip" — marks a Hạng Mục as intentionally not applicable, satisfying
  // the same all-4-Hạng-Mục gate as a real Summarize without needing any
  // entries. Disabled once real rows exist (see the button below) so it
  // can't accidentally stomp real data with a 0.
  async function handleSkip() {
    const rollupBrand = isTikTokChannel ? "" : isSocial ? brand : isCommunity ? communityBrand : "";
    await supabase.from("media_booking_package_categories").upsert(
      { release_id: release.id, category_id: selectedCategoryId, brand: rollupBrand, total_posts: 0, skipped: true, updated_at: new Date().toISOString() },
      { onConflict: "release_id,category_id,brand" }
    );
    setSummarizedCategoryIds((prev) => new Set(prev).add(selectedCategoryId));
    setSkippedCategoryIds((prev) => new Set(prev).add(selectedCategoryId));
    await refreshSummarizedRows();
  }

  // Đợt 2 targets save immediately on blur, same convention as everywhere
  // else here — no separate Save step.
  async function saveDot2Targets(patch) {
    const merged = { ...dot2Targets, ...patch };
    setDot2Targets(merged);
    await supabase.from("media_booking_dot2_targets").upsert(
      { release_id: release.id, category_id: selectedCategoryId, ...merged, updated_at: new Date().toISOString() },
      { onConflict: "release_id,category_id" }
    );
  }

  const allCategoriesSummarized = categories.length > 0 && categories.every((c) => summarizedCategoryIds.has(c.id));

  // --- Package building — was BuildPackagePopup's own state/logic, moved
  // up here so the DSP grid (this component's real data-entry tool) and the
  // Packages panel can sit side by side and share the same "Add to Package"
  // action, instead of two separate overlays with their own duplicate
  // "Summarized Hạng Mục" picker in between. ---

  const activePackage = packages.find((p) => p.id === activePackageId);
  const isIntMedia = activePackage?.name === "INT MEDIA";

  async function createPackage(name, cloneFromId) {
    const { data: pkg } = await supabase.from("media_booking_packages").insert({ release_id: release.id, name, sort_order: packages.length }).select().single();
    if (!pkg) return;
    let lines = [];
    if (cloneFromId) {
      const source = packages.find((p) => p.id === cloneFromId);
      const cloneRows = (source?.media_booking_package_lines || []).map((l, i) => ({
        package_id: pkg.id, category_id: l.category_id, brand: l.brand, unit: l.unit, quantity: l.quantity, detail: l.detail, amount: l.amount, sort_order: i,
      }));
      if (cloneRows.length > 0) {
        const { data: inserted } = await supabase.from("media_booking_package_lines").insert(cloneRows).select();
        lines = inserted || [];
      }
    }
    setPackages((prev) => [...prev, { ...pkg, media_booking_package_lines: lines }]);
    setActivePackageId(pkg.id);
    setNamePopup(null);
  }

  async function deletePackage(pkg) {
    if (!window.confirm(`Delete package "${pkg.name}"? This can't be undone.`)) return;
    await supabase.from("media_booking_packages").delete().eq("id", pkg.id);
    setPackages((prev) => {
      const next = prev.filter((p) => p.id !== pkg.id);
      if (activePackageId === pkg.id) setActivePackageId(next[0]?.id || null);
      return next;
    });
  }

  function lineFor(categoryId, brand) {
    return (activePackage?.media_booking_package_lines || []).find((l) => l.category_id === categoryId && (l.brand || "") === (brand || ""));
  }

  // Every OTHER Hạng Mục mushes its brand rows into ONE combined package
  // line (brand '') when building — Social's VIEENT+ENVI, Community's 3
  // page brands, TikTok Channel's 8 sub-brands all become a single row
  // with a summed quantity, since the built package/magic link never
  // needs the brand breakdown. Ads is the one exception — since
  // handleSummarize now rolls it up per ad-platform brand (Facebook/
  // YouTube/TikTok/Spotify Ads), it keeps one group per summarized row,
  // i.e. one line per brand, on purpose.
  function groupSummarizedRows(rows) {
    const groups = {};
    rows.forEach((r) => {
      const categoryName = r.package_categories?.name || "";
      if (categoryName === "Ads") {
        const key = `${r.category_id}::${r.brand || ""}`;
        groups[key] = { key, categoryId: r.category_id, categoryName, isAds: true, brand: r.brand, totalPosts: r.total_posts, detailText: r.detail_text, totalMoney: r.total_money, rows: [r] };
      } else {
        const key = r.category_id;
        if (!groups[key]) groups[key] = { key, categoryId: r.category_id, categoryName, isAds: false, brand: "", totalPosts: 0, rows: [] };
        groups[key].totalPosts += r.total_posts || 0;
        groups[key].rows.push(r);
      }
    });
    return Object.values(groups);
  }

  // The group matching whatever Hạng Mục/brand is currently selected in the
  // DSP grid. null until that Hạng Mục has been summarized at least once
  // (nothing to sync into a package yet).
  function currentGroup() {
    const groups = groupSummarizedRows(summarizedRows);
    if (isAds) return groups.find((g) => g.categoryId === selectedCategoryId && g.brand === adsBrand) || null;
    return groups.find((g) => g.categoryId === selectedCategoryId) || null;
  }

  // Round 54 — item A.3: Summarize now syncs straight into whichever
  // package tab is active, instead of requiring a separate "Add to
  // Package" click. If there's no active package yet (nobody's clicked
  // "Create Package" for this release), this is a no-op — Summarize just
  // records the rollup in media_booking_package_categories as before, and
  // nothing gets added anywhere until a package actually exists.
  //
  // Upserts rather than always inserting: re-Summarizing the same Hạng
  // Mục/brand after editing numbers updates the existing line's
  // quantity/detail/amount in place rather than creating a duplicate.
  // Đơn Giá is only ever SET on first insert (from the configured
  // default) — an update never touches unit_price, so re-Summarizing
  // can't clobber an edit someone already made in the building panel.
  async function syncPackageLine(group) {
    if (!activePackage || !group) return;
    const existing = lineFor(group.categoryId, group.brand);
    if (group.isAds) {
      // Ads mushes into one line PER BRAND with a pre-computed Chi Tiết +
      // Thành Tiền straight from Summarize's per-brand pricing — no unit/
      // quantity, no reference-template lookup, nothing to compute later.
      if (existing) {
        const patch = { detail: group.detailText || null, amount: group.totalMoney ?? null };
        await supabase.from("media_booking_package_lines").update(patch).eq("id", existing.id);
        setPackages((prev) => prev.map((p) => (p.id !== activePackage.id ? p : { ...p, media_booking_package_lines: p.media_booking_package_lines.map((l) => (l.id === existing.id ? { ...l, ...patch } : l)) })));
      } else {
        const insertPayload = {
          package_id: activePackage.id, category_id: group.categoryId, brand: group.brand,
          unit: null, quantity: null, detail: group.detailText || null, amount: group.totalMoney ?? null,
          sort_order: (activePackage.media_booking_package_lines || []).length,
        };
        const { data: line } = await supabase.from("media_booking_package_lines").insert(insertPayload).select().single();
        if (line) setPackages((prev) => prev.map((p) => (p.id !== activePackage.id ? p : { ...p, media_booking_package_lines: [...(p.media_booking_package_lines || []), line] })));
      }
      return;
    }
    const categoryName = group.categoryName;
    if (existing) {
      const patch = { quantity: group.totalPosts };
      const amount = computeLineAmount({ ...existing, ...patch });
      const fullPatch = { ...patch, amount };
      await supabase.from("media_booking_package_lines").update(fullPatch).eq("id", existing.id);
      setPackages((prev) => prev.map((p) => (p.id !== activePackage.id ? p : { ...p, media_booking_package_lines: p.media_booking_package_lines.map((l) => (l.id === existing.id ? { ...l, ...fullPatch } : l)) })));
    } else {
      const unitPrice = priceDefaults.categories[categoryName] ?? null;
      const insertPayload = {
        package_id: activePackage.id, category_id: group.categoryId, brand: "",
        unit: referenceDetailFor(referenceTiers, categoryName)?.unit || "Bài Đăng",
        quantity: group.totalPosts, detail: referenceDetailFor(referenceTiers, categoryName)?.detail || null,
        unit_price: unitPrice, amount: unitPrice != null ? unitPrice * (group.totalPosts || 0) : null,
        sort_order: (activePackage.media_booking_package_lines || []).length,
      };
      const { data: line } = await supabase.from("media_booking_package_lines").insert(insertPayload).select().single();
      if (line) setPackages((prev) => prev.map((p) => (p.id !== activePackage.id ? p : { ...p, media_booking_package_lines: [...(p.media_booking_package_lines || []), line] })));
    }
  }

  // Generic field-level line editor — writes to DB the moment a value
  // changes. Recomputes and persists Thành Tiền alongside every write since
  // it's always derived, never typed directly.
  async function updateLine(line, patch) {
    const merged = { ...line, ...patch };
    const cat = categories.find((c) => c.id === line.category_id);
    // Ads lines are mushed and pre-priced at Summarize time (amount comes
    // from media_booking_package_categories.total_money) — they never carry
    // a unit_price here, so the generic computeLineAmount() would always
    // null the amount out the moment someone edits Chi Tiết. Skip recompute
    // for Ads and just keep whatever amount the line already has.
    const isAdsLine = cat?.name === "Ads";
    const amount = isAdsLine ? line.amount : computeLineAmount(merged);
    const fullPatch = { ...patch, amount };
    await supabase.from("media_booking_package_lines").update(fullPatch).eq("id", line.id);
    setPackages((prev) => prev.map((p) => (p.id !== activePackageId ? p : { ...p, media_booking_package_lines: p.media_booking_package_lines.map((l) => (l.id === line.id ? { ...l, ...fullPatch } : l)) })));
  }

  // "Convert to Package" — 2-way toggle, flips the Thành Tiền formula
  // between Đơn Giá × Tổng Số Bài Đăng and Đơn Giá × Số Gói. Free to flip
  // back anytime, writes immediately either way.
  function toggleLinePricing(line) {
    updateLine(line, { is_package_priced: !line.is_package_priced });
  }

  async function addPrebuiltLine(addon) {
    if (!activePackage) return;
    const { data: line } = await supabase
      .from("media_booking_package_lines")
      .insert({
        package_id: activePackage.id, category_id: null, platform: addon.name, brand: "",
        unit: addon.unit, quantity: 1, detail: addon.detail, amount: null,
        sort_order: (activePackage.media_booking_package_lines || []).length,
      })
      .select()
      .single();
    if (line) setPackages((prev) => prev.map((p) => (p.id !== activePackage.id ? p : { ...p, media_booking_package_lines: [...(p.media_booking_package_lines || []), line] })));
  }

  async function deleteLine(line) {
    await supabase.from("media_booking_package_lines").delete().eq("id", line.id);
    setPackages((prev) => prev.map((p) => (p.id !== activePackageId ? p : { ...p, media_booking_package_lines: p.media_booking_package_lines.filter((l) => l.id !== line.id) })));
  }

  // Round 54 — item A.4: drag-to-reorder Hạng Mục rows in the Packages
  // panel. Takes the FULL line array already in its new order (the caller —
  // PackagesPanel's drag handlers — does the array move) and just persists
  // fresh 0..n-1 sort_order values against that order.
  async function reorderLines(orderedLines) {
    setPackages((prev) => prev.map((p) => (p.id !== activePackageId ? p : { ...p, media_booking_package_lines: orderedLines.map((l, i) => ({ ...l, sort_order: i })) })));
    await Promise.all(orderedLines.map((l, i) => supabase.from("media_booking_package_lines").update({ sort_order: i }).eq("id", l.id)));
  }

  async function handleGenerateLink() {
    if (!release) return;
    setGeneratingLink(true);
    const { data, error } = await supabase.from("magic_links").insert({ release_id: release.id }).select("token").single();
    setGeneratingLink(false);
    if (!error && data) {
      const url = `${window.location.origin}/pick-package/${data.token}`;
      // "Link Media Report" on the URL tab is no longer hand-typed — it's
      // just wherever the release's magic link points, so keep it in sync
      // the moment a link is generated.
      await supabase.from("releases").update({ link_media_report: url }).eq("id", release.id);
      setMagicLinkUrl(url);
    }
  }

  const hasSavedPackage = packages.length > 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, maxWidth: showBuildPopup ? 1600 : 900, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className={styles.emptyState} style={{ padding: 24 }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
              {/* LEFT — Hạng Mục picker. Narrowed a bit (was 190) when the
                  Packages panel is open, to give that panel more room. */}
              <div style={{ width: showBuildPopup ? 160 : 190, borderRight: "1px solid var(--border)", flexShrink: 0, padding: 16, overflowY: "auto" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 10 }}>Hạng Mục</div>
                {categories.map((c) => {
                  const done = summarizedCategoryIds.has(c.id);
                  const skipped = skippedCategoryIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCategoryId(c.id)}
                      style={{
                        display: "block", width: "100%", textAlign: "left", padding: "8px 10px", fontSize: 13, fontWeight: 700, borderRadius: 6, marginBottom: 4, cursor: "pointer",
                        border: selectedCategoryId === c.id ? "1px solid var(--accent)" : "1px solid transparent",
                        background: selectedCategoryId === c.id ? "rgba(255,107,26,0.1)" : "transparent",
                        color: selectedCategoryId === c.id ? "var(--accent-soft)" : "var(--text)",
                      }}
                    >
                      {c.name} {done && <span style={{ color: skipped ? "var(--text-faint)" : "var(--success-fg)" }}>●</span>}{skipped && <span style={{ fontSize: 9, color: "var(--text-faint)", marginLeft: 4 }}>SKIPPED</span>}
                    </button>
                  );
                })}
                {isSocial && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>Brand</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {BRANDS.map((b) => (
                        <button key={b} onClick={() => setBrand(b)} style={{ flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer", border: brand === b ? "1px solid var(--accent)" : "1px solid var(--border-strong)", background: brand === b ? "rgba(255,107,26,0.1)" : "transparent", color: brand === b ? "var(--accent-soft)" : "var(--text)" }}>
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {isCommunity && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>Brand</div>
                    <div style={{ display: "grid", gap: 4 }}>
                      {COMMUNITY_BRANDS.map((b) => (
                        <button
                          key={b}
                          onClick={() => setCommunityBrand(b)}
                          style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", border: communityBrand === b ? "1px solid var(--accent)" : "1px solid var(--border-strong)", background: communityBrand === b ? "rgba(255,107,26,0.1)" : "transparent", color: communityBrand === b ? "var(--accent-soft)" : "var(--text)" }}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {isAds && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>Ad Platform</div>
                    <div style={{ display: "grid", gap: 4 }}>
                      {ADS_BRANDS.map((b) => {
                        const brandEntryCount = entries.filter((e) => e.brand === b).length;
                        return (
                          <button
                            key={b}
                            onClick={() => setAdsBrand(b)}
                            style={{
                              textAlign: "left", padding: "6px 8px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer",
                              border: adsBrand === b ? `1px solid ${ADS_BRAND_COLORS[b]}` : "1px solid var(--border-strong)",
                              background: adsBrand === b ? ADS_BRAND_COLORS[b] : "transparent",
                              color: adsBrand === b ? "#fff" : "var(--text)",
                            }}
                          >
                            {b} {brandEntryCount > 0 && <span style={{ opacity: 0.8 }}>({brandEntryCount})</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {isTikTokChannel && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>Group</div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
                      {Object.keys(TIKTOK_GROUPS).map((g) => (
                        <button
                          key={g}
                          onClick={() => { setTiktokGroup(g); setTiktokBrand(TIKTOK_GROUPS[g][0]); }}
                          style={{ flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", border: tiktokGroup === g ? "1px solid var(--accent)" : "1px solid var(--border-strong)", background: tiktokGroup === g ? "rgba(255,107,26,0.1)" : "transparent", color: tiktokGroup === g ? "var(--accent-soft)" : "var(--text)" }}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>Brand</div>
                    <div style={{ display: "grid", gap: 4 }}>
                      {TIKTOK_GROUPS[tiktokGroup].map((b) => (
                        <button
                          key={b}
                          onClick={() => setTiktokBrand(b)}
                          style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", border: tiktokBrand === b ? "1px solid var(--accent)" : "1px solid var(--border-strong)", background: tiktokBrand === b ? "rgba(255,107,26,0.1)" : "transparent", color: tiktokBrand === b ? "var(--accent-soft)" : "var(--text)" }}
                        >
                          {b} {tiktokBrandTotals[b] > 0 && <span style={{ color: "var(--success-fg)" }}>●</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT — DSP grid */}
              <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <div className={styles.eyebrow}>// Package Builder</div>
                    <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{release?.title || ticket.data?.releaseId}</h2>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{release?.main_artist} · {selectedCategory?.name}{isSocial ? ` — ${brand}` : ""}{isCommunity ? ` — ${communityBrand}` : ""}{isTikTokChannel ? ` — ${tiktokBrand}` : ""}{isAds ? ` — ${adsBrand}` : ""}</div>
                  </div>
                  <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 20, cursor: "pointer" }}>✕</button>
                </div>

                {!isAds && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                    {rowOptions.map((p) => <button key={p} className={styles.btnSmall} onClick={() => addRow(p)}>+ {p}</button>)}
                  </div>
                )}

                {isAds ? (
                  // Ads keeps its own metric list + Đơn Giá-at-entry-level
                  // shape, but now shows only the ad-platform group picked
                  // in the left "Ad Platform" bracket (same single-active-
                  // brand pattern as Social/Community/TikTok Channel)
                  // instead of stacking all 4 colored tables at once.
                  // Summarize still mushes ALL 4 groups' entries into one
                  // rollup regardless of which is on screen — this is
                  // purely a display change.
                  (() => {
                    const brandEntries = entries.filter((e) => e.brand === adsBrand);
                    return (
                      <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                        <div style={{ background: ADS_BRAND_COLORS[adsBrand], color: "#fff", padding: "8px 12px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          {adsBrand}
                        </div>
                        <div style={{ padding: 10, display: "flex", gap: 6, flexWrap: "wrap", borderBottom: brandEntries.length > 0 ? "1px solid var(--border)" : undefined }}>
                          {ADS_METRICS[adsBrand].map((metric) => (
                            <button key={metric} className={styles.btnSmall} onClick={() => addRow(metric, adsBrand)}>+ {metric}</button>
                          ))}
                        </div>
                        {brandEntries.length > 0 ? (
                          <table className={styles.table}>
                            <thead>
                              <tr><th></th><th>Số Lượng</th><th>Đơn Giá</th><th>Thành Tiền</th><th></th></tr>
                            </thead>
                            <tbody>
                              {brandEntries.map((entry) => (
                                <tr key={entry.id}>
                                  <td style={{ fontSize: 12, fontWeight: 700 }}>{entry.platform}</td>
                                  <td>
                                    <input
                                      type="number"
                                      className={styles.input}
                                      style={{ width: 80, padding: "4px 6px", fontSize: 12 }}
                                      defaultValue={entry.count_posts || 0}
                                      onBlur={(e) => updateEntryCount(entry, "count_posts", parseInt(e.target.value, 10) || 0)}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="number"
                                      className={styles.input}
                                      style={{ width: 90, padding: "4px 6px", fontSize: 12 }}
                                      defaultValue={entry.unit_price || 0}
                                      onBlur={(e) => updateEntryCount(entry, "unit_price", parseFloat(e.target.value) || 0)}
                                    />
                                  </td>
                                  <td style={{ fontSize: 12, fontWeight: 700 }}>{fmtVnd((entry.count_posts || 0) * (entry.unit_price || 0))}</td>
                                  <td><button onClick={() => removeEntry(entry)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>✕</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div style={{ padding: 14, fontSize: 12, color: "var(--text-faint)" }}>No metrics added yet for {adsBrand}.</div>
                        )}
                      </div>
                    );
                  })()
                ) : entries.length === 0 ? (
                  <div className={styles.emptyState}>Pick a DSP above to add a row.</div>
                ) : isTikTokChannel ? (
                  <table className={styles.table} style={{ marginBottom: 14 }}>
                    <thead>
                      <tr>
                        <th rowSpan={2}>Kênh</th>
                        <th colSpan={2} style={{ textAlign: "center" }}>ĐỢT 1</th>
                        <th colSpan={2} style={{ textAlign: "center", borderLeft: "1px solid var(--border)" }}>
                          <button
                            onClick={() => setShowDot2Popup(true)}
                            style={{ background: "none", border: "none", color: "var(--accent-soft)", fontWeight: 700, fontSize: 11, cursor: "pointer", padding: 0, textTransform: "uppercase", letterSpacing: 0.5 }}
                            title="Set Creation cần đạt / Số Link Đã Trả Cần Đạt for Đợt 2"
                          >
                            ĐỢT 2 ⚙
                          </button>
                        </th>
                        {summary && <th rowSpan={2} style={{ borderLeft: "1px solid var(--border)" }}>Số Lượng Bài Đăng</th>}
                        <th rowSpan={2}></th>
                      </tr>
                      <tr>
                        <th style={{ fontSize: 10, fontWeight: 400 }}>Số Kênh</th>
                        <th style={{ fontSize: 10, fontWeight: 400 }}>Số Bài</th>
                        <th style={{ fontSize: 10, fontWeight: 400, borderLeft: "1px solid var(--border)" }}>Số Kênh</th>
                        <th style={{ fontSize: 10, fontWeight: 400 }}>Số Bài</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => {
                        const summaryRow = summary?.find((r) => r.id === entry.id);
                        return (
                          <tr key={entry.id}>
                            <td style={{ fontSize: 12, fontWeight: 700 }}>{entry.platform}</td>
                            <td>
                              <input
                                type="number"
                                className={styles.input}
                                style={{ width: 55, padding: "4px 6px", fontSize: 12 }}
                                defaultValue={entry.channel_count || 0}
                                onBlur={(e) => updateEntryCount(entry, "channel_count", parseInt(e.target.value, 10) || 0)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className={styles.input}
                                style={{ width: 55, padding: "4px 6px", fontSize: 12 }}
                                defaultValue={entry.count_posts || 0}
                                onBlur={(e) => updateEntryCount(entry, "count_posts", parseInt(e.target.value, 10) || 0)}
                              />
                            </td>
                            <td style={{ borderLeft: "1px solid var(--border)" }}>
                              <input
                                type="number"
                                className={styles.input}
                                style={{ width: 55, padding: "4px 6px", fontSize: 12 }}
                                defaultValue={entry.channel_count_dot2 || 0}
                                onBlur={(e) => updateEntryCount(entry, "channel_count_dot2", parseInt(e.target.value, 10) || 0)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className={styles.input}
                                style={{ width: 55, padding: "4px 6px", fontSize: 12 }}
                                defaultValue={entry.count_posts_dot2 || 0}
                                onBlur={(e) => updateEntryCount(entry, "count_posts_dot2", parseInt(e.target.value, 10) || 0)}
                              />
                            </td>
                            {summary && (
                              <td style={{ borderLeft: "1px solid var(--border)", fontWeight: 700 }}>{summaryRow?.totalPosts ?? 0}</td>
                            )}
                            <td><button onClick={() => removeEntry(entry)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>✕</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table className={styles.table} style={{ marginBottom: 14 }}>
                    <thead>
                      <tr>
                        <th rowSpan={2}>DSP</th>
                        {isCommunity && <th rowSpan={2}>Số Kênh</th>}
                        {PHASE_GROUPS.map(([label, span], i) => <th key={label} colSpan={span} style={{ textAlign: "center", borderLeft: i > 0 ? "1px solid var(--border)" : undefined }}>{label}</th>)}
                        <th rowSpan={2}></th>
                      </tr>
                      <tr>{PHASES.map(([key, label]) => <th key={label} style={{ fontSize: 10, fontWeight: 400, borderLeft: PHASE_GROUP_START_KEYS.has(key) ? "1px solid var(--border)" : undefined }}>{label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={entry.id}>
                          <td style={{ fontSize: 12, fontWeight: 700 }}>{entry.platform}</td>
                          {isCommunity && (
                            <td>
                              <input
                                type="number"
                                className={styles.input}
                                style={{ width: 55, padding: "4px 6px", fontSize: 12 }}
                                defaultValue={entry.channel_count ?? 1}
                                onBlur={(e) => updateEntryCount(entry, "channel_count", parseInt(e.target.value, 10) || 0)}
                              />
                            </td>
                          )}
                          {PHASES.map(([key]) => (
                            <td key={key} style={{ borderLeft: PHASE_GROUP_START_KEYS.has(key) ? "1px solid var(--border)" : undefined }}>
                              <input
                                type="number"
                                className={styles.input}
                                style={{ width: 55, padding: "4px 6px", fontSize: 12 }}
                                defaultValue={entry[key] || 0}
                                onBlur={(e) => updateEntryCount(entry, key, parseInt(e.target.value, 10) || 0)}
                              />
                            </td>
                          ))}
                          <td><button onClick={() => removeEntry(entry)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button className={styles.btnSecondary} onClick={handleSummarize} disabled={entries.length === 0}>Summarize</button>
                  <button
                    className={styles.btnSecondary}
                    onClick={handleSkip}
                    disabled={entries.length > 0}
                    title={entries.length > 0 ? "Can't skip — this Hạng Mục already has rows" : "Mark as intentionally not applicable"}
                  >
                    Skip
                  </button>
                  {/* Round 54 — no separate "Add to Package"/"Remove" button
                      anymore: Summarize itself syncs straight into whichever
                      package tab is active (see syncPackageLine). This just
                      shows a quiet confirmation once that's happened, so
                      it's still obvious the numbers landed in the package. */}
                  {activePackage && (() => {
                    const group = currentGroup();
                    if (!group) return null;
                    const line = lineFor(group.categoryId, group.brand);
                    if (!line) return null;
                    return (
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--success-fg)" }}>
                        ✓ In "{activePackage.name}"
                      </span>
                    );
                  })()}
                </div>

                {summarizedCategoryIds.has(selectedCategoryId) && (
                  <CategoryCountsPopup
                    isTikTokChannel={isTikTokChannel}
                    isAds={isAds}
                    brandList={brandList}
                    currentBrand={currentBrand}
                    categoryTotals={categoryTotals}
                    tiktokBrandTotals={tiktokBrandTotals}
                    tiktokBrand={tiktokBrand}
                  />
                )}

                {summary && !isTikTokChannel && !isAds && (
                  <table className={styles.table} style={{ marginTop: 14 }}>
                    <thead><tr><th>DSP</th><th>Số Lượng Bài Đăng</th><th>Số Lượng Kênh</th></tr></thead>
                    <tbody>
                      {summary.map((row) => (
                        <tr key={row.platform}>
                          <td style={{ fontSize: 12 }}>{row.platform}</td>
                          <td>{row.totalPosts}</td>
                          <td>{row.channelCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {isTikTokChannel && Object.values(tiktokBrandTotals).some((v) => v > 0) && (
                  <div style={{ marginTop: 14, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 10 }}>
                      Brand Comparison — {selectedCategory?.name}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                      {Object.entries(TIKTOK_GROUPS).map(([group, brands]) => (
                        <div key={group}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", marginBottom: 6 }}>{group}</div>
                          <div style={{ display: "grid", gap: 4 }}>
                            {brands.map((b) => (
                              <div
                                key={b}
                                style={{
                                  display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 8px", borderRadius: 5,
                                  background: b === tiktokBrand ? "rgba(255,107,26,0.1)" : "transparent",
                                  color: b === tiktokBrand ? "var(--accent-soft)" : "var(--text)",
                                }}
                              >
                                <span>{b}</span>
                                <strong>{tiktokBrandTotals[b] || 0}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Artist/label Feed Back, submitted via the magic-link page
                    (tickets.data.feedback = {text, submittedAt}). Shown as
                    its own panel below the main DSP-grid content so whoever
                    is building the package can see it without leaving this
                    popup — previously this was invisible anywhere in the
                    internal ticket UI. */}
                {ticket.data?.feedback?.text && (
                  <div style={{ marginTop: 14, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>
                        Feed Back Từ Đối Tác
                      </div>
                      {ticket.data.feedback.submittedAt && (
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                          {new Date(ticket.data.feedback.submittedAt).toLocaleString("vi-VN")}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{ticket.data.feedback.text}</div>
                  </div>
                )}
              </div>

              {/* THIRD — Packages panel. Sits right next to the DSP grid
                  (same screen, same scroll area) instead of a separate
                  overlay on top of this one — editing an entry above and
                  seeing its package line update are now the same view. */}
              {showBuildPopup && (
                <PackagesPanel
                  release={release}
                  categories={categories}
                  packages={packages}
                  activePackageId={activePackageId}
                  setActivePackageId={setActivePackageId}
                  activePackage={activePackage}
                  isIntMedia={isIntMedia}
                  namePopup={namePopup}
                  setNamePopup={setNamePopup}
                  createPackage={createPackage}
                  deletePackage={deletePackage}
                  addPrebuiltLine={addPrebuiltLine}
                  deleteLine={deleteLine}
                  reorderLines={reorderLines}
                  updateLine={updateLine}
                  magicLinkUrl={magicLinkUrl}
                  generatingLink={generatingLink}
                  onGenerateLink={handleGenerateLink}
                  proposedPackage={ticket.data?.proposedPackage}
                  onHide={() => setShowBuildPopup(false)}
                />
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--border)", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                {allCategoriesSummarized ? "All Hạng Mục summarized." : `Summarize all ${categories.length} Hạng Mục before building a package.`}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className={styles.btnPrimary}
                  onClick={() => { setShowBuildPopup((v) => !v); if (packages.length === 0) setNamePopup("create"); }}
                  disabled={!allCategoriesSummarized}
                >
                  {showBuildPopup ? "Hide Packages" : "Build Package"}
                </button>
                {/* Everything here already writes to the DB the moment it
                    changes — nothing is staged. This button doesn't do any
                    extra saving; it exists so the person building a package
                    has an explicit, reassuring "I'm done" action instead of
                    just clicking the ✕ and wondering if their last edit
                    actually stuck. */}
                {packages.length > 0 && (
                  <button className={styles.btnSecondary} onClick={onClose} title="Everything is already saved — this just closes the ticket.">
                    Save &amp; Close
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {showDot2Popup && (
        <Dot2TargetsPopup
          targets={dot2Targets}
          onSave={saveDot2Targets}
          onClose={() => setShowDot2Popup(false)}
        />
      )}
    </div>
  );
}

// Đợt 2 targets — scoped to (release, TikTok Channel category) as a
// whole, not per brand or per row (that's the whole reason this is its
// own small popup rather than another column on every row).
function Dot2TargetsPopup({ targets, onSave, onClose }) {
  const [creationTarget, setCreationTarget] = useState(targets?.creation_target ?? "");
  const [linksPaidTarget, setLinksPaidTarget] = useState(targets?.links_paid_target ?? "");

  function save() {
    onSave({
      creation_target: creationTarget === "" ? null : parseFloat(creationTarget),
      links_paid_target: linksPaidTarget === "" ? null : parseFloat(linksPaidTarget),
    });
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20, width: 320 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.eyebrow}>// Đợt 2</div>
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 14px" }}>Targets for this release</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Creation cần đạt</label>
          <input
            type="number"
            className={styles.input}
            style={{ width: "100%", padding: "8px 10px", fontSize: 13 }}
            value={creationTarget}
            onChange={(e) => setCreationTarget(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: "var(--text-faint)", display: "block", marginBottom: 4 }}>Số Link Đã Trả Cần Đạt</label>
          <input
            type="number"
            className={styles.input}
            style={{ width: "100%", padding: "8px 10px", fontSize: 13 }}
            value={linksPaidTarget}
            onChange={(e) => setLinksPaidTarget(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={styles.btnSmall} onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button className={styles.btnPrimary} onClick={save} style={{ flex: 1 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// Best-effort match against contract_type_packages' item categories —
// "ads" alone would collide with both ADS FACEBOOK and ADS YOUTUBE, so
// this needs real aliases per category, not a loose substring check.
const CATEGORY_REFERENCE_ALIASES = {
  "social": ["social vieent"],
  "community": ["page cộng đồng"],
  "ads": ["ads facebook", "ads youtube"],
};

function referenceDetailFor(referenceTiers, categoryName) {
  const aliases = CATEGORY_REFERENCE_ALIASES[categoryName?.toLowerCase()] || [];
  for (const t of referenceTiers) {
    const item = (t.items || []).find((it) => aliases.some((a) => (it.category || "").toLowerCase() === a));
    if (item) return item;
  }
  return null;
}

// Prebuilt add-on lines — seeded with the real default wording from the
// template, then freely editable same as any other line. category_id is
// left null (the existing signal for "not tied to a real Hạng Mục"); the
// add-on's own name rides in `platform`, which no other package-line
// write path uses. No live-sync to contract_type_packages needed.
const PREBUILT_ADDONS = [
  { name: "Design", unit: "Gói", detail: "Hỗ trợ thiết kế ảnh social, resize từ Key visual" },
  { name: "Discovery Mode on Spotify", unit: "Gói", detail: "Đề xuất & triển khai Discovery Mode theo chu kỳ hàng tháng" },
  { name: "Priority Pitching Spotify Homepage Banner", unit: "Gói", detail: "Banner Trang Chủ Spotify tháng 6 hoặc tháng 7" },
  // Round 54 — 3 more, straight off the "Quyền Lợi Dành Riêng Cho Đối Tác
  // Phát Hành VIEENT" reference sheet (same source PartnerBenefits() on the
  // magic-link page renders from).
  { name: "Recording Studio", unit: "Gói", detail: "Thu âm miễn phí tại VIEENT Studio" },
  { name: "19 Creative Space", unit: "Gói", detail: "Không gian miễn phí để thực hiện quay phỏng vấn, live session, MV ..." },
  { name: "Pitching Playlist/Banner", unit: "Gói", detail: "Nền Tảng: Zingmp3, NCT, Spotify, Apple Music\nKết quả Pitching sẽ được cập nhật sau khi nền tảng trả kết quả về" },
];

// Round 54 — item A.1: default Đơn Giá per Hạng Mục (Social/Community/
// TikTok Channel each mush their brand rows into one line, so they each
// get ONE default price) and per (Ads brand, metric) — Ads keeps its own
// per-row Đơn Giá column, seeded per metric. These are just the fallback
// used until Config → Media Booking Pricing has real values saved (see
// loadPriceDefaults below) — editing Config only changes what NEW rows/
// lines default to going forward, never rewrites anything already saved.
const DEFAULT_UNIT_PRICES = {
  categories: {
    "TikTok Channel": 700000,
    "Social": 200000,
    "Community": 200000,
  },
  ads: {
    "Facebook Ads": { "Lượt tiếp cận": 30, "Lượt tương tác": 300, "Lượt truy cập (Link click)": 2000 },
    "YouTube Ads": { "Thruplays (Views)": 55 },
    "TikTok Ads": { "Lượt tiếp cận": 15, "Lượt xem video": 15, "Lượt theo dõi": 1500, "Lượt truy cập (Link click)": 2500 },
    "Spotify Ads": { "HPTO": 26000, "In-Stream Audio": 26000, "In-Stream Video": 26000, "In-Feed Display": 26000, "In-Feed Video": 26000 },
  },
};
const UNIT_PRICE_DEFAULTS_SETTING_KEY = "media_booking_unit_price_defaults";

// Thành Tiền is always derived, never typed directly — Đơn Giá × Tổng Số
// Bài Đăng normally, or Đơn Giá × Số Gói once "Convert to Package" is on.
function computeLineAmount(line) {
  if (line.unit_price == null) return null;
  const qty = line.is_package_priced ? line.package_count : line.quantity;
  if (qty == null) return null;
  return line.unit_price * qty;
}

// Small popup for naming a package — replaces the browser prompt, and
// hides Vĩnh Viễn once one already exists for this release (a fixed,
// one-per-release name, not custom-typed like the years tiers).
//
// INT MEDIA is no longer a normal, freely-pickable tier here — it's a
// special add-on package that only ever gets built in response to the
// "Send INT MEDIA Follow-up" button on the release detail page (see
// app/releases/[id]/page.js), which sets this ticket's Propose Package to
// "INT MEDIA". allowIntMedia reflects that — the button only shows at all
// when this ticket was opened for exactly that purpose.
function PackageNamePopup({ existingNames, allowIntMedia, onConfirm, onCancel }) {
  const vinhVienTaken = existingNames.includes("Độc Quyền Vĩnh Viễn");
  const intMediaTaken = existingNames.includes("INT MEDIA");
  // Never auto-default to the INT MEDIA tier, even when it's offered —
  // INT MEDIA renders its package lines read-only (names only, no
  // quantities/pricing), so silently pre-selecting it meant clicking
  // "Clone Package" and confirming without looking could turn a normal,
  // fully-editable clone into a locked one by accident. INT MEDIA must
  // always be a deliberate click now, for both "create" and "clone".
  const [tierMode, setTierMode] = useState(vinhVienTaken ? "years" : "vinhVien");
  const [years, setYears] = useState("2");
  const name = tierMode === "vinhVien" ? "Độc Quyền Vĩnh Viễn" : tierMode === "intMedia" ? "INT MEDIA" : `Độc Quyền ${years} năm`;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onCancel}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20, width: 320 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.eyebrow}>// Name Package</div>
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 14px" }}>Which tier is this?</h3>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <button
            className={styles.btnSmall}
            onClick={() => !vinhVienTaken && setTierMode("vinhVien")}
            disabled={vinhVienTaken}
            style={tierMode === "vinhVien" ? { border: "1px solid var(--accent)", color: "var(--accent-soft)" } : undefined}
            title={vinhVienTaken ? "Already created for this release" : undefined}
          >
            Vĩnh Viễn
          </button>
          {allowIntMedia && (
            <button
              className={styles.btnSmall}
              onClick={() => !intMediaTaken && setTierMode("intMedia")}
              disabled={intMediaTaken}
              style={tierMode === "intMedia" ? { border: "1px solid var(--accent)", color: "var(--accent-soft)" } : undefined}
              title={intMediaTaken ? "Already created for this release" : "Mushed package — Hạng Mục names only, no quantities or pricing"}
            >
              INT MEDIA
            </button>
          )}
          <button className={styles.btnSmall} onClick={() => setTierMode("years")} style={tierMode === "years" ? { border: "1px solid var(--accent)", color: "var(--accent-soft)" } : undefined}>
            Custom Years
          </button>
          {tierMode === "years" && (
            <input type="number" className={styles.input} style={{ width: 60, padding: "4px 8px", fontSize: 12 }} value={years} onChange={(e) => setYears(e.target.value)} />
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 16 }}>Will be named: <strong style={{ color: "var(--text)" }}>{name}</strong></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={styles.btnSmall} onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
          <button className={styles.btnPrimary} onClick={() => onConfirm(name)} style={{ flex: 1 }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// Second popup — assembling named packages (custom tiers, not a fixed
// pick-list anymore) out of the summarized Hạng Mục totals. First popup
// shifts left, this one takes the right, purely decorative arrow between
// them (no wiring — just showing "this becomes that").
//
// The left panel always reflects and edits whichever package tab is
// active — checking a line adds it immediately, unchecking removes it
// immediately, same for edit/delete on the right. Nothing here is staged
// then saved — that staging model was the actual source of both the
// "second package doesn't save" bug and the checkbox cross-talk bug.
// Mostly presentational now — quantity/Số Gói is synced from the DSP grid
// above the moment Summarize is clicked (see syncPackageLine — round 54
// removed the separate "Add to Package"/"Remove" step), and this panel
// mirrors it read-only. Chi Tiết and Đơn Giá are editable in BOTH places —
// Chi Tiết is package-specific text with no natural home in the DSP grid,
// and Đơn Giá isn't reachable from the left tool for every line (Ads never
// has one), so it's kept editable here too rather than being inconsistent.
// Renders as a plain in-flow column (not its own fixed-overlay popup) so it
// sits beside the DSP grid instead of covering it.
function PackagesPanel({
  release, categories, packages, activePackageId, setActivePackageId, activePackage, isIntMedia,
  namePopup, setNamePopup, createPackage, deletePackage, addPrebuiltLine, deleteLine, reorderLines, updateLine,
  magicLinkUrl, generatingLink, onGenerateLink, proposedPackage, onHide,
}) {
  const hasSavedPackage = packages.length > 0;
  // Round 54 — item A.4: drag-to-reorder. dragIndex tracks which row (by
  // its position in the sorted array below) the drag started on; dropping
  // on another row moves it there and persists via reorderLines.
  const [dragIndex, setDragIndex] = useState(null);
  const sortedLines = [...(activePackage?.media_booking_package_lines || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  function handleDrop(targetIndex) {
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); return; }
    const next = [...sortedLines];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDragIndex(null);
    reorderLines(next);
  }

  return (
    <>
      <div style={{ width: 620, flexShrink: 0, borderLeft: "1px solid var(--border)", padding: 20, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div className={styles.eyebrow}>// Packages</div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{release?.title}</h3>
            </div>
            <button onClick={onHide} title="Hide this panel — the package stays as-is" style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer" }}>✕</button>
          </div>

          <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            {packages.map((p) => (
              <div
                key={p.id}
                onClick={() => setActivePackageId(p.id)}
                className={`${styles.tabBtn} ${activePackageId === p.id ? styles.tabBtnActive : ""}`}
                style={{ border: "1px solid var(--border)", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
              >
                {p.name}
                <span onClick={(e) => { e.stopPropagation(); deletePackage(p); }} style={{ color: "var(--text-faint)", fontSize: 11 }}>✕</span>
              </div>
            ))}
            <button className={styles.btnSmall} onClick={() => setNamePopup(packages.length === 0 ? "create" : "clone")}>
              {packages.length === 0 ? "+ Create Package" : "Clone Package"}
            </button>
          </div>

          {activePackage && (
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {PREBUILT_ADDONS.map((addon) => (
                <button key={addon.name} className={styles.btnSmall} onClick={() => addPrebuiltLine(addon)}>+ {addon.name}</button>
              ))}
            </div>
          )}

          {/* className={styles.scrollBox} — without it, the table's sticky
              <th> offsets by --topbar-height (the rule meant for tables
              that scroll with the real page), but this panel has its own
              small internal scrollport with no topbar above it, so the
              header floated too low and hovered over the first data
              row(s) instead of sitting flush above them. */}
          <div className={styles.scrollBox} style={{ flex: 1, overflowY: "auto", marginBottom: 14 }}>
            {!activePackage ? (
              <div className={styles.emptyState}>No package yet — click "Create Package" above.</div>
            ) : (activePackage.media_booking_package_lines || []).length === 0 ? (
              <div className={styles.emptyState}>Pick a Hạng Mục on the left and click Summarize — it lands here automatically.</div>
            ) : isIntMedia ? (
              // INT MEDIA — a mushed package: Hạng Mục names only, no
              // quantities, pricing, or detail at all.
              <div style={{ display: "grid", gap: 6 }}>
                {activePackage.media_booking_package_lines.map((line) => {
                  const cat = categories.find((c) => c.id === line.category_id);
                  return (
                    <div key={line.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
                      <span>{cat?.name || line.platform || "—"}{line.brand ? ` — ${line.brand}` : ""}</span>
                      <button onClick={() => deleteLine(line)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 11 }}>Delete</button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th></th>
                    <th>Hạng Mục</th>
                    <th>Tổng Số Bài Đăng / Số Gói</th>
                    <th>Chi Tiết</th>
                    <th>Đơn Giá</th>
                    <th>Thành Tiền</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLines.map((line, index) => {
                    const cat = categories.find((c) => c.id === line.category_id);
                    const isAdsLine = cat?.name === "Ads";
                    return (
                      <tr
                        key={line.id}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(index)}
                        style={{ background: dragIndex === index ? "rgba(255,107,26,0.06)" : undefined }}
                      >
                        {/* Round 54 — item A.4: drag handle to reorder Hạng
                            Mục rows. Draggable only on this cell (not the
                            whole row) so it doesn't fight with selecting
                            text in Chi Tiết/Đơn Giá. */}
                        <td
                          draggable
                          onDragStart={() => setDragIndex(index)}
                          onDragEnd={() => setDragIndex(null)}
                          style={{ cursor: "grab", color: "var(--text-faint)", fontSize: 13, width: 20, userSelect: "none" }}
                          title="Drag to reorder"
                        >
                          ⋮⋮
                        </td>
                        <td style={{ fontSize: 12 }}>{cat?.name || line.platform || "—"}{line.brand ? ` — ${line.brand}` : ""}</td>
                        {/* Read-only now — quantity/Số Gói is edited from the
                            left data tool, this just mirrors it live. */}
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {isAdsLine ? (
                            <span style={{ color: "var(--text-faint)" }}>—</span>
                          ) : line.is_package_priced ? (
                            <span>{line.package_count ?? "—"} Gói</span>
                          ) : (
                            <span>{line.quantity ?? "—"} {line.unit}</span>
                          )}
                        </td>
                        <td style={{ minWidth: 260 }}>
                          <textarea
                            className={styles.textarea}
                            style={{ width: "100%", padding: "4px 6px", fontSize: 11, minHeight: 44, boxSizing: "border-box" }}
                            defaultValue={line.detail || ""}
                            onBlur={(e) => updateLine(line, { detail: e.target.value || null })}
                          />
                        </td>
                        {/* Editable here too now — Đơn Giá wasn't
                            consistently reachable everywhere (Ads lines
                            never have one), so this mirrors the left data
                            tool's field for the categories that do, instead
                            of being read-only-only on this side. */}
                        <td>
                          {isAdsLine ? (
                            <span style={{ color: "var(--text-faint)" }}>—</span>
                          ) : (
                            <input
                              type="number"
                              className={styles.input}
                              style={{ width: 90, padding: "4px 6px", fontSize: 12 }}
                              defaultValue={line.unit_price ?? ""}
                              onBlur={(e) => updateLine(line, { unit_price: e.target.value === "" ? null : parseFloat(e.target.value) })}
                            />
                          )}
                        </td>
                        <td style={{ fontSize: 12, fontWeight: 700 }}>{fmtVnd(line.amount)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button onClick={() => deleteLine(line)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 11 }}>Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {hasSavedPackage && (
            <>
              {!magicLinkUrl ? (
                <button className={styles.btnPrimary} onClick={onGenerateLink} disabled={generatingLink} style={{ width: "100%" }}>
                  {generatingLink ? "Generating…" : "Create magic link and send package to product"}
                </button>
              ) : (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                  {/* Round 54 — same link, 2 names: "Package Offer" until
                      the Booking Board's "Convert Media Report" is clicked
                      for this release, then "Media Report" from then on. */}
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 4 }}>
                    {release?.media_report_status ? "Media Report" : "Package Offer"}
                  </div>
                  <a href={magicLinkUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 12, wordBreak: "break-all" }}>{magicLinkUrl}</a>
                </div>
              )}
              <p style={{ color: "var(--text-faint)", fontSize: 10, marginTop: 8, marginBottom: 0 }}>
                Double check the package before you send — the artist sees this once it's sent.
              </p>
            </>
          )}
        </div>

      {namePopup && (
        <PackageNamePopup
          existingNames={packages.map((p) => p.name)}
          allowIntMedia={proposedPackage === "INT MEDIA"}
          onCancel={() => setNamePopup(null)}
          onConfirm={(name) => createPackage(name, namePopup === "clone" ? activePackageId : null)}
        />
      )}
    </>
  );
}
