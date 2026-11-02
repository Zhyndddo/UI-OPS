// Round 574 — PUBLIC door check-in: a scanned (or typed) QR token + the door code -> the Apps Script marks the guest as arrived once.
// Door code from env EVENT_DOOR_CODE (fails closed). Nothing is written to the database.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { TOKEN_RE } from "../../../lib/eventConfig";
import { countHits, addHit, clientIp } from "../../../lib/eventRateLimit";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const clean = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export async function POST(request) {
  const expected = clean(process.env.EVENT_DOOR_CODE);
  if (!expected) return NextResponse.json({ error: "Check-in chưa được mở." }, { status: 503, headers: noStore });
  const ip = clientIp(request);
  if (countHits("door-bad:" + ip) >= 8) return NextResponse.json({ error: "Nhập sai mã quá nhiều lần. Thử lại sau 10 phút." }, { status: 429, headers: noStore });
  let given = "";
  try { given = clean(decodeURIComponent(request.headers.get("x-door-code") || "")); } catch (e) { given = ""; }
  if (!given || !same(given, expected)) { addHit("door-bad:" + ip); return NextResponse.json({ error: "Mã cửa không đúng." }, { status: 401, headers: noStore });  }

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const mode = body.mode === "check" ? "check" : body.mode === "stats" ? "stats" : "scan";
  if (mode === "check") return NextResponse.json({ ok: true }, { headers: noStore });   // just verifies the door code
  const token = String(body.token || "").trim();
  if (mode === "scan" && !TOKEN_RE.test(token)) return NextResponse.json({ ok: true, status: "invalid" }, { headers: noStore });
  if (mode === "scan" && countHits("door:" + ip) >= 300) return NextResponse.json({ error: "Quá nhiều lượt quét, thử lại sau ít phút." }, { status: 429, headers: noStore });

  const url = clean(process.env.DRIVE_WEBHOOK_URL || process.env.HALLOWEEN_DRIVE_WEBHOOK_URL);
  const secret = clean(process.env.DRIVE_SECRET || process.env.HALLOWEEN_DRIVE_SECRET);
  if (!url || !secret) return NextResponse.json({ error: "Hệ thống chưa được cấu hình." }, { status: 500, headers: noStore });
  if (mode === "scan") addHit("door:" + ip);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow", signal: ctrl.signal,
      body: JSON.stringify({ secret, action: mode === "stats" ? "evStats" : "evCheckin", token }),
    });
    const j = await res.json().catch(() => null);
    if (!j?.ok) return NextResponse.json({ error: "Không đọc được danh sách lúc này. Thử lại." }, { status: 502, headers: noStore });
    return NextResponse.json(j, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: "Không đọc được danh sách lúc này. Thử lại." }, { status: 502, headers: noStore });
  } finally { clearTimeout(timer); }
}
