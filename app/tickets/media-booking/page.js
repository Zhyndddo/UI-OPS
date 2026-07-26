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
const PHASE_GROUPS = [["Pre-release", 1], ["Release", 1], ["Post-release", 2]];
const BRANDS = ["VIEENT", "ENVI"];

// This is the corrected, from-scratch rebuild, now living inside the
// Media Booking ticket (replacing the old Template/Content-Plan modes
// entirely) — gated the same way the ticket itself always was, not by
// Send Upload.
function PackageBuilderPopup({ ticket, onClose, onStatusChange }) {
  const [release, setRelease] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [brand, setBrand] = useState("VIEENT");
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [summarizedCategoryIds, setSummarizedCategoryIds] = useState(new Set()); // which categories have EVER been summarized (persisted)
  const [magicLinkUrl, setMagicLinkUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBuildPopup, setShowBuildPopup] = useState(false);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const isSocial = selectedCategory?.name === "Social";

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: rel } = await supabase.from("releases").select("*").eq("did", ticket.data?.releaseId).maybeSingle();
      setRelease(rel);
      const { data: cats } = await supabase.from("package_categories").select("*").order("sort_order");
      setCategories(cats || []);
      if (cats && cats.length > 0) setSelectedCategoryId(cats[0].id);
      if (rel) {
        const { data: rollups } = await supabase.from("media_booking_package_categories").select("category_id").eq("release_id", rel.id);
        setSummarizedCategoryIds(new Set((rollups || []).map((r) => r.category_id)));
        const { data: link } = await supabase.from("magic_links").select("token").eq("release_id", rel.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (link) setMagicLinkUrl(`${window.location.origin}/pick-package/${link.token}`);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedCategoryId || !release) return;
    (async () => {
      let query = supabase.from("media_booking_content_entries").select("*").eq("release_id", release.id).eq("category_id", selectedCategoryId);
      if (isSocial) query = query.eq("brand", brand);
      const { data } = await query.order("sort_order");
      setEntries(data || []);
      setSummary(null);
    })();
  }, [selectedCategoryId, brand, release]);

  async function addRow(platform) {
    const { data } = await supabase
      .from("media_booking_content_entries")
      .insert({ release_id: release.id, category_id: selectedCategoryId, platform, brand: isSocial ? brand : null, sort_order: entries.length })
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
  // lightweight marker (total posts per platform) — that persisted
  // marker is what the "all 3 categories" gate below checks, so it
  // survives closing and reopening the ticket.
  async function handleSummarize() {
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
    await supabase.from("media_booking_package_categories").upsert(
      { release_id: release.id, category_id: selectedCategoryId, brand: isSocial ? brand : null, total_posts: totalPosts, updated_at: new Date().toISOString() },
      { onConflict: "release_id,category_id,brand" }
    );
    setSummarizedCategoryIds((prev) => new Set(prev).add(selectedCategoryId));
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
                      {c.name} {done && <span style={{ color: "var(--success-fg)" }}>●</span>}
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
              </div>

              {/* RIGHT — DSP grid */}
              <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <div className={styles.eyebrow}>// Package Builder</div>
                    <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{release?.title || ticket.data?.releaseId}</h2>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{release?.main_artist} · {selectedCategory?.name}{isSocial ? ` — ${brand}` : ""}</div>
                  </div>
                  <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 20, cursor: "pointer" }}>✕</button>
                </div>

                <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                  {PLATFORMS.map((p) => <button key={p} className={styles.btnSmall} onClick={() => addRow(p)}>+ {p}</button>)}
                </div>

                {entries.length === 0 ? (
                  <div className={styles.emptyState}>Pick a DSP above to add a row.</div>
                ) : (
                  <table className={styles.table} style={{ marginBottom: 14 }}>
                    <thead>
                      <tr>
                        <th rowSpan={2}>DSP</th>
                        {PHASE_GROUPS.map(([label, span]) => <th key={label} colSpan={span} style={{ textAlign: "center" }}>{label}</th>)}
                        <th rowSpan={2}></th>
                      </tr>
                      <tr>{PHASES.map(([, label]) => <th key={label} style={{ fontSize: 10, fontWeight: 400 }}>{label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={entry.id}>
                          <td style={{ fontSize: 12, fontWeight: 700 }}>{entry.platform}</td>
                          {PHASES.map(([key]) => (
                            <td key={key}>
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

                <button className={styles.btnSecondary} onClick={handleSummarize} disabled={entries.length === 0}>Summarize</button>

                {summary && (
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
    </div>
  );
}

// Second popup — assembling named packages (custom tiers, not a fixed
// pick-list anymore) out of the summarized Hạng Mục totals. First popup
// shifts left, this one takes the right, purely decorative arrow between
// them (no wiring — just showing "this becomes that").
function BuildPackagePopup({ release, categories, onClose, magicLinkUrl, onMagicLinkGenerated }) {
  const [summarizedRows, setSummarizedRows] = useState([]); // one per (category, brand)
  const [packages, setPackages] = useState([]);
  const [activePackageId, setActivePackageId] = useState(null);
  const [checkedKeys, setCheckedKeys] = useState(new Set());
  const [tierMode, setTierMode] = useState("vinhVien"); // "vinhVien" | "years"
  const [years, setYears] = useState("2");
  const [referenceTiers, setReferenceTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingLink, setGeneratingLink] = useState(false);

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
  const packageName = tierMode === "vinhVien" ? "Độc Quyền Vĩnh Viễn" : `Độc Quyền ${years} năm`;

  function rowKey(r) { return `${r.category_id}|${r.brand || ""}`; }

  function referenceDetailFor(categoryName) {
    // "The line right under the package name" — the matching item's own
    // description text in the real template, used as this line's detail.
    for (const t of referenceTiers) {
      const item = (t.items || []).find((it) => (it.category || "").toLowerCase().includes(categoryName.toLowerCase()));
      if (item) return item;
    }
    return null;
  }

  async function savePackage() {
    if (checkedKeys.size === 0) {
      window.alert("Pick at least one Hạng Mục line first.");
      return;
    }
    const { data: pkg } = await supabase
      .from("media_booking_packages")
      .insert({ release_id: release.id, name: packageName, sort_order: packages.length })
      .select()
      .single();
    if (!pkg) return;

    const rowsToInsert = summarizedRows.filter((r) => checkedKeys.has(rowKey(r))).map((r, i) => {
      const categoryName = r.package_categories?.name || "";
      const ref = referenceDetailFor(categoryName);
      return {
        package_id: pkg.id,
        category_id: r.category_id,
        brand: r.brand,
        unit: ref?.unit || "Bài Đăng",
        quantity: r.total_posts,
        detail: ref?.detail || null,
        amount: null,
        sort_order: i,
      };
    });
    const { data: lines } = await supabase.from("media_booking_package_lines").insert(rowsToInsert).select();
    setPackages((prev) => [...prev, { ...pkg, media_booking_package_lines: lines || [] }]);
    setActivePackageId(pkg.id);
    setCheckedKeys(new Set());
  }

  // Clones whichever tab is currently active — matches "on the event of
  // two or more packages already created, use the tab they're on."
  async function addAnotherPackage() {
    if (!activePackage) {
      window.alert("Save a package first, then you can add another.");
      return;
    }
    const newName = window.prompt("Name for the new package?", packageName);
    if (!newName) return;
    const { data: pkg } = await supabase
      .from("media_booking_packages")
      .insert({ release_id: release.id, name: newName, sort_order: packages.length })
      .select()
      .single();
    if (!pkg) return;
    const cloneRows = (activePackage.media_booking_package_lines || []).map((l, i) => ({
      package_id: pkg.id, category_id: l.category_id, brand: l.brand, unit: l.unit, quantity: l.quantity, detail: l.detail, amount: l.amount, sort_order: i,
    }));
    const { data: lines } = await supabase.from("media_booking_package_lines").insert(cloneRows).select();
    setPackages((prev) => [...prev, { ...pkg, media_booking_package_lines: lines || [] }]);
    setActivePackageId(pkg.id);
  }

  async function editLine(line) {
    const newQty = window.prompt("New quantity?", line.quantity);
    if (newQty === null) return;
    await supabase.from("media_booking_package_lines").update({ quantity: parseFloat(newQty) || 0 }).eq("id", line.id);
    setPackages((prev) => prev.map((p) => (p.id !== activePackageId ? p : { ...p, media_booking_package_lines: p.media_booking_package_lines.map((l) => (l.id === line.id ? { ...l, quantity: parseFloat(newQty) || 0 } : l)) })));
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

        {/* LEFT — pick lines, name package */}
        <div style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: "10px 0 0 10px", padding: 20, overflowY: "auto" }}>
          <div className={styles.eyebrow}>// Pick Lines</div>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 14px" }}>Summarized Hạng Mục</h3>
          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : (
            <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
              {summarizedRows.map((r) => {
                const key = rowKey(r);
                const categoryName = r.package_categories?.name || "";
                return (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", cursor: "pointer", fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={checkedKeys.has(key)}
                      onChange={(e) => {
                        const next = new Set(checkedKeys);
                        if (e.target.checked) next.add(key); else next.delete(key);
                        setCheckedKeys(next);
                      }}
                    />
                    <span style={{ flex: 1 }}>{categoryName}{r.brand ? ` — ${r.brand}` : ""}</span>
                    <strong>{r.total_posts} posts</strong>
                  </label>
                );
              })}
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <label className={styles.fieldLabel} style={{ fontSize: 10 }}>Package Name</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <button className={styles.btnSmall} onClick={() => setTierMode("vinhVien")} style={tierMode === "vinhVien" ? { border: "1px solid var(--accent)", color: "var(--accent-soft)" } : undefined}>Vĩnh Viễn</button>
              <button className={styles.btnSmall} onClick={() => setTierMode("years")} style={tierMode === "years" ? { border: "1px solid var(--accent)", color: "var(--accent-soft)" } : undefined}>Custom Years</button>
              {tierMode === "years" && (
                <input type="number" className={styles.input} style={{ width: 60, padding: "4px 8px", fontSize: 12 }} value={years} onChange={(e) => setYears(e.target.value)} />
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 10 }}>Will be named: <strong style={{ color: "var(--text)" }}>{packageName}</strong></div>
          </div>
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

          {packages.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
              {packages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActivePackageId(p.id)}
                  className={`${styles.tabBtn} ${activePackageId === p.id ? styles.tabBtnActive : ""}`}
                  style={{ border: "1px solid var(--border)", borderRadius: 6 }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", marginBottom: 14 }}>
            {!activePackage ? (
              <div className={styles.emptyState}>No package saved yet — pick lines on the left and click Save Package.</div>
            ) : (activePackage.media_booking_package_lines || []).length === 0 ? (
              <div className={styles.emptyState}>This package has no lines yet.</div>
            ) : (
              <table className={styles.table}>
                <thead><tr><th>Hạng Mục</th><th>Số Lượng</th><th>Chi Tiết</th><th></th></tr></thead>
                <tbody>
                  {activePackage.media_booking_package_lines.map((line) => {
                    const cat = categories.find((c) => c.id === line.category_id);
                    return (
                      <tr key={line.id}>
                        <td style={{ fontSize: 12 }}>{cat?.name}{line.brand ? ` — ${line.brand}` : ""}</td>
                        <td>{line.quantity} {line.unit}</td>
                        <td style={{ fontSize: 11, color: "var(--text-faint)", maxWidth: 220 }}>{line.detail || "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button onClick={() => editLine(line)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11, marginRight: 8 }}>Edit</button>
                          <button onClick={() => deleteLine(line)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 11 }}>Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: hasSavedPackage ? 14 : 0 }}>
            <button className={styles.btnPrimary} onClick={savePackage} style={{ flex: 1 }}>Save Package</button>
            <button className={styles.btnSecondary} onClick={addAnotherPackage} style={{ flex: 1 }}>Add Another Package</button>
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
    </div>
  );
}
