// Round 601 — scheduled Telegram summary into the internal group. Called by Supabase pg_cron three times a day
// (08:30 / 13:30 / 18:00 Vietnam, Mon-Fri) because Vercel Hobby crons can only run once a day.
//   GET /api/cron/telegram-digest?slot=morning|noon|evening   with   Authorization: Bearer <CRON_SECRET>
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { sendTelegram, slotOf, telegramConfigured } from "../../../../lib/telegram";
import { buildSlotText, claimSlot, releaseSlot } from "../../../../lib/fridayDigest";
import { sendPicAlerts } from "../../../../lib/tgAlerts";
import { sendReminders } from "../../../../lib/tgRemind";
import { dmCopies } from "../../../../lib/recapCopies";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (request.headers.get("authorization") || "") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not authorized." }, { status: 401 });   // fails closed
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  if (!telegramConfigured()) return NextResponse.json({ skipped: "Telegram not configured." });
  const sp = new URL(request.url).searchParams;
  const slot = slotOf(sp.get("slot"));
  if (!slot) return NextResponse.json({ error: "slot must be morning, noon or evening." }, { status: 400 });
  // Round 658 — ?fallback=1 (13:50 / 18:20 jobs): only send if Claude's relay has not already posted this slot today.
  const fallback = sp.get("fallback") === "1" && slot !== "morning";
  if (fallback && !(await claimSlot(supabaseAdmin, slot, "cron-fallback"))) return NextResponse.json({ slot, skipped: "already posted via relay" });
  try {
    const { digest, text } = await buildSlotText(supabaseAdmin, slot);
    const res = await sendTelegram(text);
    if (fallback && !res.ok) await releaseSlot(supabaseAdmin, slot);
    const copies = await dmCopies(supabaseAdmin, text);   // Round 632 — private copy for the people picked in Config
    let alerts = null;   // Round 624 — morning only: each linked person gets their own overdue / stuck items privately
    if (slot === "morning") alerts = await sendPicAlerts(supabaseAdmin, digest).catch((e) => ({ error: e.message }));
    let reminders = null;   // Round 630 — 13:30: due-in-2-days nudges with ✅ / 😴 buttons
    if (slot === "noon") reminders = await sendReminders(supabaseAdmin, digest).catch((e) => ({ error: e.message }));
    return NextResponse.json({ slot, ...res, copies, alerts, reminders }, { status: res.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
