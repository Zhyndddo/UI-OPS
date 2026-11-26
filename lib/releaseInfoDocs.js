// Round 696 — the content of the two generated documents, as plain blocks used by BOTH the PDF drawer (browser) and the .docx writer (server).
//   infoBlocks(answers)     -> "THÔNG TIN PHÁT HÀNH" (handout: 01 terms, 02 deadlines, 03 A/B/C filled in)
//   metadataBlocks(answers) -> "Metadata (Lyrics <title>)" (composer/producer, mixer, lyricist, release date, lyrics) — same layout as the doc kept in each Data folder
// Block types: title, sub, h1, h2, kv {k,v}, p, bullet, gap
import { PROJECT_KINDS, PLATFORMS, FILE_FIELDS, PROMO_FIELDS, DIRECTION_FIELDS, DESIGN_FIELDS } from "./releaseInfoForm";

const dmy = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const dash = (v) => (String(v || "").trim() ? String(v).trim() : "—");
const when = (a) => [dmy(a.release_date), a.release_time].filter(Boolean).join(" ") || "—";

export function infoFileName(a) { return `${a.performer || "Nghệ sĩ"} - ${a.song_title || "Bài hát"} - THÔNG TIN PHÁT HÀNH`.replace(/[\\/:*?"<>|]/g, " "); }
export function metadataFileName(a) { return `Metadata (Lyrics ${a.song_title || "Bài hát"})`.replace(/[\\/:*?"<>|]/g, " "); }

const RT_NAME = { master: "Master", performing: "Biểu diễn", publishing: "Tác giả" };
const rightsText = (r) => [Object.keys(r.owned || {}).length && `sở hữu ${Object.keys(r.owned).map((k) => RT_NAME[k]).join("/")}`, Object.keys(r.licensed || {}).length && `cấp phép ${Object.keys(r.licensed).map((k) => RT_NAME[k]).join("/")}`, r.platforms === "all" ? "mọi nền tảng" : r.platforms === "some" ? `nền tảng: ${r.platforms_note || "một số"}` : "", r.term === "perpetual" ? "vĩnh viễn" : r.term === "limited" ? `thời hạn ${r.term_from || "?"} → ${r.term_to || "?"}` : "", r.proof && `minh chứng: ${r.proof}`].filter(Boolean).join(", ");
export function infoBlocks(a) {
  const kind = PROJECT_KINDS.find((k) => k.key === a.project_kind);
  const b = [
    { t: "title", text: "THÔNG TIN PHÁT HÀNH" },
    { t: "sub", text: `${dash(a.performer)} — ${dash(a.song_title)}` },
    { t: "h1", text: "01. XÁC NHẬN BẢN QUYỀN & CAM KẾT SỬ DỤNG (COPYRIGHT DECLARATION & TERMS)" },
    { t: "p", text: "Bằng việc điền và gửi Bản Thông Tin Phát Hành này, Quý Đối tác và Nghệ sĩ cam kết:" },
    { t: "h2", text: "QUYỀN SỞ HỮU & TÍNH SÁNG TẠO" },
    { t: "p", text: "Cam kết tác phẩm gửi phát hành là tác phẩm nguyên bản, tự sáng tạo, không sao chép/nhái lại và tuân thủ đúng Luật Sở hữu trí tuệ." },
    { t: "p", text: "Đối với các Sản phẩm KHÔNG sở hữu 100%: Đối tác bắt buộc khai báo đầy đủ, chính xác thông tin các bên liên quan + thời hạn sở hữu cụ thể đối với 03 nhóm quyền:" },
    { t: "bullet", text: "Master Rights (Quyền Nhà xuất bản / Bản Ghi)" },
    { t: "bullet", text: "Performing Rights (Quyền Biểu diễn / Nghệ sĩ)" },
    { t: "bullet", text: "Publishing Rights (Quyền Tác giả / Sáng tác)" },
    { t: "h2", text: "CAM KẾT CHỐNG GIAN LẬN & TRÁCH NHIỆM PHÁP LÝ" },
    { t: "bullet", text: "Nghiêm cấm mọi hành vi khai báo giả mạo, gian lận hoặc cung cấp thông tin/tài liệu sai sự thật." },
    { t: "bullet", text: "Trong trường hợp phát sinh tranh chấp, vi phạm bản quyền hoặc gian lận thông tin: Quý Đối tác chịu hoàn toàn trách nhiệm trước pháp luật, đồng thời chi trả toàn bộ chi phí bồi thường thiệt hại liên quan." },
    { t: "bullet", text: "Bên phát hành có quyền ngay lập tức gỡ bỏ sản phẩm, tạm dừng hợp tác và khấu trừ doanh thu để khắc phục hậu quả." },
    { t: "p", text: "(Khai báo chi tiết 03 nhóm quyền được thực hiện ở form Khai báo bản quyền riêng.)" },
    { t: "h1", text: "02. QUY ĐỊNH VỀ THỜI GIAN GỬI DỰ ÁN (DEADLINE SEEDING & RELEASE)" },
    { t: "bullet", text: "Dự án Pitching & Hỗ trợ truyền thông: trước tối thiểu 14 ngày." },
    { t: "bullet", text: "Dự án chỉ Phát hành/Phân phối (Không Pitching): trước tối thiểu 04 ngày làm việc." },
    { t: "bullet", text: "Dự án Gấp (phát hành trong 24–48h): TikTok tối thiểu 24h · Zing MP3 tối thiểu 48h (chỉ nhận Thứ 2 – Thứ 5) · Meta (Facebook/Instagram) tối thiểu 04 ngày." },
    { t: "kv", k: "Loại dự án đã chọn", v: kind ? kind.label : "—" },
    { t: "h1", text: "03. THÔNG TIN KỸ THUẬT & HỒ SƠ PHÁT HÀNH (METADATA & RELEASE ASSETS)" },
    { t: "h2", text: "A. DỮ LIỆU SẢN PHẨM (METADATA)" },
    { t: "kv", k: "   Label", v: dash(a.label) },
    { t: "kv", k: "   Loại hình", v: dash(a.release_type) },
    ...((a.tracks || []).length ? [{ t: "kv", k: "   Tracklist", v: a.tracks.map((t, i) => `${i + 1}. ${typeof t === "string" ? t : t.title}`).join(" · ") }] : []),
    { t: "kv", k: "1. Tên sản phẩm", v: dash(a.song_title) },
    { t: "kv", k: "2. Thể loại", v: (a.genres || []).filter(Boolean).join(", ") || "—" },
    { t: "kv", k: "3. Nghệ sĩ trình bày (Main artist)", v: dash(a.performer) },
    { t: "kv", k: "   Nghệ sĩ hợp tác (Featuring)", v: dash(a.featuring) },
    { t: "kv", k: "4. Sáng tác", v: dash(a.composer) },
    { t: "kv", k: "   Người viết lời", v: dash(a.lyricist) },
    { t: "kv", k: "5. Producer", v: dash(a.producer) },
    { t: "kv", k: "6. Mixer", v: dash(a.mixer) },
    ...((a.tracks || []).length ? [] : [{ t: "kv", k: "7. Preview Time", v: dash(a.preview_time) }]),
    { t: "kv", k: "8. Ngày phát hành demo TikTok", v: a.tiktok_demo_date ? dmy(a.tiktok_demo_date) : "—" },
    { t: "kv", k: "10. Ngày giờ phát hành", v: when(a) },
  ];
  FILE_FIELDS.forEach((f, i) => b.push({ t: "kv", k: `${11 + i}. ${f.label}`, v: dash(a.files?.[f.key]) + (f.key === "audio" && a.files?.[f.key] ? (a.audio_kind === "demo" ? " (DEMO)" : " (chính thức)") : "") }));
  const prof = (a.profiles || []).filter((r) => r && r.url).map((r) => `${PLATFORMS.find((x) => x.key === r.p)?.label || r.p}: ${r.url}`).join(" · ") || a.profile_links;
  b.push({ t: "kv", k: `${11 + FILE_FIELDS.length}. Link profile nghệ sĩ`, v: dash(prof) + (a.profile_returning ? " (đã phát hành với VIEENT trước đây)" : "") });
  (a.tracks || []).filter((t) => t && typeof t === "object" && (t.performer || t.featuring || t.preview_time || t.rights_note || t.rights || t.composer || t.lyricist || t.producer || t.mixer || t.lyrics)).forEach((t, i) => {
    b.push({ t: "kv", k: `   Track ${(a.tracks || []).indexOf(t) + 1}: ${t.title}`, v: [t.performer && `Nghệ sĩ: ${t.performer}`, t.featuring && `Feat: ${t.featuring}`, t.preview_time && `Preview: ${t.preview_time}`, t.composer && `Sáng tác: ${t.composer}`, t.lyricist && `Lời: ${t.lyricist}`, t.producer && `Producer: ${t.producer}`, t.mixer && `Mixer: ${t.mixer}`, t.rights && `Quyền riêng: ${rightsText(t.rights)}`, t.rights_note && `Ghi chú quyền: ${t.rights_note}`, t.lyrics && "Lyrics (có)"].filter(Boolean).join(" · ") });
  });
  const lyUrl = /^https?:\/\/\S+$/i.test(String(a.lyrics || "").trim());
  b.push({ t: "kv", k: "9. Lyrics", v: a.lyrics ? (lyUrl ? String(a.lyrics).trim() : "(xem bên dưới)") : "—" });
  if (a.lyrics && !lyUrl) { b.push({ t: "gap" }); String(a.lyrics).split(/\r?\n/).forEach((l) => b.push({ t: "p", text: l })); b.push({ t: "gap" }); }
  if (a.deliver_only) { b.push({ t: "h2", text: "B. CHỈ PHÁT HÀNH / ONLY DELIVER" }); b.push({ t: "p", text: "Đối tác chọn chỉ phát hành: không có tư liệu truyền thông, định hướng nội dung hay thiết kế." }); b.push({ t: "gap" }); b.push({ t: "p", text: `Liên hệ: ${dash(a.contact_email)}` }); return b; }
  b.push({ t: "h2", text: "B. TƯ LIỆU TRUYỀN THÔNG (PROMO ASSETS)" });
  PROMO_FIELDS.forEach((f, i) => b.push({ t: "kv", k: `${i + 1}. ${f.label}`, v: dash(a.promo?.[f.key]) }));
  DIRECTION_FIELDS.forEach((f, i) => b.push({ t: "kv", k: `${i + 1}. ${f.label}`, v: dash(a.direction?.[f.key]) }));
  if (a.project_kind === "pitching") {
    b.push({ t: "h2", text: "C. TƯ LIỆU THIẾT KẾ (DESIGN SPECS)" });
    DESIGN_FIELDS.forEach((f) => b.push({ t: "kv", k: f.label, v: dash(a.design?.[f.key]) }));
  }
  b.push({ t: "gap" }); b.push({ t: "p", text: `Liên hệ: ${dash(a.contact_email)}` });
  return b;
}

// "24.11 19h" style, like the hand-made Metadata doc
export function shortWhen(a) {
  if (!a.release_date) return "";
  const [, m, d] = a.release_date.split("-");
  let t = "";
  if (a.release_time) { const [h, mi] = a.release_time.split(":"); t = ` ${Number(h)}h${mi === "00" ? "" : mi}`; }
  return `${d}.${m}${t}`;
}
export function metadataBlocks(a) {
  const same = !a.producer || String(a.producer).trim().toLowerCase() === String(a.composer || "").trim().toLowerCase();
  const b = [];
  if (same) b.push({ t: "p", text: `Sáng tác, producer: ${a.composer || ""}` });
  else { b.push({ t: "p", text: `Sáng tác: ${a.composer || ""}` }); b.push({ t: "p", text: `Producer: ${a.producer || ""}` }); }
  b.push({ t: "p", text: `Mixer: ${a.mixer || ""}` });
  b.push({ t: "p", text: `Người viết lời (Thơ): ${a.lyricist || ""}` });
  b.push({ t: "p", text: `Ngày phát hành: ${shortWhen(a)}` });
  b.push({ t: "gap" });
  b.push({ t: "h2", text: "Lời bài hát" });
  String(a.lyrics || "").split(/\r?\n/).forEach((l) => b.push({ t: "p", text: l }));
  return b;
}
