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
import { effectiveSubteamTags } from "../../lib/releaseTags";
import { SUBTEAM_TAG_TEAM, isAdminOrAbove, isDev } from "../../lib/permissions";
import SearchBox from "../../lib/SearchBox";
import styles from "../shared.module.css";
// Round 404 item 1 — Weekly Tasks: admin-assigned free-text recurring
// tasks, one popup-once-a-day reminder (see lib/Sidebar.js) plus the
// actual management UI here.
import { currentWeekStartStr, rollForwardIfNeeded, persistRollForward } from "../../lib/weeklyTasks";

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

// Round 389 — "limit counter to exclude old data for task tab and any
// thing that we compilate ourselves. Old data mean any things date back
// from june 2026 (release or create) and before": every count on this
// page is compiled client-side from tickets/releases (never a raw DB
// count/pagination total), so this one cutoff applies everywhere on this
// page — a ticket's created_at, or a release's release_date, of June 2026
// or earlier no longer counts toward anyone's numbers or drill-down
// lists. isRecent() treats a MISSING date (a release with no release_date
// set yet) as recent/kept, not old — an undated release is still active
// work, not something to silently drop from counts.
const TASK_TABLE_CUTOFF = "2026-07-01";
function isRecent(dateStr) {
  return !dateStr || dateStr >= TASK_TABLE_CUTOFF;
}

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

// Round 412 — same idea as bumpItem, but for a plain per-member SET of
// values (used for AR's "Projects" count below, which needs distinct
// RELEASES, not a growing list of ticket rows — a member with 3 tickets
// on the same release should count that release once, not three times).
function addToSet(map, memberKey, value) {
  const key = memberKey || UNASSIGNED;
  if (!map[key]) map[key] = new Set();
  map[key].add(value);
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

// Round 411 — was a `for (const tab of tabs) { await ... }` loop: ~29
// ticket types, one sequential round-trip each, waiting for each query to
// finish before starting the next. That's the main reason this page loads
// slowly. Same query, same per-tab work, just fired concurrently via
// Promise.all now instead of one at a time — bumpItem's map/requesterMap
// mutations are still safe done this way: each tab's own `.forEach` runs
// synchronously once ITS query resolves (JS has no real threads — two
// `await`s never interleave mid-forEach), so nothing here needed to
// change beyond how the queries are kicked off.
// Round 412 — arProjectsMap param added: AR's "Projects" count, per
// explicit formula ("every release input count as one (fill all check aka
// no TBU left considered done), any request send out count as 1 per
// project"). Filled from the SAME ticket rows this function already
// fetches, same pattern as requesterMap — no extra queries.
async function loadTicketCounts(map, requesterMap, arProjectsMap) {
  const { data: tabs } = await supabase.from("ticket_tabs").select("id, key").in("key", TICKET_KEYS);
  if (!tabs) return;
  const arOwnedTypes = new Set(TEAM_TICKET_TYPES.AR || []);
  await Promise.all(tabs.map(async (tab) => {
    // Round 389 — .gte("created_at", ...) excludes June 2026-and-earlier
    // tickets straight from the query (created_at is never null, unlike a
    // release's release_date, so this can filter server-side).
    const { data: tickets } = await supabase.from("tickets").select("id, status, pic_profile_id, pic_profile_ids, requester_profile_id, data").eq("tab_id", tab.id).is("deleted_at", null).gte("created_at", TASK_TABLE_CUTOFF);
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

        // Round 412 — "any request send out count as 1 per project": every
        // AR-owned ticket type's requester contributes the release it's on
        // (deduped by addToSet, ANY status — a sent-out request counts
        // whether or not it's been resolved yet).
        if (arOwnedTypes.has(tab.key) && t.data?.releaseId) {
          addToSet(arProjectsMap, t.requester_profile_id, t.data.releaseId);
        }
      }

      // Round 412 — "every release input count as one (fill all check aka
      // no TBU left considered done)": a COMPLETE Bổ Sung DATA ticket means
      // its PIC(s) filled in that release's Metadata Checklist — counted
      // for the PIC regardless of who requested it (requester there is
      // usually OPS, see TEAM_TICKET_TYPES.OPS's comment above). Checked
      // ahead of the isTicketUndone() early-return below, since COMPLETE is
      // itself the "done" state this is supposed to count.
      if (tab.key === "bo_sung_data" && t.status === "COMPLETE" && t.data?.releaseId) {
        const completerIds = t.pic_profile_ids && t.pic_profile_ids.length > 0 ? t.pic_profile_ids : [t.pic_profile_id];
        completerIds.forEach((picId) => {
          if (picId) addToSet(arProjectsMap, picId, t.data.releaseId);
        });
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
  }));
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

// Round 411 — these 4 queries don't depend on each other's results (each
// reads its own set of releases/assignments independently, and only gets
// combined via the shared `map` below), so they don't need to run one
// after another either — same Promise.all fix as loadTicketCounts above.
async function loadWorkstationCounts(map) {
  const [assignMap, uploadsRes, confirmRes, preReleaseRes] = await Promise.all([
    loadAssignMap(["upload", "confirm_phase1", "confirm_phase2", "pre_release"]),
    // Round 389 — "release_date" added to every releases select below so
    // isRecent() (see its comment up top) has something to check; filtered
    // in JS rather than a query .gte() since release_date CAN be null
    // (undated release) and null must stay IN, not be excluded by a plain
    // date comparison.
    supabase.from("releases").select("id, did, title, release_date, upload_status, link_lbm, link_share, smartlink, link_preorder, gate_pre_order").eq("requested", true),
    fetchAllRows(() =>
      supabase.from("releases").select([...DSP_CHECK_FIELDS, "id", "did", "title", "release_date", "link_lbm", "confirm_tag", "smartlink", "confirm_insta_sound", "confirm_tiktok_sound_updated", "confirm_smartlink_updated"].join(", ")).order("id")
    ),
    fetchAllRows(() =>
      supabase.from("releases").select("id, did, title, release_date, canva_mv_status, canva_status, musixmatch_link, musixmatch_status, nct_lyric, zing_lyric").order("id")
    ),
  ]);
  const uploads = uploadsRes.data;
  const confirmRows = confirmRes.data;
  const preReleaseRows = preReleaseRes.data;

  (uploads || []).filter((r) => isRecent(r.release_date)).forEach((r) => {
    const pic = assignMap.upload?.[r.id];
    if (pic !== undefined && !isUploadDone(r)) bumpItem(map, pic, "workstation:upload", { id: r.id, label: releaseLabel(r), href: WORKSTATION_ROUTES.upload });
  });

  (confirmRows || []).filter((r) => isRecent(r.release_date)).forEach((r) => {
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

  (preReleaseRows || []).filter((r) => isRecent(r.release_date)).forEach((r) => {
    const pic = assignMap.pre_release?.[r.id];
    if (pic !== undefined && !isPreReleaseDone(r)) bumpItem(map, pic, "workstation:pre_release", { id: r.id, label: releaseLabel(r), href: WORKSTATION_ROUTES.pre_release });
  });
}

// Round 325 — Marketing's "Dự Án" count, per explicit request: "if it has
// a team (brand) like indie, envi, count toward their subteam in the task
// table." Unlike every other column here, a dự án (release) isn't
// assigned to one Marketing PERSON — it's tagged to a SUBTEAM (INDIE/
// VPOP/ENVI/VIEENT — see effectiveSubteamTags, lib/releaseTags.js). Per
// explicit decisions this round: (1) every release CURRENTLY carrying a
// subteam's tag counts, full stop — no "still outstanding"/done concept
// exists for this, unlike every ticket/workstation column; (2) a release
// tagged with more than one subteam counts fully toward EACH of them, not
// split; (3) the count is a shared, subteam-wide number — every member
// who belongs to a given subteam (profile.subteam) sees the exact same
// number and the exact same drill-down list under the one fixed column id
// "subteam:project", reusing the existing bumpItem/countOf machinery as-is
// (bumping the SAME items array onto every member of that subteam) rather
// than needing any new per-column rendering logic in TeamSection/
// MyTasksView.
async function loadSubteamProjectCounts(map, profiles) {
  const { data: releases } = await fetchAllRows(() =>
    supabase.from("releases").select("id, did, title, release_date, tags").order("id")
  );
  const marketingMembersBySubteam = {};
  (profiles || []).forEach((p) => {
    if (p.segment !== SUBTEAM_TAG_TEAM || !p.subteam) return;
    if (!marketingMembersBySubteam[p.subteam]) marketingMembersBySubteam[p.subteam] = [];
    marketingMembersBySubteam[p.subteam].push(p.id);
  });
  (releases || []).filter((r) => isRecent(r.release_date)).forEach((r) => {
    const item = { id: r.id, label: releaseLabel(r), href: `/releases/${r.id}` };
    effectiveSubteamTags(r).forEach((subteamName) => {
      (marketingMembersBySubteam[subteamName] || []).forEach((memberId) => {
        bumpItem(map, memberId, "subteam:project", item);
      });
    });
  });
}

// Round 422 — per explicit request ("remove the task that the team is not
// executor out of their table, even though their view may have the ticket
// or workstation"): TEAM_TICKET_TYPES (lib/teamTypes.js) says which types a
// team's Tickets/Workstation SWITCHER shows — a visibility/navigation
// concern — but columnsForTeam below was also reusing it, unchanged, to
// decide which ticket-type columns render as EXECUTOR performance columns
// (PIC-based counts via memberItems). Those aren't the same thing: several
// types are listed under a team only because that team REQUESTS them, not
// because they execute them, and an executor column for a type nobody on
// that team is ever actually PIC'd on just shows a permanent wall of
// zeros — the exact "stale" symptom Round 412 diagnosed for AR (and found,
// tracing the code, applies to a couple of OPS's own listed types too).
//
// This is the exclusion list — every (team, type) pair from
// TEAM_TICKET_TYPES verified NOT to be that team's real executor, checked
// against each type's actual PIC-assignment gate: lib/ticketConfigs.js's
// executorTeam for every dual-view type, and each bespoke ticket page's own
// PIC-pool restriction (filterProfilesByTeam/EXECUTOR_TEAM/isExecutorView)
// for the rest. The type stays fully visible in that team's own ticket
// list/switcher and on the requester side below — only removed as an
// EXECUTOR column here.
//   AR: every dual-view type routes its executorTeam elsewhere (OPS or
//     Legal — see lib/ticketConfigs.js), report_conflict/pitching are
//     EXECUTOR_TEAM/isOpsTeam-gated to OPS, phu_luc's PIC pool is Legal,
//     publishing's PIC pool is ["Legal","OPS"]. AR's only real PIC pools
//     are bo_sung_data and pitching_info (both filterProfilesByTeam "AR")
//     plus stream_update (no team-gated PIC pool at all — self-serve).
//   OPS: pitching_info's PIC pool is actually AR, not OPS (see above,
//     despite OPS's TEAM_TICKET_TYPES entry), and bo_sung_data's real
//     executor is AR (Round 280 — "OPS picks the release, AR is the
//     executor"). Every other OPS-listed type checked out as real.
// Marketing/Design/Legal needed no exclusions — every type each of them
// owns is one they're genuinely PIC'd on.
const NOT_EXECUTOR_OVERRIDES = {
  AR: [
    "phai_sinh", "manual_claim", "report_conflict", "artist_profile", "phu_luc", "pitching",
    "co_trong_net_youtube", "pre_order_itunes", "priority_sync_lyric", "mv_spotify",
    "discovery_mode_spotify", "sony_publish", "split_share", "phu_luc_mg", "phu_luc_publishing", "publishing",
  ],
  OPS: ["pitching_info", "bo_sung_data"],
};

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
  const notExecutor = new Set(NOT_EXECUTOR_OVERRIDES[resolved] || []);
  const ticketCols = TICKET_KEYS.filter((k) => (TEAM_TICKET_TYPES[resolved] || []).includes(k) && !notExecutor.has(k)).map((k) => ({ id: `ticket:${k}`, name: TICKET_TYPE_LABELS[k] || k, href: TICKET_ROUTES[k] }));
  // Round 325 — "Khác" ("khac") is deliberately NOT in TEAM_TICKET_TYPES
  // for any team (it's shared/"Tất cả" — see lib/teamTypes.js's
  // SHARED_TICKET_TYPES), so it's added here directly instead, for every
  // team, rather than by editing that per-team ownership list (a
  // different concern — which team's Tickets switcher shows it). Safe to
  // show unconditionally: loadTicketCounts's existing generic PIC-bump
  // logic already only attributes a Khác ticket to someone when it has a
  // real PIC, and the only Khác tickets that ever get one are "Self Task"
  // ones (see lib/NewTicketPage.js) — which only ever attribute to their
  // OWN requester. A member never sees someone else's personal note
  // count show up here, by construction.
  const khacCol = [{ id: "ticket:khac", name: "Self Tasks (Khác)", href: TICKET_ROUTES.khac }];
  // Round 325 — Marketing-only "Dự Án" column (see
  // loadSubteamProjectCounts's comment above) — every INDIE/VPOP/ENVI/
  // VIEENT member's row shows their own subteam's tagged-release count.
  // Points at /releases (no query string — this app's release filters
  // aren't URL-driven) rather than a nonexistent per-subteam route.
  const subteamProjectCol = resolved === SUBTEAM_TAG_TEAM ? [{ id: "subteam:project", name: "Dự Án", href: "/releases" }] : [];
  return [...wsCols, ...ticketCols, ...khacCol, ...subteamProjectCol];
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

// Round 422 — replaces requesterTotal's single lump sum. Per explicit
// request ("instead of a requested column for all the thing they
// requested, it's more like a same column as the executioner but for
// requester"): one column PER ticket type, same shape as columnsForTeam's
// executor columns, just reading requesterItems (open+done, all statuses —
// same totals requesterTotal used to sum together) instead of memberItems
// (open-only, PIC-based). Computed once for the whole team (not per row)
// so every member's row lines up under the same column set: the union of
// ticket types ANY member of this team has requester-side data for, minus
// whatever's already an executor column for this team — a type they
// execute themselves isn't a "sent out" request, and would just duplicate
// the executor column right next to it.
function requestedColumnsForTeam(members, requesterItems, executorColumnIds) {
  const excluded = new Set(executorColumnIds);
  const keysWithData = new Set();
  members.forEach((m) => {
    const perColumn = requesterItems[m.id] || {};
    Object.keys(perColumn).forEach((colId) => {
      const match = colId.match(/^ticket:(.+):(open|done)$/);
      if (match && perColumn[colId]?.length > 0) keysWithData.add(match[1]);
    });
  });
  return TICKET_KEYS.filter((k) => keysWithData.has(k) && !excluded.has(`ticket:${k}`)).map((k) => ({
    id: `req:${k}`,
    typeKey: k,
    name: TICKET_TYPE_LABELS[k] || k,
    href: TICKET_ROUTES[k],
  }));
}

function requesterCount(requesterItems, memberId, typeKey) {
  return countOf(requesterItems, memberId, requesterColKey(typeKey, false)) + countOf(requesterItems, memberId, requesterColKey(typeKey, true));
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
// Round 412 — requesterItems/arProjectsCounts params added, per the
// explicit complaint that AR/Marketing's org-wide sections look "stale"
// (executor-only, and AR is structurally a requester-side team for almost
// everything it owns — see claude/pending-tasks.md's Round 412 note).
// Round 422 — the single lump "Requested" column replaced with one column
// per ticket type (requestedColumnsForTeam), same shape as the executor
// columns to its left, visually separated by a divider border — placed
// BEFORE the existing Total so Total's existing meaning (sum of the
// executor columns only) still doesn't change.
//  - "Projects" — AR only, per the user's own counting formula (see
//    loadTicketCounts's arProjectsMap comments above).
function TeamSection({ segment, members, memberItems, title, requesterItems, arProjectsCounts }) {
  const columns = columnsForTeam(segment);
  const unsupported = unsupportedWorkstationsForTeam(segment);
  const sortedMembers = [...members].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const teamHasUnassigned = columns.some((c) => countOf(memberItems, UNASSIGNED, c.id) > 0);
  const isAR = resolveTeamKey(segment) === "AR";
  const requestedColumns = requestedColumnsForTeam(sortedMembers, requesterItems, columns.map((c) => c.id));
  const dividerStyle = { borderLeft: "2px solid var(--border-strong)" };

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 15, marginBottom: 8 }}>{title || segment}</h2>
      {columns.length === 0 && requestedColumns.length === 0 ? (
        <div style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 8 }}>No tracked task types own by this team.</div>
      ) : (
        <div className={styles.scrollBox} style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              {requestedColumns.length > 0 && (
                <tr>
                  <th></th>
                  {columns.length > 0 && <th colSpan={columns.length}></th>}
                  <th colSpan={requestedColumns.length} style={{ ...dividerStyle, textAlign: "center", fontWeight: 400, fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Requested (sent to another team)
                  </th>
                  {isAR && <th></th>}
                  <th></th>
                </tr>
              )}
              <tr>
                <th>Member</th>
                {columns.map((c) => <th key={c.id}>{c.name}</th>)}
                {requestedColumns.map((c, i) => <th key={c.id} style={i === 0 ? dividerStyle : undefined}>{c.name}</th>)}
                {isAR && <th>Projects</th>}
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
                    {requestedColumns.map((c, i) => {
                      const n = requesterCount(requesterItems, m.id, c.typeKey);
                      return <td key={c.id} style={i === 0 ? dividerStyle : undefined}>{n ? <Link href={c.href} className={styles.rowLink}>{n}</Link> : <span style={{ color: "var(--text-faint)" }}>0</span>}</td>;
                    })}
                    {isAR && <td>{(() => { const n = arProjectsCounts?.[m.id] || 0; return n ? n : <span style={{ color: "var(--text-faint)" }}>0</span>; })()}</td>}
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
                  {requestedColumns.map((c, i) => <td key={c.id} style={{ color: "var(--text-faint)", ...(i === 0 ? dividerStyle : {}) }}>0</td>)}
                  {isAR && <td style={{ color: "var(--text-faint)" }}>0</td>}
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

// Round 404 item 1 — Weekly Tasks. Per explicit decision: "admin role can
// add to everyone of their own team (except dev)" — so the assignee
// picker is scoped to teamProfiles (already filtered to profile.segment,
// dev excluded since dev has no segment to begin with). The counter
// ("bộ đếm cho các task lập lại") shows repeat_count — "how many times
// it's repeated," per explicit answer, not a completion streak, so it
// keeps climbing even across a done→undone→done cycle. Rolls forward on
// mount (same lazy, no-cron pattern as lib/Sidebar.js's own rollover —
// duplicated here rather than threaded through props, since this section
// can mount independently of Sidebar's own effect having already run).
function WeeklyTasksSection({ profile, teamProfiles }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigneeId, setAssigneeId] = useState("");
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  const canAdd = isAdminOrAbove(profile) && !isDev(profile);
  const assignable = teamProfiles.filter((p) => p.role !== "dev");

  useEffect(() => {
    if (!supabase || !profile?.segment) return;
    load();
  }, [profile?.segment]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("weekly_tasks")
      .select("*, assignee:profiles!weekly_tasks_assignee_profile_id_fkey(name)")
      .eq("team", profile.segment)
      .eq("active", true)
      .order("created_at", { ascending: false });
    const rows = data || [];
    const { rolled, patches } = rollForwardIfNeeded(rows);
    if (patches.length > 0) await persistRollForward(supabase, patches);
    setTasks(rolled);
    setLoading(false);
  }

  async function addTask(e) {
    e.preventDefault();
    if (!text.trim() || !assigneeId) return;
    setAdding(true);
    setError(null);
    const { error: err } = await supabase.from("weekly_tasks").insert({
      team: profile.segment,
      assignee_profile_id: assigneeId,
      created_by: profile.id,
      text: text.trim(),
      week_start: currentWeekStartStr(),
    });
    setAdding(false);
    if (err) {
      setError(err.message);
      return;
    }
    setText("");
    setAssigneeId("");
    load();
  }

  async function toggleDone(t) {
    const { error: err } = await supabase.from("weekly_tasks").update({ done: !t.done }).eq("id", t.id);
    if (!err) setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)));
  }

  async function removeTask(t) {
    const { error: err } = await supabase.from("weekly_tasks").update({ active: false }).eq("id", t.id);
    if (!err) setTasks((prev) => prev.filter((x) => x.id !== t.id));
  }

  if (loading) return null;
  if (tasks.length === 0 && !canAdd) return null;

  return (
    <div style={{ marginBottom: 28, border: "1px solid var(--border-strong)", borderRadius: 8, padding: 16, background: "var(--bg-card)" }}>
      <h3 style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Weekly Tasks — {profile.segment}
      </h3>

      {tasks.length === 0 ? (
        <div style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: canAdd ? 12 : 0 }}>No weekly tasks yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: canAdd ? 16 : 0 }}>
          {tasks.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6 }}>
              <input type="checkbox" checked={!!t.done} onChange={() => toggleDone(t)} style={{ cursor: "pointer" }} />
              <div style={{ flex: 1, fontSize: 13, color: "var(--text)", textDecoration: t.done ? "line-through" : "none", opacity: t.done ? 0.6 : 1 }}>
                {t.text}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "nowrap" }}>{t.assignee?.name || "—"}</div>
              <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, whiteSpace: "nowrap" }} title="Weekly cycles repeated">
                ×{t.repeat_count || 1}
              </div>
              {canAdd && (
                <button
                  onClick={() => removeTask(t)}
                  style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 8px", color: "var(--text-faint)", cursor: "pointer", fontSize: 11 }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <form onSubmit={addTask} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select className={styles.select} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="">— assign to —</option>
            {assignable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input
            className={styles.input}
            style={{ flex: 1, minWidth: 200 }}
            placeholder="Task text…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className={styles.btnPrimary} type="submit" disabled={adding || !text.trim() || !assigneeId}>
            {adding ? "Adding…" : "+ Add"}
          </button>
        </form>
      )}
      {error && <div style={{ color: "var(--error-fg)", fontSize: 12, marginTop: 8 }}>{error}</div>}
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
  // Round 412 — AR's "Projects" column, keyed by profile id to a plain
  // count (converted from arProjectsMap's per-member Sets right after
  // load — TeamSection just needs the number, not the dedup machinery).
  const [arProjectsCounts, setArProjectsCounts] = useState({});
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
      const arProjectsMap = {};
      await Promise.all([loadTicketCounts(map, reqMap, arProjectsMap), loadWorkstationCounts(map), loadSubteamProjectCounts(map, profs || [])]);
      setMemberItems(map);
      setRequesterItems(reqMap);
      setArProjectsCounts(Object.fromEntries(Object.entries(arProjectsMap).map(([id, set]) => [id, set.size])));
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
                {/* Round 404 item 1 — Weekly Tasks: own team's list, plus an
                    add control for admin-and-up (never dev, per explicit
                    decision — dev also has no segment to scope this to). */}
                <WeeklyTasksSection profile={profile} teamProfiles={profiles.filter((p) => p.segment === profile.segment)} />
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
                  requesterItems={requesterItems}
                  arProjectsCounts={arProjectsCounts}
                  title={segment}
                />
              ))
            )
          ) : (
            <>
              {sections.map((segment) => (
                <TeamSection key={segment} segment={segment} members={profiles.filter((p) => p.segment === segment && p.name.toLowerCase().includes(memberQuery.trim().toLowerCase()))} memberItems={memberItems} requesterItems={requesterItems} arProjectsCounts={arProjectsCounts} />
              ))}
              {noSegmentProfiles.filter((p) => p.name.toLowerCase().includes(memberQuery.trim().toLowerCase())).length > 0 && (
                <TeamSection segment="No Team" members={noSegmentProfiles.filter((p) => p.name.toLowerCase().includes(memberQuery.trim().toLowerCase()))} memberItems={memberItems} requesterItems={requesterItems} arProjectsCounts={arProjectsCounts} title="No Team" />
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
