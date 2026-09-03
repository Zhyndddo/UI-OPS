"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "../../../lib/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate, fetchAllRows } from "../../../lib/helpers";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import { buildStreamNote } from "../../../lib/releaseNotes";
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

// Round 67 — this page used to pull the ENTIRE release_stream_metrics
// table (every release, every metric column) on every single page load,
// then render every month's full table simultaneously — Monthly alone
// could mean dozens of months × dozens of releases × ~10 inputs each, all
// mounted in the DOM at once. That's a genuinely heavy synchronous React
// commit, on top of the network cost, and is the real freeze culprit
// here (separate from — and can't be throttled away the same as — the
// Labels page fix in round 66, since this data is what the page actually
// renders, not a background sync).
//
// Redesigned per your idea: Monthly's months are now collapsible and
// start collapsed. A month's metrics only get fetched from the DB the
// first time it's expanded ("running the database again"); collapsing it
// back just stops rendering its table — the fetched data stays cached in
// memory ("local store"), so re-expanding the same month later is instant
// with no new query. Nothing here periodically refreshes a collapsed
// month's cached data in the background — once fetched it just sits there
// for the rest of the session; simplest option per your "or just don't at
// all." Which months were open gets remembered in sessionStorage
// (STREAM_EXPANDED_MONTHS_KEY) so a reload within the same browser
// session re-expands (and re-fetches) exactly the months you had open —
// "ran as much table as needed" — while a fresh session always starts
// fully collapsed ("otherwise just normal").
const STREAM_EXPANDED_MONTHS_KEY = "vieent_stream_expanded_months";

export default function StreamWorkstation() {
  const [tab, setTab] = useState("today");
  const [releases, setReleases] = useState([]);
  const [metricsByRelease, setMetricsByRelease] = useState({}); // release_id -> metrics row, populated lazily per section
  const [supplements, setSupplements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthlySearch, setMonthlySearch] = useState(""); // Monthly tab only — title/artist/DID, so an old entry can be found without scrolling every month
  const [expandedMonths, setExpandedMonths] = useState(() => new Set());
  const [loadingMonths, setLoadingMonths] = useState(() => new Set());
  const loadedReleaseIdsRef = useRef(new Set()); // ref, not state — needs synchronous dedup checks across rapid calls (search firing several at once)
  const restoredExpandedRef = useRef(false); // only ever restore session state once, right after releases first load

  useEffect(() => {
    if (!supabase) return;
    load();
  }, []);

  async function load() {
    setLoading(true);
    // Round 60 — fetchAllRows instead of a plain select(): whole-table
    // read, no filter, subject to Supabase's default 1000-row cap (see
    // DATA_FIXES.md round 59/60). Still needed in full here — grouping
    // into months and the Monthly search both need every release's
    // date/title/artist/DID up front, and that's lightweight text, not
    // the heavy part. The heavy part (release_stream_metrics, one row per
    // release with ~10 metric columns) is what round 67 below stopped
    // pulling in bulk.
    const { data: rels } = await fetchAllRows(() =>
      supabase.from("releases").select("id, did, title, main_artist, release_date, upc, isrc, smartlink, label").order("id")
    );
    setReleases(rels || []);

    const { data: supp } = await supabase.from("release_stream_metrics").select("*").is("release_id", null).order("manual_release_date", { ascending: false });
    setSupplements(supp || []);

    setLoading(false);
  }

  // Round 67 — fetches metrics rows for exactly the given release ids
  // (a month's releases, Today Check's handful, or a search match), skips
  // any id already cached, and auto-creates a metrics row for any of them
  // that doesn't have one yet (same "every release gets a row" guarantee
  // load() used to do for the whole table up front — now done lazily,
  // scoped to only the releases actually being looked at).
  async function ensureMetricsLoaded(ids) {
    const missing = ids.filter((id) => !loadedReleaseIdsRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => loadedReleaseIdsRef.current.add(id));
    const { data: metricRows } = await supabase.from("release_stream_metrics").select("*").in("release_id", missing);
    const found = new Map((metricRows || []).map((m) => [m.release_id, m]));
    const stillMissing = missing.filter((id) => !found.has(id));
    let created = [];
    if (stillMissing.length > 0) {
      const { data } = await supabase.from("release_stream_metrics").insert(stillMissing.map((release_id) => ({ release_id }))).select();
      created = data || [];
    }
    if (found.size > 0 || created.length > 0) {
      setMetricsByRelease((prev) => {
        const next = { ...prev };
        found.forEach((m, id) => { next[id] = m; });
        created.forEach((m) => { next[m.release_id] = m; });
        return next;
      });
    }
  }

  function persistExpandedMonths(set) {
    try { window.sessionStorage.setItem(STREAM_EXPANDED_MONTHS_KEY, JSON.stringify([...set])); } catch {}
  }

  async function toggleMonth(month, monthReleaseIds) {
    const willOpen = !expandedMonths.has(month);
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (willOpen) next.add(month); else next.delete(month);
      persistExpandedMonths(next);
      return next;
    });
    if (!willOpen) return;
    setLoadingMonths((prev) => new Set(prev).add(month));
    await ensureMetricsLoaded(monthReleaseIds);
    setLoadingMonths((prev) => { const next = new Set(prev); next.delete(month); return next; });
  }

  async function updateMetric(row, field, value, isSupplement) {
    const patch = { [field]: value, updated_at: new Date().toISOString() };
    if (isSupplement) {
      setSupplements((prev) => prev.map((s) => (s.id === row.id ? { ...s, ...patch } : s)));
    } else {
      setMetricsByRelease((prev) => ({ ...prev, [row.release_id]: { ...prev[row.release_id], ...patch } }));
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
      setMetricsByRelease((prev) => ({ ...prev, [release.id]: { ...targetRow, ...patch } }));
    } else {
      // No metrics row for that release yet (shouldn't normally happen —
      // ensureMetricsLoaded auto-creates one the first time that
      // release's month/section is opened) — repurpose this Bổ Sung row
      // into the real one instead of losing it.
      const { error: updErr } = await supabase
        .from("release_stream_metrics")
        .update({ release_id: release.id, manual_title: null, manual_artist: null, manual_release_date: null, manual_upc: null, manual_did: null })
        .eq("id", supplementRow.id);
      if (updErr) { window.alert(`Link failed: ${updErr.message}`); return; }
      setMetricsByRelease((prev) => ({ ...prev, [release.id]: { ...supplementRow, release_id: release.id } }));
    }
    // This release now has a known-good metrics row in state regardless of
    // whether its month has ever been expanded — mark it loaded so
    // ensureMetricsLoaded doesn't stomp it with a fresh fetch later.
    loadedReleaseIdsRef.current.add(release.id);
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

  // Today Check is small (day-1/day-2/day-7 releases only) and is the
  // default tab, so it's fine to just always fetch its metrics as soon as
  // the release list is in, rather than waiting for a manual expand.
  useEffect(() => {
    if (todayCheckReleases.length === 0) return;
    ensureMetricsLoaded(todayCheckReleases.map((r) => r.id));
  }, [todayCheckReleases]);

  // Round 67 — restores whichever months were expanded before (this
  // browser session only — sessionStorage, not localStorage), and
  // re-fetches all of them. Guarded to run exactly once, right after
  // releases first populate — monthlyGroups needs `releases` loaded to
  // know each remembered month's release ids.
  useEffect(() => {
    if (restoredExpandedRef.current || releases.length === 0) return;
    restoredExpandedRef.current = true;
    let saved = [];
    try { saved = JSON.parse(window.sessionStorage.getItem(STREAM_EXPANDED_MONTHS_KEY) || "[]"); } catch {}
    if (!Array.isArray(saved) || saved.length === 0) return;
    const groupMap = new Map(monthlyGroups);
    const valid = saved.filter((m) => groupMap.has(m));
    if (valid.length === 0) return;
    setExpandedMonths(new Set(valid));
    setLoadingMonths(new Set(valid));
    valid.forEach(async (m) => {
      await ensureMetricsLoaded(groupMap.get(m).map((r) => r.id));
      setLoadingMonths((prev) => { const next = new Set(prev); next.delete(m); return next; });
    });
  }, [releases, monthlyGroups]);

  // While actively searching Monthly, every matched month is shown
  // regardless of its collapsed/expanded state (see isOpen below) — load
  // data for those too, so results aren't just names with blank numbers.
  useEffect(() => {
    if (!monthlySearch.trim()) return;
    filteredMonthlyGroups.forEach(([, rels]) => ensureMetricsLoaded(rels.map((r) => r.id)));
  }, [monthlySearch, filteredMonthlyGroups]);

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
                style={{ border: tab === key ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: tab === key ? "rgba(255,107,26,0.1)" : "transparent" }}
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
                rows={todayCheckReleases.map((r) => ({ release: r, metrics: metricsByRelease[r.id] || {} }))}
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
                {/* Month index — jumps straight to a month AND expands it
                    (round 67 — months start collapsed now, so a plain
                    anchor scroll would've just landed on a closed header).
                    Hidden while searching, since search already narrows
                    things down to a handful of months at most, all shown
                    open. */}
                {!monthlySearch && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                    {monthlyGroups.map(([month, rels]) => (
                      <button
                        key={month}
                        onClick={() => {
                          if (!expandedMonths.has(month)) toggleMonth(month, rels.map((r) => r.id));
                          document.getElementById(`stream-month-${month}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className={styles.tabBtn}
                        style={{ border: "1px solid var(--border)", borderRadius: 6 }}
                      >
                        {month}
                      </button>
                    ))}
                  </div>
                )}
                {filteredMonthlyGroups.length === 0 ? (
                  <div className={styles.emptyState}>No matches for "{monthlySearch}".</div>
                ) : (
                  filteredMonthlyGroups.map(([month, rels]) => {
                    // Round 67 — collapsible per-month sections. Forced
                    // open while actively searching (a filtered result
                    // list is already small — no point re-collapsing it),
                    // otherwise driven by expandedMonths (manual toggle or
                    // restored from sessionStorage on load).
                    const isOpen = !!monthlySearch.trim() || expandedMonths.has(month);
                    const isLoading = loadingMonths.has(month) && !rels.some((r) => metricsByRelease[r.id]);
                    return (
                      <div key={month} id={`stream-month-${month}`} style={{ marginBottom: 12, scrollMarginTop: 16 }}>
                        <button
                          onClick={() => toggleMonth(month, rels.map((r) => r.id))}
                          className={styles.subheading}
                          style={{ marginTop: 0, marginBottom: isOpen ? 10 : 0, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0, width: "100%", textAlign: "left", fontFamily: "inherit" }}
                        >
                          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{isOpen ? "▾" : "▸"}</span>
                          {month}
                          <span style={{ color: "var(--text-faint)", fontWeight: 400, fontSize: 12 }}>({rels.length})</span>
                        </button>
                        {isOpen && (
                          isLoading ? (
                            <div className={styles.emptyState} style={{ padding: 12 }}>Loading…</div>
                          ) : (
                            <StreamTable
                              rows={rels.map((r) => ({ release: r, metrics: metricsByRelease[r.id] || {} }))}
                              onUpdate={(row, field, value) => updateMetric(row.metrics, field, value, false)}
                            />
                          )
                        )}
                      </div>
                    );
                  })
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

// Round 244 — per explicit request: a metric number changing should
// regenerate this row's note, but ONLY when there's actually an existing
// note that regenerating would change — an empty note has nothing to
// protect (stays exactly as manual/optional as before), and a metric
// that doesn't move buildStreamNote's output at all (typing the SAME
// value back, or a Facebook column, which isn't part of the note formula
// — see buildStreamNote in lib/releaseNotes.js) never needs to ask.
// Deliberately checks "would the recomputed note actually differ" rather
// than hardcoding which of the 9 metric columns are formula-relevant —
// stays correct on its own if the formula's inputs ever change, and
// naturally excludes Facebook's 2 columns without a separate list to
// keep in sync.
// On confirm: saves BOTH the new number and the freshly regenerated note
// together, so the row's note is never left stale relative to its own
// numbers. On cancel: the metric edit itself is undone too (the input is
// reset back to its pre-blur value, uncontrolled input, so this writes
// straight to the DOM node) — there's no "keep the new number but leave
// the old note" middle ground, since that's exactly the stale state this
// exists to prevent.
function handleMetricBlur(row, key, e, onUpdate) {
  const newValue = e.target.value;
  const oldValue = row.metrics[key] || "";
  if (newValue === oldValue) return; // no real change — nothing to protect, normal no-op save isn't even needed
  const currentNote = row.metrics.stream_note || "";
  const freshNote = buildStreamNote({ ...row.metrics, [key]: newValue });
  if (currentNote && currentNote !== freshNote) {
    const ok = window.confirm("This number changed — regenerating this row's note will replace what's currently saved. Continue?");
    if (!ok) {
      e.target.value = oldValue;
      return;
    }
    onUpdate(row, key, newValue);
    onUpdate(row, "stream_note", freshNote);
    return;
  }
  onUpdate(row, key, newValue);
}

function StreamTable({ rows, onUpdate, onRemove, onLink, manual }) {
  return (
    <div className={styles.scrollBox} style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh" }}>
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
                    onBlur={(e) => handleMetricBlur(row, key, e, onUpdate)}
                  />
                </td>
              ))}
              <td style={{ minWidth: 140, padding: "3px 4px" }}>
                {/* stream_note itself stays free text — this is a
                    DIFFERENT thing, per explicit feedback: a live-computed
                    preview built from this row's own metric columns (same
                    formula as the team's Google Sheet, see
                    lib/releaseNotes.js's buildStreamNote), offered as
                    something to copy in rather than silently overwriting
                    whatever's already been typed. */}
                <StreamNoteCell row={row} onUpdate={onUpdate} />
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

// Round 244 — per explicit request, the free-text input that used to sit
// directly in this cell is gone: the cell now only ever shows a Copy
// button (copies whatever's currently saved to clipboard) plus the same
// "▸ Auto note" trigger as before. Editing/fixing the note itself now
// happens ONLY inside the popup, in an editable box — "Allow fix in the
// popup panel" — pre-filled from the CURRENT saved note (never from the
// auto-computed text) so opening the popup can never itself lose a
// manual note. The popup's own "Use this" still does exactly what it did
// before: fills the box with the live-computed buildStreamNote() text —
// it just no longer saves directly, since there's a Save button now that
// commits whatever's actually in the box (typed by hand, pulled in via
// "Use this", or a mix of both edited afterward).
// The trigger is no longer gated on `generated` being non-empty — with
// the inline input gone, this popup is the ONLY way to write a note at
// all, so a release with no metrics yet (nothing for buildStreamNote to
// compute) still needs a way to open it and type one by hand.
function StreamNoteCell({ row, onUpdate }) {
  // Round 155 item 2 follow-up — Auto Note is a real centered modal popup
  // (same fixed-inset-overlay pattern as lib/ReleaseNotePopup.js), not a
  // small box anchored under the input inside the table row/cell — per
  // explicit request, since living in that cramped container made it
  // easy to miss and easy to accidentally close.
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const generated = buildStreamNote(row.metrics);
  const note = row.metrics.stream_note || "";

  function openPopup() {
    setDraft(note); // starts from what's actually saved, not the auto text — opening the popup never discards a manual note on its own
    setOpen(true);
  }

  function handleCopy() {
    navigator.clipboard?.writeText(note).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleSave() {
    onUpdate(row, "stream_note", draft);
    setOpen(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
      <button
        type="button"
        onClick={handleCopy}
        disabled={!note}
        title={note || "No note saved yet"}
        style={{ background: "none", border: "1px solid var(--border)", borderRadius: 4, color: note ? "var(--text-muted)" : "var(--text-faint)", fontSize: 10, cursor: note ? "pointer" : "default", padding: "2px 6px", opacity: note ? 1 : 0.5 }}
      >
        {copied ? "Copied!" : "📋 Copy"}
      </button>
      <button
        type="button"
        onClick={openPopup}
        style={{ background: "none", border: "none", color: "var(--accent-soft)", fontSize: 10, cursor: "pointer", padding: "2px 0" }}
      >
        ▸ Auto note
      </button>
      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 20, maxWidth: 420, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}>Note</div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              placeholder="No note yet — type one, or use the auto-computed text below."
              style={{ width: "100%", boxSizing: "border-box", fontSize: 12, color: "var(--text)", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontFamily: "inherit", resize: "vertical" }}
            />
            {generated ? (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginTop: 12, marginBottom: 4 }}>Auto-computed (reference)</div>
                <pre style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>{generated}</pre>
                <button
                  type="button"
                  onClick={() => setDraft(generated)}
                  style={{ marginTop: 6, background: "none", border: "none", color: "var(--accent-soft)", fontSize: 11, cursor: "pointer", padding: 0 }}
                >
                  Use this — fills the box above with this text (not saved until you click Save)
                </button>
              </>
            ) : (
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 10 }}>No metrics entered yet, so there's nothing to auto-compute — type a note above directly.</div>
            )}
            <button type="button" className={styles.btnPrimary} style={{ marginTop: 14, width: "100%" }} onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      )}
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
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, background: "var(--bg-hover)", border: "1px solid #333", borderRadius: 6, marginTop: 2, maxHeight: 180, overflowY: "auto" }}>
          {searching ? (
            <div style={{ padding: 8, fontSize: 11, color: "var(--text-faint)" }}>Searching…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: 8, fontSize: 11, color: "var(--text-faint)" }}>No matching release — will be saved as text only.</div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep the input's onBlur from firing before the click registers
                onClick={() => { onLink(r); setOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "6px 8px", cursor: "pointer", borderBottom: "1px solid var(--border)" }}
              >
                <div style={{ fontSize: 11, color: "#f4f4f4" }}>{r.title} — {r.main_artist}</div>
                <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{r.did}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
