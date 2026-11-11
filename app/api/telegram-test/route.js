// Round 601 — "Send test to Telegram" button (Config). Dev/admin only. { digest:true } posts the real digest, otherwise a one-line hello.
import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../lib/supabaseAdmin";
import { buildDigest } from "../../../lib/digestData";
import { sendTelegram, renderDigestTelegram, describeChat, telegramConfigured } from "../../../lib/telegram";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  const caller = await getCallerProfile(request);
  if (!caller || !(caller.role === "dev" || caller.role === "admin")) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  if (!telegramConfigured()) return NextResponse.json({ error: "Chưa có TELEGRAM_BOT_TOKEN / TELEGRAM_INTERNAL_CHAT_ID trên Vercel (Settings → Environment Variables), rồi redeploy." }, { status: 400 });
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  try {
    const text = body.digest ? renderDigestTelegram(await buildDigest(supabaseAdmin), "noon") : "✅ VIEENT OPS bot đã kết nối — tin nhắn thử.";
    const res = await sendTelegram(text);
    return NextResponse.json({ ...res, chat: await describeChat() }, { status: res.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
