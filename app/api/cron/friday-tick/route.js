// Round 660 — Friday's 10-minute tick (Supabase pg_cron, 07:00-21:50 VN): delivers /remind messages, pushes newly assigned tickets,
// sends /watch countdowns and lets messages that waited out quiet hours go. Auth: Authorization: Bearer <CRON_SECRET> (fails closed).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { telegramConfigured } from "../../../../lib/telegram";
import { flushOutbox } from "../../../../lib/tgOutbox";
import { pushAssignments } from "../../../../lib/tgInbox";
import { tickRemind, tickWatch } from "../../../../lib/tgPlanner";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (request.headers.get("authorization") || "") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  if (!telegramConfigured()) return NextResponse.json({ skipped: "Telegram not configured." });
  const out = {};
  for (const [k, fn] of [["remind", tickRemind], ["assign", pushAssignments], ["watch", tickWatch], ["outbox", flushOutbox]]) {
    try { out[k] = await fn(supabaseAdmin); } catch (e) { out[k] = { error: e.message }; }
  }
  return NextResponse.json(out);
}
