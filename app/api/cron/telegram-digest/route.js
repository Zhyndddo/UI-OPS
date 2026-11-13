// Round 601 — scheduled Telegram summary into the internal group. Called by Supabase pg_cron three times a day
// (08:30 / 13:30 / 18:00 Vietnam, Mon-Fri) because Vercel Hobby crons can only run once a day.
//   GET /api/cron/telegram-digest?slot=morning|noon|evening   with   Authorization: Bearer <CRON_SECRET>
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { buildDigest } from "../../../../lib/digestData";
import { sendTelegram, renderDigestTelegram, slotOf, telegramConfigured } from "../../../../lib/telegram";
import { loadStuck, loadChatSignals, renderActions } from "../../../../lib/friday";
import { loadIntakeGaps } from "../../../../lib/tgIntake";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (request.headers.get("authorization") || "") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not authorized." }, { status: 401 });   // fails closed
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  if (!telegramConfigured()) return NextResponse.json({ skipped: "Telegram not configured." });
  const slot = slotOf(new URL(request.url).searchParams.get("slot"));
  if (!slot) return NextResponse.json({ error: "slot must be morning, noon or evening." }, { status: 400 });
  try {
    const digest = await buildDigest(supabaseAdmin);
    let text = renderDigestTelegram(digest, slot);
    try { text += "\n\n" + renderActions(digest, await loadStuck(supabaseAdmin), slot !== "morning", await loadChatSignals(supabaseAdmin, digest.missingDataRows).catch(() => ({})), await loadIntakeGaps(supabaseAdmin).catch(() => [])); } catch (e) { /* digest still goes out without the action block */ }
    const res = await sendTelegram(text);
    return NextResponse.json({ slot, ...res }, { status: res.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
