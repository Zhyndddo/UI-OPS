// Round 568 — big-file upload to Google Drive, step 1 + 3 (PROOF OF CONCEPT, owner only for now).
//   POST { action:"init", filename, mimeType, size } -> asks the Apps Script for a one-time Drive upload address (resumable session).
//   POST { action:"finalize", name, size, fileId? }  -> asks the script to verify the file, share it with the VIEENT domain and return the links.
// The file itself never goes through here: the browser sends it straight to Google (or, as a fallback, through ./chunk).
import { NextResponse } from "next/server";
import { getCallerProfile } from "../../../lib/supabaseAdmin";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const OWNER_EMAIL = "an.thien@vieent.vn";
const MAX_BYTES = 100 * 1024 * 1024;
const BLOCKED_EXT = new Set(["exe", "msi", "bat", "cmd", "scr", "com", "jar", "vbs", "ps1", "dmg", "apk", "app", "pkg"]);
const noStore = { "Cache-Control": "no-store" };
const clean = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();

async function callScript(payload) {
  const url = clean(process.env.DRIVE_WEBHOOK_URL || process.env.HALLOWEEN_DRIVE_WEBHOOK_URL);
  const secret = clean(process.env.DRIVE_SECRET || process.env.HALLOWEEN_DRIVE_SECRET);
  if (!url || !secret) return { ok: false, error: "Drive webhook not configured" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret, ...payload }), redirect: "follow", signal: ctrl.signal });
    const j = await res.json().catch(() => null);
    if (!j) return { ok: false, error: `HTTP ${res.status}` };
    return j;
  } catch (e) { return { ok: false, error: e.message }; }
  finally { clearTimeout(timer); }
}

// ASCII-only, no path characters; keeps the extension
function safeName(name) {
  const base = String(name || "file").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d");
  const m = base.match(/^(.*?)(\.[A-Za-z0-9]{1,8})?$/);
  const stem = (m?.[1] || "file").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80) || "file";
  return stem + (m?.[2] || "");
}

export async function POST(request) {
  const caller = await getCallerProfile(request);
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: noStore });
  if ((caller.email || "").trim().toLowerCase() !== OWNER_EMAIL) return NextResponse.json({ error: "Not available yet." }, { status: 403, headers: noStore });
  let body = null;
  try { body = await request.json(); } catch { /* below */ }
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400, headers: noStore });

  if (body.action === "init") {
    const size = Number(body.size);
    if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "Empty file." }, { status: 400, headers: noStore });
    if (size > MAX_BYTES) return NextResponse.json({ error: `File too big (max ${MAX_BYTES / 1048576} MB).` }, { status: 413, headers: noStore });
    const name = safeName(body.filename);
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (BLOCKED_EXT.has(ext)) return NextResponse.json({ error: "This file type is not allowed." }, { status: 400, headers: noStore });
    const uniqueName = `${Date.now()}_${name}`;
    const j = await callScript({ action: "init", name: uniqueName, mimeType: String(body.mimeType || "application/octet-stream").slice(0, 100), size, origin: request.headers.get("origin") || "" });
    if (!j.ok) return NextResponse.json({ error: j.error || "Drive refused." }, { status: 502, headers: noStore });
    return NextResponse.json({ uploadUrl: j.uploadUrl, name: uniqueName }, { headers: noStore });
  }

  if (body.action === "finalize") {
    const j = await callScript({ action: "finalize", name: String(body.name || ""), size: Number(body.size) || 0, fileId: body.fileId ? String(body.fileId) : "" });
    if (!j.ok) return NextResponse.json({ error: j.error || "Could not verify the file." }, { status: 502, headers: noStore });
    return NextResponse.json({ file: { id: j.id, name: j.name, size: j.size, mimeType: j.mimeType, url: j.url, previewUrl: j.previewUrl } }, { headers: noStore });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore });
}
