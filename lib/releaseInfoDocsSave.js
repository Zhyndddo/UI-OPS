// Round 699 — server-side: build the two .docx from saved answers and file them (plus an optional PDF) in <product>/Data on Drive.
import { resolveReleasePath, callDrive } from "./releaseDriveFolder";
import { infoBlocks, metadataBlocks, infoFileName, metadataFileName } from "./releaseInfoDocs";
import { buildDocx } from "./docxLite";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export async function saveInfoDocs(db, releaseId, answers, pdfBytes) {
  const p = await resolveReleasePath(db, releaseId);
  if (!p.ok) return { ok: false, error: p.error };
  const files = [
    { key: "info_docx", fileName: infoFileName(answers) + ".docx", mimeType: DOCX, bytes: Buffer.from(await buildDocx(infoBlocks(answers))) },
    { key: "metadata_docx", fileName: metadataFileName(answers) + ".docx", mimeType: DOCX, bytes: Buffer.from(await buildDocx(metadataBlocks(answers))) },
  ];
  if (pdfBytes) files.unshift({ key: "pdf", fileName: infoFileName(answers) + ".pdf", mimeType: "application/pdf", bytes: pdfBytes });
  const docs = {}; const errors = {};
  for (const f of files) {
    const j = await callDrive({ action: "releaseSaveFile", ...p.path, fileName: f.fileName, mimeType: f.mimeType, dataBase64: f.bytes.toString("base64") }, 40000);
    if (j.ok) docs[f.key] = j.url; else errors[f.key] = j.error || "failed";
  }
  return { ok: Object.keys(errors).length === 0, docs, errors };
}
