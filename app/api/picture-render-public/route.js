// Round 570 — PUBLIC Picture render: save ONE rendered picture to Google Drive for visitors of /picture (no login).
// Protected by: shared access code (env PICTURE_PUBLIC_CODE, fails closed when missing), per-visitor + global rate limits,
// PNG/JPEG only, <= 4.4 MB, template folder must be a known one. Nothing is written to the database.
// Limits are kept in server memory (no database, as requested): they are per server instance, so they are a brake, not a vault.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { PICTURE_TEMPLATES } from "../../../lib/pictureRenderConfig";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const MAX_BYTES = 4.4 * 1024 * 1024;
const clean = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT_UPLOADS_PER_IP = 40;     // per 10 minutes
const LIMIT_BAD_CODES_PER_IP = 8;    // wrong codes per 10 minutes, then locked for the rest of the window
const LIMIT_UPLOADS_GLOBAL = 300;    // per 10 minutes, whole instance
const hits = new Map();              // key -> number[] timestamps
function count(key) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  hits.set(key, arr);
  return arr.length;
}
function add(key) { count(key); hits.get(key).push(Date.now()); }
function sweep() { if (hits.size > 5000) { const now = Date.now(); for (const [k, a] of hits) if (!a.length || now - a[a.length - 1] > WINDOW_MS) hits.delete(k); } }

function sameCode(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export async function POST(request) {
  sweep();
  const expected = clean(process.env.PICTURE_PUBLIC_CODE);
  if (!expected) return NextResponse.json({ error: "This page is not switched on yet." }, { status: 503, headers: noStore });

  const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (count("bad:" + ip) >= LIMIT_BAD_CODES_PER_IP) return NextResponse.json({ error: "Too many wrong codes. Try again in 10 minutes." }, { status: 429, headers: noStore });

  let given = "";
  try { given = clean(decodeURIComponent(request.headers.get("x-access-code") || "")); } catch (e) { given = ""; }
  if (!given || !sameCode(given, expected)) {
    add("bad:" + ip);
    return NextResponse.json({ error: "Wrong access code." }, { status: 401, headers: noStore });
  }
  if (request.headers.get("x-check") === "1") return NextResponse.json({ ok: true }, { headers: noStore });

  if (count("up:" + ip) >= LIMIT_UPLOADS_PER_IP || count("up:all") >= LIMIT_UPLOADS_GLOBAL)
    return NextResponse.json({ error: "Too many pictures saved to Drive just now. Your downloads still work; wait a few minutes to save more." }, { status: 429, headers: noStore });

  const folder = decodeURIComponent(request.headers.get("x-folder") || "");
  if (!PICTURE_TEMPLATES.some((t) => t.driveFolder === folder)) return NextResponse.json({ error: "Unknown template." }, { status: 400, headers: noStore });
  const mime = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (mime !== "image/png" && mime !== "image/jpeg") return NextResponse.json({ error: "PNG or JPEG only." }, { status: 400, headers: noStore });
  let filename = decodeURIComponent(request.headers.get("x-filename") || "picture.png");
  filename = filename.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "picture.png";

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) return NextResponse.json({ error: `Picture too big for Drive upload (${(buf.length / 1048576).toFixed(1)} MB, max 4.4 MB).` }, { status: 413, headers: noStore });
  // real image check (PNG / JPEG magic bytes) so the code can't be used to park other files in Drive
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  if ((mime === "image/png" && !isPng) || (mime === "image/jpeg" && !isJpg)) return NextResponse.json({ error: "Not a valid image." }, { status: 400, headers: noStore });

  const url = clean(process.env.DRIVE_WEBHOOK_URL || process.env.HALLOWEEN_DRIVE_WEBHOOK_URL);
  const secret = clean(process.env.DRIVE_SECRET || process.env.HALLOWEEN_DRIVE_SECRET);
  if (!url || !secret) return NextResponse.json({ error: "Drive webhook not configured" }, { status: 500, headers: noStore });

  add("up:" + ip); add("up:all");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow", signal: ctrl.signal,
      body: JSON.stringify({ secret, filename, mimeType: mime, dataBase64: buf.toString("base64"), subfolder: folder }),
    });
    const j = await res.json().catch(() => null);
    if (!j?.ok) return NextResponse.json({ error: j?.error || `Drive answered HTTP ${res.status}` }, { status: 502, headers: noStore });
    return NextResponse.json({ ok: true }, { headers: noStore });   // Drive link NOT returned to the public
  } catch (e) {
    return NextResponse.json({ error: "Drive save failed." }, { status: 502, headers: noStore });
  } finally { clearTimeout(timer); }
}
