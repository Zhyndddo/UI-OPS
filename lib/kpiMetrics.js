// Round 459 — Phase 2 of task-tracker-kpi-overhaul-spec.md: the 4 KPI
// metrics (§4), computed LIVE against raw ticket rows for now. No history
// table yet (that's Phase 3's daily-snapshot job) and no UI role-scoping
// yet (that's Phase 4, which will fold this into Task Table) — per
// explicit direction this round ships the formulas plus a minimal
// standalone live-view page (app/kpi/page.js) so there's something real
// to look at before the storage/UI layers exist.
//
// (Round 460: workstation backlog added below — see
// computeWorkstationBacklog. The paragraph that follows is the Round 459
// reasoning for why it wasn't there at first.)
//
// Deliberately TICKETS ONLY this round. Workstations (upload/confirm/
// pre_release/cost_mkt/stream) each have their own ad-hoc "is this row
// done" predicate (isUploadDone/isConfirmPhase1Done/etc in
// app/task-table/page.js) that was never pulled into a shared, importable
// place — duplicating a second, possibly-drifting copy of that logic here
// felt worse than being explicit about the gap. Pulling those predicates
// into a shared lib (so this module and Task Table both read the same
// definition of "done") is flagged as a short follow-up before workstation
// throughput/backlog gets added here.
//
// Cycle time is never pooled across ticket types (a Design ticket and a
// Phu Luc ticket are not comparable durations — see spec §4), so metrics
// are bucketed per (profileId, type) pair, never just per profileId.
// Throughput/on-time-count/backlog are safe to SUM across types for a
// per-person total (pure counts), which the live page does; cycle time is
// only ever shown per type.

import { isTicketDone } from "./helpers";
import { isUploadDone, isConfirmPhase1Done, isConfirmPhase2Done, isPreReleaseDone } from "./workstationDoneRules";

// Per spec §3c's deadline audit — only these ticket types have a real,
// user-settable deadline field eligible for on-time rate. Everything else
// is excluded from on-time rate specifically (not scored 0%/100%).
// batch_phai_sinh is deliberately NOT here — its deadline lives per child
// item (phai_sinh_batch_items.deadline), not on the parent ticket, and
// needs its own item-level pass (see computeBatchPhaiSinhOnTime below),
// not this ticket-level one.
export const DEADLINE_ELIGIBLE_TICKET_TYPES = ["design", "newrelease_upload", "phai_sinh", "phu_luc", "publishing"];

// Every terminal status literal this app uses, across both vocabularies
// (shared English + report_conflict's Vietnamese + design's CANCEL) —
// same list isTicketDone() in lib/helpers.js already checks. Kept
// separately here only because terminalTimestamp() below needs to know
// which status_log key to look for, in priority order (COMPLETE first —
// it's the only one on-time rate ever reads).
const TERMINAL_STATUS_KEYS = ["COMPLETE", "CANCEL", "CANCELED", "REFUND", "Hoàn thành", "Từ chối", "Hủy"];

export function picIdsOf(ticket) {
  if (ticket.pic_profile_ids && ticket.pic_profile_ids.length > 0) return ticket.pic_profile_ids;
  return ticket.pic_profile_id ? [ticket.pic_profile_id] : [];
}

// The timestamp a ticket actually closed at, whichever terminal status it
// landed in (COMPLETE most commonly, but a cancelled/refunded one still
// closed on some real date and still counts toward throughput — just
// never toward on-time rate, which only ever reads the COMPLETE key).
// Falls back to updated_at for an old ticket whose status_log predates
// this app tracking that transition.
function terminalTimestamp(ticket) {
  const log = ticket.status_log || {};
  for (const key of TERMINAL_STATUS_KEYS) {
    if (log[key]) return log[key];
  }
  return ticket.updated_at || null;
}

function inRange(iso, periodStart, periodEnd) {
  if (!iso) return false;
  return iso >= periodStart && iso < periodEnd;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function emptyBucket() {
  return {
    throughput: 0,
    onTimeEligible: 0,
    onTimeCount: 0,
    cycleTimesMs: [],
    openCount: 0,
    overdueCount: 0,
  };
}

// One pass over a flat list of tickets (each needs: type, status,
// status_log, deadline, pic_profile_id(s), created_at, updated_at) for one
// period [periodStart, periodEnd) (ISO date/datetime strings, end
// exclusive). Returns Map<profileId, Map<type, bucket>> — see module
// comment on why type is never collapsed out.
export function computeTicketKpis(tickets, { periodStart, periodEnd, deadlineEligibleTypes = DEADLINE_ELIGIBLE_TICKET_TYPES } = {}) {
  const byProfile = new Map();
  function bucket(profileId, type) {
    if (!byProfile.has(profileId)) byProfile.set(profileId, new Map());
    const byType = byProfile.get(profileId);
    if (!byType.has(type)) byType.set(type, emptyBucket());
    return byType.get(type);
  }

  const today = todayStr();

  (tickets || []).forEach((t) => {
    const ids = picIdsOf(t);
    if (ids.length === 0) return;
    const done = isTicketDone(t.status);

    if (done) {
      const closedAt = terminalTimestamp(t);
      if (closedAt && inRange(closedAt, periodStart, periodEnd)) {
        ids.forEach((id) => { bucket(id, t.type).throughput += 1; });

        // On-time rate — only COMPLETE (not cancel/refund) counts, only
        // for deadline-eligible types, only when a deadline was actually
        // set on this ticket.
        const completedAt = (t.status_log || {}).COMPLETE;
        if (deadlineEligibleTypes.includes(t.type) && t.deadline && completedAt) {
          // Deadline is a plain YYYY-MM-DD date field; completedAt is a
          // full ISO timestamp (UTC, same as every other status_log
          // entry) — comparing against end-of-deadline-day, both as plain
          // ISO strings (lexicographic compare is safe since both sides
          // are UTC already, same convention the rest of the app uses for
          // these fields).
          const onTime = completedAt <= `${t.deadline}T23:59:59.999Z`;
          ids.forEach((id) => {
            const b = bucket(id, t.type);
            b.onTimeEligible += 1;
            if (onTime) b.onTimeCount += 1;
          });
        }

        // Cycle time — created_at to closedAt, this type only.
        if (t.created_at) {
          const ms = new Date(closedAt) - new Date(t.created_at);
          if (Number.isFinite(ms) && ms >= 0) {
            ids.forEach((id) => bucket(id, t.type).cycleTimesMs.push(ms));
          }
        }
      }
    } else {
      // Backlog health — a live gauge, not period-scoped: every
      // currently-open ticket counts regardless of the picked period.
      ids.forEach((id) => {
        const b = bucket(id, t.type);
        b.openCount += 1;
        if (t.deadline && today > t.deadline) b.overdueCount += 1;
      });
    }
  });

  return byProfile;
}

// batch_phai_sinh's child items (phai_sinh_batch_items) turn out to carry
// their own real status_log + created_at (see prod_schema_clean.sql —
// same shape as a ticket row: status, status_log jsonb, created_at,
// updated_at, deadline, pic_profile_ids), so they don't need a separate
// implementation after all — a caller maps each item to a ticket-shaped
// object (type: "batch_phai_sinh", plus its own status/status_log/
// deadline/pic_profile_ids/created_at) and feeds it through
// computeTicketKpis the same as any real ticket, passing
// deadlineEligibleTypes: ["batch_phai_sinh"] for that call (items ARE
// eligible for on-time rate, per §3c — the deadline just lives one level
// down from where every other type keeps it).

export function avgMs(msList) {
  if (!msList || msList.length === 0) return null;
  return msList.reduce((a, b) => a + b, 0) / msList.length;
}

// p50/p90 — spec §4 calls these out explicitly ("average alone hides a
// few very slow outliers"). Simple nearest-rank percentile over a sorted
// copy; fine at this data volume, revisit only if a type's per-period
// ticket count ever gets large enough for this to matter perf-wise.
export function percentileMs(msList, p) {
  if (!msList || msList.length === 0) return null;
  const sorted = [...msList].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function fmtDuration(ms) {
  if (ms == null) return "—";
  const hours = ms / 3600000;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function fmtPct(count, eligible) {
  if (!eligible) return "—";
  return `${Math.round((count / eligible) * 100)}%`;
}

// Round 460 — workstation side. The done-rules now live in
// lib/workstationDoneRules.js (shared with Task Table), so open-now backlog
// can be computed live. Honest limit: a workstation row's "done" is derived
// from release fields, with NO completion timestamp, so throughput /
// on-time / cycle time can't be reconstructed for a past period — those
// need Phase 3's daily snapshots (which observe the not-done -> done flip).
// Only openCount is produced here; overdue stays 0 (workstations have no
// deadline field). Same cutoff as Task Table so numbers line up.
export const WORKSTATION_KPI_CUTOFF = "2026-07-01";
export const WORKSTATION_DONE_RULES = {
  upload: isUploadDone,
  confirm_phase1: isConfirmPhase1Done,
  confirm_phase2: isConfirmPhase2Done,
  pre_release: isPreReleaseDone,
};

// releases: rows with id, release_date + whichever fields the rules read.
// assignments: workstation_assignments rows (workstation, release_id,
// pic_profile_id, pic_profile_ids). Returns Map<profileId, Map<"ws:<key>", bucket>>.
export function computeWorkstationBacklog(releases, assignments) {
  const byProfile = new Map();
  const relById = new Map((releases || []).map((r) => [r.id, r]));
  (assignments || []).forEach((a) => {
    const rule = WORKSTATION_DONE_RULES[a.workstation];
    if (!rule || a.release_id == null) return; // skip default rows / unknown workstations
    const r = relById.get(a.release_id);
    if (!r) return;
    if (r.release_date && r.release_date < WORKSTATION_KPI_CUTOFF) return;
    if (a.workstation === "upload" && !r.requested) return; // Task Table only counts requested uploads
    if (rule(r)) return;
    const ids = a.pic_profile_ids && a.pic_profile_ids.length > 0 ? a.pic_profile_ids : a.pic_profile_id ? [a.pic_profile_id] : [];
    ids.forEach((id) => {
      if (!byProfile.has(id)) byProfile.set(id, new Map());
      const byType = byProfile.get(id);
      const key = `ws:${a.workstation}`;
      if (!byType.has(key)) byType.set(key, emptyBucket());
      byType.get(key).openCount += 1;
    });
  });
  return byProfile;
}
