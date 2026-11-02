// Round 573 — Picture render: read the name log (the Google Sheet kept by the Apps Script) so the tab can show a count and a CSV.
// Admin / dev only. Nothing is read from or written to the database except the caller's own role check.
import { NextResponse } from "next/server";
import { getCallerProfile } from "../../../lib/supabaseAdmin";

export const maxDuration = 30;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const clean = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();

export async function GET(request) {
  const caller = await getCallerProfile(request);
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: noStore });
  if (!["admin", "dev"].includes(caller.role)) return NextResponse.json({ error: "Admins and dev only." }, { status: 403, headers: noStore });
  const url = clean(process.env.DRIVE_WEBHOOK_URL || process.env.HALLOWEEN_DRIVE_WEBHOOK_URL);
  const secret = clean(process.env.DRIVE_SECRET || process.env.HALLOWEEN_DRIVE_SECRET);
  if (!url || !secret) return NextResponse.json({ error: "Drive webhook not configured" }, { status: 500, headers: noStore });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow", signal: ctrl.signal, body: JSON.stringify({ secret, action: "logList" }) });
    const j = await res.json().catch(() => null);
    if (!j?.ok) return NextResponse.json({ error: j?.error || `Drive answered HTTP ${res.status} (is the Apps Script on v5?)` }, { status: 502, headers: noStore });
    return NextResponse.json({ ok: true, rows: Array.isArray(j.rows) ? j.rows : [], sheetUrl: j.sheetUrl || null }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502, headers: noStore });
  } finally { clearTimeout(timer); }
}
