// Round 633 — shared pieces of the public rights-declaration form (browser + server).
export const RIGHTS = [
  { key: "master", vi: "Quyền Bản ghi", en: "Master Rights", checklist: "master" },
  { key: "performing", vi: "Quyền Biểu diễn", en: "Performing Rights", checklist: "vocal" },
  { key: "publishing", vi: "Quyền Tác giả", en: "Publishing Rights", checklist: "author" },
];
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
  const data = {
    song_title: str(i.song_title, 200), composer: str(i.composer, 200), performer: str(i.performer, 200),
    producer: str(i.producer, 200), mixer: str(i.mixer, 200),
    owned: {}, licensed: {},
    proof: str(i.proof, 500),
    platforms: i.platforms === "all" || i.platforms === "some" ? i.platforms : "",
    platforms_note: str(i.platforms_note, 300),
    term: i.term === "perpetual" || i.term === "limited" ? i.term : "",
    term_note: str(i.term_note, 200),
    signer_name: str(i.signer_name, 120),
    licensed_until: {},
    contact_email: str(i.contact_email, 120),
  };
  if (data.contact_email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(data.contact_email)) return { ok: false, error: "Email không hợp lệ. Để trống nếu không cần nhận qua email." };
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
  if (anyLicensed && !data.platforms) return { ok: false, error: "Vui lòng chọn nền tảng được cấp phép." };
  if (!data.term) return { ok: false, error: "Vui lòng chọn thời hạn đăng tải bản ghi." };
  if (!data.signer_name) data.signer_name = data.performer || data.composer || "";   // the mock-up has no separate name field
  return { ok: true, data };
}
