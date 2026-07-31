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
  ["Spotify", [["current_spotify", "Current"]]],
  ["TikTok", [["views_tiktok", "Views"], ["creations_tiktok", "Creations"]]],
  ["Zing", [["current_zing", "Current"]]],
  ["NCT", [["current_nct", "Current"]]],
  ["YouTube", [["current_ytb", "Current"]]],
  ["YTB Music", [["current_ytb_music", "Current"]]],
  ["Facebook", [["views_fb", "Views"], ["creations_fb", "Creations"]]],
];
const ALL_METRIC_KEYS = METRIC_GROUPS.flatMap(([, fields]) => fields.map(([k]) => k));
const GROUP_START_KEYS = new Set(METRIC_GROUPS.map(([, fields]) => fields[0][0]));

export default function StreamWorkstation() {
  const [tab, setTab] = useState("today");
  const [releases, setReleases] = useState([]);
  const [metrics, setMetrics] = useState({}); // release_id -> metrics row
  const [supplements, setSupplements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthlySearch, setMonthlySearch] = useState(""); // Monthly tab only — title/artist/DID, so an old entry can be found without scrolling every month

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

  // The DID search field actually finding a match means this Bổ Sung
  // entry's song exists in the dashboard now — merge its numbers into
  // that release's real metrics row (every release already has one, see
  // the auto-create step in load() above) and drop the Bổ Sung row,
  // instead of just stashing the DID as a label. Only fills fields that
  // are still blank on the target — never overwrites a real number
  // that's already been entered there directly.
  async function linkSupplementToRelease(supplementRow, release) {
    if (!window.confirm(`Merge this Bổ Sung entry into "${release.title}" (${release.did}) and remove it from Bổ Sung?`)) return;

    const { data: targetRow, error: targetErr } = await supabase
      .from("release_stream_metrics")
      .select("*")
      .eq("release_id", release.id)
      .maybeSingle();
    if (targetErr) { window.alert(`Lookup failed: ${targetErr.message}`); return; }

    const mergeableKeys = [...ALL_METRIC_KEYS, "stream_note"];
    const patch = {};
    mergeableKeys.forEach((key) => {
      if (!targetRow?.[key] && supplementRow[key]) patch[key] = supplementRow[key];
    });

    if (targetRow) {
      if (Object.keys(patch).length > 0) {
        const { error: updErr } = await supabase.from("release_stream_metrics").update(patch).eq("id", targetRow.id);
        if (updErr) { window.alert(`Merge failed: ${updErr.message}`); return; }
      }
      await supabase.from("release_stream_metrics").delete().eq("id", supplementRow.id);
      setMetrics((prev) => ({ ...prev, [release.id]: { ...targetRow, ...patch } }));
    } else {
      // No metrics row for that release yet (shouldn't normally happen —
      // load() auto-creates one for every release) — repurpose this
      // Bổ Sung row into the real one instead of losing it.
      const { error: updErr } = await supabase
        .from("release_stream_metrics")
        .update({ release_id: release.id, manual_title: null, manual_artist: null, manual_release_date: null, manual_upc: null, manual_did: null })
        .eq("id", supplementRow.id);
      if (updErr) { window.alert(`Link failed: ${updErr.message}`); return; }
      setMetrics((prev) => ({ ...prev, [release.id]: { ...supplementRow, release_id: release.id } }));
    }
    setSupplements((prev) => prev.filter((s) => s.id !== supplementRow.id));
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

  // Monthly can run to a LOT of months once real data piles up — finding
  // one old release to fix a number on shouldn't mean scrolling through
  // all of them. Search filters every month's rows by title/artist/DID; a
  // month with zero matches (or, with no search, zero releases) drops out
  // of the list entirely rather than showing an empty table. The index bar
  // below jumps straight to a month's anchor for when you know roughly
  // when it released but not the exact title.
  const filteredMonthlyGroups = useMemo(() => {
    const q = monthlySearch.trim().toLowerCase();
    if (!q) return monthlyGroups;
    return monthlyGroups
      .map(([month, rels]) => [month, rels.filter((r) => `${r.title} ${r.main_artist} ${r.did}`.toLowerCase().includes(q))])
      .filter(([, rels]) => rels.length > 0);
  }, [monthlyGroups, monthlySearch]);

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
              <>
                <input
                  className={styles.input}
                  style={{ maxWidth: 360, marginBottom: 12 }}
                  value={monthlySearch}
                  onChange={(e) => setMonthlySearch(e.target.value)}
                  placeholder="Search title / artist / DID…"
                />
                {/* Month index — jumps straight to that month's anchor.
                    Hidden while searching, since search already narrows
                    things down to a handful of months at most. */}
                {!monthlySearch && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                    {monthlyGroups.map(([month]) => (
                      <a
                        key={month}
                        href={`#stream-month-${month}`}
                        className={styles.tabBtn}
                        style={{ border: "1px solid var(--border)", borderRadius: 6, textDecoration: "none" }}
                      >
                        {month}
                      </a>
                    ))}
                  </div>
                )}
                {filteredMonthlyGroups.length === 0 ? (
                  <div className={styles.emptyState}>No matches for "{monthlySearch}".</div>
                ) : (
                  filteredMonthlyGroups.map(([month, rels]) => (
                    <div key={month} id={`stream-month-${month}`} style={{ marginBottom: 28, scrollMarginTop: 16 }}>
                      <div className={styles.subheading} style={{ marginTop: 0 }}>{month}</div>
                      <StreamTable
                        rows={rels.map((r) => ({ release: r, metrics: metrics[r.id] || {} }))}
                        onUpdate={(row, field, value) => updateMetric(row.metrics, field, value, false)}
                      />
                    </div>
                  ))
                )}
              </>
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
                  onLink={(row, release) => linkSupplementToRelease(row.metrics, release)}
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

function StreamTable({ rows, onUpdate, onRemove, onLink, manual }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className={styles.table} style={{ minWidth: 1400 }}>
        <thead>
          {/* Sticky on BOTH axes now — top:0 so the column labels stay
              visible scrolling down a long Monthly list (was only ever
              sticky left/right before), left:0 kept on the Release column
              so it also stays put scrolling sideways. The Release th needs
              a higher z-index than the rest since it's sticky on both axes
              at once and has to stay above them at the corner. */}
          <tr>
            <th style={{ position: "sticky", top: 0, left: 0, zIndex: 4, background: "var(--bg)", borderRight: "2px solid var(--accent)", width: 300, minWidth: 300, maxWidth: 300 }}>Release</th>
            {METRIC_GROUPS.map(([group, fields]) => (
              <th key={group} colSpan={fields.length} style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--bg)", textAlign: "center", borderLeft: "1px solid var(--border)" }}>{group}</th>
            ))}
            <th style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--bg)" }}>Note</th>
            {manual && <th style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--bg)" }}></th>}
          </tr>
          <tr>
            <th style={{ position: "sticky", top: 27, left: 0, zIndex: 4, background: "var(--bg)", borderRight: "2px solid var(--accent)" }}></th>
            {METRIC_GROUPS.flatMap(([group, fields]) => fields.map(([key, label]) => (
              <th key={key} style={{ position: "sticky", top: 27, zIndex: 3, background: "var(--bg)", fontSize: 10, fontWeight: 400, borderLeft: GROUP_START_KEYS.has(key) ? "1px solid var(--border)" : undefined }}>{label}</th>
            )))}
            <th style={{ position: "sticky", top: 27, zIndex: 3, background: "var(--bg)" }}></th>
            {manual && <th style={{ position: "sticky", top: 27, zIndex: 3, background: "var(--bg)" }}></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.release?.id || row.metrics.id || i}>
              <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--bg)", borderRight: "2px solid var(--accent)", padding: "4px 10px", width: 300, minWidth: 300, maxWidth: 300 }}>
                {manual ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <input className={styles.input} style={{ padding: "3px 6px", fontSize: 11 }} defaultValue={row.metrics.manual_title || ""} placeholder="Title…" onBlur={(e) => onUpdate(row, "manual_title", e.target.value)} />
                      <input className={styles.input} style={{ padding: "3px 6px", fontSize: 11 }} defaultValue={row.metrics.manual_artist || ""} placeholder="Artist…" onBlur={(e) => onUpdate(row, "manual_artist", e.target.value)} />
                      <input type="date" className={styles.input} style={{ padding: "3px 6px", fontSize: 11 }} defaultValue={row.metrics.manual_release_date || ""} onBlur={(e) => onUpdate(row, "manual_release_date", e.target.value)} />
                    </div>
                    <DidSearchField
                      row={row}
                      value={row.metrics.manual_did || ""}
                      onSaveText={(value) => onUpdate(row, "manual_did", value)}
                      onLink={(release) => onLink(row, release)}
                    />
                  </div>
                ) : (
                  <div style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <Link href={`/releases/${row.release.id}`} className={styles.rowLink}>{row.release.title}</Link>
                    <span style={{ color: "var(--text-faint)" }}> — {row.release.main_artist} · {fmtDate(row.release.release_date)}</span>
                  </div>
                )}
              </td>
              {ALL_METRIC_KEYS.map((key) => (
                <td key={key} style={{ padding: "3px 4px", borderLeft: GROUP_START_KEYS.has(key) ? "1px solid var(--border)" : undefined }}>
                  <input
                    className={styles.input}
                    style={{ padding: "3px 6px", fontSize: 11, width: 80 }}
                    defaultValue={row.metrics[key] || ""}
                    onBlur={(e) => onUpdate(row, key, e.target.value)}
                  />
                </td>
              ))}
              <td style={{ minWidth: 140, padding: "3px 4px" }}>
                <input className={styles.input} style={{ padding: "3px 6px", fontSize: 11 }} defaultValue={row.metrics.stream_note || ""} onBlur={(e) => onUpdate(row, "stream_note", e.target.value)} />
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

// A real DID search, not just a free-typed label — types into it search
// releases by did/legacy_id (debounced), and picking a result merges this
// Bổ Sung entry's numbers straight into that release's real metrics row
// (see linkSupplementToRelease above), which is the whole point: once the
// song this row was tracking shows up in the real dashboard, its numbers
// should land on that release, not just sit next to a DID string forever.
// Still saves whatever's typed as plain text (manual_did) on blur even
// with no match, so a not-yet-existing DID is at least recorded for later.
function DidSearchField({ row, value, onSaveText, onLink }) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query || query.trim().length < 3) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("releases")
        .select("id, did, title, main_artist")
        .or(`did.ilike.%${query.trim()}%,legacy_id.ilike.%${query.trim()}%`)
        .limit(8);
      if (!cancelled) {
        setResults(data || []);
        setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  return (
    <div style={{ position: "relative" }}>
      <input
        className={styles.input}
        style={{ padding: "3px 6px", fontSize: 11, width: "100%" }}
        value={query}
        placeholder="Related DID — search to link…"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          onSaveText(query);
          // Delay closing so a click on a result registers before the
          // dropdown unmounts.
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && query.trim().length >= 3 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, marginTop: 2, maxHeight: 180, overflowY: "auto" }}>
          {searching ? (
            <div style={{ padding: 8, fontSize: 11, color: "#888" }}>Searching…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: 8, fontSize: 11, color: "#888" }}>No matching release — will be saved as text only.</div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep the input's onBlur from firing before the click registers
                onClick={() => { onLink(r); setOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "6px 8px", cursor: "pointer", borderBottom: "1px solid #262626" }}
              >
                <div style={{ fontSize: 11, color: "#f4f4f4" }}>{r.title} — {r.main_artist}</div>
                <div style={{ fontSize: 10, color: "#888" }}>{r.did}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
