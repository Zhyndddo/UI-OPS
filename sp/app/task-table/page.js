"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { fetchAllRows } from "../../lib/helpers";
import {
  TICKET_TYPE_LABELS, TICKET_ROUTES, WORKSTATION_TYPE_LABELS, WORKSTATION_ROUTES,
  TEAM_TICKET_TYPES, TEAM_WORKSTATION_TYPES, resolveTeamKey,
} from "../../lib/teamTypes";
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

// bump(map, memberKey, colId) — memberCounts is { [memberKeyOrUnassigned]: { [colId]: count } }
function bump(map, memberKey, colId) {
  const key = memberKey || UNASSIGNED;
  if (!map[key]) map[key] = {};
  map[key][colId] = (map[key][colId] || 0) + 1;
}

async function loadTicketCounts(map) {
  const { data: tabs } = await supabase.from("ticket_tabs").select("id, key").in("key", TICKET_KEYS);
  if (!tabs) return;
  for (const tab of tabs) {
    const { data: tickets } = await supabase.from("tickets").select("status, pic_profile_id").eq("tab_id", tab.id).is("deleted_at", null);
    (tickets || []).forEach((t) => {
      if (isTicketUndone(tab.key, t.status)) bump(map, t.pic_profile_id, `ticket:${tab.key}`);
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

  const { data: uploads } = await supabase.from("releases").select("id, upload_status, link_lbm, link_share, smartlink, link_preorder, gate_pre_order").eq("requested", true);
  (uploads || []).forEach((r) => {
    const pic = assignMap.upload?.[r.id];
    if (pic !== undefined && !isUploadDone(r)) bump(map, pic, "workstation:upload");
  });

  const { data: confirmRows } = await fetchAllRows(() =>
    supabase.from("releases").select([...DSP_CHECK_FIELDS, "id", "link_lbm", "confirm_tag", "smartlink", "confirm_insta_sound", "confirm_tiktok_sound_updated", "confirm_smartlink_updated"].join(", ")).order("id")
  );
  (confirmRows || []).forEach((r) => {
    const pic1 = assignMap.confirm_phase1?.[r.id];
    if (pic1 !== undefined && !isConfirmPhase1Done(r)) bump(map, pic1, "workstation:confirm");
    const pic2 = assignMap.confirm_phase2?.[r.id];
    if (pic2 !== undefined && !isConfirmPhase2Done(r)) bump(map, pic2, "workstation:confirm");
  });

  const { data: preReleaseRows } = await fetchAllRows(() =>
    supabase.from("releases").select("id, canva_mv_status, canva_status, musixmatch_link, musixmatch_status, nct_lyric, zing_lyric").order("id")
  );
  (preReleaseRows || []).forEach((r) => {
    const pic = assignMap.pre_release?.[r.id];
    if (pic !== undefined && !isPreReleaseDone(r)) bump(map, pic, "workstation:pre_release");
  });
}

export default function TaskTablePage() {
  const [profiles, setProfiles] = useState([]);
  const [memberCounts, setMemberCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const [{ data: profs }] = await Promise.all([supabase.from("profiles").select("id, name, segment, role").order("name")]);
      setProfiles(profs || []);
      const map = {};
      await Promise.all([loadTicketCounts(map), loadWorkstationCounts(map)]);
      setMemberCounts(map);
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

  function columnsForTeam(segment) {
    const resolved = resolveTeamKey(segment);
    const wsCols = WORKSTATION_KEYS.filter((k) => SUPPORTED_WORKSTATION_KEYS.includes(k) && (TEAM_WORKSTATION_TYPES[resolved] || []).includes(k)).map((k) => ({ id: `workstation:${k}`, name: WORKSTATION_TYPE_LABELS[k] || k, href: WORKSTATION_ROUTES[k] }));
    const ticketCols = TICKET_KEYS.filter((k) => (TEAM_TICKET_TYPES[resolved] || []).includes(k)).map((k) => ({ id: `ticket:${k}`, name: TICKET_TYPE_LABELS[k] || k, href: TICKET_ROUTES[k] }));
    return [...wsCols, ...ticketCols];
  }

  function unsupportedWorkstationsForTeam(segment) {
    const resolved = resolveTeamKey(segment);
    return WORKSTATION_KEYS.filter((k) => !SUPPORTED_WORKSTATION_KEYS.includes(k) && (TEAM_WORKSTATION_TYPES[resolved] || []).includes(k)).map((k) => ({ id: k, name: WORKSTATION_TYPE_LABELS[k] || k, href: WORKSTATION_ROUTES[k] }));
  }

  function renderSection(segment, members) {
    const columns = columnsForTeam(segment);
    const unsupported = unsupportedWorkstationsForTeam(segment);
    const sortedMembers = [...members].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const unassignedCounts = memberCounts[UNASSIGNED] || {};
    const teamHasUnassigned = columns.some((c) => unassignedCounts[c.id] > 0);

    return (
      <div key={segment} style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, marginBottom: 8 }}>{segment}</h2>
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
                  const counts = memberCounts[m.id] || {};
                  const total = columns.reduce((sum, c) => sum + (counts[c.id] || 0), 0);
                  return (
                    <tr key={m.id}>
                      <td>{m.name}{m.role === "exc" ? <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-faint)" }}>(exc)</span> : null}</td>
                      {columns.map((c) => (
                        <td key={c.id}>
                          {counts[c.id] ? <Link href={c.href} className={styles.rowLink}>{counts[c.id]}</Link> : <span style={{ color: "var(--text-faint)" }}>0</span>}
                        </td>
                      ))}
                      <td style={{ fontWeight: 700 }}>{total}</td>
                    </tr>
                  );
                })}
                {teamHasUnassigned && (
                  <tr>
                    <td style={{ color: "var(--text-faint)" }}>— Unassigned —</td>
                    {columns.map((c) => (
                      <td key={c.id}>
                        {unassignedCounts[c.id] ? <Link href={c.href} className={styles.rowLink}>{unassignedCounts[c.id]}</Link> : <span style={{ color: "var(--text-faint)" }}>0</span>}
                      </td>
                    ))}
                    <td style={{ fontWeight: 700 }}>{columns.reduce((sum, c) => sum + (unassignedCounts[c.id] || 0), 0)}</td>
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

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>// Overview</div>
          <h1 className={styles.title}>Task Table</h1>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: -16, marginBottom: 24 }}>
            Outstanding (undone) work per member, grouped by team — click a count to open that task's own page.
          </p>

          {loading ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : (
            <>
              {sections.map((segment) => renderSection(segment, profiles.filter((p) => p.segment === segment)))}
              {noSegmentProfiles.length > 0 && renderSection("No Team", noSegmentProfiles)}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
