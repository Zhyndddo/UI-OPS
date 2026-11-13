// Round 601 — the digest numbers, moved out of app/api/cron/daily-digest/route.js unchanged so the Telegram digest can reuse them.
import { getNotDoneCount } from "./notDoneCounts";
import { TEAM_WORKSTATION_TYPES, WORKSTATION_TYPE_LABELS, TICKET_TYPE_LABELS } from "./teamTypes";

export function todayUTC() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Round 401 — per explicit request: this route fires in the morning (see
// vercel.json's cron schedule / the NOTE above on Hobby's fixed fire
// time), before today has had any chance to accumulate its own sent/
// completed tickets — "today" was therefore always reporting on a day
// that had barely started. "Sent"/"Completed" now report on the last
// FULL day (yesterday) instead.
function yesterdayUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Round 401 — "Ticket Counter — Not Done" and "Workstation — Not Done"
// should stop counting genuinely old backlog rows ("exclude anything
// (created or release date) before august of 2026"). Threaded through to
// getNotDoneCount's optional sinceDate (see lib/notDoneCounts.js) — scoped
// to just these two sections, nothing else in the app is affected.
// Round 428 — "say anything before 8/8 is excluded": pushed forward one
// week, same fixed-date mechanism, no other change.
const NOT_DONE_SINCE_DATE = "2026-08-08";

// Round 403 — "Ticket Counter — Not Done" ticket types with no reachable
// UI to ever clear them through, per explicit request. newrelease_upload
// is auto-created by the SEND UPLOAD button (see app/releases/[id]/
// page.js) but was never wired into any team's Tickets picker
// (lib/teamTypes.js's TEAM_TICKET_TYPES/SHARED_TICKET_TYPES) — nobody has
// a normal way to open it and move its status, so its "not done" count
// only ever grows. The real, actionable signal for this same work already
// exists and is already shown: "Workstation — Not Done" -> New Release
// Setup (workstationNotDoneCount's "upload" branch reads releases.
// upload_status/link_lbm/link_share/smartlink/link_preorder directly, not
// this ticket's own status). Showing both would double-report the same
// underlying work through one live number and one dead one — excluded
// here rather than from ticketRows (Sent/Completed) above, since that
// table is just "how many were auto-sent yesterday," which stays a
// harmless, accurate activity signal even with nowhere to act on them.
const TICKET_NOT_DONE_EXCLUDED_TYPES = new Set(["newrelease_upload"]);

// Round 232 — "Missing Data" section, per explicit request: same 6-item
// checklist as the release detail page's Metadata Checklist (see that
// page's METADATA_ITEMS — these labels are copied verbatim from there so
// this email never drifts from what the checklist actually says).
const META_CHECKLIST = [
  ["meta_audio", "Audio"],
  ["meta_artwork", "Artwork"],
  ["meta_working_files", "Working Files"],
  ["meta_lyric", "Lyric"],
  ["meta_mv", "MV"],
  ["meta_doc", "Metadata"],
];

// The team's own placeholder release_date for a project with no real date
// set yet — per explicit instruction, these are excluded from the
// Missing Data section entirely (not shown with a misleading "days to
// release" countdown), same idea as everywhere else in the app that
// already treats a real release_date as required data. If the team's
// convention for this placeholder ever changes, update it here.
const DUMMY_RELEASE_DATE = "2026-12-31";

// Round 283 — per explicit request: "no old song, just new song this month
// and last month." Missing Data used to list every release ever missing a
// checklist item regardless of age, which meant old back-catalog releases
// nobody's actively working on kept cluttering the email indefinitely.
// Scoped to a rolling 2-calendar-month window (last month's 1st through the
// end of this month) by release_date — same UTC-calendar-date convention
// this whole route already uses (todayUTC/dayStart/dayEnd above), not the
// GMT+7 localDateStr the client pages use, since this runs server-side with
// no "local" timezone of its own; the route already fires once/day so a
// same-day UTC/GMT+7 boundary mismatch here is a non-issue in practice.
function missingDataMonthWindow() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  const toStr = (d) => d.toISOString().slice(0, 10);
  return {
    from: toStr(new Date(Date.UTC(y, m - 1, 1))), // 1st of last month
    to: toStr(new Date(Date.UTC(y, m + 1, 1))), // 1st of next month (exclusive)
  };
}

async function buildMissingDataRows(supabase) {
  const { from, to } = missingDataMonthWindow();
  const { data: releases } = await supabase
    .from("releases")
    .select("id, did, title, main_artist, release_date, meta_audio, meta_artwork, meta_working_files, meta_lyric, meta_mv, meta_doc")
    .neq("release_date", DUMMY_RELEASE_DATE)
    .gte("release_date", from)
    .lt("release_date", to);

  const today = todayUTC();
  const rows = [];
  for (const r of releases || []) {
    const missing = META_CHECKLIST.filter(([key]) => r[key] !== "true").map(([, label]) => label);
    if (missing.length === 0) continue;
    const daysLeft = Math.round((new Date(r.release_date) - new Date(today)) / 86400000);
    rows.push({ id: r.id, title: r.title, artist: r.main_artist, missing, releaseDate: r.release_date, daysLeft });
  }
  // Round 401 — per explicit request, reversed: furthest-out release date
  // first, working down toward soonest/most-overdue last, instead of the
  // original most-urgent-first ordering.
  rows.sort((a, b) => b.daysLeft - a.daysLeft);
  return rows;
}

export async function buildDigest(supabase) {
  const date = todayUTC();
  // Round 401 — "Sent"/"Completed" now scoped to yesterday, not today (see
  // yesterdayUTC's comment above) — date (today) is still used for the
  // email's own header/subject and for Missing Data's days-left math,
  // which is genuinely about today.
  const activityDate = yesterdayUTC();
  const dayStart = `${activityDate}T00:00:00.000Z`;
  const dayEnd = `${activityDate}T23:59:59.999Z`;

  const { data: tabs } = await supabase.from("ticket_tabs").select("id, key, label").order("sort_order");
  const ticketRows = [];
  for (const tab of tabs || []) {
    const { count: sentCount } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("tab_id", tab.id)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    // Completed-yesterday = status_log has a COMPLETE timestamp landing on
    // activityDate — not just "status is currently COMPLETE," since a
    // ticket could've completed that day and been reopened since. jsonb
    // ->> gives text; cast to timestamptz for the range compare.
    const { data: completedRows } = await supabase
      .from("tickets")
      .select("id, status_log")
      .eq("tab_id", tab.id)
      .not("status_log->COMPLETE", "is", null);
    const completedYesterday = (completedRows || []).filter((t) => {
      const ts = t.status_log?.COMPLETE;
      return ts && ts.slice(0, 10) === activityDate;
    }).length;

    if ((sentCount || 0) > 0 || completedYesterday > 0) {
      ticketRows.push({ label: TICKET_TYPE_LABELS[tab.key] || tab.label, sent: sentCount || 0, completed: completedYesterday });
    }
  }

  const workstationRows = [];
  const allWorkstations = [...new Set(Object.values(TEAM_WORKSTATION_TYPES).flat())];
  for (const key of allWorkstations) {
    // Round 401 — excludes anything (by release_date) before August 2026,
    // per explicit request; see NOT_DONE_SINCE_DATE and
    // lib/notDoneCounts.js's scopeReleaseDate.
    const count = await getNotDoneCount("workstation", key, { role: "dev" }, { sinceDate: NOT_DONE_SINCE_DATE });
    if (count !== null) workstationRows.push({ label: WORKSTATION_TYPE_LABELS[key] || key, count });
  }

  // Round 396 — "digest email: also add ticket counter table". The
  // existing `ticketRows` above is YESTERDAY's activity only (sent /
  // completed) — this is different: the total currently-open (not-done)
  // count per ticket type, right now, regardless of when it was created
  // (Round 401 — except now excluding anything created before August
  // 2026, same reasoning as workstationRows above). Same
  // getNotDoneCount("ticket", ...) helper the Report Conflict/task-table
  // pages already use for exactly this number (kind "ticket" was already
  // implemented there, just never called from this route) — { role: "dev" }
  // for the same "full picture, not filtered to one team's view" reason
  // workstationRows already uses it above, not any real signed-in caller.
  const ticketNotDoneRows = [];
  for (const tab of tabs || []) {
    if (TICKET_NOT_DONE_EXCLUDED_TYPES.has(tab.key)) continue;
    const count = await getNotDoneCount("ticket", tab.key, { role: "dev" }, { sinceDate: NOT_DONE_SINCE_DATE });
    if (count !== null) ticketNotDoneRows.push({ label: TICKET_TYPE_LABELS[tab.key] || tab.label, count });
  }

  const missingDataRows = await buildMissingDataRows(supabase);

  return { date, activityDate, ticketRows, ticketNotDoneRows, workstationRows, missingDataRows };
}

