// Round 603 — the bot answers when somebody @mentions it, replies to it, or messages it privately. Joke reply for now.
// Telegram posts updates here; the request is checked with TELEGRAM_WEBHOOK_SECRET (set when the webhook is registered), so nobody else can call it.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

export const maxDuration = 15;
export const dynamic = "force-dynamic";

const REPLY = "Mình vui lòng giúp bạn nhưng mình chưa hiểu tiếng Việt, mời bạn nói tiếng Nga. 🇷🇺\nГоворите по-русски, пожалуйста.";
const COOLDOWN_MS = 20 * 1000;   // at most one joke per chat per 20 s, so a pile-on can't make the bot spam the group
const last = new Map();
let botName = null;

async function getBotName(token) {
  if (botName) return botName;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const j = await r.json();
    if (j.ok) botName = String(j.result.username || "").toLowerCase();
  } catch (e) { /* try again next time */ }
  return botName;
}

export async function POST(request) {
  const token = process.env.TELEGRAM_BOT_TOKEN, secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) return NextResponse.json({ ok: false }, { status: 503 });
  const given = Buffer.from(request.headers.get("x-telegram-bot-api-secret-token") || ""), want = Buffer.from(secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    console.log("telegram-webhook 401: header length", given.length, "env length", want.length);
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update = {};
  try { update = await request.json(); } catch (e) { return NextResponse.json({ ok: true }); }
  const m = update.message;
  console.log("telegram-webhook update:", Object.keys(update).join(","), "chat", m?.chat?.type, "topic", !!m?.is_topic_message, "len", String(m?.text || "").length);
  if (!m || !m.chat || m.from?.is_bot) return NextResponse.json({ ok: true });
  const text = String(m.text || m.caption || "");
  const name = await getBotName(token);
  const isPrivate = m.chat.type === "private";
  const mentioned = !!name && text.toLowerCase().includes("@" + name);
  const replyToBot = !!name && String(m.reply_to_message?.from?.username || "").toLowerCase() === name;
  if (!(isPrivate || mentioned || replyToBot)) return NextResponse.json({ ok: true });

  const now = Date.now();
  if (now - (last.get(m.chat.id) || 0) < COOLDOWN_MS) return NextResponse.json({ ok: true });
  last.set(m.chat.id, now);

  const body = { chat_id: m.chat.id, text: REPLY, reply_to_message_id: m.message_id, allow_sending_without_reply: true };
  if (m.is_topic_message && m.message_thread_id) body.message_thread_id = m.message_thread_id;
  try { await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); } catch (e) { /* ignore */ }
  return NextResponse.json({ ok: true });
}

// TEMPORARY diagnostic (round 607b): open this URL in a browser to see whether the deployed build has the env vars. Shows lengths only, never values. Remove once the bot works.
export async function GET() {
  const t = process.env.TELEGRAM_BOT_TOKEN, sc = process.env.TELEGRAM_WEBHOOK_SECRET;
  return NextResponse.json({ hasToken: !!t, secretLength: sc ? sc.length : 0, secretHasWhitespace: sc ? /\s/.test(sc) : false });
}
