// Round 610 — scheduled chat recap. Called by Supabase pg_cron:
//   GET /api/cron/telegram-recap?slot=group   18:00 VN Mon-Fri → posts today's recap into the internal group
//   GET /api/cron/telegram-recap?slot=email   08:00 VN Tue-Sat → emails yesterday's recap to the digest recipients
// Authorization: Bearer <CRON_SECRET>
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { sendTelegram, telegramConfigured } from "../../../../lib/telegram";
import { internalChatIds } from "../../../../lib/tgChats";
import { dmCopies, emailRecipients } from "../../../../lib/recapCopies";
import { addOwners } from "../../../../lib/tgOwners";
import { loadTags, renderTagBlock, renderTagHtml } from "../../../../lib/tgTags";
import { loadIntakes, renderIntakeBlock, renderIntakeHtml } from "../../../../lib/tgIntake";
import { vnDayStart, vnDateLabel, loadMessages, analyse, aiSummary, renderRecapTelegram, renderRecapHtml } from "../../../../lib/tgRecap";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (request.headers.get("authorization") || "") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  const chatId = process.env.TELEGRAM_INTERNAL_CHAT_ID;
  const slot = new URL(request.url).searchParams.get("slot");
  if (!chatId || !["group", "email"].includes(slot)) return NextResponse.json({ error: "slot must be group or email (and TELEGRAM_INTERNAL_CHAT_ID set)." }, { status: 400 });
  try {
    const now = new Date();
    const from = slot === "group" ? vnDayStart(0, now) : vnDayStart(1, now);
    const to = slot === "group" ? now : vnDayStart(0, now);
    const label = vnDateLabel(from);
    const msgs = await loadMessages(supabaseAdmin, from, to, internalChatIds());
    const a = analyse(msgs);
    await addOwners(supabaseAdmin, a.open.slice(-6)).catch(() => {});   // Round 630: who should answer each open question
    const ai = await aiSummary(msgs);
    const intakes = await loadIntakes(supabaseAdmin, from.toISOString(), to.toISOString()).catch(() => []);
    const tags = await loadTags(supabaseAdmin, from.toISOString(), to.toISOString()).catch(() => []);
    if (slot === "group") {
      if (!telegramConfigured()) return NextResponse.json({ skipped: "Telegram not configured." });
      const text = renderRecapTelegram(a, label, ai) + (intakes.length ? "\n\n" + renderIntakeBlock(intakes) : "") + (tags.length ? "\n\n" + renderTagBlock(tags) : "");
      const res = await sendTelegram(text);
      const copies = await dmCopies(supabaseAdmin, text);   // Round 632 — private copy for the people picked in Config
      return NextResponse.json({ slot, total: a.total, ...res, copies }, { status: res.ok ? 200 : 502 });
    }
    if (!a.total) return NextResponse.json({ slot, skipped: "No messages yesterday." });
    const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return NextResponse.json({ slot, sent: false, reason: "SMTP not configured." });
    const { data: settings } = await supabaseAdmin.from("notification_settings").select("digest_recipients").eq("id", 1).maybeSingle();
    const to_ = await emailRecipients(supabaseAdmin, settings?.digest_recipients);   // Round 632 — digest recipients + the OPS team
    if (!to_.length) return NextResponse.json({ slot, sent: false, reason: "No recipients." });
    const tr = nodemailer.createTransport({ host: SMTP_HOST, port: parseInt(process.env.SMTP_PORT || "587", 10), secure: process.env.SMTP_SECURE === "true", auth: { user: SMTP_USER, pass: SMTP_PASS } });
    await tr.sendMail({ from: process.env.DIGEST_FROM_EMAIL || SMTP_USER, to: to_, subject: `VIEENT OPS — Tóm tắt chat nhóm ${label}`, html: renderRecapHtml(a, label, ai).replace(/<\/div>\s*$/, renderIntakeHtml(intakes) + renderTagHtml(tags) + "</div>") });
    const copies = await dmCopies(supabaseAdmin, renderRecapTelegram(a, label, ai));   // Round 632 — the 08:00 recap also goes to the DM-copy people
    return NextResponse.json({ slot, total: a.total, sent: true, recipients: to_.length, copies });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
