"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { fetchAllRows } from "../../lib/helpers";
import { useAuth } from "../../lib/AuthContext";
import {
  TICKET_TYPE_LABELS, TICKET_ROUTES, WORKSTATION_TYPE_LABELS, WORKSTATION_ROUTES,
  TEAM_TICKET_TYPES, TEAM_WORKSTATION_TYPES, resolveTeamKey,
} from "../../lib/teamTypes";
import { TASK_PHASES, phaseForColumn } from "../../lib/taskPhases";
import styles from "../shared.module.css";

// Round 172 — rebuilt per explicit request: "update the task table to fit
// for each member, by filtering the undone from workstations and tickets,
// based on team (counting executive), sort them by the list, group by
// their corresponding group." Was a flat read-only aggregate (one row per
// task type, total row count). Now: one section per team, each section's
// members are that team's profiles (every role including "exc" — no role
// is excluded from a member row, per "counting executive"), each member's
// row is their own OUTSTANDING (undone) workload, one column per task type
// THAT TEAM actually owns (via TEAM_TICKET_TYPES/TEAM_WORKSTATION_TYPES —
// this is the "corresponding group" a task belongs to), not every task
// type for every team. Members are sorted alphabetically within their
// section; task columns keep the same declared order as before
// (workstations, then tickets).
//
// Round 250 — per explicit request, this now branches by the VIEWER's own
// role:
//   - role "exc" (the only role that ever actually gets assigned as a
//     task's PIC) gets two tabs: "My Tasks" (default — just their own
//     bucket, grouped by phase, with a per-task-type drill-down list) and
//     "My Team" (the same style as the old page, but scoped to just their
//     own team instead of every team).
//   - dev/admin/teamlead get exactly the old page, unchanged: every team,
//     every member, no personal view — per explicit request ("no personal
//     view, just full everyone view"), since these roles don't carry a
//     real per-person PIC assignment the way an exc does.
//
// "Undone" reuses the exact same terminal-status rules lib/notDoneCounts.js
// already uses for its aggregate badges (TERMINAL_EXECUTOR/DESIGN/REPORT_
// CONFLICT, upload/confirm/pre_release's field-completeness rules) — that
// module only returns a TOTAL count, not a per-ticket/per-PIC breakdown, so
// the small vocab constants are duplicated here rather than modifying a
// shared, cache-wrapped module just to add a second return shape. Keep the
// two in sync if either changes.
//
// Per-member attribution needs an actual PIC field to attribute a row to.
// Every ticket type has tickets.pic_profile_id. Among workstations, only
// Upload/Re-Check/Pre-release keep a real per-release PIC in
// workstation_assignments — Pitching's PIC lives per-metric-column (5
// separate fields, no single "done" concept to match against cleanly) and
// Booking/Streaming/Milestone/Package Price track no PIC at all (see
// notDoneCounts.js returning null for exactly these). Those unsupported
// workstations are listed below each section as a plain link instead of a
// column, rather than showing a column of misleading zeros.
const SUPPORTED_WORKSTATION_KEYS = ["upload", "confirm", "pre_release"];
const TICKET_KEYS = Object.keys(TICKET_ROUTES).filter((k) => k !== "batch_phai_sinh");
const WORKSTATION_KEYS = Object.keys(WORKSTATION_ROUTES);
const UNASSIGNED = "__unassigned__";

const TERMINAL_EXECUTOR = ["COMPLETE", "CANCELED", "REFUND"];
const TERMINAL_REPORT_CONFLICT_EXECUTOR = ["Hoàn thành", "Từ chối", "Hủy"];
const TERMINAL_DESIGN = ["COMPLETE", "CANCEL"];

function isTicketUndone(typeKey, status) {
  if (typeKey === "report_conflict") return !TERMINAL_REPORT_CONFLICT_EXECUTOR.includes(status);
  if (typeKey === "design") return !TERMINAL_DESIGN.includes(status);
  return !TERMINAL_EXECUTOR.includes(status);
}

const DSP_CHECK_FIELDS = ["confirm_spotify_correct", "confirm_apple_correct", "confirm_zing_correct", "confirm_nct_correct", "confirm_fb_correct", "confirm_ytb_correct"];

function isUploadDone(r) {
  if (r.upload_status === "Cancel") return true; // cancelled isn't outstanding work
  const keys = ["link_lbm", "link_share", "smartlink"];
  if (r.gate_pre_order === "true") keys.push("link_preorder");
  return keys.every((k) => r[k]);
}
function isConfirmPhase1Done(r) {
  return DSP_CHECK_FIELDS.every((f) => r[f]) && !!r.link_lbm && !!r.confirm_tag;
}
function isConfirmPhase2Done(r) {
  return !!(r.smartlink && r.confirm_smartlink_updated && r.confirm_insta_sound && r.confirm_tiktok_sound_updated);
}
function isPreReleaseDone(r) {
  return !!(r.canva_mv_status && r.canva_status && r.musixmatch_link && r.musixmatch_status && r.nct_lyric && r.zing_lyric);
}

// Round 250 — every ticket type's real fields live in one JSONB `data`
// column (see lib/ticketConfigs.js), with different field keys per type —
// there's no single column guaranteed to hold "the title" across all 28
// types. This tries the field keys that act as the natural "what is this"
// field on most of them, in priority order, and falls back to a plain
// ticket number rather than guessing wrong. Good enough for a drill-down
// label; if a particular type's list consistently shows the wrong text,
// add that type's real key above the fallback here rather than reworking
// this per-type.
const LABEL_FIELD_PRIORITY = ["tenBai", "title", "songTitle", "projectName", "name", "artist", "label"];
function pickTicketLabel(data, id) {
  const d = data || {};
  for (const key of LABEL_FIELD_PRIORITY) {
    const v = d[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return `Ticket #${id}`;
}

function releaseLabel(r) {
  if (r.did) return r.title ? `${r.did} — ${r.title}` : r.did;
  return `Release #${r.id}`;
}

// memberItems is { [memberKeyOrUnassigned]: { [colId]: Array<{ id, label, href }> } }
// — the actual outstanding items, not just a count, so the drill-down list
// (Round 250) can render real detail without a second round of queries.
// Counts everywhere are just that array's length.
function bumpItem(map, memberKey, colId, item) {
  const key = memberKey || UNASSIGNED;
  if (!map[key]) map[key] = {};
  if (!map[key][colId]) map[key][colId] = [];
  map[key][colId].push(item);
}

async function loadTicketCounts(map) {
  const { data: tabs } = await supabase.from("ticket_tabs").select("id, key").in("key", TICKET_KEYS);
  if (!tabs) return;
  for (const tab of tabs) {
    const { data: tickets } = await supabase.from("tickets").select("id, status, pic_profile_id, data").eq("tab_id", tab.id).is("deleted_at", null);
    (tickets || []).forEach((t) => {
      if (isTicketUndone(tab.key, t.status)) {
        bumpItem(map, t.pic_profile_id, `ticket:${tab.key}`, { id: t.id, label: pickTicketLabel(t.data, t.id), href: TICKET_ROUTES[tab.key] });
      }
    });
  }
}

async function loadAssignMap(workstationKeys) {
  const { data } = await supabase.from("workstation_assignments").select("workstation, release_id, pic_profile_id").in("workstation", workstationKeys);
  const out = {};
  (data || []).forEach((a) => {
    if (a.release_id === null) return; // default/fallback row, not a real per-release assignment
    if (!out[a.workstation]) out[a.workstation] = {};
    out[a.workstation][a.release_id] = a.pic_profile_id;
  });
  return out;
}

async function loadWorkstationCounts(map) {
  const assignMap = await loadAssignMap(["upload", "confirm_phase1", "confirm_phase2", "pre_release"]);

  const { data: uploads } = await supabase.from("releases").select("id, did, title, upload_status, link_lbm, link_share, smartlink, link_preorder, gate_pre_order").eq("requested", true);
  (uploads || []).forEach((r) => {
    const pic = assignMap.upload?.[r.id];
    if (pic !== undefined && !isUploadDone(r)) bumpItem(map, pic, "workstation:upload", { id: r.id, label: releaseLabel(r), href: WORKSTATION_ROUTES.upload });
  });

  const { data: confirmRows } = await fetchAllRows(() =>
    supabase.from("releases").select([...DSP_CHECK_FIELDS, "id", "did", "title", "link_lbm", "confirm_tag", "smartlink", "confirm_insta_sound", "confirm_tiktok_sound_updated", "confirm_smartlink_updated"].join(", ")).order("id")
  );
  (confirmRows || []).forEach((r) => {
    // Round 250 — kept as two distinct columns (workstation:confirm_phase1
    // / _phase2) instead of the old merged "workstation:confirm" id, so
    // Phase 1 (Pre-release) and Phase 2 (Release) can show up as separate
    // phase-grouped entries instead of being silently combined into one
    // number that spans two different phases.
    const pic1 = assignMap.confirm_phase1?.[r.id];
    if (pic1 !== undefined && !isConfirmPhase1Done(r)) {
      bumpItem(map, pic1, "workstation:confirm_phase1", { id: r.id, label: releaseLabel(r), href: `${WORKSTATION_ROUTES.confirm}?phase=confirm_phase1` });
    }
    const pic2 = assignMap.confirm_phase2?.[r.id];
    if (pic2 !== undefined && !isConfirmPhase2Done(r)) {
      bumpItem(map, pic2, "workstation:confirm_phase2", { id: r.id, label: releaseLabel(r), href: `${WORKSTATION_ROUTES.confirm}?phase=confirm_phase2` });
    }
  });

  const { data: preReleaseRows } = await fetchAllRows(() =>
    supabase.from("releases").select("id, did, title, canva_mv_status, canva_status, musixmatch_link, musixmatch_status, nct_lyric, zing_lyric").order("id")
  );
  (preReleaseRows || []).forEach((r) => {
    const pic = assignMap.pre_release?.[r.id];
    if (pic !== undefined && !isPreReleaseDone(r)) bumpItem(map, pic, "workstation:pre_release", { id: r.id, label: releaseLabel(r), href: WORKSTATION_ROUTES.pre_release });
  });
}

// Same team/type ownership lookup as before, except "confirm" (Re-Check)
// now expands into its two real phase columns instead of one merged one —
// see the Round 250 comment on loadWorkstationCounts above.
function columnsForTeam(segment) {
  const resolved = resolveTeamKey(segment);
  const wsCols = WORKSTATION_KEYS
    .filter((k) => SUPPORTED_WORKSTATION_KEYS.includes(k) && (TEAM_WORKSTATION_TYPES[resolved] || []).includes(k))
    .flatMap((k) => {
      if (k === "confirm") {
        return [
          { id: "workstation:confirm_phase1", name: "Re-Check (Phase 1)", href: `${WORKSTATION_ROUTES.confirm}?phase=confirm_phase1` },
          { id: "workstation:confirm_phase2", name: "Re-Check (Phase 2)", href: `${WORKSTATION_ROUTES.confirm}?phase=confirm_phase2` },
        ];
      }
      return [{ id: `workstation:${k}`, name: WORKSTATION_TYPE_LABELS[k] || k, href: WORKSTATION_ROUTES[k] }];
    });
  const ticketCols = TICKET_KEYS.filter((k) => (TEAM_TICKET_TYPES[resolved] || []).includes(k)).map((k) => ({ id: `ticket:${k}`, name: TICKET_TYPE_LABELS[k] || k, href: TICKET_ROUTES[k] }));
  return [...wsCols, ...ticketCols];
}

function unsupportedWorkstationsForTeam(segment) {
  const resolved = resolveTeamKey(segment);
  return WORKSTATION_KEYS.filter((k) => !SUPPORTED_WORKSTATION_KEYS.includes(k) && (TEAM_WORKSTATION_TYPES[resolved] || []).includes(k)).map((k) => ({ id: k, name: WORKSTATION_TYPE_LABELS[k] || k, href: WORKSTATION_ROUTES[k] }));
}

// Round 250 — groups a flat column list into the 4 locked phases (see
// lib/taskPhases.js), in phase order, dropping any phase with nothing in
// it for this particular team (e.g. a team that owns no Release-phase task
// types just doesn't get a "Release" section).
function groupColumnsByPhase(columns) {
  const byPhase = {};
  TASK_PHASES.forEach((p) => (byPhase[p] = []));
  columns.forEach((c) => byPhase[phaseForColumn(c.id)].push(c));
  return TASK_PHASES.map((phase) => ({ phase, columns: byPhase[phase] })).filter((g) => g.columns.length > 0);
}

function countOf(memberItems, memberId, colId) {
  return (memberItems[memberId || UNASSIGNED]?.[colId] || []).length;
}

// ---- Old-style org-wide section (dev/admin/teamlead's whole view, and the
// "My Team" tab's single-team version) ----
function TeamSection({ segment, members, memberItems, title }) {
  const columns = columnsForTeam(segment);
  const unsupported = unsupportedWorkstationsForTeam(segment);
  const sortedMembers = [...members].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const teamHasUnassigned = columns.some((c) => countOf(memberItems, UNASSIGNED, c.id) > 0);

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 15, marginBottom: 8 }}>{title || segment}</h2>
      {columns.length === 0 ? (
        <div style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 8 }}>No tracked task types own by this team.</div>
      ) : (
        <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Member</th>
                {columns.map((c) => <th key={c.id}>{c.name}</th>)}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((m) => {
                const total = columns.reduce((sum, c) => sum + countOf(memberItems, m.id, c.id), 0);
                return (
                  <tr key={m.id}>
                    <td>{m.name}{m.role === "exc" ? <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-faint)" }}>(exc)</span> : null}</td>
                    {columns.map((c) => {
                      const n = countOf(memberItems, m.id, c.id);
                      return <td key={c.id}>{n ? <Link href={c.href} className={styles.rowLink}>{n}</Link> : <span style={{ color: "var(--text-faint)" }}>0</span>}</td>;
                    })}
                    <td style={{ fontWeight: 700 }}>{total}</td>
                  </tr>
                );
              })}
              {teamHasUnassigned && (
                <tr>
                  <td style={{ color: "var(--text-faint)" }}>— Unassigned —</td>
                  {columns.map((c) => {
                    const n = countOf(memberItems, UNASSIGNED, c.id);
                    return <td key={c.id}>{n ? <Link href={c.href} className={styles.rowLink}>{n}</Link> : <span style={{ color: "var(--text-faint)" }}>0</span>}</td>;
                  })}
                  <td style={{ fontWeight: 700 }}>{columns.reduce((sum, c) => sum + countOf(memberItems, UNASSIGNED, c.id), 0)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {unsupported.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
          No per-member PIC tracking for: {unsupported.map((w, i) => (
            <span key={w.id}>
              {i > 0 && ", "}
              <Link href={w.href} className={styles.rowLink}>{w.name}</Link>
            </span>
          ))} — open the workstation directly.
        </div>
      )}
    </div>
  );
}

// Round 250 — sessionStorage key for "which sub-tab was I on" on the
// personal Task Table view, same idiom as app/releases/page.js's Round 224
// "remember position" (see that file for the fuller precedent) — here it's
// simpler: just which of the two main tabs, and which task-type drill-down
// tab, not a page number or filter set. Session-scoped (not localStorage)
// so a shared machine doesn't leak one person's last-viewed tab to the
// next person who opens the app in a fresh tab.
const TASK_TABLE_STATE_KEY = "vieent_task_table_state";
function readSavedState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(TASK_TABLE_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeSavedState(state) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(TASK_TABLE_STATE_KEY, JSON.stringify(state));
  } catch {}
}

// ---- Personal "My Tasks" view (exc role only) ----
function MyTasksView({ profile, memberItems, activeItemTab, setActiveItemTab }) {
  const columns = columnsForTeam(profile.segment);
  const phaseGroups = groupColumnsByPhase(columns);
  const columnsWithCounts = columns.map((c) => ({ ...c, count: countOf(memberItems, profile.id, c.id) }));
  const activeCol = columnsWithCounts.find((c) => c.id === activeItemTab) || columnsWithCounts[0];
  const activeItems = activeCol ? (memberItems[profile.id]?.[activeCol.id] || []) : [];
  const totalOutstanding = columnsWithCounts.reduce((sum, c) => sum + c.count, 0);

  if (columns.length === 0) {
    return <div className={styles.emptyState}>No tracked task types for your team yet.</div>;
  }

  return (
    <div>
      <div style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 20 }}>
        {profile.name} — {profile.segment}{totalOutstanding ? ` — ${totalOutstanding} outstanding` : " — nothing outstanding"}
      </div>

      {phaseGroups.map(({ phase, columns: cols }) => (
        <div key={phase} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>{phase}</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {cols.map((c) => {
              const n = countOf(memberItems, profile.id, c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveItemTab(c.id)}
                  className={`${styles.tabBtn} ${activeItemTab === c.id ? styles.tabBtnActive : ""}`}
                  style={{
                    border: activeItemTab === c.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                    borderRadius: 6, background: activeItemTab === c.id ? "rgba(255,107,26,0.1)" : "transparent",
                    padding: "6px 10px", display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span>{c.name}</span>
                  <span style={{ fontWeight: 700, color: n ? "var(--accent)" : "var(--text-faint)" }}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Round 250 — "under it, show the real detail per task... clicking
          it will still jump to the corresponding ticket or workstation
          page." activeCol's items came from the SAME fetch that produced
          the counts above (see bumpItem/memberItems) — no extra query to
          show this list. */}
      {activeCol && (
        <div style={{ marginTop: 8 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>{activeCol.name} ({activeItems.length})</h3>
          {activeItems.length === 0 ? (
            <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Nothing outstanding here.</div>
          ) : (
            <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <tbody>
                  {activeItems.map((item) => (
                    <tr key={item.id}>
                      <td><Link href={item.href} className={styles.rowLink}>{item.label}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TaskTablePage() {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [memberItems, setMemberItems] = useState({});
  const [loading, setLoading] = useState(true);

  // "mine" | "team" — only meaningful for role "exc"; dev/admin/teamlead
  // never see these tabs at all (see the Round 250 comment block up top).
  const [mainTab, setMainTab] = useState("mine");
  const [activeItemTab, setActiveItemTab] = useState(null);

  // Restore whichever tab was open last time, before the very first paint
  // that would otherwise default to "mine"/nothing — same "read once on
  // mount" idiom as app/releases/page.js's Round 224 restore.
  useEffect(() => {
    const saved = readSavedState();
    if (saved?.mainTab) setMainTab(saved.mainTab);
    if (saved?.activeItemTab) setActiveItemTab(saved.activeItemTab);
  }, []);
  useEffect(() => {
    writeSavedState({ mainTab, activeItemTab });
  }, [mainTab, activeItemTab]);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const [{ data: profs }] = await Promise.all([supabase.from("profiles").select("id, name, segment, role").order("name")]);
      setProfiles(profs || []);
      const map = {};
      await Promise.all([loadTicketCounts(map), loadWorkstationCounts(map)]);
      setMemberItems(map);
      setLoading(false);
    })();
  }, []);

  // Real, individually-assignable team segments only (matches
  // lib/teamTypes.js TEAMS — Youtube/Publishing/Operation shown separately
  // since that's the segment actually stored on each profile; "OPS" itself
  // is never assigned to a profile). Any profile with no/unknown segment
  // (or role "dev", who has no segment) falls into its own catch-all
  // section at the end rather than being silently dropped.
  const teamOrder = ["AR", "Marketing", "Design", "Youtube", "Publishing", "Operation", "Legal"];
  const segmentsPresent = [...new Set(profiles.map((p) => p.segment).filter(Boolean))];
  const otherSegments = segmentsPresent.filter((s) => !teamOrder.includes(s)).sort();
  const noSegmentProfiles = profiles.filter((p) => !p.segment);
  const sections = [...teamOrder, ...otherSegments].filter((seg) => profiles.some((p) => p.segment === seg));

  const isExc = profile?.role === "exc";

  // Default the drill-down tab to the member's own first task type with
  // outstanding work once data has loaded, instead of leaving it blank —
  // only runs once nothing's been picked yet (including nothing restored
  // from sessionStorage), so it never overrides a real choice.
  useEffect(() => {
    if (!isExc || !profile || loading || activeItemTab) return;
    const columns = columnsForTeam(profile.segment);
    const withCount = columns.find((c) => countOf(memberItems, profile.id, c.id) > 0);
    setActiveItemTab((withCount || columns[0])?.id || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExc, profile, loading, memberItems]);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Overview</div>
          <h1 className={styles.title}>Task Table</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -16, marginBottom: 24 }}>
            {isExc
              ? "Your own outstanding work, grouped by release phase — switch to My Team for the full team breakdown."
              : "Outstanding (undone) work per member, grouped by team — click a count to open that task's own page."}
          </p>

          {isExc && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
              {[["mine", "My Tasks"], ["team", "My Team"]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setMainTab(key)}
                  className={`${styles.tabBtn} ${mainTab === key ? styles.tabBtnActive : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : isExc ? (
            mainTab === "mine" ? (
              <MyTasksView profile={profile} memberItems={memberItems} activeItemTab={activeItemTab} setActiveItemTab={setActiveItemTab} />
            ) : (
              <TeamSection segment={profile.segment} members={profiles.filter((p) => p.segment === profile.segment)} memberItems={memberItems} title={profile.segment} />
            )
          ) : (
            <>
              {sections.map((segment) => (
                <TeamSection key={segment} segment={segment} members={profiles.filter((p) => p.segment === segment)} memberItems={memberItems} />
              ))}
              {noSegmentProfiles.length > 0 && <TeamSection segment="No Team" members={noSegmentProfiles} memberItems={memberItems} title="No Team" />}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
