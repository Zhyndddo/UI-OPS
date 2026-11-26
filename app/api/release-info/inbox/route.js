// Round 700 — uploads from the BLANK /khai-bao form for a song that is not linked to a product yet go to the Drive "_INBOX" folder
// (…/_INBOX/<random key>/<ARTWORK|AUDIO|…>); AR's confirm (or a later product pick) moves them into the product's Data folder.
//   POST { inboxKey, action:"init", field, filename, mimeType, size } -> { uploadUrl, name }
//   POST { inboxKey, action:"finalize", field, name, size, fileId? }  -> { file:{ id, name, size, url } }
import { NextResponse } from "next/server";
import { callDrive } from "../../../../lib/releaseDriveFolder";
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
  const ip = clientIp(request);
  // public + no product yet, so the limits are tighter than the per-product upload route
  if (countHits("ri-inbox:" + ip) >= 25 || countHits("ri-inbox:all") >= 600) return bad("Quá nhiều lượt tải lên. Thử lại sau ít phút.", 429);
  let b = null; try { b = await request.json(); } catch { /* below */ }
  const key = String(b?.inboxKey || "");
  if (!/^[a-f0-9]{16,40}$/.test(key)) return bad("Phiên tải lên không hợp lệ. Vui lòng tải lại trang.");
  const sub = subFor(String(b?.field || ""));
  if (!sub) return bad("Ô tải lên không hợp lệ.");
  if (b.action === "init") {
    addHit("ri-inbox:" + ip); addHit("ri-inbox:all");
    const size = Number(b.size);
    if (!Number.isFinite(size) || size <= 0) return bad("File rỗng.");
    if (size > MAX_BYTES) return bad(`File quá lớn (tối đa ${MAX_BYTES / 1048576} MB). Với file lớn hơn, hãy dán link.`, 413);
    const name = safeName(b.filename);
    if (BLOCKED_EXT.has((name.split(".").pop() || "").toLowerCase())) return bad("Loại file này không được phép.");
    const fileName = `${Date.now()}_${name}`;
    const j = await callDrive({ action: "inboxUploadInit", inboxKey: key, sub, fileName, mimeType: String(b.mimeType || "application/octet-stream").slice(0, 100), size, origin: request.headers.get("origin") || "" }, 30000);
    if (!j.ok) return bad(j.error || "Drive từ chối. Vui lòng thử lại.", 502);
    return NextResponse.json({ uploadUrl: j.uploadUrl, name: fileName }, { headers: noStore });
  }
  if (b.action === "finalize") {
    const j = await callDrive({ action: "inboxUploadFinalize", inboxKey: key, fileName: String(b.name || ""), size: Number(b.size) || 0, fileId: b.fileId ? String(b.fileId) : "" }, 30000);
    if (!j.ok) return bad(j.error || "Không xác nhận được file.", 502);
    return NextResponse.json({ file: { id: j.id, name: j.name, size: j.size, url: j.url } }, { headers: noStore });
  }
  return bad("Unknown action.");
}
