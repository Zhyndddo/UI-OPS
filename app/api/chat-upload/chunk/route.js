// Round 568 — FALLBACK for the Drive upload proof of concept: the browser sends one chunk (<= 4 MB, under Vercel's 4.5 MB
// request limit) here and we forward it to Google's upload address. Only used when the browser cannot upload straight to Google.
import { NextResponse } from "next/server";
import { getCallerProfile } from "../../../../lib/supabaseAdmin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const OWNER_EMAIL = "an.thien@vieent.vn";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request) {
  const caller = await getCallerProfile(request);
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: noStore });
  if ((caller.email || "").trim().toLowerCase() !== OWNER_EMAIL) return NextResponse.json({ error: "Not available yet." }, { status: 403, headers: noStore });

  // only ever forward to Google's own upload endpoint (no open proxy)
  let target;
  try { target = new URL(request.headers.get("x-upload-url") || ""); } catch { target = null; }
  if (!target || target.protocol !== "https:" || target.hostname !== "www.googleapis.com" || !target.pathname.startsWith("/upload/drive/v3/files")) {
    return NextResponse.json({ error: "Bad upload address." }, { status: 400, headers: noStore });
  }
  const range = request.headers.get("content-range") || "";
  if (!/^bytes \d+-\d+\/\d+$/.test(range)) return NextResponse.json({ error: "Bad range." }, { status: 400, headers: noStore });

  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > 4.4 * 1024 * 1024) return NextResponse.json({ error: "Bad chunk size." }, { status: 400, headers: noStore });

  try {
    const res = await fetch(target.toString(), { method: "PUT", headers: { "Content-Range": range, "Content-Length": String(buf.byteLength) }, body: buf, redirect: "manual" });
    let file = null;
    if (res.status === 200 || res.status === 201) { try { file = await res.json(); } catch { /* ignore */ } }
    return NextResponse.json({ status: res.status, range: res.headers.get("range"), file }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502, headers: noStore });
  }
}
