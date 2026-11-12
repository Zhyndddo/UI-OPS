// Round 603/610 — Telegram posts updates here; the request is checked with TELEGRAM_WEBHOOK_SECRET (set when the webhook is registered).
//  • Internal group only: every text message is stored in tg_chat_log (for the daily recap) and /status, /missing are answered.
//  • Anywhere: @mention / reply to the bot / private message → the joke reply.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { buildDigest } from "../../../lib/digestData";
import { renderStatusTelegram, renderMissingTelegram } from "../../../lib/telegram";
import { vnDayStart, vnDateLabel, loadMessages, analyse, aiSummary, renderRecapTelegram } from "../../../lib/tgRecap";

export const maxDuration = 30;
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

async function reply(token, m, text, html) {
  const body = { chat_id: m.chat.id, text, reply_to_message_id: m.message_id, allow_sending_without_reply: true, disable_web_page_preview: true };
  if (html) body.parse_mode = "HTML";
  if (m.is_topic_message && m.message_thread_id) body.message_thread_id = m.message_thread_id;
  try { await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); } catch (e) { /* ignore */ }
}

export async function POST(request) {
  const token = process.env.TELEGRAM_BOT_TOKEN, secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) return NextResponse.json({ ok: false }, { status: 503 });
  const given = Buffer.from(request.headers.get("x-telegram-bot-api-secret-token") || ""), want = Buffer.from(secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return NextResponse.json({ ok: false }, { status: 401 });

  let update = {};
  try { update = await request.json(); } catch (e) { return NextResponse.json({ ok: true }); }
  const m = update.message;
  if (!m || !m.chat || m.from?.is_bot) return NextResponse.json({ ok: true });
  const text = String(m.text || m.caption || "");
  const name = await getBotName(token);
  const isPrivate = m.chat.type === "private";
  const isInternal = !!process.env.TELEGRAM_INTERNAL_CHAT_ID && String(m.chat.id) === String(process.env.TELEGRAM_INTERNAL_CHAT_ID);

  // Round 610 — remember the internal group's chat for the daily recap (text only, capped; commands to the bot are not stored)
  const cmdMatch = /^\/(\w+)(?:@(\w+))?(?:\s|$)/.exec(text);
  const isCommand = !!cmdMatch && (!cmdMatch[2] || cmdMatch[2].toLowerCase() === name);
  if (isInternal && supabaseAdmin && text.trim() && !isCommand) {
    const sender = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || m.from?.username || "?";
    try {
      await supabaseAdmin.from("tg_chat_log").upsert({
        chat_id: String(m.chat.id), thread_id: m.is_topic_message ? m.message_thread_id || null : null, msg_id: m.message_id,
        sender, text: text.slice(0, 1000), sent_at: new Date((m.date || Date.now() / 1000) * 1000).toISOString(),
      }, { onConflict: "chat_id,msg_id", ignoreDuplicates: true });
    } catch (e) { /* never break the bot over logging */ }
  }

  // Round 610 — commands, internal group only (they show internal numbers)
  if (isCommand && isInternal && supabaseAdmin) {
    const cmd = cmdMatch[1].toLowerCase();
    if (["status", "missing", "recap"].includes(cmd)) {   // instant 👍 so people know the command arrived (the answer can take a few seconds)
      try { await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: m.chat.id, message_id: m.message_id, reaction: [{ type: "emoji", emoji: "👍" }] }) }); } catch (e) { /* ignore */ }
    }
    if (cmd === "recap") {
      try {
        const yesterday = /hôm qua|hom qua|yesterday|qua/i.test(text.slice(cmdMatch[0].length));
        const now = new Date(), from = vnDayStart(yesterday ? 1 : 0, now), to = yesterday ? vnDayStart(0, now) : now;
        const msgs = await loadMessages(supabaseAdmin, from, to, m.chat.id);
        const ai = await aiSummary(msgs);
        await reply(token, m, renderRecapTelegram(analyse(msgs), vnDateLabel(from) + (yesterday ? "" : " (đến giờ)"), ai), true);
      } catch (e) { await reply(token, m, "Lỗi khi tóm tắt: " + e.message, false); }
      return NextResponse.json({ ok: true });
    }
    if (cmd === "status" || cmd === "missing") {
      try {
        const digest = await buildDigest(supabaseAdmin);
        await reply(token, m, cmd === "status" ? renderStatusTelegram(digest) : renderMissingTelegram(digest), true);
      } catch (e) { await reply(token, m, "Lỗi khi lấy số liệu: " + e.message, false); }
      return NextResponse.json({ ok: true });
    }
  }

  const mentioned = !!name && text.toLowerCase().includes("@" + name);
  const replyToBot = !!name && String(m.reply_to_message?.from?.username || "").toLowerCase() === name;
  if (!(isPrivate || mentioned || replyToBot)) return NextResponse.json({ ok: true });

  const now = Date.now();
  if (now - (last.get(m.chat.id) || 0) < COOLDOWN_MS) return NextResponse.json({ ok: true });
  last.set(m.chat.id, now);
  await reply(token, m, REPLY, false);
  return NextResponse.json({ ok: true });
}
