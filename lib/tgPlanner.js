// Round 660 — personal planner commands (all need the account link):
//   /remind <when> <text>   /remind list   /remind huỷ <số>      → a private message at that time
//   /watch <bài>   /watch   (list, with ✖ buttons)               → DMs at 3 days, 1 day and the release day with what is still missing
//   /cover <tên> đến <ngày>   /cover off                          → that person also receives MY tag / ticket / watch messages
//   /quiet 22-7 [cuối tuần]   /quiet off                          → no pushed DMs in those hours (they wait); /remind always fires on time
import { norm } from "./chatParse";
import { searchReleases, releaseUrl } from "./tgTags";
import { loadPeople } from "./tgIntake";
import { sendOne, queueDm, vnDate } from "./tgOutbox";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const META = [["meta_audio", "Audio"], ["meta_artwork", "Artwork"], ["meta_working_files", "Working Files"], ["meta_lyric", "Lyric"], ["meta_mv", "MV"], ["meta_doc", "Metadata"]];
const pad = (n) => String(n).padStart(2, "0");
const W = (p) => new RegExp(`(?<![\\p{L}\\d])(?:${p})(?![\\p{L}\\d])`, "iu");
const fmtVn = (d) => { const v = new Date(d.getTime() + 7 * 3600000); return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())} ${pad(v.getUTCDate())}/${pad(v.getUTCMonth() + 1)}`; };

// ---------- parse "mai 10h", "15/12 9:30", "sau 30 phút", "thứ 6 14h", "10:30" out of free text ----------
// returns { at: Date (real UTC instant), hasTime, rest } or null. `now` is injectable for tests.
export function parseWhen(input, now = new Date()) {
  let s = String(input || ""), found = false;
  const cut = (re) => { const m = re.exec(s); if (!m) return null; s = (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length)).replace(/\s+/g, " "); found = true; return m; };
  const vn = new Date(now.getTime() + 7 * 3600000);
  const base = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));   // today 00:00 on the VN wall clock
  const toReal = (wall) => new Date(wall.getTime() - 7 * 3600000);

  let m = cut(W("sau\\s+(\\d{1,3})\\s*(?:phút|phut|p|giờ|gio|h|tiếng|tieng)") ) || cut(W("in\\s+(\\d{1,3})\\s*(?:min|minutes?|m|hours?|h)"));
  if (m) {
    const n = parseInt(m[1], 10), hours = /^(?:sau|in)\s+\d+\s*(?:giờ|gio|h|tiếng|tieng|hours?)$/i.test(m[0].trim());
    const at = new Date(now.getTime() + n * (hours ? 3600000 : 60000));
    return { at, hasTime: true, rest: clean(s) };
  }
  let day = null;
  if (cut(W("hôm nay|hom nay|today|nay"))) day = new Date(base);
  else if (cut(W("ngày kia|ngay kia"))) day = new Date(base.getTime() + 2 * 86400000);
  else if (cut(W("ngày mai|ngay mai|mai|tomorrow"))) day = new Date(base.getTime() + 86400000);
  else if ((m = cut(W("(?:thứ|thu)\\s*([2-7])|t([2-7])|(chủ nhật|chu nhat|cn)")))) {
    const want = m[3] ? 0 : parseInt(m[1] || m[2], 10) - 1;   // thứ 2 = Monday = 1 … thứ 7 = Saturday = 6
    const wantDow = m[3] ? 0 : want, cur = base.getUTCDay();
    const add = ((wantDow - cur + 7) % 7) || 7;
    day = new Date(base.getTime() + add * 86400000);
  } else if ((m = cut(W("(\\d{1,2})[\\/\\-.](\\d{1,2})(?:[\\/\\-.](\\d{2,4}))?")))) {
    const dd = parseInt(m[1], 10), mm = parseInt(m[2], 10);
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
    let yy = m[3] ? parseInt(m[3], 10) : base.getUTCFullYear(); if (yy < 100) yy += 2000;
    day = new Date(Date.UTC(yy, mm - 1, dd));
    if (!m[3] && day < base) day = new Date(Date.UTC(yy + 1, mm - 1, dd));
  }
  let hh = null, mi = 0;
  const tm = cut(W("(\\d{1,2})\\s*(?::|h|g|giờ)\\s*(\\d{2})?(?:\\s*(sáng|sang|chiều|chieu|tối|toi|am|pm))?")) || null;
  if (tm) {
    hh = parseInt(tm[1], 10); mi = tm[2] ? parseInt(tm[2], 10) : 0;
    const part = String(tm[3] || "").toLowerCase();
    if (/^(chiều|chieu|tối|toi|pm)$/.test(part) && hh < 12) hh += 12;
    if (hh > 23 || mi > 59) return null;
    const pmHint = W("chiều|chieu|tối|toi").test(s);   // "chiều nay 3h", "3h chiều" said the other way round
    if (pmHint && hh >= 1 && hh < 12) hh += 12;
    while (cut(W("sáng|sang|chiều|chieu|tối|toi"))) { /* strip the part-of-day words from the text */ }
  }
  if (!found || (!day && hh === null)) return null;
  let wall;
  if (day) wall = new Date(day.getTime() + (hh === null ? 9 : hh) * 3600000 + mi * 60000);
  else { wall = new Date(base.getTime() + hh * 3600000 + mi * 60000); if (toReal(wall) <= now) wall = new Date(wall.getTime() + 86400000); }
  return { at: toReal(wall), hasTime: hh !== null, day: day ? day.toISOString().slice(0, 10) : null, rest: clean(s) };
}
const clean = (s) => s.replace(/^\s*(?:nhắc|nhac|remind|nhớ|nho|lúc|luc|vào|vao|at|để|de)\b[\s:,-]*/iu, "").replace(/^[\s:,.-]+|[\s:,.-]+$/g, "").replace(/\s+/g, " ").trim();

// ---------- /remind ----------
export async function cmdRemind(db, lk, chatId, arg, now = new Date()) {
  const a = String(arg || "").trim();
  const la = norm(a);
  if (!a || la === "list" || la === "ds" || la === "danh sach") {
    const { data } = await db.from("tg_remind_me").select("id, text, due_at").eq("profile_id", lk.profile_id).is("sent_at", null).order("due_at").limit(10);
    if (!data?.length) return { text: "Bạn chưa có lời nhắc nào.\nVí dụ: <code>/remind mai 10h kiểm tra pitching</code> · <code>/remind sau 30 phút gọi lại</code> · <code>/remind 15/12 9:00 nộp báo cáo</code>" };
    return { text: "<b>⏰ Lời nhắc của bạn</b>\n" + data.map((r) => `#${r.id} · ${fmtVn(new Date(r.due_at))} — ${esc(r.text)}`).join("\n") + "\n\nHuỷ: <code>/remind huỷ &lt;số&gt;</code>" };
  }
  const del = /^(?:huy|xoa|cancel|del)\s+#?(\d+)$/.exec(la);
  if (del) {
    const { data } = await db.from("tg_remind_me").delete().eq("id", parseInt(del[1], 10)).eq("profile_id", lk.profile_id).is("sent_at", null).select("id");
    return { text: data?.length ? `🗑 Đã huỷ lời nhắc #${del[1]}.` : "Không thấy lời nhắc đó (hoặc đã gửi rồi)." };
  }
  const w = parseWhen(a, now);
  if (!w || !w.rest) return { text: "Mình chưa hiểu thời gian hoặc nội dung. Ví dụ:\n<code>/remind mai 10h kiểm tra pitching</code>\n<code>/remind sau 30 phút gọi lại</code>\n<code>/remind thứ 6 14h họp</code>\n<code>/remind 15/12 9:00 nộp báo cáo</code>" };
  if (w.at.getTime() - now.getTime() < 30000) return { text: "Thời điểm đó đã qua rồi. Chọn một lúc trong tương lai nhé." };
  const { error } = await db.from("tg_remind_me").insert({ profile_id: lk.profile_id, dm_chat_id: lk.dm_chat_id || chatId, text: w.rest.slice(0, 500), due_at: w.at.toISOString() });
  if (error) return { text: "Lỗi: " + esc(error.message) };
  return { text: `⏰ Ok! Mình sẽ nhắc bạn lúc <b>${fmtVn(w.at)}</b>${w.hasTime || !w.day ? "" : " (mặc định 09:00)"}: ${esc(w.rest)}` };
}

export async function tickRemind(db) {
  const { data } = await db.from("tg_remind_me").select("id, dm_chat_id, text").is("sent_at", null).lte("due_at", new Date().toISOString()).order("due_at").limit(50);
  let sent = 0;
  for (const r of data || []) {
    const out = await sendOne(r.dm_chat_id, `⏰ <b>Nhắc bạn:</b> ${esc(r.text)}`);
    await db.from("tg_remind_me").update({ sent_at: new Date().toISOString() }).eq("id", r.id);
    if (out.ok) sent += 1;
  }
  return { sent };
}

// ---------- /watch ----------
const daysTo = (iso) => Math.round((new Date(iso) - new Date(vnDate())) / 86400000);
export async function cmdWatch(db, lk, arg) {
  const a = String(arg || "").trim().replace(/^#/, "");
  if (!a || /^(list|ds)$/i.test(a)) {
    const { data } = await db.from("tg_watch").select("id, title, release_id").eq("profile_id", lk.profile_id).order("created_at");
    if (!data?.length) return { text: "Bạn chưa theo dõi bài nào. Gõ <code>/watch tên bài</code> — mình nhắn trước 3 ngày, 1 ngày và đúng ngày phát hành, kèm những gì còn thiếu." };
    return { text: "<b>👀 Bài bạn đang theo dõi</b>\n" + data.map((w) => `• <a href="${releaseUrl(w.release_id)}">${esc(w.title)}</a>`).join("\n") + "\n\nBấm để bỏ theo dõi:", markup: { inline_keyboard: data.map((w) => [{ text: "✖ " + String(w.title).slice(0, 40), callback_data: `wx:${w.id}` }]) } };
  }
  const found = await searchReleases(db, a);
  if (!found.length) return { text: `Mình không tìm thấy bài nào khớp “${esc(a)}” (gõ đủ từng từ của tên bài hoặc nghệ sĩ).` };
  if (found.length === 1) return { text: await addWatch(db, lk.profile_id, found[0]) };
  return { text: "Có nhiều bài khớp, chọn đúng bài:", markup: { inline_keyboard: found.slice(0, 6).map((r) => [{ text: `${r.title}${r.artist ? " — " + r.artist : ""}`.slice(0, 60), callback_data: `wt:${r.id}` }]) } };
}
async function addWatch(db, profileId, r) {
  const { error } = await db.from("tg_watch").upsert({ profile_id: profileId, release_id: r.id, title: r.title, stages_sent: [] }, { onConflict: "profile_id,release_id", ignoreDuplicates: true });
  if (error) return "Lỗi: " + esc(error.message);
  return `👀 Đã theo dõi <a href="${releaseUrl(r.id)}">${esc(r.title)}</a>${r.release_date ? " (phát hành " + esc(String(r.release_date).split("-").reverse().slice(0, 2).join("/")) + ")" : ""}. Mình sẽ nhắn trước 3 ngày, 1 ngày và đúng ngày phát hành.`;
}
export async function handleWatchCb(db, cb, linkedProfile) {
  const [kind, id] = String(cb.data || "").split(":");
  const lk = await linkedProfile(cb.from.id).catch(() => null);
  if (!lk) return { answer: "Bạn chưa liên kết tài khoản." };
  if (kind === "wx") { await db.from("tg_watch").delete().eq("id", parseInt(id, 10)).eq("profile_id", lk.profile_id); return { answer: "Đã bỏ theo dõi", edit: "✖ Đã bỏ theo dõi bài đó." }; }
  const { data: r } = await db.from("releases").select("id, title, main_artist, release_date").eq("id", id).maybeSingle();
  if (!r) return { answer: "Không tìm thấy bài." };
  return { answer: "Đã theo dõi 👀", edit: await addWatch(db, lk.profile_id, { id: r.id, title: r.title, artist: r.main_artist, release_date: r.release_date }) };
}

// tick: from 08:00 VN, send each watcher the stage that is due (≤3 days, ≤1 day, release day); drop the watch once the day has passed
export async function tickWatch(db) {
  const hour = new Date(Date.now() + 7 * 3600000).getUTCHours();
  if (hour < 8) return { sent: 0 };
  const { data: ws } = await db.from("tg_watch").select("*").limit(1000);
  if (!ws?.length) return { sent: 0 };
  const { data: rels } = await db.from("releases").select("id, title, main_artist, release_date, " + META.map((m) => m[0]).join(", ")).in("id", [...new Set(ws.map((w) => w.release_id))]);
  const by = Object.fromEntries((rels || []).map((r) => [r.id, r]));
  let sent = 0;
  for (const w of ws) {
    const r = by[w.release_id];
    if (!r || !r.release_date) continue;
    const d = daysTo(r.release_date);
    if (d < 0) { await db.from("tg_watch").delete().eq("id", w.id); continue; }
    const stage = d === 0 ? "d0" : d <= 1 ? "d1" : d <= 3 ? "d3" : null;
    if (!stage || (w.stages_sent || []).includes(stage)) continue;
    const miss = META.filter(([k]) => r[k] !== "true").map(([, l]) => l);
    const when = d === 0 ? "HÔM NAY" : d === 1 ? "ngày mai" : `còn ${d} ngày`;
    const html = `<b>👀 ${esc(r.title)}</b>${r.main_artist ? " — " + esc(r.main_artist) : ""}\nPhát hành ${when}. ${miss.length ? "Còn thiếu: " + esc(miss.join(", ")) : "Checklist đủ ✅"}\n<a href="${releaseUrl(r.id)}">Mở release</a>`;
    const out = await queueDm(w.profile_id, html, { kind: "watch", ref: r.id });
    if (out.sent || out.queued) { sent += 1; await db.from("tg_watch").update({ stages_sent: [...(w.stages_sent || []), stage] }).eq("id", w.id); }
  }
  return { sent };
}

// ---------- /cover ----------
export async function cmdCover(db, lk, arg) {
  const a = String(arg || "").trim();
  const la = norm(a);
  if (!a || la === "off" || la === "tat" || la === "huy") {
    if (a) { await db.from("tg_cover").delete().eq("profile_id", lk.profile_id); return { text: "✅ Đã tắt thay thế — tin của bạn chỉ về bạn." }; }
    const { data } = await db.from("tg_cover").select("cover_profile_id, until").eq("profile_id", lk.profile_id).gte("until", vnDate());
    if (!data?.length) return { text: "Hiện không ai đang thay bạn. Gõ <code>/cover tên đến 20/12</code> (tin tag, ticket mới và nhắc bài của bạn cũng gửi cho người đó). Tắt: <code>/cover off</code>." };
    const { data: ps } = await db.from("profiles").select("id, name").in("id", data.map((d) => d.cover_profile_id));
    const nm = Object.fromEntries((ps || []).map((p) => [p.id, p.name]));
    return { text: "<b>🤝 Đang thay bạn</b>\n" + data.map((d) => `• ${esc(nm[d.cover_profile_id] || "?")} đến ${esc(d.until.split("-").reverse().slice(0, 2).join("/"))}`).join("\n") };
  }
  const m = /^(.*?)\s+(?:đến|den|tới|toi|until|to)\s+(.+)$/iu.exec(a);
  if (!m) return { text: "Cú pháp: <code>/cover tên đến 20/12</code> hoặc <code>/cover tên đến thứ 6</code>. Tắt: <code>/cover off</code>." };
  const w = parseWhen(m[2]);
  if (!w || !w.day) return { text: "Mình chưa hiểu ngày kết thúc. Ví dụ: 20/12, mai, thứ 6." };
  const toks = norm(m[1]).split(" ").filter(Boolean);
  const people = (await loadPeople(db)).filter((p) => p.id !== lk.profile_id && toks.every((t) => norm(p.name).split(" ").includes(t)));
  if (!people.length) return { text: `Mình không tìm thấy ai tên “${esc(m[1])}”.` };
  if (people.length > 1) return { text: "Có nhiều người khớp, nói rõ hơn: " + people.slice(0, 6).map((p) => esc(p.name)).join(", ") };
  const p = people[0];
  const { error } = await db.from("tg_cover").upsert({ profile_id: lk.profile_id, cover_profile_id: p.id, until: w.day }, { onConflict: "profile_id,cover_profile_id" });
  if (error) return { text: "Lỗi: " + esc(error.message) };
  const { data: theirLink } = await db.from("tg_links").select("profile_id").eq("profile_id", p.id).maybeSingle();
  return { text: `🤝 ${esc(p.name)} sẽ nhận bản sao tin tag, ticket mới và nhắc bài của bạn đến hết ${esc(w.day.split("-").reverse().slice(0, 2).join("/"))}.${theirLink ? "" : "\n⚠️ " + esc(p.name) + " chưa liên kết Telegram với mình nên chưa nhận được — nhờ họ nhắn riêng /link."}` };
}

// ---------- /quiet ----------
export async function cmdQuiet(db, tgUserId, arg) {
  const a = norm(arg);
  const { data: lk } = await db.from("tg_links").select("quiet_from, quiet_to, quiet_weekend").eq("tg_user_id", tgUserId).maybeSingle();
  if (!lk) return "Bạn chưa liên kết. Gõ /link email-đăng-nhập-app trước.";
  if (!a) return lk.quiet_from == null && !lk.quiet_weekend ? "Chưa đặt giờ yên tĩnh. Ví dụ: <code>/quiet 22-7</code> (không nhắn từ 22h đến 7h) hoặc <code>/quiet 22-7 cuối tuần</code>. Tắt: <code>/quiet off</code>." : `🌙 Giờ yên tĩnh: ${lk.quiet_from != null ? lk.quiet_from + "h–" + lk.quiet_to + "h" : "không"}${lk.quiet_weekend ? " · cả cuối tuần" : ""}. Tin sẽ chờ đến hết giờ này rồi mới gửi.`;
  if (a === "off" || a === "tat") { await db.from("tg_links").update({ quiet_from: null, quiet_to: null, quiet_weekend: false }).eq("tg_user_id", tgUserId); return "✅ Đã tắt giờ yên tĩnh."; }
  const weekend = /cuoi tuan|weekend|\bt7\b/.test(a);
  const m = /(\d{1,2})\s*(?:h|g|:)?\s*(?:-|den|toi|to)\s*(\d{1,2})/.exec(a);
  if (!m && !weekend) return "Cú pháp: <code>/quiet 22-7</code> hoặc <code>/quiet 22-7 cuối tuần</code> hoặc <code>/quiet off</code>.";
  const patch = { quiet_weekend: weekend };
  if (m) { const f = parseInt(m[1], 10), t = parseInt(m[2], 10); if (f > 23 || t > 23 || f === t) return "Giờ không hợp lệ (0-23, hai mốc khác nhau)."; patch.quiet_from = f; patch.quiet_to = t; } else { patch.quiet_from = null; patch.quiet_to = null; }
  await db.from("tg_links").update(patch).eq("tg_user_id", tgUserId);
  return `🌙 Ok! ${m ? `Không nhắn từ ${patch.quiet_from}h đến ${patch.quiet_to}h` : ""}${weekend ? (m ? " và cả" : "Không nhắn") + " cuối tuần" : ""}. Tin tag/ticket/theo dõi sẽ chờ đến hết giờ yên tĩnh. Lời nhắc /remind vẫn đúng giờ.`;
}
