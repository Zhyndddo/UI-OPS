// Round 34 — Design ticket flow redesign. Central place for the new status
// vocabulary, transition rules, expected-deadline business-day/urgency
// math, and the top counter-box math — kept out of the page components so
// app/tickets/design/page.js and .../new/page.js aren't 600-line files of
// tangled date arithmetic.
//
// Status vocabulary change (round 34): REQUESTED/PROCESS/COMPLETE/REFUND/
// CANCELED -> REQUEST/PROCESS/PENDING/REVISE/COMPLETE/CANCEL. REFUND is
// retired for this type — PENDING and REVISE replace what REFUND used to
// loosely cover (see add-round34-design-flow-and-ops-notes.sql for how
// existing REFUND rows are migrated). No other ticket type is affected —
// this vocabulary is intentionally Design-only.
export const DESIGN_STATUSES = ["REQUEST", "PROCESS", "PENDING", "REVISE", "COMPLETE", "CANCEL"];
export const DESIGN_DEFAULT_STATUS = "REQUEST";

// ── Transition rules ────────────────────────────────────────────────────
// Exact rules per the request:
//  - REQUEST: exec can move to PROCESS (gated by a confirm modal requiring
//    Expected Deadline + PIC) or CANCEL. Requester can only CANCEL — they
//    cannot self-advance to PROCESS.
//  - PROCESS: exec can move to PENDING or REVISE (both require a Note) or
//    straight to COMPLETE, or CANCEL.
//  - REVISE: exec can move to COMPLETE (feedback accepted) or CANCEL.
//    Assumption (not explicit in the request, added for a practical
//    escape hatch): also allowed back to PROCESS if the feedback means
//    more work is needed — otherwise REVISE would be a dead end whenever
//    complete isn't warranted yet. Flagged in DATA_FIXES.md.
//  - PENDING: nobody picks a status "forward" here — the ticket bounces
//    back to whatever status it was in right before PENDING (stored in
//    data.returnStatus at the moment PROCESS/REVISE -> PENDING happens).
//    Both the requester and the exec can fire that return.
//  - COMPLETE / CANCEL: terminal, same as every other ticket type.
export function statusOptionsFor(ticket, isExecutor) {
  const s = ticket?.status;
  if (isExecutor) {
    if (s === "REQUEST") return ["REQUEST", "PROCESS", "CANCEL"];
    if (s === "PROCESS") return ["PROCESS", "PENDING", "REVISE", "COMPLETE", "CANCEL"];
    if (s === "REVISE") return ["REVISE", "PROCESS", "COMPLETE", "CANCEL"];
    if (s === "PENDING") return [...new Set(["PENDING", ticket?.data?.returnStatus].filter(Boolean))];
    return [s];
  }
  // Requester (AR) side.
  if (s === "REQUEST") return ["REQUEST", "CANCEL"];
  if (s === "PENDING") return [...new Set(["PENDING", ticket?.data?.returnStatus].filter(Boolean))];
  return [s];
}

// Statuses that require a Note to be filled before the transition is
// allowed, per explicit request ("moving out to revise and pending must
// add a note").
export const NOTE_REQUIRED_STATUSES = ["PENDING", "REVISE"];

export function isDesignDone(status) {
  return status === "COMPLETE" || status === "CANCEL";
}

// ── Expected Deadline business-day / urgency rules ──────────────────────
// "deadline must be at least 2 week-day counting from the request date;
// every in-day mark as urgent ... request create after 18h00 on friday
// can only choose the next tuesday as expected deadline, sooner will mark
// as urgent."
const VN_WEEKEND = [0, 6]; // Sun, Sat

function isWeekend(d) {
  return VN_WEEKEND.includes(d.getDay());
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addBusinessDays(date, count) {
  let d = new Date(date);
  let added = 0;
  while (added < count) {
    d = addDays(d, 1);
    if (!isWeekend(d)) added++;
  }
  return d;
}

function nextTuesday(from) {
  let d = new Date(from);
  do {
    d = addDays(d, 1);
  } while (d.getDay() !== 2);
  return d;
}

function toDateOnlyStr(d) {
  return d.toISOString().slice(0, 10);
}

// The earliest date NOT considered urgent, given when the request is
// being created. Friday-after-18:00 special case takes priority over the
// generic 2-business-day rule per explicit request.
export function minNonUrgentDeadline(now = new Date()) {
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const hour = now.getHours();
  if (day === 5 && hour >= 18) {
    return toDateOnlyStr(nextTuesday(now));
  }
  return toDateOnlyStr(addBusinessDays(now, 2));
}

// True if the chosen deadline (a "YYYY-MM-DD" string) counts as urgent —
// today itself is always urgent ("every in-day mark as urgent"), and
// anything earlier than the computed minimum non-urgent date is urgent.
export function isDeadlineUrgent(deadlineStr, now = new Date()) {
  if (!deadlineStr) return false;
  const todayStr = toDateOnlyStr(now);
  if (deadlineStr === todayStr) return true;
  const min = minNonUrgentDeadline(now);
  return deadlineStr < min;
}

// "lock at 2 request per team per day" — picked the simplest of the three
// options the request explicitly offered ("only in request"): count how
// many Design tickets the requester's own team has already created today;
// the 3rd (and beyond) is auto-marked urgent rather than blocked outright
// (nothing in the request says to actually block creation).
export function isOverTeamDailyQuota(countAlreadyToday) {
  return countAlreadyToday >= 2;
}

// ── Design-team-status counter comment thresholds ───────────────────────
// Request gave overlapping boundaries (<5, 5-10, 10-15, >15) — resolved to
// non-overlapping buckets: <5, 5-9, 10-14, >=15. Flagged in DATA_FIXES.md.
export function designTeamStatusComment(count) {
  if (count < 5) return "Rảnh nè";
  if (count < 10) return "Bình ổn";
  if (count < 15) return "Quá tải";
  return "💥 Kế Hoạch";
}

export const DEFAULT_DESIGN_NOTIFICATION_TEMPLATES = {
  urgentCreation: "🔴 Urgent Design request: {task} — expected deadline {deadline}.",
  reminder: "Design team: {count} request(s) waiting to be picked up.",
  late: "Design team: {count} ticket(s) are past their expected deadline.",
  pendingRevise: "{count} Design ticket(s) are Pending/Revise — action may be needed on your side.",
  overload: "Design team Status has reached {count} — team may be overloaded.",
};
