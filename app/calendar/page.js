"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate } from "../../lib/helpers";
import styles from "../shared.module.css";

// Round 172 item 3 — new sidebar entry, per explicit request: "make me a
// new side bar item, label 'Calendar'; this is like a kanban calendar.
// taking the result from the recent 3 weeks, last-this-next for data."
// Clarified in follow-up: cards = releases, anchored to release_date.
//
// Layout: 3 columns (Last Week / This Week / Next Week, Mon–Sun), each a
// mini kanban board — releases falling in that week are grouped into
// lanes by project_type (the same field that drives the pipeline
// everywhere else in this app — see PIPELINE_STAGES in
// app/releases/[id]/page.js and lib/packageSimulator.js), lane order
// matches the real pipeline order (BRIEF & DATA → SENT TO MARKETING →
// DEALING) followed by every resolved package type alphabetically, "no
// package yet" last. Tapping a card opens that release's detail page.
const PIPELINE_ORDER = ["BRIEF & DATA", "SENT TO MARKETING", "DEALING"];
const MS_DAY = 24 * 60 * 60 * 1000;

function startOfWeek(date) {
  // Monday-anchored week, matching the app's other week-based UI (Booking
  // Board etc. all read Mon–Sun as "the week").
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function addDays(date, n) {
  return new Date(date.getTime() + n * MS_DAY);
}

function fmtRange(start, end) {
  const opts = { day: "2-digit", month: "2-digit" };
  return `${start.toLocaleDateString("vi-VN", opts)} – ${end.toLocaleDateString("vi-VN", opts)}`;
}

function laneSort(a, b) {
  const ia = PIPELINE_ORDER.indexOf(a);
  const ib = PIPELINE_ORDER.indexOf(b);
  if (a === "—" ) return 1;
  if (b === "—") return -1;
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  return a.localeCompare(b);
}

export default function CalendarPage() {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);

  const weeks = useMemo(() => {
    const thisStart = startOfWeek(new Date());
    return [
      { key: "last", label: "Last Week", start: addDays(thisStart, -7) },
      { key: "this", label: "This Week", start: thisStart },
      { key: "next", label: "Next Week", start: addDays(thisStart, 7) },
    ].map((w) => ({ ...w, end: addDays(w.start, 6) }));
  }, []);

  useEffect(() => {
    if (!supabase || weeks.length === 0) return;
    const rangeStart = weeks[0].start;
    const rangeEnd = addDays(weeks[weeks.length - 1].end, 1); // exclusive upper bound
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("releases")
        .select("id, did, title, main_artist, project_type, release_date, release_category")
        .gte("release_date", rangeStart.toISOString().slice(0, 10))
        .lt("release_date", rangeEnd.toISOString().slice(0, 10))
        .order("release_date");
      setReleases(data || []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function releasesForWeek(week) {
    return releases.filter((r) => {
      if (!r.release_date) return false;
      const d = new Date(r.release_date);
      return d >= week.start && d <= week.end;
    });
  }

  function laneGroups(weekReleases) {
    const groups = {};
    weekReleases.forEach((r) => {
      const lane = r.project_type || "—";
      if (!groups[lane]) groups[lane] = [];
      groups[lane].push(r);
    });
    return Object.keys(groups).sort(laneSort).map((lane) => ({ lane, items: groups[lane] }));
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 1400 }}>
          <div className={styles.eyebrow}>// Overview</div>
          <h1 className={styles.title}>Calendar</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -16, marginBottom: 24 }}>
            Releases by release date — last, this, and next week, grouped by pipeline stage.
          </p>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : (
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", overflowX: "auto" }}>
              {weeks.map((week) => {
                const weekReleases = releasesForWeek(week);
                const groups = laneGroups(weekReleases);
                return (
                  <div key={week.key} style={{ flex: "1 1 0", minWidth: 280, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: week.key === "this" ? "var(--accent)" : "var(--text)" }}>{week.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{fmtRange(week.start, week.end)} · {weekReleases.length} release{weekReleases.length === 1 ? "" : "s"}</div>
                    </div>

                    {groups.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No releases this week.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {groups.map(({ lane, items }) => (
                          <div key={lane}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>
                              {lane} <span style={{ fontWeight: 400 }}>({items.length})</span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {items.map((r) => (
                                <Link
                                  key={r.id}
                                  href={`/releases/${r.id}`}
                                  style={{
                                    display: "block",
                                    background: "var(--bg)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 6,
                                    padding: "8px 10px",
                                    textDecoration: "none",
                                    color: "var(--text)",
                                  }}
                                >
                                  <div style={{ fontSize: 12, fontWeight: 700 }}>{r.title || "—"}</div>
                                  <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.main_artist || "—"}</div>
                                  <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>{fmtDate(r.release_date)} · {r.did || "—"}</div>
                                </Link>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
