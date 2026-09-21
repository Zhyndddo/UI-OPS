import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { getNotDoneCount } from "../../../../lib/notDoneCounts";
import { TEAM_WORKSTATION_TYPES, WORKSTATION_TYPE_LABELS, TICKET_TYPE_LABELS } from "../../../../lib/teamTypes";

// Daily digest — Config item 5b. Compiles today's ticket activity (sent /
// completed, per ticket type) + every workstation's current not-done row
// count, and emails it out. Fires from a scheduled job (see vercel.json's
// cron entry) hitting this route once/day.
//
// NOTE on scheduling: the original design here was an hourly poll +
// same-day dedup guard, so the Config -> Notifications "hour" picker could
// actually control the send time. Vercel's Hobby plan caps cron jobs at
// once/day (a cron expression that fires more often fails at deploy
// time — this broke deploys entirely until vercel.json's schedule was
// changed to "0 0 * * *"), so on Hobby the fire time is whatever
// vercel.json says, fixed at deploy time — changing it means editing that
// file and redeploying, not just changing the Config setting. Upgrading
// to a paid Vercel plan and restoring an hourly schedule in vercel.json
// makes the Config hour picker live again.
//
// Sends via SMTP through a real mailbox you already control (SMTP_USER/
// SMTP_PASS below) rather than a third-party email API — no domain
// ownership or DNS verification needed, since it's just logging in and
// sending the way any mail client would. Without SMTP_HOST/SMTP_USER/
// SMTP_PASS configured, this still computes and returns the digest
// (dryRun) so it's testable before email is wired up. Set CRON_SECRET too
// and Vercel Cron will send it automatically as a Bearer token; without
// CRON_SECRET configured, any caller can trigger this (fine for local/dev,
// not for production).
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_SECURE = process.env.SMTP_SECURE === "true"; // true for port 465, false (STARTTLS) for 587/25
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const DIGEST_FROM = process.env.DIGEST_FROM_EMAIL || SMTP_USER;
const CRON_SECRET = process.env.CRON_SECRET;

function todayUTC() {
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
const NOT_DONE_SINCE_DATE = "2026-08-01";

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
    rows.push({ title: r.title, artist: r.main_artist, missing, releaseDate: r.release_date, daysLeft });
  }
  // Round 401 — per explicit request, reversed: furthest-out release date
  // first, working down toward soonest/most-overdue last, instead of the
  // original most-urgent-first ordering.
  rows.sort((a, b) => b.daysLeft - a.daysLeft);
  return rows;
}

async function buildDigest(supabase) {
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
    const count = await getNotDoneCount("ticket", tab.key, { role: "dev" }, { sinceDate: NOT_DONE_SINCE_DATE });
    if (count !== null) ticketNotDoneRows.push({ label: TICKET_TYPE_LABELS[tab.key] || tab.label, count });
  }

  const missingDataRows = await buildMissingDataRows(supabase);

  return { date, activityDate, ticketRows, ticketNotDoneRows, workstationRows, missingDataRows };
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderDigestHtml({ date, activityDate, ticketRows, ticketNotDoneRows, workstationRows, missingDataRows }, customNote) {
  // Round 401 — "Sent"/"Completed" now report on activityDate (yesterday,
  // full day) rather than "today," since this email goes out in the
  // morning before today has any activity of its own yet. Column headers
  // spell out the actual date so it's never ambiguous which day this is.
  const ticketTable = ticketRows.length
    ? `<table cellpadding="6" style="border-collapse:collapse;width:100%">
        <tr style="text-align:left;border-bottom:1px solid #ccc"><th>Ticket Type</th><th>Sent (${escapeHtml(activityDate)})</th><th>Completed (${escapeHtml(activityDate)})</th></tr>
        ${ticketRows.map((r) => `<tr style="border-bottom:1px solid #eee"><td>${escapeHtml(r.label)}</td><td>${r.sent}</td><td>${r.completed}</td></tr>`).join("")}
      </table>`
    : `<p style="color:#888">No ticket activity on ${escapeHtml(activityDate)}.</p>`;

  // Round 396 — separate from ticketTable above: total currently-open
  // count per ticket type (not just what moved today), same idiom as
  // workstationTable right below it.
  const ticketCounterTable = (ticketNotDoneRows || []).length
    ? `<table cellpadding="6" style="border-collapse:collapse;width:100%">
        <tr style="text-align:left;border-bottom:1px solid #ccc"><th>Ticket Type</th><th>Not Done</th></tr>
        ${ticketNotDoneRows.map((r) => `<tr style="border-bottom:1px solid #eee"><td>${escapeHtml(r.label)}</td><td>${r.count}</td></tr>`).join("")}
      </table>`
    : `<p style="color:#888">No ticket counts available.</p>`;

  const workstationTable = workstationRows.length
    ? `<table cellpadding="6" style="border-collapse:collapse;width:100%">
        <tr style="text-align:left;border-bottom:1px solid #ccc"><th>Workstation</th><th>Not Done</th></tr>
        ${workstationRows.map((r) => `<tr style="border-bottom:1px solid #eee"><td>${escapeHtml(r.label)}</td><td>${r.count}</td></tr>`).join("")}
      </table>`
    : `<p style="color:#888">No workstation counts available.</p>`;

  // Round 232 — per explicit request: which releases are missing which
  // checklist item, with the placeholder-dated ones already excluded (see
  // buildMissingDataRows/DUMMY_RELEASE_DATE). A table reads far cleaner
  // in an email client than a wall of one-sentence-per-song text blocks
  // (the older tool's format this was modeled on) — same table idiom as
  // the two sections above, so the whole email stays visually consistent.
  // Missing items render as small red badges; Days Left is red/bold once
  // a release is within a week of (or already past) its release date, so
  // the urgent ones jump out without needing a separate "overdue" table.
  const missingDataTable = missingDataRows.length
    ? `<table cellpadding="6" style="border-collapse:collapse;width:100%">
        <tr style="text-align:left;border-bottom:1px solid #ccc"><th>Release</th><th>Missing</th><th>Release Date</th><th>Days Left</th></tr>
        ${missingDataRows.map((r) => {
          const urgent = r.daysLeft <= 7;
          const badges = r.missing.map((m) => `<span style="display:inline-block;background:#fdecea;color:#c0392b;border-radius:4px;padding:1px 6px;margin:1px 3px 1px 0;font-size:11px;font-weight:700">${escapeHtml(m)}</span>`).join("");
          return `<tr style="border-bottom:1px solid #eee">
            <td>${escapeHtml(r.title)}${r.artist ? `<br><span style="color:#888;font-size:11px">${escapeHtml(r.artist)}</span>` : ""}</td>
            <td>${badges}</td>
            <td style="white-space:nowrap">${r.releaseDate}</td>
            <td style="white-space:nowrap;${urgent ? "color:#c0392b;font-weight:700" : ""}">${r.daysLeft}</td>
          </tr>`;
        }).join("")}
      </table>`
    : `<p style="color:#888">Nothing missing — every release with a real date is fully checked off.</p>`;

  return `
    <div style="font-family:sans-serif;max-width:640px">
      <h2>VIEENT OPS — Daily Digest, ${date}</h2>
      ${customNote ? `<p style="background:#f5f5f5;border-radius:6px;padding:10px 14px;white-space:pre-wrap">${escapeHtml(customNote)}</p>` : ""}
      <h3>Tickets</h3>
      ${ticketTable}
      <h3 style="margin-top:24px">Ticket Counter — Not Done</h3>
      ${ticketCounterTable}
      <h3 style="margin-top:24px">Workstation — Not Done</h3>
      ${workstationTable}
      <h3 style="margin-top:24px">Missing Data</h3>
      ${missingDataTable}
    </div>
  `;
}

let cachedTransporter = null;
function getTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return cachedTransporter;
}

async function sendEmail(to, html) {
  const transporter = getTransporter();
  if (!transporter) return { sent: false, reason: "SMTP_HOST/SMTP_USER/SMTP_PASS not configured" };
  try {
    await transporter.sendMail({
      from: DIGEST_FROM,
      to,
      subject: `VIEENT OPS — Daily Digest, ${todayUTC()}`,
      html,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: `SMTP error: ${err.message}` };
  }
}

export async function GET(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1"; // manual "Send test digest now" from Config bypasses the hour/dedup gate

  if (CRON_SECRET) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${CRON_SECRET}` && !force) {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
  }

  const { data: settings } = await supabaseAdmin.from("notification_settings").select("*").eq("id", 1).maybeSingle();
  if (!settings?.enabled) {
    return NextResponse.json({ skipped: "Notifications disabled." });
  }

  // Vercel Hobby caps cron jobs at once/day, so vercel.json's schedule is
  // the actual fixed fire time (currently 00:00 UTC — see that file's
  // comment), not the digest_hour setting below. digest_hour still exists
  // for orgs on a plan that allows more frequent cron (Pro+) — restore the
  // hourly poll in vercel.json ("0 * * * *") and this hour-match check
  // becomes live again; on Hobby it's informational only, and the
  // same-day dedup guard is what actually prevents a double-send if this
  // route gets hit more than once on the same day.
  const today = todayUTC();
  if (!force && settings.digest_last_sent_date === today) {
    return NextResponse.json({ skipped: "Already sent today." });
  }

  const digest = await buildDigest(supabaseAdmin);
  const html = renderDigestHtml(digest, settings.digest_custom_note);

  let recipients = settings.digest_recipients || [];
  if (recipients.length === 0) {
    const { data: admins } = await supabaseAdmin.from("profiles").select("email").in("role", ["admin", "dev"]);
    recipients = (admins || []).map((p) => p.email).filter(Boolean);
  }

  const result = recipients.length > 0 ? await sendEmail(recipients, html) : { sent: false, reason: "No recipients configured." };

  if (!force) {
    await supabaseAdmin.from("notification_settings").update({ digest_last_sent_date: today }).eq("id", 1);
  }

  return NextResponse.json({ ...digest, recipients, emailResult: result });
}
