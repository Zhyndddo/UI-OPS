// Round 695 — shared pieces of the release-info form ("Thông tin phát hành", step 2 of /khai-bao). Browser + server.
export const PROJECT_KINDS = [
  { key: "pitching", label: "Pitching & hỗ trợ truyền thông", sub: "Gửi trước tối thiểu 14 ngày" },
  { key: "release_only", label: "Chỉ phát hành / phân phối (không Pitching)", sub: "Gửi trước tối thiểu 04 ngày làm việc" },
  { key: "urgent", label: "Dự án gấp (phát hành trong 24–48h)", sub: "TikTok ≥ 24h · Zing MP3 ≥ 48h (Thứ 2–Thứ 5) · Meta ≥ 04 ngày" },
];
export const FILE_FIELDS = [
  { key: "audio", label: "File audio", hint: "24bit, 48000Hz, WAV" },
  { key: "artwork", label: "File hình", hint: "3000x3000px" },
  { key: "design", label: "File hình thiết kế", hint: "psd / tiff" },
  { key: "mv", label: "File MV", hint: "nếu có" },
  { key: "dsp_photo", label: "Hình profile DSP", hint: "nếu nghệ sĩ muốn cập nhật hình profile trước khi ra mắt" },
];
export const PROMO_FIELDS = [
  { key: "artist_photo", label: "Artist Photo", hint: "bộ ảnh nghệ sĩ chất lượng cao" },
  { key: "mv_photo", label: "MV Photo", hint: "ảnh hậu trường, stills từ MV" },
  { key: "bts", label: "Behind The Scenes", hint: "clip / hình hậu trường thu âm, quay MV" },
  { key: "short_video", label: "Short Video / Lipsync TikTok", hint: "video ngắn quảng bá trước/sau phát hành" },
  { key: "cta", label: "CTA Video / Audio", hint: "video kêu gọi fan trên tất cả nền tảng" },
  { key: "media_plan", label: "Kế hoạch truyền thông", hint: "master plan / timeline, nếu có" },
];
export const DIRECTION_FIELDS = [
  { key: "goal", label: "Mục tiêu và ý định", hint: "Lý do thực hiện dự án, thông điệp chính, cảm xúc mong muốn mang đến cho người nghe." },
  { key: "style", label: "Phong cách & cách tiếp cận", hint: "Màu sắc âm nhạc, chất liệu / kỹ thuật sản xuất, sự thử nghiệm hoặc pha trộn phong cách." },
  { key: "story", label: "Ý nghĩa và câu chuyện", hint: "Những suy nghĩ, cảm xúc, câu chuyện truyền cảm hứng gửi gắm trong tác phẩm." },
];
export const DESIGN_FIELDS = [
  { key: "spotify_video", label: "Spotify Video Banner", hint: "16:9 · .MOV/.MP4 · tối đa 30 giây · tối đa 500MB · tối thiểu 1280x720 · âm thanh chuẩn hóa theo Spotify" },
  { key: "spotify_image", label: "Spotify Image Banner", hint: "1.91:1 · 800x418 → 1200x628 px · .JPG · tối đa 1MB" },
  { key: "zing_psd", label: "Zing MP3", hint: "file PSD (Zing tự resize theo chuẩn hiển thị)" },
  { key: "nct", label: "Nhạc Của Tui (NCT)", hint: "1280 x 256 px" },
  { key: "cta_clip", label: "Call-to-action video clip / audio", hint: "Zing MP3 / NCT / Spotify (khi BTV nền tảng yêu cầu)" },
];

const str = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
const isoDate = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x));
const link = (v) => str(v, 500);
const mapLinks = (src, fields) => Object.fromEntries(fields.map((f) => [f.key, link(src?.[f.key])]));

// working days from `from` (exclusive) to `to` (inclusive), Mon–Fri
export function workingDaysBetween(from, to) {
  let n = 0; const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (d < end) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n += 1; }
  return n;
}
// Warning only (never blocks). Returns { level: "ok"|"warn"|"info", text }.
export function deadlineCheck(kind, releaseIso, now = new Date()) {
  if (!isoDate(releaseIso || "")) return { level: "info", text: "Chọn ngày phát hành để kiểm tra thời hạn gửi dự án." };
  const rel = new Date(releaseIso + "T00:00:00");
  const days = Math.round((rel - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  // Round 704 — a date in the past is allowed (catalogue / already-out songs) but flagged; it is a warning only
  if (days < 0) return { level: "warn", past: true, text: `Ngày phát hành ${releaseIso.split("-").reverse().join("/")} đã qua. Bạn vẫn có thể gửi, nhưng hãy kiểm tra lại ngày phát hành.` };
  if (kind === "pitching") return days >= 14 ? { level: "ok", text: `Còn ${days} ngày — đủ thời hạn Pitching (tối thiểu 14 ngày).` } : { level: "warn", late: true, text: `Chỉ còn ${days} ngày — dự án Pitching cần gửi trước tối thiểu 14 ngày.` };
  if (kind === "release_only") { const w = workingDaysBetween(now, rel); return w >= 4 ? { level: "ok", text: `Còn ${w} ngày làm việc — đủ thời hạn (tối thiểu 04 ngày làm việc).` } : { level: "warn", text: `Chỉ còn ${w} ngày làm việc — dự án chỉ phát hành cần gửi trước tối thiểu 04 ngày làm việc.`, late: true }; }
  if (kind === "urgent") return { level: "info", text: "Dự án gấp: thời hạn tùy nền tảng — TikTok ≥ 24h, Zing MP3 ≥ 48h (chỉ nhận Thứ 2–Thứ 5), Meta ≥ 04 ngày." };
  return { level: "info", text: "Chọn loại dự án để kiểm tra thời hạn gửi." };
}

// Returns { ok:true, data } | { ok:false, error } (Vietnamese messages shown to the submitter).
export const REST_MIN = 3;   // not "only deliver": at least this many of promo + direction (+ design for pitching) must be filled
// Round 703 — "Loại dự án" IS the gate: only Pitching & hỗ trợ truyền thông fills promo / direction / design; "Chỉ phát hành" and "Dự án gấp" deliver only.
export const isDeliverOnly = (a) => !!a.project_kind && a.project_kind !== "pitching";
export const RELEASE_TYPE_KEYS = ["Single", "EP", "Album"];
export function restFilled(a) {
  const n = (o) => Object.values(o || {}).filter((v) => String(v || "").trim()).length;
  return n(a.promo) + n(a.direction) + (a.project_kind === "pitching" ? n(a.design) : 0);
}
// opts.intro = the combined page (also needs the label + type page)
export function cleanReleaseInfo(input, opts = {}) {
  const i = input || {};
  const kind = PROJECT_KINDS.some((k) => k.key === i.project_kind) ? i.project_kind : "";
  const genres = (Array.isArray(i.genres) ? i.genres : []).map((g) => str(g, 60)).filter(Boolean).slice(0, 3);
  const d = {
    song_title: str(i.song_title, 200), performer: str(i.performer, 200), composer: str(i.composer, 200), producer: str(i.producer, 200), mixer: str(i.mixer, 200), lyricist: str(i.lyricist, 200),
    genres, project_kind: kind,
    release_date: isoDate(str(i.release_date, 10)) ? str(i.release_date, 10) : "",
    release_time: /^\d{2}:\d{2}$/.test(str(i.release_time, 5)) ? str(i.release_time, 5) : "",
    preview_time: str(i.preview_time, 40), tiktok_demo_date: isoDate(str(i.tiktok_demo_date, 10)) ? str(i.tiktok_demo_date, 10) : "",
    lyrics: str(i.lyrics, 20000), profile_links: str(i.profile_links, 1500),
    files: mapLinks(i.files, FILE_FIELDS), promo: mapLinks(i.promo, PROMO_FIELDS), design: kind === "pitching" ? mapLinks(i.design, DESIGN_FIELDS) : {},
    direction: Object.fromEntries(DIRECTION_FIELDS.map((f) => [f.key, str(i.direction?.[f.key], 2000)])),
    contact_email: str(i.contact_email, 120),
    label: str(i.label, 120), release_type: RELEASE_TYPE_KEYS.includes(i.release_type) ? i.release_type : "",
    deliver_only: !!kind && kind !== "pitching",
  };
  // tracks: [{ title, composer, lyricist, producer, mixer, lyrics }] (an old plain string = just the title); empty detail = same as the main info
  d.tracks = d.release_type === "EP" || d.release_type === "Album" ? (Array.isArray(i.tracks) ? i.tracks : []).map((t) => {
    const o = typeof t === "string" ? { title: t } : (t || {});
    return { title: str(o.title, 200), composer: str(o.composer, 200), lyricist: str(o.lyricist, 200), producer: str(o.producer, 200), mixer: str(o.mixer, 200), lyrics: str(o.lyrics, 20000) };
  }).filter((t) => t.title).slice(0, 40) : [];
  d.late_ack = i.late_ack === true;
  if (d.deliver_only) { d.promo = {}; d.direction = {}; d.design = {}; }
  if (opts.intro) {
    if (!d.label) return { ok: false, error: "Vui lòng nhập Label (hoặc ghi Independent)." };
    if (!d.release_type) return { ok: false, error: "Vui lòng chọn loại hình: Single / EP / Album." };
    if ((d.release_type === "EP" || d.release_type === "Album") && d.tracks.length < 2) return { ok: false, error: `Vui lòng nhập tracklist của ${d.release_type} (ít nhất 2 track).` };
  }
  if (!d.song_title) return { ok: false, error: "Vui lòng nhập tên bài hát." };
  if (!d.performer) return { ok: false, error: "Vui lòng nhập nghệ sĩ trình bày." };
  if (!d.composer) return { ok: false, error: "Vui lòng nhập tên người sáng tác." };
  if (!kind) return { ok: false, error: "Vui lòng chọn loại dự án (Pitching / chỉ phát hành / gấp)." };
  if (!d.release_date) return { ok: false, error: "Vui lòng chọn ngày phát hành." };
  if (!d.files.audio || !d.files.artwork) return { ok: false, error: "Vui lòng thêm link hoặc tải lên File audio và File hình (artwork) — hai mục này bắt buộc." };
  const dlc = deadlineCheck(kind, d.release_date, opts.now);
  if (dlc.late && !d.late_ack) return { ok: false, error: "Ngày phát hành chưa đủ thời hạn gửi tối thiểu. Vui lòng tích xác nhận đã hiểu ở mục Thời gian phát hành." };
  if (!d.deliver_only && restFilled(d) < REST_MIN) return { ok: false, error: `Vui lòng điền ít nhất ${REST_MIN} mục ở phần Tư liệu truyền thông / Định hướng nội dung${d.project_kind === "pitching" ? " / Thiết kế" : ""} (hiện có ${restFilled(d)}), hoặc chọn loại dự án "Chỉ phát hành".` };
  if (d.contact_email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(d.contact_email)) return { ok: false, error: "Email liên hệ không hợp lệ." };
  const bad = [...Object.values(d.files), ...Object.values(d.promo), ...Object.values(d.design)].find((v) => v && !/^https?:\/\//i.test(v));
  if (bad) return { ok: false, error: "Các ô link phải bắt đầu bằng http:// hoặc https://." };
  return { ok: true, data: d };
}
