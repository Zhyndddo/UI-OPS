// Round 665 — "✉ Gửi mail" on a Report Conflict ticket: emails the report (the team's fixed template) to REPORT_CONFLICT_TO
// (default suong.tuyet@vieent.com) through the app's SMTP, then stamps the ticket (data.__mailSentAt / __mailSentBy / __mailTo).
// A ticket still on "Chưa bắt đầu" moves to "Đã submit chờ duyệt". Results are then tracked on the ticket itself (Email / Kết quả column) — no external sheet.
import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../../lib/supabaseAdmin";
import { rightsMailer } from "../../../../lib/mailer";

export const dynamic = "force-dynamic";
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  const caller = await getCallerProfile(request);
  if (!caller) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const { data: tab } = await supabaseAdmin.from("ticket_tabs").select("id").eq("key", "report_conflict").maybeSingle();
  const { data: t } = await supabaseAdmin.from("tickets").select("*").eq("id", body.ticketId).maybeSingle();
  if (!t || !tab || t.tab_id !== tab.id) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  const d = t.data || {};
  if (!d.reportedURL) return NextResponse.json({ error: "Reported Link is empty — fill it first." }, { status: 400 });
  const m = rightsMailer();
  if (!m) return NextResponse.json({ error: "SMTP not configured." }, { status: 500 });
  const to = process.env.REPORT_CONFLICT_TO || "suong.tuyet@vieent.com";
  const rows = [
    ["Nền tảng", d.conflictType], ["Bài hát / Nghệ sĩ", [d.assetTitle, d.artist].filter(Boolean).join(" / ")],
    ["Official UPC", d.officialUPC], ["Official Sound Link", d.officialURL], ["MV YouTube Link", d.linkMVYoutube],
    ["Reported Sound Link", d.reportedURL], ["Ghi chú", d.note],
  ];
  const textBody = "Case:\n" + rows.map(([k, v]) => `${k}: ${v || ""}`).join("\n") + `\n---\n\nNhờ chị hỗ trợ xử lý giúp em. Em sẽ theo dõi và cập nhật kết quả trên hệ thống nội bộ.\n\n${caller.name || ""}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p><b>Case:</b></p><p>${rows.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join("<br>")}</p><p>---</p><p>Nhờ chị hỗ trợ xử lý giúp em. Em sẽ theo dõi và cập nhật kết quả trên hệ thống nội bộ.</p><p>${esc(caller.name || "")}</p></div>`;
  try {
    await m.transport.sendMail({ from: m.from, to, cc: caller.email || undefined, replyTo: caller.email || m.replyTo, subject: `[VIEENT] Report conflict — ${d.conflictType || "?"} — ${[d.assetTitle, d.artist].filter(Boolean).join(" / ")}`.slice(0, 200), text: textBody, html });
  } catch (err) {
    return NextResponse.json({ error: `SMTP error: ${err.message}` }, { status: 502 });
  }
  const now = new Date().toISOString();
  const data = { ...d, __mailSentAt: now, __mailSentBy: caller.name || "?", __mailTo: to };
  const patch = { data };
  if (t.status === "Chưa bắt đầu") { patch.status = "Đã submit chờ duyệt"; patch.status_log = { ...(t.status_log || {}), "Đã submit chờ duyệt": now }; }
  await supabaseAdmin.from("tickets").update(patch).eq("id", t.id);
  await supabaseAdmin.from("audit_log").insert({ actor: caller.id, action: "email", entity: "ticket", entity_id: t.id, field: "report_conflict_mail", before_val: null, after_val: to }).then(() => {}, () => {});
  return NextResponse.json({ sent: true, to, patch });
}
