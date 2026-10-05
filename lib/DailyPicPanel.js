"use client";

// Round 458 — Milestone has no per-release row to hang a PIC on (its
// workflow is a chart-entry log, not a release list — see
// task-tracker-kpi-overhaul-spec.md §3b), so per explicit request this
// tracks PIC per LOG DAY instead: one person responsible for a given
// date's entries, not a tag list. Reuses workstation_assignments (same
// table every other workstation's PIC lives on) but keyed differently —
// `release_id` is always null here, `column_key` holds the date string
// (YYYY-MM-DD) instead of "all". A real human pick always wins/persists,
// same precedence rule as every other PIC field in this app; any day with
// no row yet (including every day before today — the "backfill" ask)
// shows and gets auto-assigned to `defaultEmail` the moment this panel
// sees that date in its `dates` list.
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { resolveProfilesByEmail } from "./pingNotification";
import { logPicReassign, logAudit } from "./auditLog";
import { useAuth } from "./AuthContext";

export default function DailyPicPanel({ styles, workstation, dates, defaultEmail, profiles, label }) {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState({}); // date -> { id, profileId, autoAssigned }
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!supabase || dates.length === 0) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workstation, dates.join(",")]);

  async function load() {
    setLoading(true);
    const { data: rows } = await supabase
      .from("workstation_assignments")
      .select("id, column_key, pic_profile_id, pic_profile_ids, auto_assigned")
      .eq("workstation", workstation)
      .is("release_id", null)
      .in("column_key", dates);

    const map = {};
    (rows || []).forEach((r) => {
      const ids = r.pic_profile_ids || (r.pic_profile_id ? [r.pic_profile_id] : []);
      map[r.column_key] = { id: r.id, profileId: ids[0] || null, autoAssigned: r.auto_assigned };
    });

    // Backfill — any date in `dates` (today, plus every earlier date this
    // page already has entries for) with no row yet defaults to
    // `defaultEmail`, exactly like a fresh auto-assign everywhere else.
    const missing = dates.filter((d) => !map[d]);
    if (missing.length > 0) {
      const ids = await resolveProfilesByEmail(defaultEmail);
      const defaultId = ids[0] || null;
      if (defaultId) {
        const inserted = await Promise.all(
          missing.map((d) =>
            supabase
              .from("workstation_assignments")
              .insert({ workstation, column_key: d, release_id: null, pic_profile_id: defaultId, pic_profile_ids: [defaultId], auto_assigned: true })
              .select("id")
              .single()
          )
        );
        missing.forEach((d, i) => {
          const row = inserted[i]?.data;
          if (row) map[d] = { id: row.id, profileId: defaultId, autoAssigned: true };
          logAudit({ actor: null, action: "auto_assign", entity: "workstation_assignment", entityId: `${workstation}:${d}`, field: "pic", before: null, after: defaultId });
        });
      }
    }

    setAssignments(map);
    setLoading(false);
  }

  async function setPic(date, profileId) {
    const before = assignments[date]?.profileId ?? null;
    const existingId = assignments[date]?.id;
    setAssignments((prev) => ({ ...prev, [date]: { ...prev[date], profileId, autoAssigned: false } }));
    logPicReassign({ actor: profile?.id, entity: "workstation_assignment", entityId: `${workstation}:${date}`, before, after: profileId || null });
    if (!profileId) {
      if (existingId) await supabase.from("workstation_assignments").delete().eq("id", existingId);
      return;
    }
    const { error } = existingId
      ? await supabase.from("workstation_assignments").update({ pic_profile_id: profileId, pic_profile_ids: [profileId], auto_assigned: false }).eq("id", existingId)
      : await supabase.from("workstation_assignments").insert({ workstation, column_key: date, release_id: null, pic_profile_id: profileId, pic_profile_ids: [profileId], auto_assigned: false });
    if (error) {
      setAssignments((prev) => ({ ...prev, [date]: { ...prev[date], profileId: before, autoAssigned: prev[date]?.autoAssigned } }));
      alert(`Couldn't save PIC — try again. (${error.message})`);
    }
  }

  if (dates.length === 0) return null;

  const [todayDate, ...pastDates] = dates; // dates is caller-sorted, newest first

  function Row({ date }) {
    const a = assignments[date];
    return (
      <div key={date} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
        <span style={{ fontSize: 12, color: "var(--text-faint)", minWidth: 90 }}>{date}</span>
        <select
          className={styles.select}
          style={{ padding: "4px 8px", fontSize: 12, minWidth: "16ch" }}
          value={a?.profileId || ""}
          onChange={(e) => setPic(date, e.target.value || null)}
        >
          <option value="">— Unassigned —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {a?.autoAssigned && <span style={{ fontSize: 10, color: "var(--text-faint)" }}>(default)</span>}
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 16, maxWidth: 420 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>{label} PIC</div>
      {loading ? (
        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading…</div>
      ) : (
        <>
          <Row date={todayDate} />
          {pastDates.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 11, cursor: "pointer", padding: "4px 0" }}
              >
                {expanded ? "Hide" : "Show"} past {pastDates.length} day{pastDates.length === 1 ? "" : "s"}
              </button>
              {expanded && pastDates.map((d) => <Row key={d} date={d} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}
