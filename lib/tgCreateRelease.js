// Round 710 — Friday can create a release from the group chat, confirm-first.
//   /new TITLE - ARTIST - 25/12 [19h30] - LABEL      -> a card; press ✅ to create (AR / admin / superadmin / dev only)
//   an upload request for a song that is not in the app -> Friday asks "tạo release không?" (same card flow)
// A missing label is asked with buttons (labels from the Labels list + the artist name). Nothing is written until a permitted person presses a button.
// Only title, artist, date and label are needed (same as the app's form); everything else keeps the table defaults, like Quick Create.
import { norm, parseRelease } from "./chatParse";
import { didPrefixFor } from "./didHelpers";
import { createReleaseFolder } from "./releaseDriveFolder";
import { findExistingLabel } from "./nameDedupe";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SITE = "https://internal.vieent.com";
const ROLES = ["dev", "admin", "superadmin"];
const vnToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const dmy = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

// "/new" arguments -> { title, artists, date, time, label }.  Segments are separated by " - " (also – — |); the segment with a d/m date is the date,
// the first = title, the second = artist(s), the remaining one = label.
export function parseNewArgs(arg, nowYear = new Date().getFullYear()) {
  const segs = String(arg || "").split(/\s+[-–—|]\s+/).map((s) => s.trim()).filter(Boolean);
  const out = { title: "", artists: [], date: null, time: null, label: "" };
  const rest = [];
  for (const s of segs) {
    const hasDate = /\d{1,2}\s*[./]\s*\d{1,2}/.test(s);
    if (hasDate && !out.date) { const r = parseRelease(s, nowYear); if (r.date) { out.date = r.date; out.time = r.time; continue; } }
    rest.push(s);
  }
  if (rest[0]) out.title = rest[0];
  if (rest[1]) out.artists = rest[1].split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b)\s*/i).map((x) => x.trim()).filter(Boolean);
  if (rest[2]) out.label = rest.slice(2).join(" - ").replace(/^label\s*[:：]?\s*/i, "").trim();
  return out;
}

// EP / Album are NOT created from Telegram in full: Friday makes a draft from whatever was sent and sends the app link (Round 711).
// "EP" must be written in capitals (so the Vietnamese word "ép" never counts); "album" in any case.
export const multiKind = (it) => { const t = `${it.title || ""} ${it.raw || ""}`; return /(^|[^A-Za-z0-9])EP([^A-Za-z0-9]|$)/.test(t) ? "EP" : /(^|[^A-Za-z0-9])album([^A-Za-z0-9]|$)/i.test(t) ? "Album" : ""; };
export const DUMMY_DATE = "2026-12-31";   // the team's "no date yet" placeholder
export const draftOf = (it) => ({
  title: String(it.title || "").trim(), artists: Array.isArray(it.artists) ? it.artists.filter(Boolean) : [],
  date: it.release_date || null, time: it.release_time || null, label: String(it.label || "").trim(), multi: multiKind(it),
});

function cardText(d, extra = "") {
  const L = [d.multi ? `➕ <b>Tạo bản nháp ${d.multi}?</b>` : "➕ <b>Tạo release mới?</b>", `• Tên: <b>${esc(d.title || "—")}</b>`, `• Nghệ sĩ: ${d.artists.length ? esc(d.artists.join(", ")) : "—"}`,
    `• Ngày phát hành: ${d.date ? esc(dmy(d.date)) + (d.time ? " " + esc(d.time) : " 19:00") : "—"}`, `• Label: ${d.label ? esc(d.label) : "—"}`];
  if (d.date && d.date < vnToday()) L.push("⚠️ Ngày phát hành đã qua — kiểm tra lại nhé.");
  if (extra) L.push("", extra);
  return L.join("\n");
}
const missingOf = (d) => (d.multi ? [!d.title && "tên"] : [!d.title && "tên bài", !d.artists.length && "nghệ sĩ", !d.date && "ngày phát hành"]).filter(Boolean);
const MULTI_NOTE = (d) => `Đây là <b>${d.multi}</b> — mình không tạo đầy đủ từ chat. Mình chỉ tạo <b>bản nháp</b> từ những gì bạn đã gửi (phần thiếu để tạm), rồi gửi link app để bạn điền tiếp tracklist và thông tin còn lại.`;
const EXAMPLE = "<code>/new Tên bài - Nghệ sĩ - 25/12 19h - Label</code>";
const yesNo = (id) => ({ inline_keyboard: [[{ text: "✅ Tạo release", callback_data: `cr:y:${id}` }, { text: "❌ Không", callback_data: `cr:n:${id}` }]] });

// Label choices as buttons: labels matching what was typed, else the labels used by the latest releases; plus the artist name.
async function labelChoices(db, typed) {
  let rows = [];
  const q = String(typed || "").replace(/^HĐ\s*-\s*/i, "").replace(/[%_\\,()]/g, " ").trim();
  if (q.length >= 2) { const { data } = await db.from("labels").select("id, label_name").ilike("label_name", `%${q}%`).limit(6); rows = data || []; }
  if (!rows.length) {
    const since = new Date(Date.now() - 120 * 86400000).toISOString();
    const { data: rel } = await db.from("releases").select("label").gte("created_at", since).limit(600);
    const cnt = new Map(); (rel || []).forEach((r) => { if (r.label) cnt.set(r.label, (cnt.get(r.label) || 0) + 1); });
    const names = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((x) => x[0]);
    if (names.length) { const { data } = await db.from("labels").select("id, label_name").in("label_name", names); rows = (data || []).sort((a, b) => (cnt.get(b.label_name) || 0) - (cnt.get(a.label_name) || 0)).slice(0, 6); }
  }
  return rows;
}
async function labelCard(db, id, d) {
  const rows = await labelChoices(db, d.label);
  const btn = rows.map((r) => [{ text: String(r.label_name).slice(0, 40), callback_data: `cr:l:${id}:${r.id}` }]);
  if (d.artists.length) btn.push([{ text: `🎤 ${d.artists[0].slice(0, 30)} (tên nghệ sĩ)`, callback_data: `cr:l:${id}:art` }]);
  if (d.label) btn.push([{ text: `Giữ nguyên “${d.label.slice(0, 28)}”`, callback_data: `cr:l:${id}:raw` }]);
  btn.push([{ text: "❌ Không", callback_data: `cr:n:${id}` }]);
  return { text: cardText(d, d.label ? "Chọn đúng Label (hoặc giữ như đã gõ):" : "Chưa có <b>Label</b> — chọn trong danh sách Label, hoặc dùng tên nghệ sĩ:"), markup: { inline_keyboard: btn } };
}

// The card posted for a stored intake row (kind create_release, or an upload request whose song is not in the app).
export async function buildCreateCard(db, it) {
  const d = draftOf(it);
  const miss = missingOf(d);
  if (miss.length) return { text: cardText(d, `Thiếu: <b>${esc(miss.join(", "))}</b>. Gõ lại đủ: ${EXAMPLE}`), markup: null };
  return { text: cardText(d, (d.multi ? MULTI_NOTE(d) + "\n" : "") + "Chỉ <b>AR / admin</b> đã /link mới bấm được."), markup: d.multi ? { inline_keyboard: [[{ text: `✅ Tạo bản nháp ${d.multi}`, callback_data: `cr:y:${it.id}` }, { text: "❌ Không", callback_data: `cr:n:${it.id}` }]] } : yesNo(it.id) };
}

// /new typed in the group: store it (kind create_release) and return the card
export async function startNew(db, m, argText) {
  const d = parseNewArgs(argText);
  if (!String(argText || "").trim()) return { text: `Cách dùng: ${EXAMPLE}\nVí dụ: <code>/new Hai Chữ Yên Bình - Cao Sĩ Hùng - 19.12 19h - Tên Label</code>\nMình sẽ hỏi lại trước khi tạo.`, markup: null };
  const poster = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || m.from?.username || "?";
  const row = {
    chat_id: String(m.chat.id), thread_id: m.is_topic_message ? m.message_thread_id || null : null, msg_id: m.message_id, poster_tg_id: m.from?.id || null, poster_name: poster,
    kind: "create_release", status: "confirmed", confirmed_by: "tự động", decided_at: new Date().toISOString(), allowed_usernames: [],
    label: d.label || null, title: d.title || "(chưa có tên)", artists: d.artists, release_date: d.date, release_time: d.time, release_text: null, raw: String(argText).slice(0, 2000),
  };
  const { data, error } = await db.from("tg_intakes").upsert(row, { onConflict: "chat_id,msg_id", ignoreDuplicates: true }).select().maybeSingle();
  if (error || !data) return { text: "Mình chưa ghi nhận được yêu cầu này (có thể chưa chạy SQL của Round 710). Bạn thử lại sau nhé.", markup: null };
  return buildCreateCard(db, data);
}

// An upload request whose song is not in the app: ask whether to create it (buttons run the same flow as /new)
export async function buildCreateAsk(db, it) {
  const d = draftOf(it);
  if (d.title.length < 3) return null;
  const miss = missingOf(d);
  const head = `📤 Yêu cầu Upload <b>${esc(d.title)}</b>${d.artists.length ? " — " + esc(d.artists.join(", ")) : ""}: mình chưa thấy bài này trong app.`;
  if (miss.length) return { text: head + `\nMuốn tạo release thì cần thêm: <b>${esc(miss.join(", "))}</b>. Gõ: ${EXAMPLE}`, markup: null };
  return { text: head + "\n" + cardText(d, (d.multi ? MULTI_NOTE(d) + "\n" : "") + `Bạn có muốn mình tạo ${d.multi ? "bản nháp" : "release này"} không? Chỉ <b>AR / admin</b> đã /link mới bấm được.`), markup: { inline_keyboard: [[{ text: d.multi ? `➕ Có, tạo bản nháp ${d.multi}` : "➕ Có, tạo release", callback_data: `cr:y:${it.id}` }, { text: "❌ Không", callback_data: `cr:n:${it.id}` }]] } };
}

const relLink = (r) => `<a href="${SITE}/releases/${r.id}">${esc(r.title)}${r.main_artist ? " — " + esc(String(r.main_artist).split(",")[0]) : ""}</a> (${esc(r.did)}, ${esc(dmy(r.release_date))})`;

async function duplicateOf(db, d) {
  const main = d.artists.join(", ");
  const prefix = didPrefixFor(d.title, main, d.date);
  if (prefix) { const { data } = await db.from("releases").select("id, did, title, main_artist, release_date").like("did", `${prefix}-%`).limit(1); if (data?.length) return data[0]; }
  const esc2 = (x) => String(x).replace(/[%_\\]/g, (c) => "\\" + c);
  const { data } = await db.from("releases").select("id, did, title, main_artist, release_date").ilike("title", esc2(d.title)).ilike("main_artist", esc2(main)).limit(1);
  return data?.[0] || null;
}

async function createNow(db, it, d, lk, who, intakeKind) {
  const placeholders = [];   // EP / Album draft: whatever was not sent gets the team's placeholder, and the message lists it
  const main = d.artists.join(", ") || (placeholders.push("nghệ sĩ"), "TBU");
  const date = d.date || (placeholders.push("ngày phát hành"), DUMMY_DATE);
  const label = d.label || (placeholders.push("label"), d.artists[0] || "TBU");
  const realDate = date !== DUMMY_DATE;
  const { data: rel, error } = await db.from("releases").insert({
    title: d.title, main_artist: main, release_date: date, release_time: d.time || "19:00", label, release_category: "New Release", single_album_ep: d.multi || "Single",
    gate_goi_ho_tro_truyen_thong: "update", created_by_profile_id: lk.profile_id,
  }).select("id, did, title, main_artist, release_date, drive_link").single();
  if (error || !rel) return { answer: "Không tạo được.", send: `⚠️ Chưa tạo được release: ${esc(error?.message || "lỗi không rõ")}. Bạn tạo trong app giúp nhé.` };
  try { await db.from("audit_log").insert({ actor: lk.profile_id, action: "create", entity: "release", entity_id: rel.id, field: "via", after_val: `Friday (Telegram) — ${who}` }); } catch (e) { /* best-effort */ }
  let folder = "";
  if (!realDate) folder = "\n📁 Chưa tạo folder Drive vì chưa có ngày phát hành — thêm ngày trong app rồi bấm “Tạo folder Drive” trên trang release.";
  else try { const f = await createReleaseFolder(db, rel.id); folder = f.ok ? `\n📁 Folder Drive: ${esc(f.url)}` : `\n📁 Chưa tạo được folder Drive (${esc(f.error || "")}) — dùng nút trên trang release.`; } catch (e) { folder = "\n📁 Chưa tạo được folder Drive — dùng nút trên trang release."; }
  const rows = [];
  if (intakeKind === "upload") rows.push([{ text: "📤 Gửi Upload trên web", callback_data: `ua:y:${it.id}:${rel.id}` }]);
  const draftNote = d.multi ? `\n📝 Đây là <b>bản nháp ${d.multi}</b>${placeholders.length ? ` — đang để tạm: ${esc(placeholders.join(", "))}` : ""}. Mở link để điền tracklist và thông tin còn lại:\n${SITE}/releases/${rel.id}` : "\nLoại: Single (đổi sang EP/Album, thêm thông tin khác trong app).";
  return { answer: "Đã tạo ✅", edit: `✅ Đã tạo ${d.multi ? `bản nháp ${d.multi}` : "release"} ${relLink(rel)} — bởi ${esc(who)}.${folder}${draftNote}`, editMarkup: rows.length ? { inline_keyboard: rows } : { inline_keyboard: [] } };
}

// Buttons: cr:y:<intake> (run) · cr:l:<intake>:<labelId|ind|raw> (label picked) · cr:f:<intake> (create even though a similar release exists) · cr:n:<intake>
export async function handleCreateCb(db, cb, linkedProfile) {
  const [, act, idRaw, arg] = String(cb.data || "").split(":");
  const id = parseInt(idRaw, 10);
  if (!["y", "l", "f", "n"].includes(act) || !id) return { answer: "?" };
  const { data: it } = await db.from("tg_intakes").select("*").eq("id", id).maybeSingle();
  if (!it) return { answer: "Không tìm thấy yêu cầu." };
  const who = [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(" ") || cb.from?.username || "?";
  if (act === "n") return { answer: "Ok, không tạo.", edit: `➕ Tạo release <b>${esc(it.title)}</b> — ${esc(who)} chọn không tạo. Không có gì thay đổi.` };
  const lk = await linkedProfile(cb.from.id).catch(() => null);
  if (!lk) return { answer: "Bạn cần /link tài khoản app trước (nhắn riêng cho Friday)." };
  const { data: me } = await db.from("profiles").select("role, segment").eq("id", lk.profile_id).maybeSingle();
  if (!(me && (ROLES.includes(me.role) || me.segment === "AR"))) return { answer: "Chỉ AR / admin mới tạo release được." };

  let d = draftOf(it);
  if (act === "l") {   // a label was picked
    let name = "";
    if (arg === "ind" || arg === "art") name = d.artists[0] || "";   // "ind" = older buttons
    else if (arg === "raw") name = d.label;
    else { const { data: l } = await db.from("labels").select("label_name").eq("id", arg).maybeSingle(); name = l?.label_name || ""; }
    if (!name) return { answer: "Không tìm thấy label." };
    d = { ...d, label: name };
    await db.from("tg_intakes").update({ label: name }).eq("id", id);
  }
  const miss = missingOf(d);
  if (miss.length) return { answer: "Thiếu thông tin.", send: `⚠️ Chưa tạo được vì thiếu: ${esc(miss.join(", "))}. Gõ lại: ${EXAMPLE}` };
  if (!d.label && !d.multi) { const c = await labelCard(db, id, d); return { answer: "Chọn label", edit: c.text, editMarkup: c.markup }; }
  if (d.label && !/^HĐ\s*-/.test(d.label)) {   // a typed label: use the Labels list's spelling when it exists
    try { const ex = await findExistingLabel(db, d.label); if (ex?.label_name) d = { ...d, label: ex.label_name }; } catch (e) { /* keep as typed */ }
  }
  if (act !== "f" && d.artists.length) {
    const dup = await duplicateOf(db, d);
    if (dup) return { answer: "Đã có bài tương tự.", edit: `⚠️ Trong app đã có bài giống: ${relLink(dup)}.\nTạo thêm một release mới nữa?`, editMarkup: { inline_keyboard: [[{ text: "➕ Vẫn tạo mới", callback_data: `cr:f:${id}` }, { text: "❌ Không", callback_data: `cr:n:${id}` }]] } };
  }
  return createNow(db, it, d, lk, who, it.kind);
}
