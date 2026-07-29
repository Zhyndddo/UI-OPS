import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { getNotDoneCount } from "../../../../lib/notDoneCounts";
import { TEAM_WORKSTATION_TYPES, WORKSTATION_TYPE_LABELS, TICKET_TYPE_LABELS } from "../../../../lib/teamTypes";

// Daily digest — Config item 5b. Compiles today's ticket activity (sent /
// completed, per ticket type) + every workstation's current not-done row
// count, and emails it out. Fires from a scheduled job (see vercel.json's
// cron entry, hourly) hitting this route; the actual "once a day, at the
// configured hour" behavior is enforced HERE via notification_settings
// (digest_hour + digest_last_sent_date), not by the cron schedule itself
// — Vercel Cron's minimum interval is coarser than "any hour 0-23", so an
// hourly poll + an in-DB dedup guard is the reliable way to hit an
// admin-configurable hour.
//
// Needs RESEND_API_KEY set (https://resend.com) to actually send — without
// it this still computes and returns the digest (dryRun) so it's testable
// before email is wired up. Set CRON_SECRET too and Vercel Cron will send
// it automatically as a Bearer token; without CRON_SECRET configured, any
// caller can trigger this (fine for local/dev, not for production).
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DIGEST_FROM = process.env.DIGEST_FROM_EMAIL || "ops@vieent.local";
const CRON_SECRET = process.env.CRON_SECRET;

function todayUTC() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function buildDigest(supabase) {
  const date = todayUTC();
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  const { data: tabs } = await supabase.from("ticket_tabs").select("id, key, label").order("sort_order");
  const ticketRows = [];
  for (const tab of tabs || []) {
    const { count: sentCount } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("tab_id", tab.id)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    // Completed-today = status_log has a COMPLETE timestamp landing today
    // — not just "status is currently COMPLETE," since a ticket could've
    // completed today and been reopened since. jsonb ->> gives text; cast
    // to timestamptz for the range compare.
    const { data: completedRows } = await supabase
      .from("tickets")
      .select("id, status_log")
      .eq("tab_id", tab.id)
      .not("status_log->COMPLETE", "is", null);
    const completedToday = (completedRows || []).filter((t) => {
      const ts = t.status_log?.COMPLETE;
      return ts && ts.slice(0, 10) === date;
    }).length;

    if ((sentCount || 0) > 0 || completedToday > 0) {
      ticketRows.push({ label: TICKET_TYPE_LABELS[tab.key] || tab.label, sent: sentCount || 0, completed: completedToday });
    }
  }

  const workstationRows = [];
  const allWorkstations = [...new Set(Object.values(TEAM_WORKSTATION_TYPES).flat())];
  for (const key of allWorkstations) {
    const count = await getNotDoneCount("workstation", key, { role: "dev" });
    if (count !== null) workstationRows.push({ label: WORKSTATION_TYPE_LABELS[key] || key, count });
  }

  return { date, ticketRows, workstationRows };
}

function renderDigestHtml({ date, ticketRows, workstationRows }) {
  const ticketTable = ticketRows.length
    ? `<table cellpadding="6" style="border-collapse:collapse;width:100%">
        <tr style="text-align:left;border-bottom:1px solid #ccc"><th>Ticket Type</th><th>Sent Today</th><th>Completed Today</th></tr>
        ${ticketRows.map((r) => `<tr style="border-bottom:1px solid #eee"><td>${r.label}</td><td>${r.sent}</td><td>${r.completed}</td></tr>`).join("")}
      </table>`
    : `<p style="color:#888">No ticket activity today.</p>`;

  const workstationTable = workstationRows.length
    ? `<table cellpadding="6" style="border-collapse:collapse;width:100%">
        <tr style="text-align:left;border-bottom:1px solid #ccc"><th>Workstation</th><th>Not Done</th></tr>
        ${workstationRows.map((r) => `<tr style="border-bottom:1px solid #eee"><td>${r.label}</td><td>${r.count}</td></tr>`).join("")}
      </table>`
    : `<p style="color:#888">No workstation counts available.</p>`;

  return `
    <div style="font-family:sans-serif;max-width:640px">
      <h2>VIEENT OPS — Daily Digest, ${date}</h2>
      <h3>Tickets</h3>
      ${ticketTable}
      <h3 style="margin-top:24px">Workstation — Not Done</h3>
      ${workstationTable}
    </div>
  `;
}

async function sendEmail(to, html) {
  if (!RESEND_API_KEY) return { sent: false, reason: "RESEND_API_KEY not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: DIGEST_FROM, to, subject: `VIEENT OPS — Daily Digest, ${todayUTC()}`, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { sent: false, reason: `Resend error: ${res.status} ${body}` };
  }
  return { sent: true };
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

  const currentUTCHour = new Date().getUTCHours();
  const today = todayUTC();
  if (!force) {
    if (currentUTCHour !== settings.digest_hour) {
      return NextResponse.json({ skipped: `Not the configured hour (now ${currentUTCHour}, configured ${settings.digest_hour}).` });
    }
    if (settings.digest_last_sent_date === today) {
      return NextResponse.json({ skipped: "Already sent today." });
    }
  }

  const digest = await buildDigest(supabaseAdmin);
  const html = renderDigestHtml(digest);

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
