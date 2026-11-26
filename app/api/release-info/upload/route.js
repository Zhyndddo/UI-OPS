// Round 696 — artist uploads from the release-info form go STRAIGHT to the product's Drive folder (…/Data/<ARTWORK|AUDIO|MV|PROMO|DESIGN-SPECS>).
//   POST { token, action:"init", field, filename, mimeType, size }        -> { uploadUrl, name }  (resumable Drive session; the browser PUTs the file to Google)
//   POST { token, action:"finalize", field, name, size, fileId? }          -> { file:{ id, name, size, url } }
// The folder is worked out from the release row (never from the client); the Apps Script re-checks the file is inside THIS product folder.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { readRightsToken } from "../../../../lib/rightsToken";
import { resolveReleasePath, callDrive, createReleaseFolder } from "../../../../lib/releaseDriveFolder";
import { countHits, addHit, clientIp } from "../../../../lib/eventRateLimit";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const MAX_BYTES = 500 * 1024 * 1024;
const BLOCKED_EXT = new Set(["exe", "msi", "bat", "cmd", "scr", "com", "jar", "vbs", "ps1", "dmg", "apk", "app", "pkg", "js", "html", "htm", "svg"]);
const bad = (error, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

const SUB = { "files.audio": "AUDIO", "files.artwork": "ARTWORK", "files.design": "ARTWORK", "files.dsp_photo": "ARTWORK", "files.mv": "MV" };
function subFor(field) {
  if (SUB[field]) return SUB[field];
  if (/^promo\.[a-z_]+$/.test(field)) return "PROMO";
  if (/^design\.[a-z_]+$/.test(field)) return "DESIGN-SPECS";
  return null;
}
function safeName(name) {
  const base = String(name || "file").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d");
  const m = base.match(/^(.*?)(\.[A-Za-z0-9]{1,8})?$/);
  const stem = (m?.[1] || "file").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80) || "file";
  return stem + (m?.[2] || "");
}

export async function POST(request) {
  if (!supabaseAdmin) return bad("Server not configured.", 500);
  const ip = clientIp(request);
  if (countHits("ri-up:" + ip) >= 60) return bad("Quá nhiều lượt tải lên. Thử lại sau ít phút.", 429);
  addHit("ri-up:" + ip);
  let b = null; try { b = await request.json(); } catch { /* below */ }
  const id = readRightsToken(b?.token);
  if (!id) return bad("Link không hợp lệ.", 404);
  const sub = subFor(String(b?.field || ""));
  if (!sub) return bad("Ô tải lên không hợp lệ.");
  const p = await resolveReleasePath(supabaseAdmin, id);
  if (!p.ok) return bad(p.code === "no_release_date" ? "Sản phẩm chưa có ngày phát hành trên hệ thống — vui lòng nhờ VIEENT bổ sung rồi tải lên lại." : p.error, p.code === "not_found" ? 404 : 400);

  if (b.action === "init") {
    const size = Number(b.size);
    if (!Number.isFinite(size) || size <= 0) return bad("File rỗng.");
    if (size > MAX_BYTES) return bad(`File quá lớn (tối đa ${MAX_BYTES / 1048576} MB). Với file lớn hơn, hãy dán link.`, 413);
    const name = safeName(b.filename);
    if (BLOCKED_EXT.has((name.split(".").pop() || "").toLowerCase())) return bad("Loại file này không được phép.");
    const fileName = name;   // Apps Script v10 makes it unique in the folder and returns the final name
    if (!String(p.rel.drive_link || "").trim()) await createReleaseFolder(supabaseAdmin, id);   // also fills Link Drive on the release
    const j = await callDrive({ action: "releaseUploadInit", ...p.path, sub, fileName, mimeType: String(b.mimeType || "application/octet-stream").slice(0, 100), size, origin: request.headers.get("origin") || "" });
    if (!j.ok) return bad(j.error || "Drive từ chối. Vui lòng thử lại.", 502);
    return NextResponse.json({ uploadUrl: j.uploadUrl, name: j.name || fileName }, { headers: noStore });
  }
  if (b.action === "finalize") {
    const j = await callDrive({ action: "releaseUploadFinalize", ...p.path, fileName: String(b.name || ""), size: Number(b.size) || 0, fileId: b.fileId ? String(b.fileId) : "" });
    if (!j.ok) return bad(j.error || "Không xác nhận được file.", 502);
    return NextResponse.json({ file: { id: j.id, name: j.name, size: j.size, url: j.url } }, { headers: noStore });
  }
  return bad("Unknown action.");
}
