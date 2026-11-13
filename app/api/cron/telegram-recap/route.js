// Round 610 — scheduled chat recap. Called by Supabase pg_cron:
//   GET /api/cron/telegram-recap?slot=group   18:00 VN Mon-Fri → posts today's recap into the internal group
//   GET /api/cron/telegram-recap?slot=email   08:00 VN Tue-Sat → emails yesterday's recap to the digest recipients
// Authorization: Bearer <CRON_SECRET>
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { sendTelegram, telegramConfigured } from "../../../../lib/telegram";
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
    const msgs = await loadMessages(supabaseAdmin, from, to, chatId);
    const a = analyse(msgs);
    const ai = await aiSummary(msgs);
    const intakes = await loadIntakes(supabaseAdmin, from.toISOString(), to.toISOString()).catch(() => []);
    if (slot === "group") {
      if (!telegramConfigured()) return NextResponse.json({ skipped: "Telegram not configured." });
      const res = await sendTelegram(renderRecapTelegram(a, label, ai) + (intakes.length ? "\n\n" + renderIntakeBlock(intakes) : ""));
      return NextResponse.json({ slot, total: a.total, ...res }, { status: res.ok ? 200 : 502 });
    }
    if (!a.total) return NextResponse.json({ slot, skipped: "No messages yesterday." });
    const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return NextResponse.json({ slot, sent: false, reason: "SMTP not configured." });
    const { data: settings } = await supabaseAdmin.from("notification_settings").select("digest_recipients").eq("id", 1).maybeSingle();
    let to_ = settings?.digest_recipients || [];
    if (!to_.length) {
      const { data: admins } = await supabaseAdmin.from("profiles").select("email").in("role", ["admin", "dev"]);
      to_ = (admins || []).map((p) => p.email).filter(Boolean);
    }
    if (!to_.length) return NextResponse.json({ slot, sent: false, reason: "No recipients." });
    const tr = nodemailer.createTransport({ host: SMTP_HOST, port: parseInt(process.env.SMTP_PORT || "587", 10), secure: process.env.SMTP_SECURE === "true", auth: { user: SMTP_USER, pass: SMTP_PASS } });
    await tr.sendMail({ from: process.env.DIGEST_FROM_EMAIL || SMTP_USER, to: to_, subject: `VIEENT OPS — Tóm tắt chat nhóm ${label}`, html: renderRecapHtml(a, label, ai).replace(/<\/div>\s*$/, renderIntakeHtml(intakes) + "</div>") });
    return NextResponse.json({ slot, total: a.total, sent: true, recipients: to_.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
