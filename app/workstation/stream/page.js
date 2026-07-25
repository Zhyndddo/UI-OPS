"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import styles from "../../shared.module.css";

// The real v1 "Stream" component (STREAM_COLS_DEF in app.js) — manually
// entered per-platform metrics. Reorganized per the doc into 3 tabs
// instead of v1's Summarize + 12 separate month tabs: Today Check (fresh
// releases at the key day+1/day+2/day+7 checkpoints), Monthly (everything,
// grouped and sorted by month), and Bổ Sung (products with no New
// Release row at all).
const METRIC_GROUPS = [
  ["Spotify", [["current_spotify", "Current"], ["playlist_spotify", "Playlist"]]],
  ["TikTok", [["views_tiktok", "Views"], ["creations_tiktok", "Creations"]]],
  ["Zing", [["current_zing", "Current"], ["homepage_banner_zing", "Homepage Banner"], ["bxh_nhac_moi", "BXH Nhạc Mới"], ["album_hot_zing", "Album Hot"], ["cover_playlist_zing", "Cover Playlist"], ["playlist_zing", "Playlist"]]],
  ["NCT", [["current_nct", "Current"], ["banner_homepage_nct", "Banner Homepage"], ["cover_playlist_nct", "Cover Playlist"], ["playlist_nct", "Playlist"]]],
  ["YouTube", [["current_ytb", "Current"], ["youtube_trending", "Trending"]]],
  ["YouTube Music", [["current_ytb_music", "Current"]]],
  ["Facebook", [["views_fb", "Views"], ["creations_fb", "Creations"]]],
];
const ALL_METRIC_KEYS = METRIC_GROUPS.flatMap(([, fields]) => fields.map(([k]) => k));

export default function StreamWorkstation() {
  const [tab, setTab] = useState("today");
  const [releases, setReleases] = useState([]);
  const [metrics, setMetrics] = useState({}); // release_id -> metrics row
  const [supplements, setSupplements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: rels } = await supabase.from("releases").select("id, did, title, main_artist, release_date, upc, isrc, smartlink, label");
    setReleases(rels || []);

    const { data: metricRows } = await supabase.from("release_stream_metrics").select("*").not("release_id", "is", null);
    const map = {};
    (metricRows || []).forEach((m) => (map[m.release_id] = m));
    setMetrics(map);

    // Auto-create a metrics row for any release that doesn't have one yet
    // — matches v1's auto-sync behavior, just done once on load instead
    // of a live listener.
    const missing = (rels || []).filter((r) => !map[r.id]);
    if (missing.length > 0) {
      const { data: created } = await supabase
        .from("release_stream_metrics")
        .insert(missing.map((r) => ({ release_id: r.id })))
        .select();
      (created || []).forEach((m) => (map[m.release_id] = m));
      setMetrics({ ...map });
    }

    const { data: supp } = await supabase.from("release_stream_metrics").select("*").is("release_id", null).order("manual_release_date", { ascending: false });
    setSupplements(supp || []);

    setLoading(false);
  }

  async function updateMetric(row, field, value, isSupplement) {
    const patch = { [field]: value, updated_at: new Date().toISOString() };
    if (isSupplement) {
      setSupplements((prev) => prev.map((s) => (s.id === row.id ? { ...s, ...patch } : s)));
    } else {
      setMetrics((prev) => ({ ...prev, [row.release_id]: { ...prev[row.release_id], ...patch } }));
    }
    await supabase.from("release_stream_metrics").update(patch).eq("id", row.id);
  }

  async function addSupplement() {
    const { data } = await supabase.from("release_stream_metrics").insert({ manual_title: "", manual_artist: "" }).select().single();
    if (data) setSupplements((prev) => [data, ...prev]);
  }

  async function removeSupplement(row) {
    if (!window.confirm("Remove this supplement entry?")) return;
    await supabase.from("release_stream_metrics").delete().eq("id", row.id);
    setSupplements((prev) => prev.filter((s) => s.id !== row.id));
  }

  const todayCheckReleases = useMemo(() => {
    const now = new Date();
    const targets = [1, 2, 7].map((days) => {
      const d = new Date(now);
      d.setDate(now.getDate() - days);
      return d.toISOString().slice(0, 10);
    });
    return releases.filter((r) => r.release_date && targets.includes(r.release_date));
  }, [releases]);

  const monthlyGroups = useMemo(() => {
    const sorted = [...releases].filter((r) => r.release_date).sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""));
    const groups = {};
    sorted.forEach((r) => {
      const key = r.release_date.slice(0, 7); // YYYY-MM
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return Object.entries(groups); // already in descending order since input was sorted
  }, [releases]);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1400 }}>
          <TypeSwitcher kind="workstation" current="stream" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title} style={{ marginBottom: 16 }}>Streaming</h1>

          <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
            {[["today", "Today Check"], ["monthly", "Monthly"], ["supplement", "Bổ Sung"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`${styles.tabBtn} ${tab === key ? styles.tabBtnActive : ""}`}
                style={{ border: "1px solid var(--border)", borderRadius: 6 }}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : tab === "today" ? (
            todayCheckReleases.length === 0 ? (
              <div className={styles.emptyState}>Nothing released yesterday, day-before-yesterday, or exactly a week ago.</div>
            ) : (
              <StreamTable
                rows={todayCheckReleases.map((r) => ({ release: r, metrics: metrics[r.id] || {} }))}
                onUpdate={(row, field, value) => updateMetric(row.metrics, field, value, false)}
              />
            )
          ) : tab === "monthly" ? (
            monthlyGroups.length === 0 ? (
              <div className={styles.emptyState}>No releases with a release date yet.</div>
            ) : (
              monthlyGroups.map(([month, rels]) => (
                <div key={month} style={{ marginBottom: 28 }}>
                  <div className={styles.subheading} style={{ marginTop: 0 }}>{month}</div>
                  <StreamTable
                    rows={rels.map((r) => ({ release: r, metrics: metrics[r.id] || {} }))}
                    onUpdate={(row, field, value) => updateMetric(row.metrics, field, value, false)}
                  />
                </div>
              ))
            )
          ) : (
            <>
              <button className={styles.btnPrimary} onClick={addSupplement} style={{ marginBottom: 16 }}>+ Add Product</button>
              {supplements.length === 0 ? (
                <div className={styles.emptyState}>No supplement entries yet — for products that aren't in New Release.</div>
              ) : (
                <StreamTable
                  rows={supplements.map((s) => ({ release: null, metrics: s }))}
                  onUpdate={(row, field, value) => updateMetric(row.metrics, field, value, true)}
                  onRemove={(row) => removeSupplement(row.metrics)}
                  manual
                />
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function StreamTable({ rows, onUpdate, onRemove, manual }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className={styles.table} style={{ minWidth: 1600 }}>
        <thead>
          <tr>
            <th style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>Release info</th>
            {METRIC_GROUPS.map(([group, fields]) => (
              <th key={group} colSpan={fields.length} style={{ textAlign: "center", borderLeft: "1px solid var(--border)" }}>{group}</th>
            ))}
            <th>Note</th>
            {manual && <th></th>}
          </tr>
          <tr>
            <th style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}></th>
            {METRIC_GROUPS.flatMap(([group, fields]) => fields.map(([key, label]) => <th key={key} style={{ fontSize: 10, fontWeight: 400 }}>{label}</th>))}
            <th></th>
            {manual && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.release?.id || row.metrics.id || i}>
              <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}>
                {manual ? (
                  <>
                    <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, marginBottom: 4 }} defaultValue={row.metrics.manual_title || ""} placeholder="Title…" onBlur={(e) => onUpdate(row, "manual_title", e.target.value)} />
                    <input className={styles.input} style={{ padding: "4px 8px", fontSize: 12, marginBottom: 4 }} defaultValue={row.metrics.manual_artist || ""} placeholder="Artist…" onBlur={(e) => onUpdate(row, "manual_artist", e.target.value)} />
                    <input type="date" className={styles.input} style={{ padding: "4px 8px", fontSize: 11 }} defaultValue={row.metrics.manual_release_date || ""} onBlur={(e) => onUpdate(row, "manual_release_date", e.target.value)} />
                  </>
                ) : (
                  <>
                    <Link href={`/releases/${row.release.id}`} className={styles.rowLink}>{row.release.title}</Link>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{row.release.main_artist} · {row.release.did} · {fmtDate(row.release.release_date)}</div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)" }}>UPC: {row.release.upc || "—"}</div>
                  </>
                )}
              </td>
              {ALL_METRIC_KEYS.map((key) => (
                <td key={key}>
                  <input
                    className={styles.input}
                    style={{ padding: "4px 6px", fontSize: 11, width: 80 }}
                    defaultValue={row.metrics[key] || ""}
                    onBlur={(e) => onUpdate(row, key, e.target.value)}
                  />
                </td>
              ))}
              <td style={{ minWidth: 140 }}>
                <input className={styles.input} style={{ padding: "4px 8px", fontSize: 11 }} defaultValue={row.metrics.stream_note || ""} onBlur={(e) => onUpdate(row, "stream_note", e.target.value)} />
              </td>
              {manual && (
                <td>
                  <button onClick={() => onRemove(row)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>✕</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
