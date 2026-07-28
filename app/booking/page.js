"use client";

import AppShell from "../../lib/AppShell";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate } from "../../lib/helpers";
import TypeSwitcher from "../../lib/TypeSwitcher";
import styles from "../shared.module.css";

// Real brand lists per Hạng Mục — MUST stay in sync with the same
// constants in app/tickets/media-booking/page.js (BRANDS, COMMUNITY_BRANDS,
// TIKTOK_ALL_BRANDS). Columns here are brand-based, not platform-based, so
// that "already added" (media_booking_entries, tagged by these same brand
// strings) and "booked in package" (media_booking_package_lines, keyed by
// category_id + brand) actually compare apples to apples. Ads has no real
// brand bracket yet (one's coming later) — '' is the placeholder single
// column, same as how Ads already rolls up under the empty-string brand
// everywhere else in this system.
const CATEGORY_BRANDS = {
  "Social": ["VIEENT", "ENVI"],
  "Community": ["PAGE BOLERO / MT", "PAGE VPOP", "PAGE INDIE"],
  "TikTok Channel": [
    "TIKTOK BOLERO / MT", "TIKTOK VPOP", "TIKTOK INDIE", "CAPCUT",
    "EXT TIKTOK - BK MUSIC", "EXT TIKTOK - DUCTH", "EXT TIKTOK - BK GROUP", "EXT TIKTOK - CTV MẪU",
  ],
  "Ads": [""],
};

const ROUNDS = ["INT", "Đợt 1", "Đợt 2"];
const PLATFORM_OPTIONS = ["Facebook", "Instagram", "TikTok", "YouTube", "Thread"]; // informational only now, doesn't split columns

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
  const [channelType, setChannelType] = useState("Direct"); // 'Direct' | 'Partner' — still independent of round/brand, still gates the Phụ Lục warning
  const [typeFilter, setTypeFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [expandedCell, setExpandedCell] = useState(null); // `${releaseId}:${categoryName}:${brand}` or null
  const [packagePreview, setPackagePreview] = useState(null); // release being previewed, or null

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
    setReleases(rels || []);
    setEntries(ents || []);
    setCategories(cats || []);
    setPackages(pkgs || []);
    setDot2ReleaseIds(new Set((targets || []).map((t) => t.release_id)));
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

  function addedFor(release, categoryName, brand, entryPool) {
    const categoryId = categoryIdByName[categoryName];
    return entryPool.filter((e) => e.release_id === release.id && e.category_id === categoryId && (brand === null || (e.channel_name || "") === (brand || ""))).length;
  }

  // Round is still an entry-level tag (which "phase" a given link belongs
  // to), so it still filters which entries count for "already added" —
  // AND it now also filters which releases show up as rows (see below).
  const roundEntries = useMemo(() => {
    return entries.filter((e) => e.booking_round === round && e.channel_type === channelType);
  }, [entries, round, channelType]);

  // Row-level round filter: INT = an INT MEDIA package was chosen; Đợt 1 =
  // any real chosen package that isn't INT MEDIA or the Chỉ Phát Hành-only
  // pick; Đợt 2 = releases that actually have Đợt 2 targets set (TikTok
  // Channel's Skip/summarize flow — see media-booking's Đợt 2 popup).
  const roundFilteredReleases = useMemo(() => {
    return releases.filter((r) => {
      if (round === "INT") return r.project_type === "INT MEDIA";
      if (round === "Đợt 1") return !!r.project_type && r.project_type !== "Chỉ Phát Hành" && r.project_type !== "INT MEDIA";
      if (round === "Đợt 2") return dot2ReleaseIds.has(r.id);
      return true;
    });
  }, [releases, round, dot2ReleaseIds]);

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
      return true;
    });
  }, [roundFilteredReleases, search, month, typeFilter, labelFilter]);

  // Columns: one per Hạng Mục when "All" is picked (aggregate ratio across
  // every brand in that category), or one per real brand once a specific
  // Hạng Mục is selected.
  const columns = useMemo(() => {
    if (hangMucFilter === "All") {
      return categories.map((c) => ({ key: c.name, label: c.name, categoryName: c.name, brand: null }));
    }
    return (CATEGORY_BRANDS[hangMucFilter] || []).map((b) => ({
      key: `${hangMucFilter}:${b}`,
      label: b || hangMucFilter,
      categoryName: hangMucFilter,
      brand: b,
    }));
  }, [hangMucFilter, categories]);

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
  async function addEntry(releaseId, categoryName, brand, platform, link) {
    if (!link.trim()) return;
    const { data, error } = await supabase
      .from("media_booking_entries")
      .insert({
        release_id: releaseId, booking_round: round, channel_type: channelType,
        category_id: categoryIdByName[categoryName] || null, channel_name: brand || null,
        platform: platform || null, link, status: "Chưa Booking",
      })
      .select()
      .single();
    if (!error && data) setEntries((prev) => [...prev, data]);
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
        row.push(addedFor(r, c.categoryName, c.brand, roundEntries));
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

        <div className={styles.statRow} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Tổng Releases</div>
            <div className={styles.statValue}>{stats.total}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Done ({round})</div>
            <div className={styles.statValue} style={{ color: "#7ee6a8" }}>{stats.done}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Đang Booking</div>
            <div className={styles.statValue} style={{ color: "#ffca4d" }}>{stats.inProgress}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Chưa Booking</div>
            <div className={styles.statValue} style={{ color: "#888" }}>{stats.notBooked}</div>
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
                  background: round === r ? "#ff6b1a" : "transparent", color: round === r ? "#0a0a0a" : "#ccc",
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden", flexWrap: "wrap" }}>
            <button
              onClick={() => setHangMucFilter("All")}
              style={{ padding: "9px 14px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: hangMucFilter === "All" ? "#ff6b1a" : "transparent", color: hangMucFilter === "All" ? "#0a0a0a" : "#ccc" }}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setHangMucFilter(c.name)}
                style={{ padding: "9px 14px", fontSize: 12, fontWeight: 700, border: "none", borderLeft: "1px solid #333", cursor: "pointer", background: hangMucFilter === c.name ? "#ff6b1a" : "transparent", color: hangMucFilter === c.name ? "#0a0a0a" : "#ccc" }}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden" }}>
            {["Direct", "Partner"].map((c) => (
              <button
                key={c}
                onClick={() => setChannelType(c)}
                style={{ padding: "9px 16px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: channelType === c ? "#ff6b1a" : "transparent", color: channelType === c ? "#0a0a0a" : "#ccc" }}
              >
                {c}
              </button>
            ))}
          </div>
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

        {channelType === "Partner" && (
          <div className={styles.errorBox} style={{ background: "#1a1a1a", borderColor: "#5a4a1a", color: "#ffca4d", marginBottom: 16 }}>
            ⚠ Partner booking should wait for releases whose Phụ Lục isn't signed yet — check the badge next to each release below. Not a hard block yet, just a heads up.
          </div>
        )}

        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : filteredReleases.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#1c1c1c", letterSpacing: 4 }}>EMPTY</div>
            <div style={{ color: "#555", marginTop: -12 }}>Không tìm thấy</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
          <table className={styles.table} style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>Release</th>
                <th>Package</th>
                <th>Result</th>
                {columns.map((c) => (
                  <th key={c.key} style={{ textAlign: "center" }}>{c.label}<div style={{ fontWeight: 400, color: "#666", fontSize: 10 }}>{round} · {channelType}</div></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredReleases.map((r) => (
                <tr key={r.id}>
                  <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>
                    <Link href={`/releases/${r.id}`} className={styles.rowLink}>{r.title}</Link>
                    <div style={{ fontSize: 11, color: "#666" }}>{r.main_artist} · {r.did} · {fmtDate(r.release_date)}</div>
                    {channelType === "Partner" && (
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
                  <td style={{ verticalAlign: "top" }}>
                    {r.project_type ? (
                      <button onClick={() => setPackagePreview(r)} style={{ background: "none", border: "none", color: "var(--accent-soft)", cursor: "pointer", fontSize: 12, textAlign: "left", padding: 0 }}>
                        {r.project_type}
                      </button>
                    ) : (
                      <span style={{ color: "#666", fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td style={{ verticalAlign: "top" }}>
                    <ResultCell release={r} categories={categories} bookedFor={bookedFor} entries={roundEntries} categoryIdByName={categoryIdByName} />
                  </td>
                  {columns.map((c) => (
                    <BrandCell
                      key={c.key}
                      release={r}
                      column={c}
                      booked={bookedFor(r, c.categoryName, c.brand)}
                      cellEntries={roundEntries.filter((e) => e.release_id === r.id && e.category_id === categoryIdByName[c.categoryName] && (c.brand === null || (e.channel_name || "") === (c.brand || "")))}
                      expanded={expandedCell === `${r.id}:${c.key}`}
                      onToggle={() => setExpandedCell(expandedCell === `${r.id}:${c.key}` ? null : `${r.id}:${c.key}`)}
                      onAdd={(platform, link) => addEntry(r.id, c.categoryName, c.brand, platform, link)}
                      onCycleStatus={cycleStatus}
                      canAdd={hangMucFilter !== "All"}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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
function ResultCell({ release, categories, bookedFor, entries, categoryIdByName }) {
  return (
    <div style={{ display: "grid", gap: 3 }}>
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
            <span style={{ color: "#999" }}>{c.name}</span>
          </div>
        );
      })}
    </div>
  );
}

function BrandCell({ release, column, booked, cellEntries, expanded, onToggle, onAdd, onCycleStatus, canAdd }) {
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [platform, setPlatform] = useState(PLATFORM_OPTIONS[0]);
  const [link, setLink] = useState("");
  const added = cellEntries.length;
  const isDone = booked != null && booked > 0 && added >= booked;

  function submitAdd() {
    onAdd(platform, link);
    setLink("");
    setShowAddPopup(false);
  }

  return (
    <td style={{ verticalAlign: "top", minWidth: 130, position: "relative" }}>
      <div
        onClick={onToggle}
        style={{ cursor: "pointer", fontSize: 12, textAlign: "center", fontWeight: isDone ? 800 : 400 }}
        title={cellEntries.map((e) => `${e.platform ? e.platform + ": " : ""}${e.status}: ${e.link}`).join("\n")}
      >
        {isDone ? (
          <span style={{ color: "#7ee6a8" }}>DONE</span>
        ) : booked != null ? (
          <span style={{ color: "#ccc" }}>{added} / {booked}</span>
        ) : (
          <span style={{ color: "#666" }}>{added} / —</span>
        )}
      </div>
      {expanded && (
        <div style={{ marginTop: 6, background: "#141414", border: "1px solid #262626", borderRadius: 6, padding: 8 }}>
          {cellEntries.length === 0 && <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>No links yet.</div>}
          {cellEntries.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, marginBottom: 4, gap: 6 }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>
                {e.platform && <span style={{ color: "#ff9d5c", fontWeight: 700 }}>{e.platform}: </span>}
                <a href={e.link} target="_blank" rel="noopener noreferrer" style={{ color: "#ccc" }}>{e.link}</a>
              </div>
              <button
                onClick={() => onCycleStatus(e)}
                style={{ background: "none", border: "none", cursor: "pointer", color: e.status === "Done" ? "#7ee6a8" : e.status === "Đã Gửi" ? "#ffca4d" : "#666", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}
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
          <div onClick={() => setShowAddPopup(false)} style={{ position: "fixed", inset: 0, zIndex: 299 }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: 0, left: "100%", marginLeft: 6, zIndex: 300, width: 260,
              background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 8 }}>
              Add Link — {column.label}
            </div>
            <label style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>Platform (informational)</label>
            <select className={styles.select} style={{ width: "100%", marginBottom: 8, padding: "6px 8px", fontSize: 12 }} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORM_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 3 }}>URL</label>
            <input
              autoFocus
              className={styles.input}
              style={{ width: "100%", padding: "6px 8px", fontSize: 12 }}
              placeholder="https://…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button className={styles.btnSmall} onClick={() => setShowAddPopup(false)} style={{ flex: 1 }}>Cancel</button>
              <button className={styles.btnPrimary} onClick={submitAdd} style={{ flex: 1, padding: "7px 0", fontSize: 12 }}>Add</button>
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
                  <td style={{ fontSize: 11, color: "var(--text-faint)" }}>{l.detail || "—"}</td>
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
