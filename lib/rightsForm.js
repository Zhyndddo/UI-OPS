// Round 633 — shared pieces of the public rights-declaration form (browser + server).
export const RIGHTS = [
  { key: "master", vi: "Quyền Bản ghi", en: "Master Rights", checklist: "master" },
  { key: "performing", vi: "Quyền Biểu diễn", en: "Performing Rights", checklist: "vocal" },
  { key: "publishing", vi: "Quyền Tác giả", en: "Publishing Rights", checklist: "author" },
];
// PDF page geometry shared by the drawing code and the Dropbox Sign signature field (mock-up units; the page is 595 pt wide).
export const PDF_MW = 1660;
export const PDF_MH = 2344;            // normal page
export const PDF_MH_HOLDER = 2560;     // taller page when a right holder must sign (extra band at the bottom)
export const AUDIT_H = 960;             // extra band at the bottom with the verification record (Round 639)
export const HOLDER_BOX = { x: 700, y: 2440, w: 829, h: 100 };
export const META_FIELDS = [
  { key: "song_title", label: "Tên bài hát" },
  { key: "composer", label: "Sáng tác" },
  { key: "performer", label: "Trình bày" },
  { key: "producer", label: "Producer" },
  { key: "mixer", label: "Mixer" },
];
const str = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);

// Returns { ok:true, data } or { ok:false, error } (Vietnamese messages, shown to the submitter).
export function cleanDeclaration(input) {
  const i = input || {};
  // "Có thời hạn" = two date pickers (from / to); stored as one readable string in term_note (no new column)
  const isoOk = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x));
  const vn = (x) => x.split("-").reverse().join("/");
  const tf = isoOk(str(i.term_from, 10)) ? str(i.term_from, 10) : "", tt = isoOk(str(i.term_to, 10)) ? str(i.term_to, 10) : "";
  if (i.term === "limited" && tf && tt && tf > tt) return { ok: false, error: "Thời hạn đăng tải: ngày bắt đầu phải trước ngày kết thúc." };
  const termNote = i.term === "limited" && (tf || tt) ? (tf && tt ? `${vn(tf)} – ${vn(tt)}` : tf ? `Từ ${vn(tf)}` : `Đến ${vn(tt)}`) : str(i.term_note, 200);
  const data = {
    song_title: str(i.song_title, 200), composer: str(i.composer, 200), performer: str(i.performer, 200),
    producer: str(i.producer, 200), mixer: str(i.mixer, 200),
    owned: {}, licensed: {},
    proof: str(i.proof, 500),
    platforms: i.platforms === "all" || i.platforms === "some" ? i.platforms : "",
    platforms_note: str(i.platforms_note, 300),
    term: i.term === "perpetual" || i.term === "limited" ? i.term : "",
    term_note: termNote,
    signer_name: str(i.signer_name, 120),
    licensed_until: {},
    holder_name: str(i.holder_name, 120),
    holder_email: str(i.holder_email, 120),
    contact_email: str(i.contact_email, 120),
  };
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(data.contact_email)) return { ok: false, error: "Vui lòng nhập email hợp lệ của bạn — mã xác nhận sẽ được gửi về email này." };
  if (!data.song_title) return { ok: false, error: "Vui lòng nhập tên bài hát." };
  for (const r of RIGHTS) {
    data.owned[r.key] = !!i.owned?.[r.key];
    data.licensed[r.key] = !!i.licensed?.[r.key];
    const until = str(i.licensed_until?.[r.key], 10);
    if (data.licensed[r.key] && /^\d{4}-\d{2}-\d{2}$/.test(until) && !isNaN(Date.parse(until))) data.licensed_until[r.key] = until;
    if (data.owned[r.key] && data.licensed[r.key]) return { ok: false, error: `${r.vi}: chỉ chọn "sở hữu" hoặc "được cấp phép", không chọn cả hai.` };
    if (!data.owned[r.key] && !data.licensed[r.key]) return { ok: false, error: `Thiếu xác nhận cho ${r.vi}. Phải xác nhận đủ 3 quyền.` };
  }
  const anyLicensed = RIGHTS.some((r) => data.licensed[r.key]);
  // right-holder e-signature (Dropbox Sign) is OPTIONAL: both fields filled = a signing request is sent, both empty = skipped
  if ((data.holder_name || data.holder_email) && (!data.holder_name || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(data.holder_email))) return { ok: false, error: "Chủ sở hữu ký điện tử: nhập đủ họ tên và email hợp lệ, hoặc để trống cả hai." };
  if (!anyLicensed) { data.holder_name = ""; data.holder_email = ""; }
  if (anyLicensed && !data.platforms) return { ok: false, error: "Vui lòng chọn nền tảng được cấp phép." };
  if (!data.term) return { ok: false, error: "Vui lòng chọn thời hạn đăng tải bản ghi." };
  if (!data.signer_name) data.signer_name = data.performer || data.composer || "";   // the mock-up has no separate name field
  return { ok: true, data };
}
