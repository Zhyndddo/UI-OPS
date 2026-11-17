// Round 603/610 — Telegram posts updates here; the request is checked with TELEGRAM_WEBHOOK_SECRET (set when the webhook is registered).
//  • Internal group only: every text message is stored in tg_chat_log (for the daily recap) and /status, /missing are answered.
//  • Anywhere: @mention / reply to the bot / private message → the joke reply.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { buildDigest } from "../../../lib/digestData";
import { sendTelegramTo, splitText, renderStatusTelegram, renderMissingTelegram } from "../../../lib/telegram";
import { loadStuck, loadChatSignals, loadOwners, renderActions } from "../../../lib/friday";
import { loadIntakeGaps } from "../../../lib/tgIntake";
import { internalChatIds, isInternalChat, isExtraChat } from "../../../lib/tgChats";
import { releaseList, releaseWhich, HELP_RELEASE } from "../../../lib/tgRelease";
import { setAlerts } from "../../../lib/tgAlerts";
import { captureTags, handleTagPick, loadTags, renderTagBlock } from "../../../lib/tgTags";
import { askFriday } from "../../../lib/tgAsk";
import { teamHtml, matchSegment, listSegments, segmentOfProfile } from "../../../lib/tgTeams";
import { handleReminder } from "../../../lib/tgRemind";
import { addOwners } from "../../../lib/tgOwners";
import { linkedProfile, startLink, confirmLink, unlink, myTasksHtml } from "../../../lib/tgLink";
import { captureIntake, handleDecision, loadIntakes, renderIntakeBlock, cardButtons, renderCard, intakeCardsOn } from "../../../lib/tgIntake";
import { vnDayStart, vnDateLabel, loadMessages, analyse, aiSummary, renderRecapTelegram } from "../../../lib/tgRecap";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const REPLY = "Mình vui lòng giúp bạn nhưng mình chưa hiểu tiếng Việt, mời bạn nói tiếng Nga. 🇷🇺\nГоворите по-русски, пожалуйста.";
const COOLDOWN_MS = 20 * 1000;   // at most one joke per chat per 20 s, so a pile-on can't make the bot spam the group
const last = new Map();
let botName = null;

// Round 630 — /ask and /team (group or private chat of a linked person)
async function runAskTeam(cmd, arg, tgUserId) {
  if (cmd === "ask") return await askFriday(supabaseAdmin, arg);
  const info = arg ? await matchSegment(supabaseAdmin, arg) : { segs: await listSegments(supabaseAdmin), seg: null };
  if (arg) return info.seg ? await teamHtml(supabaseAdmin, info.seg) : `Không thấy team "${esc(arg)}". Các team: ${info.segs.map(esc).join(", ") || "—"}`;
  const lk = tgUserId ? await linkedProfile(tgUserId).catch(() => null) : null;
  const seg = lk ? await segmentOfProfile(supabaseAdmin, lk.profile_id) : null;
  if (!seg) return `Mình chưa biết team của bạn. Gõ /team <tên team> (${info.segs.map(esc).join(", ") || "—"}) hoặc nhắn riêng cho mình /link để mình nhớ bạn.`;
  return await teamHtml(supabaseAdmin, seg);
}

async function getBotName(token) {
  if (botName) return botName;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const j = await r.json();
    if (j.ok) botName = String(j.result.username || "").toLowerCase();
  } catch (e) { /* try again next time */ }
  return botName;
}

async function reply(token, m, text, html, markup) {
  let first = true;
  for (const part of splitText(text)) {   // Telegram's limit is 4096 characters → long answers become 2-3 messages
    const body = { chat_id: m.chat.id, text: part, disable_web_page_preview: true };
    if (first) { body.reply_to_message_id = m.message_id; body.allow_sending_without_reply = true; first = false; }
    if (html) body.parse_mode = "HTML";
    if (markup) body.reply_markup = markup;
    if (m.is_topic_message && m.message_thread_id) body.message_thread_id = m.message_thread_id;
    try { await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); } catch (e) { /* ignore */ }
  }
}

export async function POST(request) {
  const token = process.env.TELEGRAM_BOT_TOKEN, secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) return NextResponse.json({ ok: false }, { status: 503 });
  const given = Buffer.from(request.headers.get("x-telegram-bot-api-secret-token") || ""), want = Buffer.from(secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return NextResponse.json({ ok: false }, { status: 401 });

  let update = {};
  try { update = await request.json(); } catch (e) { return NextResponse.json({ ok: true }); }
  if (update.callback_query) {   // Round 616 — ✅ Đúng / 🗑 Bỏ on an intake card
    const cb = update.callback_query, tg = (method, body) => fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    try {
      const data = String(cb.data || "");   // Round 625 # song tag buttons (tp:/tx:), Round 630 reminder buttons (rm:)
      const res = !supabaseAdmin ? { answer: "Chưa cấu hình." } : /^t[px]:/.test(data) ? await handleTagPick(supabaseAdmin, cb, linkedProfile) : data.startsWith("rm:") ? await handleReminder(supabaseAdmin, cb, linkedProfile) : await handleDecision(supabaseAdmin, cb, linkedProfile);
      await tg("answerCallbackQuery", { callback_query_id: cb.id, text: res.answer });
      if (res.edit && cb.message) await tg("editMessageText", { chat_id: cb.message.chat.id, message_id: cb.message.message_id, text: res.edit, parse_mode: "HTML", disable_web_page_preview: true });
    } catch (e) { await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Lỗi, thử lại." }); }
    return NextResponse.json({ ok: true });
  }
  const m = update.message;
  if (!m || !m.chat || m.from?.is_bot) return NextResponse.json({ ok: true });
  const text = String(m.text || m.caption || "");
  const name = await getBotName(token);
  const isPrivate = m.chat.type === "private";
  const isExtra = isExtraChat(m.chat.id);   // Round 631b: another chat — answers /release /status /ask, messages logged apart from the basket
  const isInternal = isInternalChat(m.chat.id);   // Round 624: any group in TELEGRAM_CHAT_IDS (+ the main one) is read into the same basket

  // Round 610 — remember the internal group's chat for the daily recap (text only, capped; commands to the bot are not stored)
  const cmdMatch = /^\/(\w+)(?:@(\w+))?(?:\s|$)/.exec(text);
  const isCommand = !!cmdMatch && (!cmdMatch[2] || cmdMatch[2].toLowerCase() === name);
  if (isCommand && cmdMatch[1].toLowerCase() === "chatid") {   // Round 643b — works in ANY chat the bot is in: tells you the id to put in TELEGRAM_EXTRA_CHAT_IDS
    await reply(token, m, `Chat ID: ${m.chat.id}\nLoại: ${m.chat.type}${m.chat.title ? "\nTên: " + m.chat.title : ""}`, false);
    return NextResponse.json({ ok: true });
  }
  if ((isInternal || isExtra) && supabaseAdmin && text.trim() && !isCommand) {
    const sender = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || m.from?.username || "?";
    try {
      await supabaseAdmin.from("tg_chat_log").upsert({
        chat_id: String(m.chat.id), thread_id: m.is_topic_message ? m.message_thread_id || null : null, msg_id: m.message_id,
        sender, text: text.slice(0, 1000), sent_at: new Date((m.date || Date.now() / 1000) * 1000).toISOString(),
      }, { onConflict: "chat_id,msg_id", ignoreDuplicates: true });
    } catch (e) { /* never break the bot over logging */ }
  }

  // Round 625 — "#bài hát": search the app, offer buttons, link the chosen song
  if (isInternal && supabaseAdmin && text.includes("#") && !isCommand) {
    try { for (const r of await captureTags(supabaseAdmin, m, text)) await reply(token, m, r.text, true, r.markup); } catch (e) { /* never break the bot over tags */ }
  }

  // Round 616 — a request message in the group ("Hiếu ơi gửi upload nha …") becomes a card the poster / PIC can confirm
  if (isInternal && supabaseAdmin && text.trim() && !isCommand) {
    try {
      // links hidden behind link text (Telegram "text_link") are added as extra lines so the parser sees them
      const hidden = (m.entities || m.caption_entities || []).filter((e) => e.type === "text_link" && e.url && !text.includes(e.url)).map((e) => e.url);
      const it = await captureIntake(supabaseAdmin, m, hidden.length ? text + "\n" + hidden.join("\n") : text);
      if (it && intakeCardsOn()) await reply(token, m, renderCard(it), true, cardButtons(it.id));
    } catch (e) { /* never break the bot over parsing */ }
  }

  // Round 630 — private chat: /ask and /team need a linked account (they show internal numbers)
  if (isPrivate && isCommand && supabaseAdmin && m.from?.id && ["ask", "team"].includes(cmdMatch[1].toLowerCase())) {
    const lk = await linkedProfile(m.from.id).catch(() => null);
    if (!lk) { await sendTelegramTo(m.chat.id, "Bạn cần liên kết trước: /link email-đăng-nhập-app"); return NextResponse.json({ ok: true }); }
    try { await sendTelegramTo(m.chat.id, await runAskTeam(cmdMatch[1].toLowerCase(), text.slice(cmdMatch[0].length).trim(), m.from.id)); } catch (e) { await sendTelegramTo(m.chat.id, esc("Lỗi: " + e.message)); }
    return NextResponse.json({ ok: true });
  }

  // Round 611 — private chat: /link, /code, /unlink, /mytasks (the account link needs a code emailed to the app address)
  if (isPrivate && isCommand && supabaseAdmin && m.from?.id) {
    const cmd = cmdMatch[1].toLowerCase(), arg = text.slice(cmdMatch[0].length).trim();
    let out = null;
    try {
      if (cmd === "start" || cmd === "help") out = "Xin chào! Để nhận việc của bạn ở đây:\n1) /link email-đăng-nhập-app\n2) Mở email lấy mã 6 số, rồi gõ /code 123456\nSau đó gõ /mytasks bất cứ lúc nào. Gõ /ask <câu hỏi> hoặc /team để hỏi nhanh. Gõ /alert để mỗi sáng mình nhắn riêng việc của bạn (/alert off để tắt). /unlink để huỷ liên kết.";
      else if (cmd === "link") out = await startLink(m.from.id, m.chat.id, arg);
      else if (cmd === "code") out = await confirmLink(m.from.id, arg);
      else if (cmd === "unlink") out = await unlink(m.from.id);
      else if (cmd === "alert" || cmd === "alerts") out = await setAlerts(m.from.id, arg);
      else if (cmd === "mytasks") { const lk = await linkedProfile(m.from.id); out = lk ? await myTasksHtml(lk.profile_id) : "Bạn chưa liên kết. Gõ /link email-đăng-nhập-app"; }
    } catch (e) { out = "Lỗi: " + e.message; }
    if (out) { await sendTelegramTo(m.chat.id, cmd === "mytasks" ? out : esc(out)); return NextResponse.json({ ok: true }); }
  }

  // Round 610 — commands, internal group only (they show internal numbers)
  if (isCommand && (isInternal || isExtra) && supabaseAdmin) {
    const cmd = cmdMatch[1].toLowerCase();
    if (isExtra && !["release", "status", "ask"].includes(cmd)) {   // Round 631b: only these three answer in an extra chat
      if (["missing", "recap", "mytasks", "team"].includes(cmd)) await reply(token, m, "Ở nhóm này mình chỉ trả lời /release, /status và /ask thôi nhé.", false);
      return NextResponse.json({ ok: true });
    }
    if (["status", "missing", "recap", "mytasks", "ask", "team", "release"].includes(cmd)) {   // instant 👍 so people know the command arrived (the answer can take a few seconds)
      try { await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: m.chat.id, message_id: m.message_id, reaction: [{ type: "emoji", emoji: "👍" }] }) }); } catch (e) { /* ignore */ }
    }
    if (cmd === "mytasks") {   // list goes to the person's private chat, never into the group
      try {
        const lk = m.from?.id ? await linkedProfile(m.from.id) : null;
        if (!lk) await reply(token, m, `Mình chưa biết bạn là ai. Nhắn riêng cho mình (@${name}) gõ /link email-đăng-nhập-app để liên kết một lần.`, false);
        else {
          const res = await sendTelegramTo(lk.dm_chat_id, await myTasksHtml(lk.profile_id));
          await reply(token, m, res.ok ? "📬 Đã gửi danh sách việc vào tin nhắn riêng của bạn." : res.blocked ? `Mình chưa nhắn riêng được — bạn mở chat với @${name} và bấm Start trước nhé.` : "Không gửi được: " + res.error, false);
        }
      } catch (e) { await reply(token, m, "Lỗi: " + e.message, false); }
      return NextResponse.json({ ok: true });
    }
    if (cmd === "release") {   // Round 631b — releases not out yet: this week / upcoming
      const which = releaseWhich(text.slice(cmdMatch[0].length));
      try { await reply(token, m, which ? await releaseList(supabaseAdmin, which) : HELP_RELEASE, true); } catch (e) { await reply(token, m, "Lỗi: " + e.message, false); }
      return NextResponse.json({ ok: true });
    }
    if (cmd === "ask" || cmd === "team") {   // Round 630
      try { await reply(token, m, await runAskTeam(cmd, text.slice(cmdMatch[0].length).trim(), m.from?.id), true); } catch (e) { await reply(token, m, "Lỗi: " + e.message, false); }
      return NextResponse.json({ ok: true });
    }
    if (cmd === "recap") {
      try {
        const yesterday = /hôm qua|hom qua|yesterday|qua/i.test(text.slice(cmdMatch[0].length));
        const now = new Date(), from = vnDayStart(yesterday ? 1 : 0, now), to = yesterday ? vnDayStart(0, now) : now;
        const msgs = await loadMessages(supabaseAdmin, from, to, internalChatIds());
        const ai = await aiSummary(msgs);
        const an = analyse(msgs);
        await addOwners(supabaseAdmin, an.open.slice(-6)).catch(() => {});
        const intakeBlock = renderIntakeBlock(await loadIntakes(supabaseAdmin, from.toISOString(), to.toISOString()).catch(() => []));
        const tagBlock = renderTagBlock(await loadTags(supabaseAdmin, from.toISOString(), to.toISOString()).catch(() => []));
        await reply(token, m, renderRecapTelegram(an, vnDateLabel(from) + (yesterday ? "" : " (đến giờ)"), ai) + (intakeBlock ? "\n\n" + intakeBlock : "") + (tagBlock ? "\n\n" + tagBlock : ""), true);
      } catch (e) { await reply(token, m, "Lỗi khi tóm tắt: " + e.message, false); }
      return NextResponse.json({ ok: true });
    }
    if (cmd === "status" || cmd === "missing") {
      try {
        const digest = await buildDigest(supabaseAdmin);
        await loadOwners(supabaseAdmin, digest.missingDataRows);
        if (cmd === "status") {
          const stuck = await loadStuck(supabaseAdmin).catch(() => []);
          const sig = await loadChatSignals(supabaseAdmin, digest.missingDataRows).catch(() => ({}));
          const gaps = await loadIntakeGaps(supabaseAdmin).catch(() => []);
          await reply(token, m, renderStatusTelegram(digest) + "\n\n" + renderActions(digest, stuck, true, sig, gaps), true);
        } else await reply(token, m, renderMissingTelegram(digest, await loadChatSignals(supabaseAdmin, digest.missingDataRows).catch(() => ({}))), true);
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
