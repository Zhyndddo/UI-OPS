// Round 632 — "Email this report" (Report page). Emails a performance-report share link to the subscribed
// recipients (Config → notification_settings.digest_recipients). Signed-in users only; the link must be one of our own
// /performance-report/<token> URLs so this can't be used to relay arbitrary links.
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin, getCallerProfile } from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  const caller = await getCallerProfile(request);
  if (!caller) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  let u;
  try { u = new URL(body.url); } catch (e) { return NextResponse.json({ error: "Bad link." }, { status: 400 }); }
  const host = request.headers.get("host");
  if (u.host !== host || !u.pathname.startsWith("/performance-report/")) return NextResponse.json({ error: "Only report links from this site can be emailed." }, { status: 400 });
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return NextResponse.json({ error: "SMTP not configured." }, { status: 500 });
  const { data: settings } = await supabaseAdmin.from("notification_settings").select("digest_recipients").eq("id", 1).maybeSingle();
  const to = (settings?.digest_recipients || []).filter(Boolean);
  if (!to.length) return NextResponse.json({ error: "No subscribed recipients (Config → Notifications → Recipients)." }, { status: 400 });
  const title = String(body.title || "Performance report").slice(0, 200);
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p><b>${esc(caller.name || "A teammate")}</b> shared a report with you:</p><p style="font-size:16px"><b>${esc(title)}</b></p><p><a href="${esc(u.toString())}" style="background:#ff6b1a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open report</a></p><p style="color:#888;font-size:12px">The link works for 72 hours from creation.</p></div>`;
  try {
    const tr = nodemailer.createTransport({ host: SMTP_HOST, port: parseInt(process.env.SMTP_PORT || "587", 10), secure: process.env.SMTP_SECURE === "true", auth: { user: SMTP_USER, pass: SMTP_PASS } });
    await tr.sendMail({ from: process.env.DIGEST_FROM_EMAIL || SMTP_USER, to, subject: `VIEENT OPS — Report: ${title}`, html });
    return NextResponse.json({ sent: true, recipients: to.length });
  } catch (err) {
    return NextResponse.json({ error: `SMTP error: ${err.message}` }, { status: 502 });
  }
}
