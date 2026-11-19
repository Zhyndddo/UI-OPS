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
import { internalChatIds, isInternalChat, isExtraChat, isArChat } from "../../../lib/tgChats";
import { arRecapHtml } from "../../../lib/tgArRecap";
import { releaseList, releaseWhich, HELP_RELEASE } from "../../../lib/tgRelease";
import { runLink } from "../../../lib/tgLinks";
import { setAlerts } from "../../../lib/tgAlerts";
import { captureTags, handleTagPick, loadTags, renderTagBlock } from "../../../lib/tgTags";
import { askFriday, helpHtml } from "../../../lib/tgAsk";
import { teamHtml, matchSegment, listSegments, segmentOfProfile } from "../../../lib/tgTeams";
import { handleReminder } from "../../../lib/tgRemind";
import { handleTicketCb, handleDone, DONE_RE } from "../../../lib/tgInbox";
import { sendPaged, handlePageCb } from "../../../lib/tgPages";
import { askAndLog, handleAskCb, missesHtml } from "../../../lib/tgAskLog";
import { cmdRemind, cmdWatch, cmdCover, cmdQuiet, handleWatchCb } from "../../../lib/tgPlanner";
import { addOwners } from "../../../lib/tgOwners";
import { linkedProfile, startLink, confirmLink, unlink, myTasksHtml, wantsMyTasks, rememberUsername, pushTagDms, setTagAlerts } from "../../../lib/tgLink";
import { captureIntake, handleDecision, loadIntakes, renderIntakeBlock, cardButtons, renderCard, intakeCardsOn } from "../../../lib/tgIntake";
import { vnDayStart, vnDateLabel, loadMessages, analyse, aiSummary, renderRecapTelegram } from "../../../lib/tgRecap";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const REPLY = "Mình vui lòng giúp bạn nhưng mình chưa hiểu tiếng Việt, mời bạn nói tiếng Nga. 🇷🇺\nГоворите по-русски, пожалуйста.";
const COOLDOWN_MS = 20 * 1000;   // at most one joke per chat per 20 s, so a pile-on can't make the bot spam the group
const last = new Map();
// Round 651 — ONE flow for everything personal (/mytasks, "tóm tắt việc", /ask, /team, tag DMs): link first, then it all arrives in the private chat
const LINK_ASK = "Mình chưa biết bạn là ai 🙂 Để nhận việc và tin tag của bạn ở đây, hãy liên kết tài khoản một lần:\n1) /link email-đăng-nhập-app\n2) Mở email lấy mã 6 số, rồi gõ /code 123456";
const LINK_ASK_GROUP = "Mình chưa biết bạn là ai 🙂 Bấm nút dưới để mở chat riêng với mình, bấm Start, rồi gõ /link email-đăng-nhập-app (mã 6 số sẽ gửi về email). Sau đó việc của bạn và tin ai tag bạn sẽ về hộp thư riêng này.";
const linkButton = (n) => ({ inline_keyboard: [[{ text: "🔗 Mở chat riêng để liên kết", url: `https://t.me/${n}?start=link` }]] });
let botName = null;

// Round 630 — /ask and /team (group or private chat of a linked person)
async function runAskTeam(cmd, arg, tgUserId, extra = false) {
  if (cmd === "ask") return await askFriday(supabaseAdmin, arg, extra);
  const info = arg ? await matchSegment(supabaseAdmin, arg) : { segs: await listSegments(supabaseAdmin), seg: null };
  if (arg) return info.seg ? await teamHtml(supabaseAdmin, info.seg) : `Không thấy team "${esc(arg)}". Các team: ${info.segs.map(esc).join(", ") || "—"}`;
  const lk = tgUserId ? await linkedProfile(tgUserId).catch(() => null) : null;
  const seg = lk ? await segmentOfProfile(supabaseAdmin, lk.profile_id) : null;
  if (!seg) return `Mình chưa biết team của bạn. Gõ /team <tên team> (${info.segs.map(esc).join(", ") || "—"}) hoặc nhắn riêng cho mình /link để mình nhớ bạn.`;
  return await teamHtml(supabaseAdmin, seg);
}

// Round 660 — /remind /watch /cover /quiet (need the account link)
const PLANNER = ["remind", "watch", "unwatch", "cover", "quiet"];
async function runPlanner(cmd, arg, m, lk) {
  if (cmd === "remind") return await cmdRemind(supabaseAdmin, lk, m.chat.id, arg);
  if (cmd === "watch") return await cmdWatch(supabaseAdmin, lk, arg);
  if (cmd === "unwatch") return await cmdWatch(supabaseAdmin, lk, "");
  if (cmd === "cover") return await cmdCover(supabaseAdmin, lk, arg);
  return { text: await cmdQuiet(supabaseAdmin, m.from.id, arg) };
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
  // Round 661 — long answers: first part + "▶ Xem tiếp" button, the rest one message at a time on tap (no burst, no spam flag)
  try { await sendPaged(supabaseAdmin, token, { chat_id: m.chat.id, thread_id: m.is_topic_message && m.message_thread_id ? m.message_thread_id : null }, text, { html, replyTo: m.message_id, markup }); } catch (e) { /* ignore */ }
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
      const res = !supabaseAdmin ? { answer: "Chưa cấu hình." } : data.startsWith("pg:") ? await handlePageCb(supabaseAdmin, token, cb) : /^(ak|fb|ck):/.test(data) ? await handleAskCb(supabaseAdmin, cb, linkedProfile) : /^t[px]:/.test(data) ? await handleTagPick(supabaseAdmin, cb, linkedProfile) : data.startsWith("rm:") ? await handleReminder(supabaseAdmin, cb, linkedProfile) : data.startsWith("tk:") ? await handleTicketCb(supabaseAdmin, cb, linkedProfile) : /^w[tx]:/.test(data) ? await handleWatchCb(supabaseAdmin, cb, linkedProfile) : await handleDecision(supabaseAdmin, cb, linkedProfile);
      await tg("answerCallbackQuery", { callback_query_id: cb.id, text: res.answer });
      if (res.clearButtons && cb.message) await tg("editMessageReplyMarkup", { chat_id: cb.message.chat.id, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
      if (res.markup && cb.message) await tg("editMessageReplyMarkup", { chat_id: cb.message.chat.id, message_id: cb.message.message_id, reply_markup: res.markup });
      if (res.send && cb.message) await sendPaged(supabaseAdmin, token, { chat_id: cb.message.chat.id, thread_id: cb.message.is_topic_message && cb.message.message_thread_id ? cb.message.message_thread_id : null }, res.send, { html: true });
      if (res.dm) await sendPaged(supabaseAdmin, token, { chat_id: res.dm.chat }, res.dm.text, { html: true });
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
  const isAr = isArChat(m.chat.id);   // Round 662: the AR group is read on its own (never in the basket)
  const isInternal = isInternalChat(m.chat.id);   // Round 624: any group in TELEGRAM_CHAT_IDS (+ the main one) is read into the same basket

  // Round 610 — remember the internal group's chat for the daily recap (text only, capped; commands to the bot are not stored)
  const cmdMatch = /^\/(\w+)(?:@(\w+))?(?:\s|$)/.exec(text);
  if (cmdMatch && cmdMatch[1].toLowerCase() === "mytask") cmdMatch[1] = "mytasks";   // Round 651: /mytask = /mytasks
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

  if (isInternal && supabaseAdmin && m.from?.id && m.from.username) rememberUsername(m.from.id, m.from.username).catch(() => {});
  if ((isInternal || isExtra) && supabaseAdmin && !isCommand && (text.includes("@") || m.reply_to_message || /ơi/i.test(text) || (m.entities || m.caption_entities || []).some((e) => e.type === "text_mention"))) { try { await pushTagDms(m, text, name); } catch (e) { /* never break the bot over tag DMs */ } }   // Round 651: tagged people get it in their private chat   // Round 650: so "who tagged me" works

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

  // Round 662 — AR group: new-song requests and updates are collected (no cards, nothing is posted); /recap there summarises them
  if (isAr && supabaseAdmin && text.trim() && !isCommand) {
    try {
      const hidden = (m.entities || m.caption_entities || []).filter((e) => e.type === "text_link" && e.url && !text.includes(e.url)).map((e) => e.url);
      await captureIntake(supabaseAdmin, m, hidden.length ? text + "\n" + hidden.join("\n") : text);
    } catch (e) { /* never break the bot over parsing */ }
  }

  // Round 630 — private chat: /ask and /team need a linked account (they show internal numbers)
  if (isPrivate && isCommand && supabaseAdmin && m.from?.id && ["ask", "team"].includes(cmdMatch[1].toLowerCase())) {
    const lk = await linkedProfile(m.from.id).catch(() => null);
    if (!lk) { await sendTelegramTo(m.chat.id, LINK_ASK); return NextResponse.json({ ok: true }); }
    try {
      const c0 = cmdMatch[1].toLowerCase(), a0 = text.slice(cmdMatch[0].length).trim();
      if (c0 === "ask") { const r = await askAndLog(supabaseAdmin, a0, m, false); await reply(token, m, r.text, true, r.markup); }   // Round 661: logged, 👍/👎 or suggestion buttons
      else await sendTelegramTo(m.chat.id, await runAskTeam(c0, a0, m.from.id));
    } catch (e) { await sendTelegramTo(m.chat.id, esc("Lỗi: " + e.message)); }
    return NextResponse.json({ ok: true });
  }

  // Round 663 — /release also works in the private chat (linked accounts only, like /ask and /team)
  if (isPrivate && isCommand && supabaseAdmin && m.from?.id && cmdMatch[1].toLowerCase() === "release") {
    try {
      const lk = await linkedProfile(m.from.id);
      if (!lk) await sendTelegramTo(m.chat.id, esc(LINK_ASK));
      else { const which = releaseWhich(text.slice(cmdMatch[0].length)); await reply(token, m, which ? await releaseList(supabaseAdmin, which) : HELP_RELEASE, true); }
    } catch (e) { console.error("[friday private /release]", e.message); await sendTelegramTo(m.chat.id, "Mình gặp lỗi khi lấy danh sách, bạn thử lại sau ít phút nhé."); }
    return NextResponse.json({ ok: true });
  }

  // Round 660 — private chat: "xong" (reply to a pushed ticket) closes the ticket; /remind /watch /cover /quiet
  if (isPrivate && supabaseAdmin && m.from?.id && !isCommand && DONE_RE.test(text)) {
    try {
      const lk = await linkedProfile(m.from.id);
      if (!lk) await sendTelegramTo(m.chat.id, esc(LINK_ASK));
      else { const r = await handleDone(supabaseAdmin, m, lk); await sendTelegramTo(m.chat.id, r.text, r.markup); }
    } catch (e) { await sendTelegramTo(m.chat.id, esc("Lỗi: " + e.message)); }
    return NextResponse.json({ ok: true });
  }
  if (isPrivate && isCommand && supabaseAdmin && m.from?.id && PLANNER.includes(cmdMatch[1].toLowerCase())) {
    try {
      const lk = await linkedProfile(m.from.id);
      if (!lk) await sendTelegramTo(m.chat.id, esc(LINK_ASK));
      else { const r = await runPlanner(cmdMatch[1].toLowerCase(), text.slice(cmdMatch[0].length).trim(), m, lk); await sendTelegramTo(m.chat.id, r.text, r.markup); }
    } catch (e) { await sendTelegramTo(m.chat.id, esc("Lỗi: " + e.message)); }
    return NextResponse.json({ ok: true });
  }

  // Round 611 — private chat: /link, /code, /unlink, /mytasks (the account link needs a code emailed to the app address)
  if (isPrivate && isCommand && supabaseAdmin && m.from?.id) {
    const cmd = cmdMatch[1].toLowerCase(), arg = text.slice(cmdMatch[0].length).trim();
    let out = null;
    try {
      if (cmd === "start" || cmd === "help") out = "Xin chào! Để nhận việc của bạn ở đây:\n1) /link email-đăng-nhập-app\n2) Mở email lấy mã 6 số, rồi gõ /code 123456\nSau đó gõ /mytasks bất cứ lúc nào. Gõ /release tuần này (hoặc /release sắp tới), /ask <câu hỏi> hoặc /team để hỏi nhanh. Ai tag bạn trong nhóm, mình nhắn riêng cho bạn (/tagalert off để tắt). Gõ /alert để mỗi sáng mình nhắn riêng việc của bạn (/alert off để tắt). Ticket mới giao cho bạn mình nhắn riêng, trả lời \"xong\" vào tin đó để đóng ticket. /remind mai 10h việc cần nhớ · /watch tên bài · /cover tên đến 20/12 · /quiet 22-7. /unlink để huỷ liên kết.";
      else if (cmd === "link") out = await startLink(m.from.id, m.chat.id, arg);
      else if (cmd === "code") out = await confirmLink(m.from.id, arg);
      else if (cmd === "unlink") out = await unlink(m.from.id);
      else if (cmd === "alert" || cmd === "alerts") out = await setAlerts(m.from.id, arg);
      else if (cmd === "tagalert") out = await setTagAlerts(m.from.id, arg);
      else if (cmd === "mytasks") { const lk = await linkedProfile(m.from.id); out = lk ? await myTasksHtml(lk.profile_id) : esc(LINK_ASK); }
      else if (cmd === "misses") { const lk = await linkedProfile(m.from.id); out = lk ? await missesHtml(supabaseAdmin, lk.profile_id) : esc(LINK_ASK); }   // Round 661
    } catch (e) { out = "Lỗi: " + e.message; }
    if (out) { await sendTelegramTo(m.chat.id, cmd === "mytasks" || cmd === "misses" ? out : esc(out)); return NextResponse.json({ ok: true }); }
  }

  // Round 610 — commands, internal group only (they show internal numbers)
  if (isCommand && (isInternal || isExtra) && supabaseAdmin) {
    const cmd = cmdMatch[1].toLowerCase();
    if (cmd === "help") { await reply(token, m, helpHtml(isExtra), true); return NextResponse.json({ ok: true }); }   // Round 643c — /help in a group
    if (isAr && cmd === "recap") {   // Round 662 — AR group: recap of THIS group only
      try { await reply(token, m, await arRecapHtml(supabaseAdmin, /hôm qua|hom qua|yesterday|qua/i.test(text.slice(cmdMatch[0].length))), true); } catch (e) { console.error("[friday AR /recap]", e.message); await reply(token, m, "Mình gặp lỗi khi tóm tắt chat AR, bạn thử lại sau ít phút nhé.", false); }
      return NextResponse.json({ ok: true });
    }
    if (isExtra && !["release", "status", "ask", "link"].includes(cmd)) {   // Round 631b: only these three answer in an extra chat
      if (["missing", "recap", "mytasks", "team"].includes(cmd)) await reply(token, m, "Ở nhóm này mình chỉ trả lời /release, /status, /ask và /link thôi nhé.", false);
      return NextResponse.json({ ok: true });
    }
    if (["status", "missing", "recap", "mytasks", "ask", "team", "release", "link"].includes(cmd)) {   // instant 👍 so people know the command arrived (the answer can take a few seconds)
      try { await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: m.chat.id, message_id: m.message_id, reaction: [{ type: "emoji", emoji: "❤" }] }) }); } catch (e) { /* ignore */ }
    }
    if (PLANNER.includes(cmd) && !isExtra) {   // Round 660 — same commands typed in the group; the answer is short and stays in the group
      try {
        const lk = m.from?.id ? await linkedProfile(m.from.id) : null;
        if (!lk) await reply(token, m, LINK_ASK_GROUP, false, linkButton(name));
        else { const r = await runPlanner(cmd, text.slice(cmdMatch[0].length).trim(), m, lk); await reply(token, m, r.text, true, r.markup); }
      } catch (e) { await reply(token, m, "Lỗi: " + e.message, false); }
      return NextResponse.json({ ok: true });
    }
    if (cmd === "mytasks") {   // list goes to the person's private chat, never into the group
      try {
        const lk = m.from?.id ? await linkedProfile(m.from.id) : null;
        if (!lk) await reply(token, m, LINK_ASK_GROUP, false, linkButton(name));
        else {
          const res = await sendTelegramTo(lk.dm_chat_id, await myTasksHtml(lk.profile_id));
          await reply(token, m, res.ok ? "📬 Đã gửi danh sách việc vào tin nhắn riêng của bạn." : res.blocked ? `Mình chưa nhắn riêng được — bạn mở chat với @${name} và bấm Start trước nhé.` : "Không gửi được: " + res.error, false);
        }
      } catch (e) { await reply(token, m, "Lỗi: " + e.message, false); }
      return NextResponse.json({ ok: true });
    }
    if (cmd === "link") {   // Round 644 — answer under the replied message with #tags / song names turned into links
      try { const r = await runLink(supabaseAdmin, m, text.slice(cmdMatch[0].length).trim()); await reply(token, r.target || m, r.html, true); } catch (e) { console.error("[friday /link]", e.message); await reply(token, m, "Mình gặp lỗi khi gắn link, bạn thử lại sau ít phút nhé.", false); }
      return NextResponse.json({ ok: true });
    }
    if (cmd === "release") {   // Round 631b — releases not out yet: this week / upcoming
      const which = releaseWhich(text.slice(cmdMatch[0].length));
      try { await reply(token, m, which ? await releaseList(supabaseAdmin, which) : HELP_RELEASE, true); } catch (e) { console.error("[friday /release]", e.message); await reply(token, m, "Mình gặp lỗi khi lấy danh sách, bạn thử lại sau ít phút nhé.", false); }
      return NextResponse.json({ ok: true });
    }
    if (cmd === "misses" && !isExtra) {   // Round 661 — admin / dev: what Friday could not answer; the list goes to the private chat
      try {
        const lk = m.from?.id ? await linkedProfile(m.from.id) : null;
        if (!lk) await reply(token, m, LINK_ASK_GROUP, false, linkButton(name));
        else { const res = await sendTelegramTo(lk.dm_chat_id, await missesHtml(supabaseAdmin, lk.profile_id)); await reply(token, m, res.ok ? "📬 Đã gửi vào tin nhắn riêng của bạn." : "Mình chưa nhắn riêng được — bạn mở chat với mình và bấm Start trước nhé.", false); }
      } catch (e) { await reply(token, m, "Lỗi: " + e.message, false); }
      return NextResponse.json({ ok: true });
    }
    if (cmd === "ask" || cmd === "team") {   // Round 630
      try {
        if (cmd === "ask") { const r = await askAndLog(supabaseAdmin, text.slice(cmdMatch[0].length).trim(), m, isExtra); await reply(token, m, r.text, true, r.markup); }   // Round 661
        else await reply(token, m, await runAskTeam(cmd, text.slice(cmdMatch[0].length).trim(), m.from?.id, isExtra), true);
      } catch (e) { console.error("[friday /" + cmd + "]", e.message); await reply(token, m, "Mình gặp lỗi khi lấy dữ liệu, bạn thử lại sau ít phút nhé.", false); }
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
      } catch (e) { console.error("[friday /recap]", e.message); await reply(token, m, "Mình gặp lỗi khi tóm tắt chat, bạn thử lại sau ít phút nhé.", false); }
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
      } catch (e) { console.error("[friday /" + cmd + "]", e.message); await reply(token, m, "Mình gặp lỗi khi lấy số liệu, bạn thử lại sau ít phút nhé.", false); }
      return NextResponse.json({ ok: true });
    }
  }

  const mentioned = !!name && text.toLowerCase().includes("@" + name);
  const replyToBot = !!name && String(m.reply_to_message?.from?.username || "").toLowerCase() === name;
  if (!(isPrivate || mentioned || replyToBot)) return NextResponse.json({ ok: true });   // (replyToBot still lets "tóm tắt việc của tôi" through below)

  // Round 650 — "tóm tắt việc của tôi" / "ai tag mình" in plain words (private chat, or @Friday / reply in the internal group) = /mytasks
  if (supabaseAdmin && m.from?.id && (isPrivate || isInternal) && wantsMyTasks(text)) {
    try {
      const lk = await linkedProfile(m.from.id);
      if (!lk) { await reply(token, m, LINK_ASK_GROUP, false, linkButton(name)); return NextResponse.json({ ok: true }); }
      const out = await myTasksHtml(lk.profile_id);
      if (isPrivate) await reply(token, m, out, true);
      else {
        const res = await sendTelegramTo(lk.dm_chat_id, out);
        await reply(token, m, res.ok ? "📬 Đã gửi tóm tắt việc vào tin nhắn riêng của bạn." : res.blocked ? `Mình chưa nhắn riêng được — bạn mở chat với @${name} và bấm Start trước nhé.` : "Không gửi được: " + res.error, false);
      }
    } catch (e) { console.error("[friday my-tasks]", e.message); await reply(token, m, "Mình gặp lỗi khi lấy việc của bạn, thử lại sau ít phút nhé.", false); }
    return NextResponse.json({ ok: true });
  }

  if (!isPrivate && !mentioned) return NextResponse.json({ ok: true });   // Round 663: people REPLYING to one of her messages (e.g. asking a colleague about her answer) get no joke reply — only a private chat or an explicit @Friday does
  const now = Date.now();
  if (now - (last.get(m.chat.id) || 0) < COOLDOWN_MS) return NextResponse.json({ ok: true });
  last.set(m.chat.id, now);
  await reply(token, m, REPLY, false);
  return NextResponse.json({ ok: true });
}
