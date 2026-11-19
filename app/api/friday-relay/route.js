// Round 658 — Claude relay. A scheduled Claude task reads the digest text (GET), checks it, and posts it with a
// short note on top (POST) through Friday. Auth: Authorization: Bearer <FRIDAY_RELAY_TOKEN> (its OWN env var,
// separate from CRON_SECRET). The token can only: read the digest text, and post the digest + a note (max 600
// chars) to the main group, once per slot per day. It cannot send arbitrary text.
//   GET  /api/friday-relay?slot=noon|evening       -> { slot, day, posted_by, plain, text }
//   POST /api/friday-relay  { slot, note }          -> posts; 409 if the slot was already posted today
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { sendTelegram, slotOf, telegramConfigured } from "../../../lib/telegram";
import { buildSlotText, claimSlot, releaseSlot, slotPostedBy, vnDay } from "../../../lib/fridayDigest";
import { sendReminders } from "../../../lib/tgRemind";
import { dmCopies } from "../../../lib/recapCopies";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const plainOf = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function authed(request) {
  const t = process.env.FRIDAY_RELAY_TOKEN;
  return !!t && (request.headers.get("authorization") || "") === `Bearer ${t}`;   // fails closed
}

export async function GET(request) {
  if (!authed(request)) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  const slot = slotOf(new URL(request.url).searchParams.get("slot"));
  if (!slot) return NextResponse.json({ error: "slot must be morning, noon or evening." }, { status: 400 });
  try {
    const { text } = await buildSlotText(supabaseAdmin, slot);
    return NextResponse.json({ slot, day: vnDay(), posted_by: await slotPostedBy(supabaseAdmin, slot), plain: plainOf(text), text });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!authed(request)) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  if (!telegramConfigured()) return NextResponse.json({ skipped: "Telegram not configured." });
  let body = {};
  try { body = await request.json(); } catch (e) { /* empty body is fine, treated as no note */ }
  const slot = slotOf(body.slot);
  if (!slot) return NextResponse.json({ error: "slot must be morning, noon or evening." }, { status: 400 });
  const note = String(body.note || "").trim().slice(0, 600);
  if (!(await claimSlot(supabaseAdmin, slot, "claude-relay"))) return NextResponse.json({ error: "Already posted for this slot today.", slot, day: vnDay() }, { status: 409 });
  try {
    const { digest, text } = await buildSlotText(supabaseAdmin, slot);
    const full = note ? `🧭 <b>Friday kiểm tra:</b> ${esc(note)}\n\n${text}` : text;
    const res = await sendTelegram(full);
    if (!res.ok) { await releaseSlot(supabaseAdmin, slot); return NextResponse.json({ error: res.error, slot }, { status: 502 }); }
    const copies = await dmCopies(supabaseAdmin, full);
    let reminders = null;
    if (slot === "noon") reminders = await sendReminders(supabaseAdmin, digest).catch((e) => ({ error: e.message }));
    return NextResponse.json({ ok: true, slot, day: vnDay(), ...res, copies, reminders });
  } catch (err) {
    await releaseSlot(supabaseAdmin, slot);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
