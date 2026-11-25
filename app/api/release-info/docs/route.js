// Round 696 — generated documents of the release-info form.
//   POST { token, pdfBase64 } -> builds the two .docx from the SAVED answers, saves PDF + both .docx into <product>/Data on Drive, stores the links, returns them.
//   GET  ?token=...&kind=info|metadata -> downloads that .docx (built from the saved answers).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { readRightsToken } from "../../../../lib/rightsToken";
import { resolveReleasePath, callDrive } from "../../../../lib/releaseDriveFolder";
import { infoBlocks, metadataBlocks, infoFileName, metadataFileName } from "../../../../lib/releaseInfoDocs";
import { buildDocx } from "../../../../lib/docxLite";
import { countHits, addHit, clientIp } from "../../../../lib/eventRateLimit";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_PDF = 3.2 * 1024 * 1024;
const bad = (error, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

async function saved(id) {
  const { data } = await supabaseAdmin.from("release_info_forms").select("answers, docs").eq("release_id", id).maybeSingle();
  return data || null;
}

export async function GET(request) {
  if (!supabaseAdmin) return bad("Server not configured.", 500);
  const ip = clientIp(request);
  if (countHits("ri-doc:" + ip) >= 40) return bad("Quá nhiều lượt tải. Thử lại sau ít phút.", 429);
  addHit("ri-doc:" + ip);
  const u = new URL(request.url);
  const id = readRightsToken(u.searchParams.get("token"));
  const row = id ? await saved(id) : null;
  if (!row) return bad("Chưa có dữ liệu đã gửi.", 404);
  const a = row.answers || {};
  const meta = u.searchParams.get("kind") === "metadata";
  const bytes = await buildDocx(meta ? metadataBlocks(a) : infoBlocks(a));
  const name = (meta ? metadataFileName(a) : infoFileName(a)) + ".docx";
  const ascii = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9._() -]+/g, "_");
  return new NextResponse(bytes, { headers: { ...noStore, "Content-Type": DOCX, "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}` } });
}

export async function POST(request) {
  if (!supabaseAdmin) return bad("Server not configured.", 500);
  const ip = clientIp(request);
  if (countHits("ri-docs:" + ip) >= 15) return bad("Quá nhiều lần gửi. Thử lại sau ít phút.", 429);
  addHit("ri-docs:" + ip);
  let b = null; try { b = await request.json(); } catch { /* below */ }
  const id = readRightsToken(b?.token);
  if (!id) return bad("Link không hợp lệ.", 404);
  const row = await saved(id);
  if (!row) return bad("Hãy gửi biểu mẫu trước.", 404);
  const a = row.answers || {};
  const p = await resolveReleasePath(supabaseAdmin, id);
  if (!p.ok) return bad(p.error, p.code === "not_found" ? 404 : 400);

  const pdf = Buffer.from(String(b?.pdfBase64 || ""), "base64");
  const pdfOk = pdf.length > 100 && pdf.length <= MAX_PDF && pdf[0] === 0x25 && pdf[1] === 0x50 && pdf[2] === 0x44 && pdf[3] === 0x46;
  const files = [
    { key: "info_docx", fileName: infoFileName(a) + ".docx", mimeType: DOCX, bytes: Buffer.from(await buildDocx(infoBlocks(a))) },
    { key: "metadata_docx", fileName: metadataFileName(a) + ".docx", mimeType: DOCX, bytes: Buffer.from(await buildDocx(metadataBlocks(a))) },
  ];
  if (pdfOk) files.unshift({ key: "pdf", fileName: infoFileName(a) + ".pdf", mimeType: "application/pdf", bytes: pdf });

  const docs = { ...(row.docs || {}) }; const errors = {};
  for (const f of files) {
    const j = await callDrive({ action: "releaseSaveFile", ...p.path, fileName: f.fileName, mimeType: f.mimeType, dataBase64: f.bytes.toString("base64") }, 40000);
    if (j.ok) docs[f.key] = j.url; else errors[f.key] = j.error || "failed";
  }
  await supabaseAdmin.from("release_info_forms").update({ docs, updated_at: new Date().toISOString() }).eq("release_id", id);
  return NextResponse.json({ ok: Object.keys(errors).length === 0, docs, errors, pdfRejected: !pdfOk }, { headers: noStore });
}
