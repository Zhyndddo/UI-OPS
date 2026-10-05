"use client";

// Round 462 — Phase 4 of task-tracker-kpi-overhaul-spec.md: the KPI table
// folded into Task Table as a "Performance" tab (replaces the standalone
// /kpi prototype from Rounds 459-461, which now just redirects here).
// Scoping is done by the CALLER (app/task-table/page.js builds `groups`
// from the exact same role rules the existing tabs use — exc: self only,
// teamlead/admin: own team (OPS admin: per-subteam), dev: every team), so
// this component never decides who may see whom.
// Live mode computes from tickets/workstations right now; History mode
// rolls up Phase 3's stored daily snapshots.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { fetchAllRows } from "./helpers";
import { TICKET_TYPE_LABELS, WORKSTATION_TYPE_LABELS } from "./teamTypes";
import { percentileMs, fmtDuration, fmtPct } from "./kpiMetrics";
import { computeLiveKpis, rollupSnapshots } from "./kpiData";
import styles from "../app/shared.module.css";

// Round 460 — workstation rows use "ws:<assignment key>" as their type.
const WS_LABELS = {
  "ws:upload": WORKSTATION_TYPE_LABELS.upload,
  "ws:confirm_phase1": `${WORKSTATION_TYPE_LABELS.confirm} — Phase 1`,
  "ws:confirm_phase2": `${WORKSTATION_TYPE_LABELS.confirm} — Phase 2`,
  "ws:pre_release": WORKSTATION_TYPE_LABELS.pre_release,
};
function typeLabel(t) { return TICKET_TYPE_LABELS[t] || WS_LABELS[t] || t; }

function pad2(n) { return String(n).padStart(2, "0"); }
function isoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

// Period presets — periodEnd is EXCLUSIVE (see computeTicketKpis), so
// "today" is [today, tomorrow), "this month" is [1st, 1st-of-next-month),
// etc. Matches calendar boundaries, not a rolling N-day window.
function periodRange(preset) {
  const now = new Date();
  if (preset === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return { start: isoDate(start), end: isoDate(end) };
  }
  if (preset === "week") {
    // Monday-start week, same convention lib/weeklyTasks.js's
    // currentWeekStartStr uses elsewhere in this app.
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = (start.getDay() + 6) % 7; // Mon=0..Sun=6
    start.setDate(start.getDate() - dow);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    return { start: isoDate(start), end: isoDate(end) };
  }
  if (preset === "quarter") {
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), qStartMonth, 1);
    const end = new Date(now.getFullYear(), qStartMonth + 3, 1);
    return { start: isoDate(start), end: isoDate(end) };
  }
  if (preset === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear() + 1, 0, 1);
    return { start: isoDate(start), end: isoDate(end) };
  }
  // "month" — default
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start: isoDate(start), end: isoDate(end) };
}


const PRESETS = [["today", "Today"], ["week", "This Week"], ["month", "This Month"], ["quarter", "This Quarter"], ["year", "This Year"]];

// groups: [{ title, members: [{id, name, segment}] }]
export default function KpiPerformanceView({ groups }) {
  const [preset, setPreset] = useState("month");
  const [mode, setMode] = useState("live");
  const [loading, setLoading] = useState(true);
  const [byProfile, setByProfile] = useState(new Map());
  const [historyError, setHistoryError] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const { start: periodStart, end: periodEnd } = periodRange(preset);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let merged;
      if (mode === "history") {
        const { data: snaps, error } = await fetchAllRows(() =>
          supabase.from("task_kpi_daily_snapshots").select("*").gte("snapshot_date", periodStart).lt("snapshot_date", periodEnd)
        );
        if (!cancelled) setHistoryError(error ? error.message : null);
        merged = rollupSnapshots(snaps || []);
      } else {
        if (!cancelled) setHistoryError(null);
        merged = await computeLiveKpis(supabase, { periodStart, periodEnd });
      }
      if (cancelled) return;
      setByProfile(merged);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [periodStart, periodEnd, mode]);

  const presentTypes = useMemo(() => {
    const set = new Set();
    groups.forEach((g) => g.members.forEach((m) => byProfile.get(m.id)?.forEach((_, t) => set.add(t))));
    return [...set].sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)));
  }, [groups, byProfile]);

  const tabStyle = (on, fs) => ({ border: on ? "1px solid var(--accent)" : "1px solid var(--border)", borderRadius: 6, background: on ? "rgba(255,107,26,0.1)" : "transparent", fontSize: fs });

  return (
    <div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 12, maxWidth: 760 }}>
        Throughput, on-time rate, cycle time and backlog per person and type. Co-tagged PICs each count in full.
        Workstation rows only have Open now live; their throughput comes from stored history.
      </p>
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {[["live", "Live"], ["history", "History (daily snapshots)"]].map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} className={`${styles.tabBtn} ${mode === k ? styles.tabBtnActive : ""}`} style={tabStyle(mode === k, 12)}>{l}</button>
        ))}
      </div>
      {mode === "history" && (
        <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 0, marginBottom: 10, maxWidth: 760 }}>
          {historyError
            ? `Couldn't read snapshots (${historyError}) — has add-round461-task-kpi-snapshots.sql been run?`
            : "Stored daily snapshots only — days before the nightly job (or a ticket backfill) won't appear. Cycle time is a mean here; Open/Overdue show the latest stored gauge in range."}
        </p>
      )}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {PRESETS.map(([k, l]) => (
          <button key={k} onClick={() => setPreset(k)} className={`${styles.tabBtn} ${preset === k ? styles.tabBtnActive : ""}`} style={tabStyle(preset === k, undefined)}>{l}</button>
        ))}
      </div>
      <select className={styles.select} style={{ marginBottom: 16 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
        <option value="all">All types</option>
        {presentTypes.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
      </select>

      {loading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : (
        groups.map((g) => {
          const rows = [];
          let tThroughput = 0, tOpen = 0, tOverdue = 0;
          g.members.forEach((m) => {
            byProfile.get(m.id)?.forEach((bucket, type) => {
              if (typeFilter !== "all" && type !== typeFilter) return;
              if (bucket.throughput === 0 && bucket.openCount === 0) return;
              tThroughput += bucket.throughput; tOpen += bucket.openCount; tOverdue += bucket.overdueCount;
              rows.push({ m, type, bucket });
            });
          });
          rows.sort((a, b) => a.m.name.localeCompare(b.m.name) || typeLabel(a.type).localeCompare(typeLabel(b.type)));
          return (
            <div key={g.title} style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 15, marginBottom: 4 }}>{g.title}</h2>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8 }}>
                Total: {tThroughput} closed · {tOpen} open now · <span style={{ color: tOverdue ? "#ff8a80" : undefined }}>{tOverdue} overdue</span>
              </div>
              {rows.length === 0 ? (
                <div className={styles.emptyState}>No activity for this period/filter.</div>
              ) : (
                <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Person</th><th>Type</th>
                        <th title="Closed in this period">Throughput</th>
                        <th title="Closed on/before deadline — only types with a real deadline field">On-time</th>
                        <th title="Live: median created→closed. History: mean.">{mode === "history" ? "Cycle (mean)" : "Cycle (p50)"}</th>
                        <th title="Currently open">Open now</th>
                        <th title="Currently open and past deadline">Overdue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ m, type, bucket }) => (
                        <tr key={`${m.id}:${type}`}>
                          <td>{m.name}</td>
                          <td>{typeLabel(type)}</td>
                          <td style={{ textAlign: "center" }}>{bucket.throughput || "—"}</td>
                          <td style={{ textAlign: "center" }} title={bucket.onTimeEligible ? `${bucket.onTimeCount}/${bucket.onTimeEligible}` : "no deadline-eligible closures"}>{fmtPct(bucket.onTimeCount, bucket.onTimeEligible)}</td>
                          <td style={{ textAlign: "center" }}>{mode === "history" ? fmtDuration(bucket.cycleCount ? bucket.cycleSumMs / bucket.cycleCount : null) : fmtDuration(percentileMs(bucket.cycleTimesMs, 50))}</td>
                          <td style={{ textAlign: "center" }}>{bucket.openCount || "—"}</td>
                          <td style={{ textAlign: "center", color: bucket.overdueCount > 0 ? "#ff8a80" : undefined }}>{bucket.overdueCount || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
