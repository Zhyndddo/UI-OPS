// Round 631b — /release tuần này | /release sắp tới : every release that has NOT come out yet (no filter by team / label / PIC).
//   tuần này  = from today to this Sunday (Mon-Sun week, VN date)
//   sắp tới   = everything after this Sunday, grouped by week, soonest first
// Releases with the team's placeholder date (2026-12-31 = "no date yet") are left out and mentioned in one line.
import { releaseUrl } from "./tgTags";
import { norm } from "./chatParse";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const DUMMY = "2026-12-31";
const META = [["meta_audio", "Audio"], ["meta_artwork", "Artwork"], ["meta_working_files", "Working Files"], ["meta_lyric", "Lyric"], ["meta_mv", "MV"], ["meta_doc", "Metadata"]];
const FIELDS = "id, title, main_artist, release_date, " + META.map((m) => m[0]).join(", ");
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MAX_ROWS = 300;   // Round 661: long lists are paged by the sender, so the old 60-row cap is lifted
const dmy = (iso) => iso.split("-").reverse().slice(0, 2).join("/");
const addDays = (iso, n) => new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
export const vnToday = (now = new Date()) => new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const mondayOf = (iso) => addDays(iso, -((new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7));
export const HELP_RELEASE = "Gõ <b>/release tuần này</b> (từ hôm nay đến Chủ nhật) hoặc <b>/release sắp tới</b> (các tuần sau). Chỉ tính bài chưa phát hành.";

export function releaseWhich(arg) {
  const q = ` ${norm(arg)} `;
  if (/\btuan nay\b/.test(q)) return "week";
  if (/\bsap toi\b|\btuan sau\b|\btuan toi\b|\bupcoming\b/.test(q)) return "upcoming";
  return null;
}

const line = (r) => {
  const miss = META.filter(([k]) => r[k] !== "true").map(([, l]) => l);
  const wd = WD[new Date(r.release_date + "T00:00:00Z").getUTCDay()];
  return `• ${wd} ${dmy(r.release_date)} · <a href="${releaseUrl(r.id)}">${esc(r.title)}</a>${r.main_artist ? " — " + esc(r.main_artist) : ""} ${miss.length ? "· thiếu " + esc(miss.join(", ")) : "· đủ ✅"}`;
};

export async function releaseList(db, which, now = new Date()) {
  const today = vnToday(now), sunday = addDays(mondayOf(today), 6);
  const q = db.from("releases").select(FIELDS, { count: "exact" }).neq("release_date", DUMMY).order("release_date").order("title").limit(MAX_ROWS);
  const { data, count, error } = which === "week" ? await q.gte("release_date", today).lte("release_date", sunday) : await q.gt("release_date", sunday);
  if (error) throw new Error(error.message);
  const rows = data || [];
  const head = which === "week" ? `🗓 <b>Phát hành tuần này</b> (${dmy(today)}–${dmy(sunday)}, chưa phát hành)` : `🗓 <b>Sắp phát hành</b> (từ ${dmy(addDays(sunday, 1))}, chưa phát hành)`;
  if (!rows.length) return `${head}\n\nKhông có bài nào.`;
  const L = [`${head} — ${count ?? rows.length} bài`];
  if (which === "week") rows.forEach((r) => L.push(line(r)));
  else {
    let wk = "";
    rows.forEach((r) => {
      const m = mondayOf(r.release_date);
      if (m !== wk) { wk = m; L.push("", `<b>Tuần ${dmy(m)}–${dmy(addDays(m, 6))}</b>`); }
      L.push(line(r));
    });
  }
  if ((count ?? rows.length) > rows.length) L.push("", `… và ${count - rows.length} bài nữa (hiển thị ${rows.length} bài gần nhất).`);
  L.push("", "<i>Không tính bài chưa có ngày (ngày tạm 31/12/2026).</i>");
  return L.join("\n");
}
