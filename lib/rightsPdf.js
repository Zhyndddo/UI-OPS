"use client";
// Round 633 — draws the filled "Khai báo bản quyền ca khúc mới" form on a canvas (same layout as the hand-out mock-up)
// and turns it into a one-page PDF. sigCanvas: the signature pad canvas (or null).
import { jpegToPdf } from "./pdfImage";
import { RIGHTS, PDF_MW, PDF_MH, PDF_MH_HOLDER, HOLDER_BOX, AUDIT_H } from "./rightsForm";

const OR = "#f26a0f", OR_DK = "#c2410c";
const OUT_W = 1240;   // drawn in mock-up coordinates, scaled to 1240 px wide

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function fit(c, text, maxW) { let t = String(text || ""); if (c.measureText(t).width <= maxW) return t; while (t.length > 1 && c.measureText(t + "…").width > maxW) t = t.slice(0, -1); return t + "…"; }
function wrap(c, text, maxW) { const words = String(text).split(/\s+/); const lines = []; let cur = ""; for (const w of words) { const t = cur ? cur + " " + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; }

export async function renderRightsCanvas(d, sigCanvas, family, audit) {
  const fam = family || "Arial, sans-serif";
  try { await Promise.all(["400", "600", "700", "800"].map((w) => document.fonts.load(`${w} 24px ${fam}`, "Khai báo bản quyền"))); } catch (e) { /* fall back to whatever is loaded */ }
  const MW = PDF_MW, BASE_H = d.holder_name ? PDF_MH_HOLDER : PDF_MH, MH = BASE_H + (audit ? AUDIT_H : 0);
  const canvas = document.createElement("canvas");
  canvas.width = OUT_W; canvas.height = Math.round((OUT_W * MH) / MW);
  const c = canvas.getContext("2d");
  c.scale(OUT_W / MW, OUT_W / MW);
  const F = (w, s) => `${w} ${s}px ${fam}`;
  c.fillStyle = "#fafafa"; c.fillRect(0, 0, MW, MH);
  c.textBaseline = "alphabetic";
  c.fillStyle = "#111"; c.font = F(800, 28); c.textAlign = "left"; c.fillText("VIEENT", 92, 100);
  c.fillStyle = "#555"; c.font = F(600, 24); c.textAlign = "right"; c.fillText("Hướng dẫn khai báo bản quyền · Ca khúc mới", 1567, 100);
  c.textAlign = "left";
  c.fillStyle = OR; rr(c, 92, 131, 275, 56, 28); c.fill();
  c.fillStyle = "#fff"; c.font = F(800, 26); c.fillText("FORM KHAI BÁO", 115, 168);
  c.fillStyle = "#111"; c.font = F(800, 70); c.fillText("Khai báo bản quyền ca khúc mới", 92, 265);
  c.fillStyle = "#555"; c.font = F(400, 32); c.fillText("Vui lòng điền và tích đủ các mục.", 92, 325);

  const card = (y, h, n, title) => {
    c.fillStyle = "#fff"; c.strokeStyle = "#ececec"; c.lineWidth = 2; rr(c, 92, y, 1475, h, 28); c.fill(); c.stroke();
    c.fillStyle = "#fdeadd"; c.beginPath(); c.arc(155, y + 54, 26, 0, Math.PI * 2); c.fill();
    c.fillStyle = OR_DK; c.font = F(800, 24); c.textAlign = "center"; c.fillText(String(n), 155, y + 63); c.textAlign = "left";
    c.fillStyle = "#111"; c.font = F(700, 36); c.fillText(title, 200, y + 68);
  };
  const box = (x, y, w, h, label, sub, on) => {
    c.fillStyle = "#fff"; c.strokeStyle = "#f5d9c3"; c.lineWidth = 2; rr(c, x, y, w, h, 12); c.fill(); c.stroke();
    const cy = sub ? y + h / 2 : y + h / 2;
    c.strokeStyle = on ? OR : "#666"; c.lineWidth = 2.5; c.fillStyle = on ? OR : "#fff"; rr(c, x + 22, cy - 12, 24, 24, 5); c.fill(); c.stroke();
    if (on) { c.strokeStyle = "#fff"; c.lineWidth = 3.5; c.beginPath(); c.moveTo(x + 27, cy); c.lineTo(x + 32.5, cy + 6); c.lineTo(x + 42, cy - 6); c.stroke(); }
    c.fillStyle = "#222"; c.font = F(700, 28);
    if (sub) { c.fillText(label, x + 64, y + 38); c.fillStyle = "#666"; c.font = F(400, 24); c.fillText(sub, x + 64, y + 70); }
    else c.fillText(label, x + 64, cy + 10);
  };

  // 1. metadata
  card(367, 412, 1, "Thông tin metadata");
  const rows = [["Tên bài hát:", d.song_title], ["Sáng tác:", d.composer], ["Trình bày:", d.performer], ["Producer:", d.producer], ["Mixer:", d.mixer]];
  rows.forEach(([k, v], i) => {
    const y = 497 + i * 60;
    c.fillStyle = "#222"; c.font = F(700, 28); c.fillText(k, 131, y);
    c.fillStyle = OR_DK; c.font = F(700, 30); c.fillText(fit(c, v, 1130), 379, y - 6);
    c.strokeStyle = "#999"; c.lineWidth = 1.5; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(379, y + 8); c.lineTo(1528, y + 8); c.stroke(); c.setLineDash([]);
  });

  // 2. rights
  card(805, 947, 2, "Xác nhận quyền");
  c.fillStyle = "#fdf1e8"; c.strokeStyle = "#f5d9c3"; c.lineWidth = 2; rr(c, 130, 907, 1399, 814, 22); c.fill(); c.stroke();
  c.fillStyle = "#222"; c.font = F(400, 30); c.fillText("Tôi cam kết có ", 157, 960);
  let x = 157 + c.measureText("Tôi cam kết có ").width; c.font = F(800, 30); c.fillText("đầy đủ 3 quyền", x, 960);
  x += c.measureText("đầy đủ 3 quyền").width; c.font = F(400, 30); c.fillText(" để phát hành ca khúc này, gồm:", x, 960);
  c.font = F(700, 30); c.fillText("Các quyền tôi sở hữu:", 157, 1018);
  RIGHTS.forEach((r, i) => box(157 + i * 453, 1039, 439, 88, r.vi, `(${r.en})`, !!d.owned?.[r.key]));
  c.fillStyle = "#222"; c.font = F(700, 30); c.fillText("Các quyền được cấp phép sử dụng bởi chủ sở hữu quyền:", 157, 1172);
  RIGHTS.forEach((r, i) => box(157 + i * 453, 1193, 439, 88, r.vi, `(${r.en})`, !!d.licensed?.[r.key]));
  // Thời hạn (valid until) under each licensed right, then everything below shifts down 44px
  const fd = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
  RIGHTS.forEach((r, i) => {
    if (!d.licensed?.[r.key] || !d.licensed_until?.[r.key]) return;   // per-right expiry is hidden on the form now; printed only if a value exists
    c.fillStyle = OR_DK; c.font = F(700, 26); c.fillText(`Thời hạn: ${fd(d.licensed_until[r.key])}`, 157 + i * 453 + 22, 1313);
  });
  c.save(); c.translate(0, 44);
  c.fillStyle = "#fde3d3"; c.strokeStyle = "#f2b58e"; rr(c, 157, 1300, 1345, 108, 12); c.fill(); c.stroke();
  c.fillStyle = "#b0390b"; c.font = F(700, 27);
  wrap(c, "Đối với các quyền được cấp phép, vui lòng gửi kèm xác nhận từ chủ sở hữu: ảnh chụp màn hình tin nhắn / email hoặc hợp đồng.", 1300).slice(0, 2).forEach((l, i) => c.fillText(l, 180, 1343 + i * 36));
  c.fillStyle = "#222"; c.font = F(700, 30); c.fillText("Nền tảng được cấp phép:", 157, 1455);
  box(157, 1475, 330, 52, "Tất cả các nền tảng", null, d.platforms === "all");
  box(501, 1475, 486, 52, "Một số nền tảng theo thỏa thuận", null, d.platforms === "some");
  if (d.platforms === "some" && d.platforms_note) { c.fillStyle = OR_DK; c.font = F(600, 24); c.fillText(fit(c, d.platforms_note, 480), 1010, 1509); }
  c.fillStyle = "#222"; c.font = F(700, 30); c.fillText("Thời hạn đăng tải bản ghi:", 157, 1575);
  box(157, 1596, 192, 52, "Vĩnh viễn", null, d.term === "perpetual");
  box(362, 1596, 222, 52, "Có thời hạn", null, d.term === "limited");
  if (d.term === "limited" && d.term_note) { c.fillStyle = OR_DK; c.font = F(600, 24); c.fillText(fit(c, "Thời hạn: " + d.term_note, 880), 610, 1630); }

  // 3. signature
  card(1736, 360, 3, "Người gửi ký xác nhận");
  c.fillStyle = "#222"; c.font = F(700, 30); c.fillText("Chữ ký:", 131, 1865);
  c.strokeStyle = "#aaa"; c.lineWidth = 2; c.setLineDash([8, 6]); rr(c, 130, 1885, 1399, 175, 16); c.stroke(); c.setLineDash([]);
  if (sigCanvas && sigCanvas.width) { const s = Math.min(1360 / sigCanvas.width, 150 / sigCanvas.height); const w = sigCanvas.width * s, h = sigCanvas.height * s; c.drawImage(sigCanvas, 130 + (1399 - w) / 2, 1885 + (175 - h) / 2, w, h); }
  const when = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  c.fillStyle = "#444"; c.font = F(600, 24); c.textAlign = "right"; c.fillText(`${d.signer_name}  ·  ${when}`, 1520, 2050); c.textAlign = "left";

  c.fillStyle = "#222"; c.fillRect(92, 2121, 1475, 2);
  c.fillStyle = OR_DK; c.font = F(800, 30); c.fillText("Lưu ý:", 92, 2178);
  x = 92 + c.measureText("Lưu ý: ").width; c.fillStyle = "#111"; c.font = F(700, 30); c.fillText("Thiếu xác nhận nào, bài hát sẽ chưa được phát hành.", x, 2178);
  if (d.proof) { c.fillStyle = "#444"; c.font = F(600, 24); wrap(c, "Minh chứng quyền được cấp phép: " + d.proof, 1475).slice(0, 2).forEach((l, i) => c.fillText(l, 92, 2230 + i * 32)); }
  c.restore();
  if (d.holder_name) {   // right holder confirms here: the Dropbox Sign signature field is placed on the dashed box
    c.fillStyle = "#fff"; c.strokeStyle = "#ececec"; c.lineWidth = 2; rr(c, 92, 2352, 1475, 190, 22); c.fill(); c.stroke();
    c.fillStyle = "#111"; c.font = F(800, 30); c.fillText("Chủ sở hữu quyền xác nhận (ký điện tử qua Dropbox Sign)", 130, 2402);
    c.fillStyle = OR_DK; c.font = F(700, 28); c.fillText(fit(c, d.holder_name + (d.holder_email ? "  ·  " + d.holder_email : ""), 540), 130, 2450);
    c.strokeStyle = "#aaa"; c.lineWidth = 2; c.setLineDash([8, 6]); rr(c, HOLDER_BOX.x, HOLDER_BOX.y, HOLDER_BOX.w, HOLDER_BOX.h, 12); c.stroke(); c.setLineDash([]);
  }
  if (audit) {   // Round 639: verification record (email code + consent) printed on the form itself
    const y0 = BASE_H + 10;
    c.fillStyle = "#fff"; c.strokeStyle = "#cfd8e6"; c.lineWidth = 2; rr(c, 92, y0, 1475, AUDIT_H - 40, 22); c.fill(); c.stroke();
    c.fillStyle = "#1f3a68"; c.font = F(800, 30); c.fillText("Bằng chứng xác minh điện tử", 130, y0 + 50);
    const when = new Date(audit.verified_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const place = [audit.city, audit.region, audit.country].filter(Boolean).join(", ") || "không xác định";
    const rows = [
      `Email xác minh bằng mã: ${audit.email}  ·  ${when} (GMT+7)`,
      `Địa chỉ IP: ${audit.ip}  ·  Vị trí gần đúng (theo IP): ${place}`,
      `Thiết bị: ${audit.device} · ${audit.os} · ${audit.browser}  ·  Múi giờ máy: ${audit.client?.tz || "?"}  ·  Màn hình: ${audit.client?.screen || "?"}`,
      "Người khai báo đã đồng ý để VIEENT ghi nhận các thông tin trên, chỉ nhằm xác định người khai báo.",
    ];
    c.fillStyle = "#333"; c.font = F(600, 24);
    rows.forEach((t, i) => c.fillText(fit(c, t, 1400), 130, y0 + 98 + i * 36));
    c.fillStyle = "#666"; c.font = F(600, 21);
    c.fillText("SHA-256 nội dung khai báo:", 130, y0 + 98 + rows.length * 36 + 6);
    c.fillText(audit.form_hash, 130, y0 + 98 + rows.length * 36 + 36);
  }
  return canvas;
}

export async function buildRightsPdf(d, sigCanvas, family, audit) {
  const canvas = await renderRightsCanvas(d, sigCanvas, family, audit);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return jpegToPdf(bytes, canvas.width, canvas.height);
}
