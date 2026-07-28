"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, statusColor } from "../../../lib/helpers";
import { useAuth } from "../../../lib/AuthContext";
import TypeSwitcher from "../../../lib/TypeSwitcher";
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

  const visibleTickets = useMemo(() => {
    if (!tab) return [];
    if (isExecutorView) return tickets.filter((t) => t.status === statusFilter);
    return [...tickets].sort((a, b) => (a.status === "REFUND" ? 0 : 1) - (b.status === "REFUND" ? 0 : 1));
  }, [tickets, tab, isExecutorView, statusFilter]);

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
            <table className={styles.table}>
              <thead>
                <tr><th>Release (DID)</th><th>Propose Package</th><th>PIC</th><th>Deadline</th><th>Status</th></tr>
              </thead>
              <tbody>
                {visibleTickets.map((t) => {
                  const color = statusColor(t.status);
                  return (
                    <tr key={t.id} onClick={() => setOpenTicket(t)} style={{ cursor: "pointer" }}>
                      <td><span className={styles.rowLink}>{t.data?.releaseId}</span></td>
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
function CategoryCountsPopup({ isTikTokChannel, brandList, currentBrand, categoryTotals, tiktokBrandTotals, tiktokBrand }) {
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
      <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Số Lượng Bài Đăng</span>
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

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const isSocial = selectedCategory?.name === "Social";
  const isCommunity = selectedCategory?.name === "Community";
  const isTikTokChannel = selectedCategory?.name === "TikTok Channel";
  const rowOptions = isTikTokChannel ? TIKTOK_SUBCHANNELS : PLATFORMS;
  const currentBrand = isSocial ? brand : isCommunity ? communityBrand : null;
  const brandList = isSocial ? BRANDS : isCommunity ? COMMUNITY_BRANDS : null;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: rel } = await supabase.from("releases").select("*").eq("did", ticket.data?.releaseId).maybeSingle();
      setRelease(rel);
      const { data: cats } = await supabase.from("package_categories").select("*").order("sort_order");
      setCategories(cats || []);
      if (cats && cats.length > 0) setSelectedCategoryId(cats[0].id);
      if (rel) {
        const { data: rollups } = await supabase.from("media_booking_package_categories").select("category_id, skipped").eq("release_id", rel.id);
        setSummarizedCategoryIds(new Set((rollups || []).map((r) => r.category_id)));
        // A category can have both a real (non-skipped) row and a skipped
        // row across different brands — only treat it as "skipped" in the
        // sidebar if every row for it is a skip, not a real Summarize.
        const byCategory = {};
        (rollups || []).forEach((r) => { byCategory[r.category_id] = byCategory[r.category_id] ?? true; byCategory[r.category_id] = byCategory[r.category_id] && r.skipped; });
        setSkippedCategoryIds(new Set(Object.keys(byCategory).filter((id) => byCategory[id])));
        const { data: link } = await supabase.from("magic_links").select("token").eq("release_id", rel.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (link) setMagicLinkUrl(`${window.location.origin}/pick-package/${link.token}`);
      }
      setLoading(false);
    })();
  }, []);

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

  async function addRow(platform) {
    const rowBrand = isSocial ? brand : isCommunity ? communityBrand : isTikTokChannel ? tiktokBrand : "";
    const { data } = await supabase
      .from("media_booking_content_entries")
      .insert({ release_id: release.id, category_id: selectedCategoryId, platform, brand: rowBrand, sort_order: entries.length })
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
      return;
    }

    const byPlatform = {};
    PLATFORMS.forEach((p) => (byPlatform[p] = { platform: p, channelCount: 0, totalPosts: 0 }));
    entries.forEach((e) => {
      if (!e.platform) return;
      byPlatform[e.platform].channelCount += 1;
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

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, maxWidth: 900, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className={styles.emptyState} style={{ padding: 24 }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
              {/* LEFT — Hạng Mục picker */}
              <div style={{ width: 190, borderRight: "1px solid var(--border)", flexShrink: 0, padding: 16, overflowY: "auto" }}>
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
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{release?.main_artist} · {selectedCategory?.name}{isSocial ? ` — ${brand}` : ""}{isCommunity ? ` — ${communityBrand}` : ""}{isTikTokChannel ? ` — ${tiktokBrand}` : ""}</div>
                  </div>
                  <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 20, cursor: "pointer" }}>✕</button>
                </div>

                <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                  {rowOptions.map((p) => <button key={p} className={styles.btnSmall} onClick={() => addRow(p)}>+ {p}</button>)}
                </div>

                {entries.length === 0 ? (
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
                        {PHASE_GROUPS.map(([label, span], i) => <th key={label} colSpan={span} style={{ textAlign: "center", borderLeft: i > 0 ? "1px solid var(--border)" : undefined }}>{label}</th>)}
                        <th rowSpan={2}></th>
                      </tr>
                      <tr>{PHASES.map(([key, label]) => <th key={label} style={{ fontSize: 10, fontWeight: 400, borderLeft: PHASE_GROUP_START_KEYS.has(key) ? "1px solid var(--border)" : undefined }}>{label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={entry.id}>
                          <td style={{ fontSize: 12, fontWeight: 700 }}>{entry.platform}</td>
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

                <div style={{ display: "flex", gap: 8 }}>
                  <button className={styles.btnSecondary} onClick={handleSummarize} disabled={entries.length === 0}>Summarize</button>
                  <button
                    className={styles.btnSecondary}
                    onClick={handleSkip}
                    disabled={entries.length > 0}
                    title={entries.length > 0 ? "Can't skip — this Hạng Mục already has rows" : "Mark as intentionally not applicable"}
                  >
                    Skip
                  </button>
                </div>

                {summarizedCategoryIds.has(selectedCategoryId) && (
                  <CategoryCountsPopup
                    isTikTokChannel={isTikTokChannel}
                    brandList={brandList}
                    currentBrand={currentBrand}
                    categoryTotals={categoryTotals}
                    tiktokBrandTotals={tiktokBrandTotals}
                    tiktokBrand={tiktokBrand}
                  />
                )}

                {summary && !isTikTokChannel && (
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
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                {allCategoriesSummarized ? "All Hạng Mục summarized." : `Summarize all ${categories.length} Hạng Mục before building a package.`}
              </div>
              <button className={styles.btnPrimary} onClick={() => setShowBuildPopup(true)} disabled={!allCategoriesSummarized}>
                Build Package
              </button>
            </div>
          </>
        )}
      </div>

      {showBuildPopup && (
        <BuildPackagePopup
          release={release}
          categories={categories}
          onClose={() => setShowBuildPopup(false)}
          magicLinkUrl={magicLinkUrl}
          onMagicLinkGenerated={setMagicLinkUrl}
        />
      )}

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
];

// Thành Tiền is always derived, never typed directly — Đơn Giá × Tổng Số
// Bài Đăng normally, or Đơn Giá × Số Gói once "Convert to Package" is on.
function computeLineAmount(line) {
  if (line.unit_price == null) return null;
  const qty = line.is_package_priced ? line.package_count : line.quantity;
  if (qty == null) return null;
  return line.unit_price * qty;
}

// Small popup for naming a package — replaces the browser prompt, and
// hides Vĩnh Viễn (and INT MEDIA) once one already exists for this
// release — both are fixed, one-per-release names, not custom-typed like
// the years tiers.
function PackageNamePopup({ existingNames, onConfirm, onCancel }) {
  const vinhVienTaken = existingNames.includes("Độc Quyền Vĩnh Viễn");
  const intMediaTaken = existingNames.includes("INT MEDIA");
  const [tierMode, setTierMode] = useState(vinhVienTaken ? (intMediaTaken ? "years" : "intMedia") : "vinhVien");
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
          <button
            className={styles.btnSmall}
            onClick={() => !intMediaTaken && setTierMode("intMedia")}
            disabled={intMediaTaken}
            style={tierMode === "intMedia" ? { border: "1px solid var(--accent)", color: "var(--accent-soft)" } : undefined}
            title={intMediaTaken ? "Already created for this release" : "Mushed package — Hạng Mục names only, no quantities or pricing"}
          >
            INT MEDIA
          </button>
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
function BuildPackagePopup({ release, categories, onClose, magicLinkUrl, onMagicLinkGenerated }) {
  const [summarizedRows, setSummarizedRows] = useState([]);
  const [packages, setPackages] = useState([]);
  const [activePackageId, setActivePackageId] = useState(null);
  const [referenceTiers, setReferenceTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [namePopup, setNamePopup] = useState(null); // null | "create" | "clone"

  useEffect(() => {
    if (!release) return;
    (async () => {
      setLoading(true);
      const [{ data: rollups }, { data: pkgs }, { data: tiers }] = await Promise.all([
        supabase.from("media_booking_package_categories").select("*, package_categories(name)").eq("release_id", release.id),
        supabase.from("media_booking_packages").select("*, media_booking_package_lines(*)").eq("release_id", release.id).order("sort_order"),
        supabase.from("contract_type_packages").select("contract_type, items"),
      ]);
      setSummarizedRows(rollups || []);
      setPackages(pkgs || []);
      if (pkgs && pkgs.length > 0) setActivePackageId(pkgs[0].id);
      setReferenceTiers(tiers || []);
      setLoading(false);
    })();
  }, [release]);

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

  // Checking/unchecking a Hạng Mục line writes to the DB immediately —
  // no separate save step, which is what was breaking on the 2nd+ package.
  async function toggleLine(row, checked) {
    if (!activePackage) return;
    if (checked) {
      const categoryName = row.package_categories?.name || "";
      const ref = referenceDetailFor(referenceTiers, categoryName);
      const { data: line } = await supabase
        .from("media_booking_package_lines")
        .insert({
          package_id: activePackage.id, category_id: row.category_id, brand: row.brand,
          unit: ref?.unit || "Bài Đăng", quantity: row.total_posts, detail: ref?.detail || null, amount: null,
          sort_order: (activePackage.media_booking_package_lines || []).length,
        })
        .select()
        .single();
      if (line) setPackages((prev) => prev.map((p) => (p.id !== activePackage.id ? p : { ...p, media_booking_package_lines: [...(p.media_booking_package_lines || []), line] })));
    } else {
      const existing = lineFor(row.category_id, row.brand);
      if (!existing) return;
      await supabase.from("media_booking_package_lines").delete().eq("id", existing.id);
      setPackages((prev) => prev.map((p) => (p.id !== activePackage.id ? p : { ...p, media_booking_package_lines: p.media_booking_package_lines.filter((l) => l.id !== existing.id) })));
    }
  }

  // Generic field-level line editor — writes to DB the moment a value
  // changes (same immediate-write convention as everywhere else in this
  // popup; no separate Save step, that staging model already caused real
  // bugs once). Recomputes and persists Thành Tiền alongside every write
  // since it's always derived, never typed directly.
  async function updateLine(line, patch) {
    const merged = { ...line, ...patch };
    const amount = computeLineAmount(merged);
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

  async function handleGenerateLink() {
    if (!release) return;
    setGeneratingLink(true);
    const { data, error } = await supabase.from("magic_links").insert({ release_id: release.id }).select("token").single();
    setGeneratingLink(false);
    if (!error && data) onMagicLinkGenerated(`${window.location.origin}/pick-package/${data.token}`);
  }

  const hasSavedPackage = packages.length > 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ display: "flex", alignItems: "stretch", gap: 0, maxWidth: 1100, width: "100%", maxHeight: "88vh" }} onClick={(e) => e.stopPropagation()}>

        {/* LEFT — always reflects the active package's lines */}
        <div style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: "10px 0 0 10px", padding: 20, overflowY: "auto" }}>
          <div className={styles.eyebrow}>// {activePackage ? activePackage.name : "Pick Lines"}</div>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 14px" }}>Summarized Hạng Mục</h3>
          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : !activePackage ? (
            <div className={styles.emptyState}>Create a package on the right first — then its lines show up here to pick.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {summarizedRows.map((r) => {
                const line = lineFor(r.category_id, r.brand);
                const categoryName = r.package_categories?.name || "";
                return (
                  <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", cursor: "pointer", fontSize: 12 }}>
                    <input type="checkbox" checked={!!line} onChange={(e) => toggleLine(r, e.target.checked)} />
                    <span style={{ flex: 1 }}>{categoryName}{r.brand ? ` — ${r.brand}` : ""}</span>
                    <strong>{r.total_posts} posts</strong>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* MIDDLE — decorative arrow, no wiring */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 50, flexShrink: 0 }}>
          <div style={{ fontSize: 28, color: "var(--accent)" }}>➜</div>
        </div>

        {/* RIGHT — package tabs, lines, send */}
        <div style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: "0 10px 10px 0", padding: 20, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div className={styles.eyebrow}>// Packages</div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{release?.title}</h3>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer" }}>✕</button>
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

          <div style={{ flex: 1, overflowY: "auto", marginBottom: 14 }}>
            {!activePackage ? (
              <div className={styles.emptyState}>No package yet — click "Create Package" above.</div>
            ) : (activePackage.media_booking_package_lines || []).length === 0 ? (
              <div className={styles.emptyState}>Check a Hạng Mục on the left to add it here.</div>
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
                    <th>Hạng Mục</th>
                    <th>Tổng Số Bài Đăng / Số Gói</th>
                    <th>Chi Tiết</th>
                    <th>Đơn Giá</th>
                    <th>Thành Tiền</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activePackage.media_booking_package_lines.map((line) => {
                    const cat = categories.find((c) => c.id === line.category_id);
                    return (
                      <tr key={line.id}>
                        <td style={{ fontSize: 12 }}>{cat?.name || line.platform || "—"}{line.brand ? ` — ${line.brand}` : ""}</td>
                        <td>
                          {line.is_package_priced ? (
                            <input
                              type="number"
                              className={styles.input}
                              style={{ width: 70, padding: "4px 6px", fontSize: 12 }}
                              defaultValue={line.package_count ?? ""}
                              placeholder="Số Gói"
                              onBlur={(e) => updateLine(line, { package_count: e.target.value === "" ? null : parseFloat(e.target.value) })}
                            />
                          ) : (
                            <span>{line.quantity ?? "—"} {line.unit}</span>
                          )}
                          <button
                            onClick={() => toggleLinePricing(line)}
                            title="Convert to Package"
                            style={{ display: "block", marginTop: 4, background: "none", border: "none", color: line.is_package_priced ? "var(--accent-soft)" : "var(--text-faint)", cursor: "pointer", fontSize: 10, padding: 0 }}
                          >
                            {line.is_package_priced ? "↺ Bài Đăng" : "⇄ Convert to Package"}
                          </button>
                        </td>
                        <td style={{ maxWidth: 220 }}>
                          <input
                            className={styles.input}
                            style={{ width: "100%", padding: "4px 6px", fontSize: 11 }}
                            defaultValue={line.detail || ""}
                            onBlur={(e) => updateLine(line, { detail: e.target.value || null })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className={styles.input}
                            style={{ width: 90, padding: "4px 6px", fontSize: 12 }}
                            defaultValue={line.unit_price ?? ""}
                            onBlur={(e) => updateLine(line, { unit_price: e.target.value === "" ? null : parseFloat(e.target.value) })}
                          />
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
                <button className={styles.btnPrimary} onClick={handleGenerateLink} disabled={generatingLink} style={{ width: "100%" }}>
                  {generatingLink ? "Generating…" : "Create magic link and send package to product"}
                </button>
              ) : (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                  <a href={magicLinkUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 12, wordBreak: "break-all" }}>{magicLinkUrl}</a>
                </div>
              )}
              <p style={{ color: "var(--text-faint)", fontSize: 10, marginTop: 8, marginBottom: 0 }}>
                Double check the package before you send — the artist sees this once it's sent.
              </p>
            </>
          )}
        </div>
      </div>

      {namePopup && (
        <PackageNamePopup
          existingNames={packages.map((p) => p.name)}
          onCancel={() => setNamePopup(null)}
          onConfirm={(name) => createPackage(name, namePopup === "clone" ? activePackageId : null)}
        />
      )}
    </div>
  );
}
