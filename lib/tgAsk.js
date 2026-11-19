// Round 630 — /ask: plain questions answered from the app's own data (rules only, no AI, nothing invented).
//   "<bài> thiếu gì" / "ai là PIC <bài>" / "tình trạng <bài>"   → one release: date, PICs, missing checklist items
//   "hôm nay | ngày mai | tuần này | tuần sau | tháng này phát hành" → releases in that range
//   "việc của <tên>" / "<tên> đang làm gì"                       → that person's open items
//   "quá hạn"                                                    → overdue releases
import { buildDigest, todayUTC } from "./digestData";
import { loadOwners, loadStuck, picText } from "./friday";
import { searchReleases, releaseUrl, allReleases } from "./tgTags";
import { norm } from "./chatParse";
import { loadPeople } from "./tgIntake";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const META = [["meta_audio", "Audio"], ["meta_artwork", "Artwork"], ["meta_working_files", "Working Files"], ["meta_lyric", "Lyric"], ["meta_mv", "MV"], ["meta_doc", "Metadata"]];
const FIELDS = "id, title, main_artist, release_date, ar_pic_profile_id, " + META.map((m) => m[0]).join(", ");
// Round 643c — Friday explains herself in Vietnamese. extra = the "other chat" (only /release, /status, /ask answer there).
export function helpHtml(extra) {
  const L = ["<b>👋 Mình là Friday — trợ lý của nhóm. Mình làm được:</b>", "",
    "<b>Hỏi nhanh: /ask &lt;câu hỏi&gt;</b>",
    "• <i>Nắng Ấm Xa Dần thiếu gì</i> / <i>ai là PIC Nắng Ấm Xa Dần</i> / <i>tình trạng …</i> — ngày phát hành, PIC, còn thiếu gì",
    "• <i>tuần này phát hành gì</i> · <i>ngày mai phát hành</i> · <i>tháng này phát hành</i>",
    "• <i>tuần này có bao nhiêu dự án</i> — mình chỉ bạn dùng /release tuần này",
    "• <i>việc của Hiếu</i> · <i>Tâm đang làm gì</i> — việc đang mở của một người",
    "• <i>quá hạn</i> — các bài đã quá hạn",
    "",
    "<b>Lệnh</b>",
    "• /release tuần này — bài chưa phát hành từ hôm nay đến Chủ nhật",
    "• /release sắp tới — bài chưa phát hành các tuần sau",
    "• /link — trả lời một tin nhắn bằng /link (hoặc /link tên bài) để mình gắn link bài hát: trang release, Drive, Share, LBM, Smartlink",
    "• /status — tóm tắt việc đang mở và dữ liệu còn thiếu"];
  if (!extra) L.push("• /missing — danh sách đầy đủ bài còn thiếu dữ liệu", "• /recap (hoặc /recap hôm qua) — tóm tắt chat nhóm", "• /team [tên team] — việc của team bạn hoặc team khác", "• /mytasks — gửi việc của bạn vào tin nhắn riêng", "• #tên bài hát — mình tìm bài trong app, bạn chọn đúng bài rồi mình gắn link", "", "<b>Nhắn riêng cho mình:</b> /link email-đăng-nhập-app → /code 123456 để liên kết; /alert để mỗi sáng nhận việc của bạn (/alert off để tắt).");
  L.push("", "<i>Mình trả lời bằng tiếng Việt và chỉ dùng dữ liệu có trong app, không đoán.</i>");
  return L.join("\n");
}
const dmy = (iso) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "?");
const missingOf = (r) => META.filter(([k]) => r[k] !== "true").map(([, l]) => l);
const daysTo = (iso) => Math.round((new Date(iso) - new Date(todayUTC())) / 86400000);
const addDays = (n) => new Date(new Date(todayUTC()).getTime() + n * 86400000).toISOString().slice(0, 10);

function range(q) {
  const t = todayUTC(), d = new Date(t), dow = (d.getUTCDay() + 6) % 7;   // Monday = 0
  if (/\bhom nay\b/.test(q)) return { label: "hôm nay", from: t, to: t };
  if (/\bngay mai\b/.test(q)) return { label: "ngày mai", from: addDays(1), to: addDays(1) };
  if (/\btuan nay\b/.test(q)) return { label: "tuần này", from: addDays(-dow), to: addDays(6 - dow) };
  if (/\btuan sau\b|\btuan toi\b/.test(q)) return { label: "tuần sau", from: addDays(7 - dow), to: addDays(13 - dow) };
  if (/\bthang nay\b/.test(q)) { const a = t.slice(0, 7); const last = new Date(Date.UTC(+a.slice(0, 4), +a.slice(5, 7), 0)).toISOString().slice(0, 10); return { label: "tháng này", from: a + "-01", to: last }; }
  return null;
}

async function releaseCard(db, ids) {
  const { data } = await db.from("releases").select(FIELDS).in("id", ids);
  const rows = (data || []).map((r) => ({ ...r, title: r.title, artist: r.main_artist }));
  await loadOwners(db, rows);
  return rows.map((r) => {
    const miss = missingOf(r), d = r.release_date ? daysTo(r.release_date) : null;
    const when = d === null ? "chưa có ngày" : d < 0 ? `${dmy(r.release_date)} (đã qua ${-d} ngày)` : d === 0 ? `${dmy(r.release_date)} (hôm nay)` : `${dmy(r.release_date)} (còn ${d} ngày)`;
    return [`<b><a href="${releaseUrl(r.id)}">${esc(r.title)}</a></b>${r.artist ? " — " + esc(r.artist) : ""}`, `• Phát hành: ${when}`, `• PIC: ${esc(picText(r))}`, `• ${miss.length ? "Còn thiếu: " + esc(miss.join(", ")) : "Checklist đủ ✅"}`].join("\n");
  });
}

// Round 652/655 — BATCH: first row = the request, every following row (a line break between them) = one song.
//   "cho tôi release date của các bài này\nNắng Ấm Xa Dần\nChào con\n…"  /  "PIC các bài này\n…"  /  "thiếu gì\n…"  /  bullets (- • 1.) are fine too.
// The request row is recognised by its words; with no recognisable request the default answer is date + PIC + what is missing.
const BULLET = /^\s*(?:[-•*·–—]|\d+[.)])\s*/;
const REQ_WORDS = /\b(release|phat hanh|ngay|date|pic|phu trach|thieu|missing|tinh trang|trang thai|status|ai la|ai lam|check|kiem tra|cho (?:toi|minh|em|anh|chi)|giup|hoi|cac bai|bai nay|nhung bai|danh sach)\b/;
const dmyFull = (iso) => (iso ? iso.split("-").reverse().join("/") : "chưa có ngày");

async function splitBatch(db, text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.replace(BULLET, "").trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const all = await allReleases(db);
  const titles = new Set(all.map((r) => norm(r.title)));
  const firstIsSong = titles.has(norm(lines[0]));
  const request = !firstIsSong && (REQ_WORDS.test(` ${norm(lines[0])} `) || lines.length >= 3) ? lines[0] : "";
  const items = (request ? lines.slice(1) : lines).slice(0, 20);
  if (items.length < 2 && !(request && items.length >= 1 && REQ_WORDS.test(` ${norm(request)} `) && lines.length >= 3)) return null;
  return { request, items, all };
}

async function batchReply(db, { request, items, all }) {
  const q = ` ${norm(request)} `;
  const wDate = /\b(release|phat hanh|ngay|date|ra mat)\b/.test(q), wPic = /\b(pic|phu trach|ai la|ai lam)\b/.test(q), wMiss = /\b(thieu|missing|con thieu)\b/.test(q);
  const any = wDate || wPic || wMiss;
  const f = { date: wDate || !any, pic: wPic || !any, miss: wMiss || !any };
  const L = [`<b>📋 ${items.length} bài${request ? " — " + esc(request) : ""}</b>`];
  for (const it of items) {
    const key = norm(it);
    let hits = all.filter((r) => norm(r.title) === key);
    if (!hits.length) hits = await searchReleases(db, it);
    if (!hits.length) { L.push(`• ${esc(it)}: <i>không tìm thấy trong app</i>`); continue; }
    const { data } = await db.from("releases").select(FIELDS).in("id", hits.slice(0, 4).map((r) => r.id));
    const rows = (data || []).map((r) => ({ ...r, artist: r.main_artist }));
    if (f.pic) await loadOwners(db, rows);
    for (const r of rows) {
      const real = r.release_date && r.release_date !== "2026-12-31";
      const d = real ? daysTo(r.release_date) : null;
      const note = d === null ? "" : d < 0 ? ` (đã qua ${-d} ngày)` : d === 0 ? " (hôm nay)" : ` (còn ${d} ngày)`;
      const parts = [];
      if (f.date) parts.push(`<b>${real ? dmyFull(r.release_date) : "chưa có ngày"}</b>${note}`);
      if (f.pic) parts.push(`PIC: ${esc(picText(r))}`);
      if (f.miss) { const m = missingOf(r); parts.push(m.length ? `thiếu: ${esc(m.join(", "))}` : "checklist đủ ✅"); }
      L.push(`• <a href="${releaseUrl(r.id)}">${esc(r.title)}</a>${r.artist ? " — " + esc(r.artist) : ""}: ${parts.join(" · ")}`);
    }
    if (hits.length > 1 && rows.length > 1) L.push("  <i>(nhiều bài cùng tên — kiểm tra đúng nghệ sĩ)</i>");
  }
  return L.join("\n");
}

export async function askFriday(db, text, extra = false) {
  if (/\r?\n/.test(String(text || "").trim())) {   // Round 655 — several rows = one batch
    const batch = await splitBatch(db, text);
    if (batch) return await batchReply(db, batch);
  }
  const q = ` ${norm(text)} `;
  if (q.trim().length < 3) return helpHtml(extra);

  // Round 659 — "tuần này có bao nhiêu dự án" (count questions about a week) -> point to /release, which prints the list AND the total.
  if (/\b(bao nhieu|may|tong so|tong|so luong|dem)\b/.test(q) && /\b(du an|bai|release|bai hat|ca khuc|project)\b/.test(q)) {
    if (/\btuan nay\b/.test(q)) return "📌 Câu này mình trả lời bằng lệnh <b>/release tuần này</b> nhé — mình liệt kê các bài chưa phát hành từ hôm nay đến Chủ nhật, kèm tổng số bài.";
    if (/\btuan sau\b|\btuan toi\b|\bsap toi\b/.test(q)) return "📌 Câu này mình trả lời bằng lệnh <b>/release sắp tới</b> nhé — mình liệt kê các bài chưa phát hành từ tuần sau trở đi, kèm tổng số bài.";
  }

  // 1) a person's items
  const pm = /viec cua ([a-z ]+?)(?: dang| the nao| la gi)? $/.exec(q) || /^ ([a-z ]+?) (?:dang lam gi|dang lam|con viec gi)\b/.exec(q);
  if (pm) {
    const toks = pm[1].trim().split(" ").filter(Boolean);
    const people = (await loadPeople(db)).filter((p) => toks.every((t) => norm(p.name).split(" ").includes(t)));
    if (!people.length) return `Mình không tìm thấy ai tên "${esc(pm[1].trim())}".`;
    if (people.length > 1) return "Có nhiều người khớp, nói rõ hơn nhé: " + people.slice(0, 6).map((p) => esc(p.name)).join(", ");
    const p = people[0], digest = await buildDigest(db);
    await loadOwners(db, digest.missingDataRows);
    const mine = digest.missingDataRows.filter((r) => r.ownerId === p.id || (r.opsIds || []).includes(p.id));
    const stuck = (await loadStuck(db).catch(() => [])).filter((s) => s.pics.includes(p.id));
    const over = mine.filter((r) => r.daysLeft <= 0), near = mine.filter((r) => r.daysLeft > 0 && r.daysLeft <= 7).sort((a, b) => a.daysLeft - b.daysLeft);
    const L = [`<b>📋 Việc của ${esc(p.name)}</b>`];
    if (!over.length && !near.length && !stuck.length) return L.concat(["", "Không có release quá hạn / sắp đến hạn và không có ticket đứng yên. 🎉"]).join("\n");
    if (near.length) { L.push("", `<b>⏰ Sắp đến hạn — ${near.length}</b>`); near.slice(0, 6).forEach((r) => L.push(`• ${esc(r.title)}: thiếu ${esc(r.missing.join(", "))} · còn ${r.daysLeft} ngày`)); }
    if (over.length) { L.push("", `<b>🔥 Quá hạn — ${over.length}</b>`); over.slice(0, 8).forEach((r) => L.push(`• ${esc(r.title)}: thiếu ${esc(r.missing.join(", "))}`)); if (over.length > 8) L.push(`… và ${over.length - 8} release nữa`); }
    if (stuck.length) { L.push("", `<b>🧱 Ticket đứng yên — ${stuck.length}</b>`); stuck.slice(0, 5).forEach((s) => L.push(`• ${esc(s.type)}: ${esc(s.label)} — ${s.days} ngày`)); }
    return L.join("\n");
  }

  // 2) releases in a time range
  const rg = range(q);
  if (rg && /(phat hanh|release|ra mat)/.test(q)) {
    const { data } = await db.from("releases").select(FIELDS).gte("release_date", rg.from).lte("release_date", rg.to).neq("release_date", "2026-12-31").order("release_date").limit(30);
    if (!data?.length) return `Không có release nào phát hành ${rg.label} (${dmy(rg.from)}${rg.from !== rg.to ? "–" + dmy(rg.to) : ""}).`;
    const L = [`<b>🗓 Phát hành ${rg.label}</b> — ${data.length} bài`];
    data.forEach((r) => { const m = missingOf(r); L.push(`• ${dmy(r.release_date)} <a href="${releaseUrl(r.id)}">${esc(r.title)}</a>${r.main_artist ? " — " + esc(r.main_artist) : ""} ${m.length ? "· thiếu " + esc(m.join(", ")) : "· đủ ✅"}`); });
    return L.join("\n");
  }

  // 3) overdue list
  if (/(qua han|overdue|tre han)/.test(q) && q.trim().split(" ").length <= 4) {
    const digest = await buildDigest(db);
    await loadOwners(db, digest.missingDataRows);
    const over = digest.missingDataRows.filter((r) => r.daysLeft <= 0);
    if (!over.length) return "Hiện không có release nào quá hạn. 🎉";
    const L = [`<b>🔥 Quá hạn — ${over.length} release</b> (gần hạn nhất trước)`];
    over.sort((a, b) => b.daysLeft - a.daysLeft).slice(0, 10).forEach((r) => L.push(`• ${esc(r.title)}: thiếu ${esc(r.missing.join(", "))} · PIC ${esc(picText(r))}`));
    if (over.length > 10) L.push(`… và ${over.length - 10} nữa, gõ /missing`);
    return L.join("\n");
  }

  // 4) one release by name: drop the question words, search whole words (accent-insensitive), shorten from the end if needed
  const stripped = q.replace(/\b(thieu gi|con thieu|ai la pic|pic cua|pic|tinh trang|trang thai|status|check|bai|release|cua|giup|minh|nhe|nha|hoi|la gi|gi|the nao|dang o dau)\b/g, " ").replace(/\s+/g, " ").trim();
  const words = stripped.split(" ").filter(Boolean);
  for (let n = words.length; n >= 1; n--) {
    const found = await searchReleases(db, words.slice(0, n).join(" "));
    if (!found.length) continue;
    const cards = await releaseCard(db, found.slice(0, 3).map((r) => r.id));
    return cards.join("\n\n") + (found.length > 3 ? `\n\n… còn ${found.length - 3} bài khớp nữa, gõ rõ tên hơn nhé.` : "");
  }
  return "Mình chưa hiểu câu này. 🙈\n\n" + helpHtml(extra);
}
