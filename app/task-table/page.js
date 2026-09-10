"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { fetchAllRows } from "../../lib/helpers";
import { useAuth } from "../../lib/AuthContext";
import {
  TICKET_TYPE_LABELS, TICKET_ROUTES, WORKSTATION_TYPE_LABELS, WORKSTATION_ROUTES,
  TEAM_TICKET_TYPES, TEAM_WORKSTATION_TYPES, resolveTeamKey, isOpsTeam,
} from "../../lib/teamTypes";
import { TASK_PHASES, phaseForColumn } from "../../lib/taskPhases";
import SearchBox from "../../lib/SearchBox";
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
// role, and Round 253 locked in the full hierarchy for every non-dev role
// (originally exc-only in Round 250, then widened per explicit request):
//   - exc ("member"): "My Tasks" (default — own bucket, grouped by phase,
//     with a per-task-type drill-down) + "My Team" — their own team/
//     segment only, every member of it plus the Unassigned ("blank PIC")
//     row.
//   - teamlead: same shape as exc — own tasks + their own team/segment
//     only. A team lead whose segment happens to be one of the 3 real OPS
//     sub-teams (Youtube/Publishing/Operation) still only sees that ONE
//     sub-team, not the other two — "their own subteam", singular, per
//     explicit request.
//   - admin: own tasks + their own team/segment, but if their segment is
//     one of the OPS sub-teams, "My Team" expands to ALL THREE OPS sub-
//     teams (Youtube + Publishing + Operation) instead of just their own
//     one — "all subteam", per explicit request. For a non-OPS segment
//     (AR/Marketing/Design/Legal, none of which split into sub-teams) this
//     is identical to teamlead's scope, since there's nothing to expand.
//   - dev: exactly the old page, unchanged — every team, every member, NO
//     personal tab at all ("dev see all team, no personal view though").
//     Deliberate: dev has no segment of their own to build a personal
//     bucket from in the first place.
// This is a Task-Table-specific visibility rule, intentionally narrower
// than lib/permissions.js's scopeableTeamMembers (where admin sees every
// team, for Config -> Team purposes) — the two are answering different
// questions and aren't meant to match.
//
// "Undone" reuses the exact same terminal-status rules lib/notDoneCounts.js
// already uses for its aggregate badges (TERMINAL_EXECUTOR/DESIGN/REPORT_
// CONFLICT, upload/confirm/pre_release's field-completeness rules) — that
// module only returns a TOTAL count, not a per-ticket/per-PIC breakdown, so
// the small vocab constants are duplicated here rather than modifying a
// shared, cache-wrapped module just to add a second return shape. Keep the
// two in sync if either changes.
//
// Round 281 — added a second, additive attribution: each ticket's
// requester_profile_id (not just its PIC/executor) now shows up too, in its
// own "Requested by You" section on the personal "My Tasks" view — see
// claude/audit-log-and-requester-attribution.md, loadTicketCounts's
// requesterMap param, and RequestedSection near the bottom of this file.
// Deliberately NOT folded into the executor TeamSection/columnsForTeam
// machinery above: a ticket's requester team and executor team are often
// different teams by design, so scoping requester counts by team ownership
// would hide exactly the cross-team requests this exists to surface.
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

// Round 281 — requester-side attribution alongside the existing PIC/executor
// one, see claude/audit-log-and-requester-attribution.md. requesterMap is
// shaped exactly like the existing executor `map` (reuses bumpItem/countOf
// as-is) but keyed by requester_profile_id instead of PIC, and under TWO
// columns per ticket type instead of one — `ticket:<key>:open` / `:done` —
// since "requested by you" is framed around checking whether it got DONE
// (per the ask), not just outstanding count like the executor side.
function requesterColKey(tabKey, done) {
  return `ticket:${tabKey}:${done ? "done" : "open"}`;
}

async function loadTicketCounts(map, requesterMap) {
  const { data: tabs } = await supabase.from("ticket_tabs").select("id, key").in("key", TICKET_KEYS);
  if (!tabs) return;
  for (const tab of tabs) {
    const { data: tickets } = await supabase.from("tickets").select("id, status, pic_profile_id, pic_profile_ids, requester_profile_id, data").eq("tab_id", tab.id).is("deleted_at", null);
    (tickets || []).forEach((t) => {
      // Round 281 — requester side, ALL tickets (not just undone ones —
      // done ones still count, just under the "done" column instead of
      // "open"). requester_profile_id is additive/nullable: legacy
      // tickets and any ticket type not yet wired this round are null,
      // and there's no sensible free-text fallback (requester_segment/
      // requester_name aren't profile-linkable) — skip those entirely
      // rather than bumping a null key.
      if (t.requester_profile_id) {
        const item = { id: t.id, label: pickTicketLabel(t.data, t.id), href: TICKET_ROUTES[tab.key] };
        bumpItem(requesterMap, t.requester_profile_id, requesterColKey(tab.key, !isTicketUndone(tab.key, t.status)), item);
      }

      if (!isTicketUndone(tab.key, t.status)) return;
      // Round 279 — PIC is now a tag list on pages converted to the tag
      // UI (pic_profile_ids); a ticket tagged with several people counts
      // toward EACH of them here, not just the first. Falls back to the
      // legacy single pic_profile_id for any ticket type not yet
      // converted (pic_profile_ids stays null there) — unchanged
      // attribution for those.
      const picIds = t.pic_profile_ids && t.pic_profile_ids.length > 0 ? t.pic_profile_ids : [t.pic_profile_id];
      picIds.forEach((picId) => {
        bumpItem(map, picId, `ticket:${tab.key}`, { id: t.id, label: pickTicketLabel(t.data, t.id), href: TICKET_ROUTES[tab.key] });
      });
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

// Round 281 — which ticket-type columns to show in a person's "Requested by
// You" section. Deliberately NOT columnsForTeam(profile.segment) — a
// requester's own team and the team that executes their ticket is often a
// different team by design (that's the whole point of the requester/
// executor split, e.g. an AR member requesting a Bổ Sung DATA ticket that
// OPS/AR executes), so gating this by the viewer's team-ownership list would
// hide exactly the cross-team requests this section exists to surface.
// Instead: scan every ticket type this profile has ANY requester-side entry
// for (open or done) and only show those — keeps the table from listing all
// ~20 ticket types with a wall of zeros for types this person never
// requests anything in.
function requesterColumnsWithData(requesterItems, profileId) {
  const perColumn = requesterItems[profileId] || {};
  const keysWithData = new Set();
  Object.keys(perColumn).forEach((colId) => {
    const m = colId.match(/^ticket:(.+):(open|done)$/);
    if (m && perColumn[colId]?.length > 0) keysWithData.add(m[1]);
  });
  return TICKET_KEYS.filter((k) => keysWithData.has(k)).map((k) => ({
    id: k,
    name: TICKET_TYPE_LABELS[k] || k,
    href: TICKET_ROUTES[k],
    open: countOf(requesterItems, profileId, requesterColKey(k, false)),
    done: countOf(requesterItems, profileId, requesterColKey(k, true)),
  }));
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

// Round 253 — which real segments/subteams a "My Team" tab should render,
// per the hierarchy in the big comment block up top. Only admin ever sees
// more than one section, and only on OPS (where Round 262 moved the 3
// former standalone segments to profiles.subteam — see
// lib/teamTypes.js's header comment). Needs the full profiles list since
// the subteam names are no longer a fixed constant, just whatever real
// values exist on OPS profiles right now.
function scopeSegmentsForRole(profile, allProfiles) {
  if (!profile?.segment) return [];
  if (profile.role === "admin" && isOpsTeam(profile.segment)) {
    return [...new Set((allProfiles || []).filter((p) => p.segment === "OPS" && p.subteam).map((p) => p.subteam))].sort();
  }
  return [profile.segment];
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

// Round 281 — requester-side attribution, additive alongside the executor
// view above: "note the task for requester in the task table (they have the
// responsibility to check if the tickets were done)." Same table/drill-down
// visual pattern as the executor side (columns + a click-to-open detail
// list below), but split Open vs. Done per ticket type instead of just an
// outstanding count — the whole point here is checking completion, not
// workload. See requesterColumnsWithData's comment for why this is NOT
// scoped by columnsForTeam(profile.segment) like the executor side is.
function RequestedSection({ profile, requesterItems }) {
  const [activeTab, setActiveTab] = useState(null); // { colId, bucket: "open"|"done" }
  const columns = requesterColumnsWithData(requesterItems, profile.id);
  const totalOpen = columns.reduce((sum, c) => sum + c.open, 0);
  const totalDone = columns.reduce((sum, c) => sum + c.done, 0);

  const active = activeTab && columns.find((c) => c.id === activeTab.colId);
  const activeItems = active ? (requesterItems[profile.id]?.[requesterColKey(active.id, activeTab.bucket === "done")] || []) : [];

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
      <h3 style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Requested by You</h3>
      <div style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 12 }}>
        Tickets you requested (any team) — check these got done, regardless of who executed them.
      </div>

      {columns.length === 0 ? (
        <div style={{ color: "var(--text-faint)", fontSize: 12 }}>You haven't requested any tracked tickets yet.</div>
      ) : (
        <>
          <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Ticket Type</th>
                  <th>Open</th>
                  <th>Done</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>
                      {c.open ? (
                        <button
                          onClick={() => setActiveTab({ colId: c.id, bucket: "open" })}
                          className={styles.rowLink}
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "var(--accent)" }}
                        >
                          {c.open}
                        </button>
                      ) : <span style={{ color: "var(--text-faint)" }}>0</span>}
                    </td>
                    <td>
                      {c.done ? (
                        <button
                          onClick={() => setActiveTab({ colId: c.id, bucket: "done" })}
                          className={styles.rowLink}
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "var(--accent)" }}
                        >
                          {c.done}
                        </button>
                      ) : <span style={{ color: "var(--text-faint)" }}>0</span>}
                    </td>
                    <td style={{ fontWeight: 700 }}>{c.open + c.done}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 700 }}>Total</td>
                  <td style={{ fontWeight: 700 }}>{totalOpen}</td>
                  <td style={{ fontWeight: 700 }}>{totalDone}</td>
                  <td style={{ fontWeight: 700 }}>{totalOpen + totalDone}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {active && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ fontSize: 13, marginBottom: 8 }}>{active.name} — {activeTab.bucket === "done" ? "Done" : "Open"} ({activeItems.length})</h4>
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
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TaskTablePage() {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [memberItems, setMemberItems] = useState({});
  // Round 281 — requester-side attribution, kept as its own state/map
  // (loadTicketCounts fills both in one pass over the same ticket rows) —
  // see RequestedSection/requesterColumnsWithData below.
  const [requesterItems, setRequesterItems] = useState({});
  const [loading, setLoading] = useState(true);

  // "mine" | "team" — only meaningful for role "exc"; dev/admin/teamlead
  // never see these tabs at all (see the Round 250 comment block up top).
  const [mainTab, setMainTab] = useState("mine");
  const [activeItemTab, setActiveItemTab] = useState(null);
  // Round 278 — filters the member rows shown in "My Team"/the full-org
  // breakdown by name; has no effect on "My Tasks" (a single person's own
  // view, nothing to search over there).
  const [memberQuery, setMemberQuery] = useState("");

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
      const reqMap = {};
      await Promise.all([loadTicketCounts(map, reqMap), loadWorkstationCounts(map)]);
      setMemberItems(map);
      setRequesterItems(reqMap);
      setLoading(false);
    })();
  }, []);

  // Real, individually-assignable team segments (matches lib/teamTypes.js
  // TEAMS — Round 262 folded Youtube/Publishing/Operation into "OPS" as
  // subteams, so they no longer show as separate sections here; an OPS
  // admin's "My Team" tab still breaks them out individually, see
  // scopeSegmentsForRole below). Any profile with no/unknown segment (or
  // role "dev", who has no segment) falls into its own catch-all section
  // at the end rather than being silently dropped.
  const teamOrder = ["AR", "Marketing", "Design", "OPS", "Legal"];
  const segmentsPresent = [...new Set(profiles.map((p) => p.segment).filter(Boolean))];
  const otherSegments = segmentsPresent.filter((s) => !teamOrder.includes(s)).sort();
  const noSegmentProfiles = profiles.filter((p) => !p.segment);
  const sections = [...teamOrder, ...otherSegments].filter((seg) => profiles.some((p) => p.segment === seg));

  // Round 253 — every non-dev role gets a personal view now (was exc-only
  // in Round 250). "dev" has no segment of its own to build one from, and
  // explicitly keeps the old full-org page with no personal tab at all.
  const hasPersonalView = !!profile && profile.role !== "dev";
  const myTeamSegments = scopeSegmentsForRole(profile, profiles);
  // True when myTeamSegments holds subteam NAMES (an OPS admin's
  // per-subteam breakdown) rather than real segment values — the members
  // filter and columnsForTeam call below need to know which.
  const isOpsAdminSplit = profile?.role === "admin" && isOpsTeam(profile?.segment);

  // Default the drill-down tab to the member's own first task type with
  // outstanding work once data has loaded, instead of leaving it blank —
  // only runs once nothing's been picked yet (including nothing restored
  // from sessionStorage), so it never overrides a real choice.
  useEffect(() => {
    if (!hasPersonalView || !profile || loading || activeItemTab) return;
    const columns = columnsForTeam(profile.segment);
    const withCount = columns.find((c) => countOf(memberItems, profile.id, c.id) > 0);
    setActiveItemTab((withCount || columns[0])?.id || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPersonalView, profile, loading, memberItems]);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Overview</div>
          <h1 className={styles.title}>Task Table</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -16, marginBottom: 24 }}>
            {hasPersonalView
              ? "Your own outstanding work, grouped by release phase — switch to My Team for the full team breakdown."
              : "Outstanding (undone) work per member, grouped by team — click a count to open that task's own page."}
          </p>

          {hasPersonalView && (
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

          {!loading && (hasPersonalView ? mainTab === "team" : true) && (
            <SearchBox value={memberQuery} onChange={setMemberQuery} placeholder="Search member name…" />
          )}

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : hasPersonalView ? (
            mainTab === "mine" ? (
              <>
                <MyTasksView profile={profile} memberItems={memberItems} activeItemTab={activeItemTab} setActiveItemTab={setActiveItemTab} />
                {/* Round 281 — additive, not gated by columnsForTeam/segment
                    like MyTasksView above it: a requester's team and the
                    executing team are often different by design. */}
                <RequestedSection profile={profile} requesterItems={requesterItems} />
              </>
            ) : (
              myTeamSegments.map((segment) => (
                <TeamSection
                  key={segment}
                  segment={isOpsAdminSplit ? "OPS" : segment}
                  members={profiles.filter((p) => (isOpsAdminSplit ? p.segment === "OPS" && p.subteam === segment : p.segment === segment) && p.name.toLowerCase().includes(memberQuery.trim().toLowerCase()))}
                  memberItems={memberItems}
                  title={segment}
                />
              ))
            )
          ) : (
            <>
              {sections.map((segment) => (
                <TeamSection key={segment} segment={segment} members={profiles.filter((p) => p.segment === segment && p.name.toLowerCase().includes(memberQuery.trim().toLowerCase()))} memberItems={memberItems} />
              ))}
              {noSegmentProfiles.filter((p) => p.name.toLowerCase().includes(memberQuery.trim().toLowerCase())).length > 0 && (
                <TeamSection segment="No Team" members={noSegmentProfiles.filter((p) => p.name.toLowerCase().includes(memberQuery.trim().toLowerCase()))} memberItems={memberItems} title="No Team" />
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
