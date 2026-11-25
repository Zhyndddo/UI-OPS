"use client";
// Round 696 — draws blocks (lib/releaseInfoDocs.js) onto A4-ratio canvas pages and turns them into one multi-page PDF (JPEG pages, same approach as the rights PDF).
import { jpegsToPdf } from "./pdfImage";

const OR = "#c2410c";
const W = 1240, H = 1754, M = 90;

function wrap(c, text, maxW) {
  const out = [];
  String(text).split("\n").forEach((para) => {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); return; }
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (c.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t;
    }
    if (cur) out.push(cur);
  });
  return out;
}

export async function buildInfoPdf(blocks, family = "Arial, sans-serif") {
  try { await Promise.all(["400", "700", "800"].map((w) => document.fonts.load(`${w} 24px ${family}`, "Thông tin phát hành"))); } catch (e) { /* fall back */ }
  const pages = [];
  let canvas, c, y;
  const newPage = () => {
    canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    c = canvas.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, W, H); c.textBaseline = "alphabetic"; c.textAlign = "left";
    c.fillStyle = "#999"; c.font = `700 20px ${family}`; c.fillText("VIEENT", M, 56);
    pages.push(canvas); y = M + 20;
  };
  const ensure = (h) => { if (y + h > H - M) newPage(); };
  const F = (w, s) => `${w} ${s}px ${family}`;
  newPage();
  for (const b of blocks) {
    if (b.t === "gap") { y += 14; continue; }
    if (b.t === "title") { ensure(80); c.fillStyle = OR; c.font = F(800, 52); c.fillText(b.text, M, y + 44); y += 72; continue; }
    if (b.t === "sub") { ensure(60); c.fillStyle = "#111"; c.font = F(700, 34); wrap(c, b.text, W - 2 * M).forEach((l) => { c.fillText(l, M, y + 30); y += 44; }); y += 14; continue; }
    if (b.t === "h1") { c.font = F(800, 29); const ls = wrap(c, b.text, W - 2 * M); ensure(60 + ls.length * 38); y += 22; c.fillStyle = OR; ls.forEach((l) => { c.fillText(l, M, y + 28); y += 38; }); c.fillStyle = "#f5d9c3"; c.fillRect(M, y + 4, W - 2 * M, 3); y += 20; continue; }
    if (b.t === "h2") { c.font = F(800, 26); const ls = wrap(c, b.text, W - 2 * M); ensure(50 + ls.length * 34); y += 12; c.fillStyle = "#111"; ls.forEach((l) => { c.fillText(l, M, y + 26); y += 34; }); y += 8; continue; }
    if (b.t === "kv") {
      c.font = F(700, 23); const kl = wrap(c, b.k, 300);
      c.font = F(400, 23); const vl = wrap(c, b.v, W - 2 * M - 330);
      const lines = Math.max(kl.length, vl.length);
      ensure(lines * 32 + 12);
      c.fillStyle = "#222"; c.font = F(700, 23); kl.forEach((l, i) => c.fillText(l, M, y + 24 + i * 32));
      c.fillStyle = "#111"; c.font = F(400, 23); vl.forEach((l, i) => c.fillText(l, M + 330, y + 24 + i * 32));
      y += lines * 32 + 12; continue;
    }
    const bullet = b.t === "bullet";
    c.font = F(400, 23); const ls = wrap(c, b.text || "", W - 2 * M - (bullet ? 34 : 0));
    ls.forEach((l, i) => {
      ensure(34); c.fillStyle = "#111"; c.font = F(400, 23);
      if (bullet && i === 0) c.fillText("•", M + 8, y + 24);
      c.fillText(l, M + (bullet ? 34 : 0), y + 24); y += l ? 32 : 18;
    });
    y += bullet ? 4 : 6;
  }
  const out = [];
  for (const cv of pages) {
    const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.85));
    out.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: cv.width, h: cv.height });
  }
  return jpegsToPdf(out);
}
