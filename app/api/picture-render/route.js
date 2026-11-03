// Round 569 — Picture render: save ONE rendered picture to Google Drive (same Apps Script webhook as the Halloween pictures).
// POST raw image bytes (png/jpeg, <= 4.4 MB: Vercel's request limit) with headers: x-filename (URL-encoded), x-folder (template folder).
// Admin / dev only. Nothing is written to the database: this route only reads the caller's profile to check the role.
import { NextResponse } from "next/server";
import { getCallerProfile } from "../../../lib/supabaseAdmin";
import { PICTURE_TEMPLATES } from "../../../lib/pictureRenderConfig";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const MAX_BYTES = 4.4 * 1024 * 1024;
const clean = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();

export async function POST(request) {
  const caller = await getCallerProfile(request);
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: noStore });
  if (!["admin", "dev"].includes(caller.role)) return NextResponse.json({ error: "Admins and dev only." }, { status: 403, headers: noStore });

  const folder = decodeURIComponent(request.headers.get("x-folder") || "");
  if (!PICTURE_TEMPLATES.some((t) => t.driveFolder === folder)) return NextResponse.json({ error: "Unknown template." }, { status: 400, headers: noStore });
  const mime = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "application/pdf") return NextResponse.json({ error: "PNG, JPEG or PDF only." }, { status: 400, headers: noStore });
  let filename = decodeURIComponent(request.headers.get("x-filename") || "picture.png");
  filename = filename.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "picture.png";

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) return NextResponse.json({ error: `Picture too big for Drive upload (${(buf.length / 1048576).toFixed(1)} MB, max 4.4 MB).` }, { status: 413, headers: noStore });

  const logName = (() => { try { return decodeURIComponent(request.headers.get("x-name") || "").replace(/\s+/g, " ").trim().slice(0, 120); } catch (e) { return ""; } })();
  const url = clean(process.env.DRIVE_WEBHOOK_URL || process.env.HALLOWEEN_DRIVE_WEBHOOK_URL);
  const secret = clean(process.env.DRIVE_SECRET || process.env.HALLOWEEN_DRIVE_SECRET);
  if (!url || !secret) return NextResponse.json({ error: "Drive webhook not configured" }, { status: 500, headers: noStore });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow", signal: ctrl.signal,
      body: JSON.stringify({ secret, filename, mimeType: mime, dataBase64: buf.toString("base64"), subfolder: folder, logName, logSource: "staff: " + String(caller.email || caller.name || caller.role || "").slice(0, 80) }),
    });
    const j = await res.json().catch(() => null);
    if (!j?.ok) return NextResponse.json({ error: j?.error || `Drive answered HTTP ${res.status}` }, { status: 502, headers: noStore });
    return NextResponse.json({ ok: true, url: j.url || null }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502, headers: noStore });
  } finally { clearTimeout(timer); }
}
