"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import styles from "../../shared.module.css";

const PLATFORMS = ["Facebook", "Instagram", "TikTok", "YouTube", "Thread"];
const PHASES = ["Tung Hint", "Out Now", "Listen Now", "Add-in Post"];
const PHASE_GROUPS = [["Pre-release", 1], ["Release", 1], ["Post-release", 2]];
const BRANDS = ["VIEENT", "ENVI"];

function fmtVnd(n) {
  if (n === null || n === undefined || n === "") return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

// This is the corrected, from-scratch rebuild — deliberately separate
// from the Media Booking ticket's old Template/Content-Plan flow, not a
// replacement of it. First pass, expect to iterate.
export default function MediaPackageWorkstation() {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openRelease, setOpenRelease] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("releases").select("id, did, title, main_artist, release_date").eq("requested", true).order("release_date", { ascending: false });
      setReleases(data || []);
      setLoading(false);
    })();
  }, []);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1000 }}>
          <TypeSwitcher kind="workstation" current="media_package" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 16 }}>New Media Package</h1>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : releases.length === 0 ? (
            <div className={styles.emptyState}>No releases have had SEND UPLOAD clicked yet.</div>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Release</th><th>Artist</th><th>Release Date</th></tr></thead>
              <tbody>
                {releases.map((r) => (
                  <tr key={r.id} onClick={() => setOpenRelease(r)} style={{ cursor: "pointer" }}>
                    <td><span className={styles.rowLink}>{r.title}</span></td>
                    <td>{r.main_artist}</td>
                    <td>{fmtDate(r.release_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {openRelease && <MediaPackagePopup release={openRelease} onClose={() => setOpenRelease(null)} />}
    </AppShell>
  );
}

function MediaPackagePopup({ release, onClose }) {
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [brand, setBrand] = useState("VIEENT");
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null); // per-platform rollup, set by "Summarize"
  const [built, setBuilt] = useState([]); // media_booking_package_categories rows for this release
  const [referenceTiers, setReferenceTiers] = useState([]);
  const [loading, setLoading] = useState(true);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const isSocial = selectedCategory?.name === "Social";
  const contextKey = isSocial ? brand : null; // the "brand" filter only applies to Social

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: cats }, { data: builtRows }, { data: tiers }] = await Promise.all([
        supabase.from("package_categories").select("*").order("sort_order"),
        supabase.from("media_booking_package_categories").select("*").eq("release_id", release.id),
        supabase.from("contract_type_packages").select("contract_type, items"),
      ]);
      setCategories(cats || []);
      setBuilt(builtRows || []);
      setReferenceTiers(tiers || []);
      if (cats && cats.length > 0) setSelectedCategoryId(cats[0].id);
      setLoading(false);
    })();
  }, [release]);

  useEffect(() => {
    if (!selectedCategoryId) return;
    (async () => {
      let query = supabase.from("media_booking_content_entries").select("*").eq("release_id", release.id).eq("category_id", selectedCategoryId);
      if (isSocial) query = query.eq("brand", brand);
      const { data } = await query.order("sort_order");
      setEntries(data || []);
      setSummary(null);
    })();
  }, [selectedCategoryId, brand]);

  async function addRow(platform) {
    const { data } = await supabase
      .from("media_booking_content_entries")
      .insert({
        release_id: release.id, category_id: selectedCategoryId, platform,
        brand: isSocial ? brand : null, phase: PHASES[0], count: 0, sort_order: entries.length,
      })
      .select()
      .single();
    if (data) setEntries((prev) => [...prev, data]);
    setSummary(null);
  }

  async function updateEntryPhaseCount(entry, phase, count) {
    // Each row tracks ONE phase's count at a time via a phase selector —
    // matches the popup's per-cell "use this phase" pattern from the
    // earlier attempt, kept since it's the simplest way to get a phase x
    // count pair without a much bigger grid-editing component.
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, phase, count } : e)));
    await supabase.from("media_booking_content_entries").update({ phase, count }).eq("id", entry.id);
    setSummary(null);
  }

  async function removeEntry(entry) {
    await supabase.from("media_booking_content_entries").delete().eq("id", entry.id);
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    setSummary(null);
  }

  function handleSummarize() {
    const byPlatform = {};
    PLATFORMS.forEach((p) => (byPlatform[p] = { platform: p, channelCount: 0, totalPosts: 0, byPhase: {} }));
    entries.forEach((e) => {
      if (!e.platform) return;
      byPlatform[e.platform].channelCount += 1;
      byPlatform[e.platform].totalPosts += e.count || 0;
      byPlatform[e.platform].byPhase[e.phase] = (byPlatform[e.platform].byPhase[e.phase] || 0) + (e.count || 0);
    });
    const rows = PLATFORMS.map((p) => byPlatform[p]).filter((r) => r.channelCount > 0);
    setSummary(rows);
  }

  const builtForContext = built.find((b) => b.category_id === selectedCategoryId && (isSocial ? b.brand === brand : b.brand === null));

  async function buildSpec() {
    if (!summary) return;
    const totalPosts = summary.reduce((sum, r) => sum + r.totalPosts, 0);
    const unitPriceStr = window.prompt("Unit price per post (đ)?", builtForContext?.unit_price ?? "200000");
    if (unitPriceStr === null) return;
    const unitPrice = parseFloat(unitPriceStr) || 0;
    const totalMoney = totalPosts * unitPrice;

    const { data } = await supabase
      .from("media_booking_package_categories")
      .upsert(
        { release_id: release.id, category_id: selectedCategoryId, brand: isSocial ? brand : null, total_posts: totalPosts, unit_price: unitPrice, total_money: totalMoney, tier_type: builtForContext?.tier_type || null, updated_at: new Date().toISOString() },
        { onConflict: "release_id,category_id,brand" }
      )
      .select()
      .single();
    if (data) setBuilt((prev) => [...prev.filter((b) => !(b.category_id === selectedCategoryId && (isSocial ? b.brand === brand : b.brand === null))), data]);
  }

  async function setTier(tierType) {
    if (!builtForContext) return;
    await supabase.from("media_booking_package_categories").update({ tier_type: tierType }).eq("id", builtForContext.id);
    setBuilt((prev) => prev.map((b) => (b.id === builtForContext.id ? { ...b, tier_type: tierType } : b)));
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, maxWidth: 900, width: "100%", maxHeight: "85vh", display: "flex", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className={styles.emptyState} style={{ padding: 24 }}>Loading…</div>
        ) : (
          <>
            {/* LEFT — Hạng Mục picker */}
            <div style={{ width: 200, borderRight: "1px solid var(--border)", flexShrink: 0, padding: 16, overflowY: "auto" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 10 }}>Hạng Mục</div>
              {categories.map((c) => {
                const isBuiltAny = built.some((b) => b.category_id === c.id);
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
                    {c.name} {isBuiltAny && <span style={{ color: "var(--success-fg)" }}>●</span>}
                  </button>
                );
              })}

              {isSocial && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 8 }}>Brand</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {BRANDS.map((b) => (
                      <button
                        key={b}
                        onClick={() => setBrand(b)}
                        style={{
                          flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer",
                          border: brand === b ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
                          background: brand === b ? "rgba(255,107,26,0.1)" : "transparent",
                          color: brand === b ? "var(--accent-soft)" : "var(--text)",
                        }}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT — DSP grid, summarize, build */}
            <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div className={styles.eyebrow}>// New Media Package</div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{release.title}</h2>
                  <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{release.main_artist} · {selectedCategory?.name}{isSocial ? ` — ${brand}` : ""}</div>
                </div>
                <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer" }}>✕</button>
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                {PLATFORMS.map((p) => (
                  <button key={p} className={styles.btnSmall} onClick={() => addRow(p)}>+ {p}</button>
                ))}
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
                    <tr>
                      {PHASES.map((p) => <th key={p} style={{ fontSize: 10, fontWeight: 400 }}>{p}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td style={{ fontSize: 12, fontWeight: 700 }}>{entry.platform}</td>
                        {PHASES.map((p) => (
                          <td key={p}>
                            {entry.phase === p ? (
                              <input
                                type="number"
                                className={styles.input}
                                style={{ width: 55, padding: "4px 6px", fontSize: 12 }}
                                defaultValue={entry.count || 0}
                                onBlur={(e) => updateEntryPhaseCount(entry, p, parseInt(e.target.value, 10) || 0)}
                              />
                            ) : (
                              <button onClick={() => updateEntryPhaseCount(entry, p, 0)} style={{ background: "none", border: "1px dashed var(--border)", borderRadius: 4, color: "var(--text-faint)", fontSize: 9, cursor: "pointer", padding: "3px 5px" }}>
                                use
                              </button>
                            )}
                          </td>
                        ))}
                        <td><button onClick={() => removeEntry(entry)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <button className={styles.btnSecondary} onClick={handleSummarize} disabled={entries.length === 0} style={{ marginBottom: 16 }}>
                Summarize
              </button>

              {summary && (
                <table className={styles.table} style={{ marginBottom: 16 }}>
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

              {summary && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                  <button className={styles.btnPrimary} onClick={buildSpec}>Build Spec</button>

                  {builtForContext && (
                    <div style={{ marginTop: 16, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                      <div style={{ display: "flex", gap: 24, marginBottom: 12, fontSize: 12 }}>
                        <div>Total Posts: <strong>{builtForContext.total_posts}</strong></div>
                        <div>Unit Price: <strong>{fmtVnd(builtForContext.unit_price)}</strong></div>
                        <div>Total: <strong style={{ color: "var(--accent-soft)" }}>{fmtVnd(builtForContext.total_money)}</strong></div>
                      </div>
                      <label className={styles.fieldLabel} style={{ fontSize: 10 }}>Which tier is this for?</label>
                      <select className={styles.select} style={{ maxWidth: 240 }} value={builtForContext.tier_type || ""} onChange={(e) => setTier(e.target.value)}>
                        <option value="">— Not tagged yet —</option>
                        {referenceTiers.map((t) => <option key={t.contract_type} value={t.contract_type}>{t.contract_type}</option>)}
                      </select>
                      <p style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 8 }}>
                        Reference only — the old template's numbers below, for comparison while you decide:
                      </p>
                      {referenceTiers.map((t) => {
                        const item = (t.items || []).find((it) => (it.category || "").toLowerCase().includes(selectedCategory?.name.toLowerCase()));
                        if (!item) return null;
                        return <div key={t.contract_type} style={{ fontSize: 11, color: "var(--text-faint)" }}>{t.contract_type}: {item.quantity} {item.unit}</div>;
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
