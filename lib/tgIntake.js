// Round 616 — Friday collects the team's request messages as data (see lib/chatParse.js).
// A card is posted under the message; the poster, a tagged @user or the named PIC (via their /link) confirms it with one tap.
// Intakes feed the recap and the "chat says sent, app doesn't have it" check. Nothing here writes tickets or releases.
import { parseIntake } from "./chatParse";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const KIND = { upload: "Upload", phai_sinh: "Phái sinh", presave: "Link pre-save" };
let peopleCache = { at: 0, rows: [] };
export async function loadPeople(db) {
  if (Date.now() - peopleCache.at < 5 * 60000 && peopleCache.rows.length) return peopleCache.rows;
  const { data } = await db.from("profiles").select("id, name");
  peopleCache = { at: Date.now(), rows: (data || []).filter((p) => p.name) };
  return peopleCache.rows;
}

const fmtRel = (it) => {
  if (!it.release_date && !it.release_text) return null;
  const d = it.release_date ? it.release_date.split("-").reverse().slice(0, 2).join("/") + "/" + it.release_date.slice(0, 4) : "";
  return [it.release_time, d].filter(Boolean).join(" ") || it.release_text;
};

export function renderCard(it, footer) {
  const pic = it.pic_name ? esc(it.pic_name) : it.pic_text ? esc(it.pic_text) + " (chưa rõ ai)" : "—";
  const L = [`<b>📥 ${KIND[it.kind] || it.kind}</b> — mình ghi nhận như sau:`];
  L.push(`• PIC: ${pic}`);
  if (it.label) L.push(`• Label: ${esc(it.label)}`);
  L.push(`• Tên: <b>${esc(it.title)}</b>`);
  if (it.artists?.length) L.push(`• Nghệ sĩ: ${esc(it.artists.join(", "))}`);
  const rel = fmtRel(it); if (rel) L.push(`• Phát hành: ${esc(rel)}`);
  if (it.link) L.push(`• Link: ${esc(it.link)}`);
  if (it.notes) L.push(`• Ghi chú: ${esc(it.notes)}`);
  L.push("", footer || "Đúng chưa? Người gửi hoặc PIC được tag bấm giúp.");
  return L.join("\n");
}
export const cardButtons = (id) => ({ inline_keyboard: [[{ text: "✅ Đúng", callback_data: `ok:${id}` }, { text: "🗑 Bỏ", callback_data: `no:${id}` }]] });

// Parse one group message; when it looks like an intake, store it and return the stored row (else null).
export async function captureIntake(db, m, text) {
  const people = await loadPeople(db);
  const p = parseIntake(text, people);
  if (!p) return null;
  const poster = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || m.from?.username || "?";
  const row = {
    chat_id: String(m.chat.id), thread_id: m.is_topic_message ? m.message_thread_id || null : null, msg_id: m.message_id,
    poster_tg_id: m.from?.id || null, poster_name: poster, kind: p.kind, pic_text: p.pic_text, pic_profile_id: p.pic_profile?.id || null, pic_name: p.pic_profile?.name || null,
    allowed_usernames: p.mentions.map((u) => u.toLowerCase()), label: p.label, title: p.title, artists: p.artists, release_text: p.release?.text || null,
    release_date: p.release?.date || null, release_time: p.release?.time || null, link: p.link, links: p.links, notes: p.notes, raw: text.slice(0, 2000),
  };
  const { data, error } = await db.from("tg_intakes").upsert(row, { onConflict: "chat_id,msg_id", ignoreDuplicates: true }).select().maybeSingle();
  if (error || !data) return null;
  return data;
}

// Telegram callback_query ("✅ Đúng" / "🗑 Bỏ"). Returns { answer, edit } for the webhook to send.
export async function handleDecision(db, cb, linkedProfile) {
  const [act, idRaw] = String(cb.data || "").split(":");
  const id = parseInt(idRaw, 10);
  if (!["ok", "no"].includes(act) || !id) return { answer: "?" };
  const { data: it } = await db.from("tg_intakes").select("*").eq("id", id).maybeSingle();
  if (!it) return { answer: "Không tìm thấy bản ghi." };
  if (it.status !== "pending") return { answer: "Đã xử lý rồi." };
  const uname = String(cb.from?.username || "").toLowerCase();
  let allowed = cb.from?.id === it.poster_tg_id || (uname && (it.allowed_usernames || []).includes(uname));
  if (!allowed && it.pic_profile_id) { const lk = await linkedProfile(cb.from.id).catch(() => null); allowed = !!lk && lk.profile_id === it.pic_profile_id; }
  if (!allowed) return { answer: "Chỉ người gửi hoặc PIC được tag mới bấm được." };
  const who = [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(" ") || uname || "?";
  const status = act === "ok" ? "confirmed" : "dismissed";
  await db.from("tg_intakes").update({ status, confirmed_by: who, decided_at: new Date().toISOString() }).eq("id", id);
  return { answer: act === "ok" ? "Đã xác nhận ✅" : "Đã bỏ 🗑", edit: renderCard(it, act === "ok" ? `✅ Đã xác nhận bởi ${esc(who)}` : `🗑 Đã bỏ bởi ${esc(who)}`) };
}

// ---- recap / Friday helpers ----
export async function loadIntakes(db, fromIso, toIso) {
  const { data } = await db.from("tg_intakes").select("*").gte("created_at", fromIso).lt("created_at", toIso).neq("status", "dismissed").order("created_at");
  return data || [];
}
export function renderIntakeBlock(rows) {
  if (!rows.length) return "";
  const L = ["<b>📥 Dự án / yêu cầu gửi trong chat</b>"];
  rows.slice(0, 15).forEach((r) => {
    const rel = fmtRel(r);
    L.push(`• ${KIND[r.kind] || r.kind}: <b>${esc(r.title)}</b>${r.artists?.length ? " — " + esc(r.artists.join(", ")) : ""}${r.pic_name || r.pic_text ? " · PIC " + esc(r.pic_name || r.pic_text) : ""}${rel ? " · " + esc(rel) : ""} ${r.status === "confirmed" ? "✅" : "⏳ chưa ai xác nhận"}`);
  });
  if (rows.length > 15) L.push(`… và ${rows.length - 15} mục nữa`);
  return L.join("\n");
}
export function renderIntakeHtml(rows) {
  if (!rows.length) return "";
  const tr = rows.map((r) => `<tr style="border-bottom:1px solid #eee"><td>${esc(KIND[r.kind] || r.kind)}</td><td>${esc(r.title)}</td><td>${esc((r.artists || []).join(", "))}</td><td>${esc(r.pic_name || r.pic_text || "")}</td><td>${esc(fmtRel(r) || "")}</td><td>${r.status === "confirmed" ? "✅" : "⏳"}</td></tr>`).join("");
  return `<h3 style="margin-top:24px">Dự án / yêu cầu gửi trong chat</h3><table cellpadding="6" style="border-collapse:collapse;width:100%"><tr style="text-align:left;border-bottom:1px solid #ccc"><th>Loại</th><th>Tên</th><th>Nghệ sĩ</th><th>PIC</th><th>Phát hành</th><th></th></tr>${tr}</table>`;
}

// Intakes of the last 3 days (upload / phái sinh) whose title is not found in the app's releases yet.
export async function loadIntakeGaps(db) {
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data } = await db.from("tg_intakes").select("kind, title, artists, pic_name, pic_text, created_at").gte("created_at", since).in("kind", ["upload", "phai_sinh"]).neq("status", "dismissed");
  const gaps = [];
  for (const it of data || []) {
    const safe = it.title.replace(/[%,()]/g, " ").trim();
    if (safe.length < 4) continue;
    const { data: hit } = await db.from("releases").select("id").ilike("title", `%${safe}%`).limit(1);
    if (!hit || !hit.length) gaps.push(it);
  }
  return gaps;
}
