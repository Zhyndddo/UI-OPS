// Round 574 — PUBLIC event registration: name + email (+ organisation) + event code -> a QR code is made, saved in the Google Sheet
// and emailed to the guest (all done by the Apps Script, drive-webhook-v6.gs). Nothing is written to the database.
// Protected by: event code (env EVENT_REGISTER_CODE, fails closed), per-visitor rate limits, a hidden honeypot field, email format check.
import { NextResponse } from "next/server";
import { randomBytes, timingSafeEqual } from "crypto";
import { EVENT, QR_PREFIX } from "../../../lib/eventConfig";
import { qrPng } from "../../../lib/qrPng";
import { countHits, addHit, clientIp } from "../../../lib/eventRateLimit";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const clean = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

export async function POST(request) {
  const expected = clean(process.env.EVENT_REGISTER_CODE);
  if (!expected) return NextResponse.json({ error: "Đăng ký chưa được mở." }, { status: 503, headers: noStore });
  const ip = clientIp(request);
  if (countHits("reg-bad:" + ip) >= 8) return NextResponse.json({ error: "Nhập sai mã quá nhiều lần. Vui lòng thử lại sau 10 phút." }, { status: 429, headers: noStore });
  if (countHits("reg:" + ip) >= 10 || countHits("reg:all") >= 400) return NextResponse.json({ error: "Có quá nhiều lượt đăng ký lúc này. Vui lòng thử lại sau ít phút." }, { status: 429, headers: noStore });

  let body = {};
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400, headers: noStore }); }
  if (body.website) return NextResponse.json({ ok: true, fake: true }, { headers: noStore });   // honeypot: bots fill this hidden field

  const code = clean(body.code);
  if (!code || !same(code, expected)) { addHit("reg-bad:" + ip); return NextResponse.json({ error: "Mã sự kiện không đúng." }, { status: 401, headers: noStore }); }

  const name = String(body.name || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 160);
  const org = String(body.org || "").replace(/\s+/g, " ").trim().slice(0, 160);
  if (name.length < 2) return NextResponse.json({ error: "Vui lòng nhập họ và tên." }, { status: 400, headers: noStore });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Email chưa đúng định dạng." }, { status: 400, headers: noStore });

  const url = clean(process.env.DRIVE_WEBHOOK_URL || process.env.HALLOWEEN_DRIVE_WEBHOOK_URL);
  const secret = clean(process.env.DRIVE_SECRET || process.env.HALLOWEEN_DRIVE_SECRET);
  if (!url || !secret) return NextResponse.json({ error: "Hệ thống chưa được cấu hình." }, { status: 500, headers: noStore });

  const token = QR_PREFIX + randomBytes(16).toString("base64url");   // 22 chars after the prefix
  const png = qrPng(token, 8);
  addHit("reg:" + ip); addHit("reg:all");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const call = async (payload) => {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow", signal: ctrl.signal, body: JSON.stringify({ secret, ...payload }) });
      return res.json().catch(() => null);
    };
    // 1) save the guest (the same email again gives back the ORIGINAL token)
    const j = await call({ action: "evRegister", name, email, org, token });
    if (!j?.ok || !j.token) return NextResponse.json({ error: "Không thể đăng ký lúc này. Vui lòng thử lại." }, { status: 502, headers: noStore });
    const finalPng = j.token === token ? png : qrPng(j.token, 8);
    // 2) email that token's QR (the script looks the address up in the sheet itself)
    const m = await call({ action: "evMail", token: j.token, qrBase64: finalPng.toString("base64"), event: EVENT });
    return NextResponse.json({ ok: true, again: !!j.again, mailed: !!m?.ok, mailError: m?.ok ? "" : (m?.error === "mail quota" ? "quota" : m?.error === "resend limit" ? "limit" : "failed"), qr: "data:image/png;base64," + finalPng.toString("base64") }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: "Không thể đăng ký lúc này. Vui lòng thử lại." }, { status: 502, headers: noStore });
  } finally { clearTimeout(timer); }
}
