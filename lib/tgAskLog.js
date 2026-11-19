// Round 661 — what people ask Friday: every /ask is logged (60 days), a miss gets suggestion buttons (the tapped one is remembered),
// 👍/👎 under answers, and /misses (admin / dev) lists what she could not answer.
import { norm } from "./chatParse";
import { releaseList } from "./tgRelease";
import { askFriday, helpHtml } from "./tgAsk";
import { myTasksHtml } from "./tgLink";

export const MISS_PREFIX = "Mình chưa hiểu câu này";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function logAsk(db, { chatId, userId, question, outcome }) {
  const { data } = await db.from("tg_ask_log").insert({ chat_id: String(chatId ?? ""), tg_user_id: userId || null, question: String(question || "").slice(0, 500), outcome }).select("id").maybeSingle();
  return data?.id || null;
}

const SUGGEST = [["week", "📅 Phát hành tuần này"], ["over", "🔥 Quá hạn"], ["me", "👤 Việc của tôi"], ["help", "❓ Hướng dẫn"]];
export const suggestMarkup = (id) => ({ inline_keyboard: [SUGGEST.slice(0, 2), SUGGEST.slice(2)].map((row) => row.map(([k, label]) => ({ text: label, callback_data: `ak:${id}:${k}` }))) });
export const feedbackMarkup = (id) => ({ inline_keyboard: [[{ text: "👍", callback_data: `fb:${id}:1` }, { text: "👎", callback_data: `fb:${id}:-1` }]] });

// /ask text → { text, markup }. Logs the question; a miss comes back with suggestion buttons, any other answer with 👍/👎.
export async function askAndLog(db, arg, m, extra) {
  const text = await askFriday(db, arg, extra);
  const miss = text.startsWith(MISS_PREFIX);
  const batch = /\r?\n/.test(String(arg || "").trim());
  const id = await logAsk(db, { chatId: m.chat.id, userId: m.from?.id, question: arg, outcome: miss ? "miss" : text.startsWith("📌") ? "redirect" : batch ? "batch" : "ok" }).catch(() => null);
  if (!id) return { text };
  if (miss) return { text: text.split("\n\n")[0] + "\nBạn muốn mình làm gì? Chọn một nút (hoặc hỏi lại bằng cách khác):", markup: suggestMarkup(id) };
  return { text, markup: feedbackMarkup(id) };
}

// callback_query "ak:<logId>:<key>" and "fb:<logId>:<1|-1>"  → { answer, edit?, send?, sendMarkup? }
export async function handleAskCb(db, cb, linkedProfile) {
  const [kind, idRaw, arg] = String(cb.data || "").split(":");
  const id = parseInt(idRaw, 10);
  if (!id) return { answer: "?" };
  if (kind === "fb") {
    const rating = arg === "1" ? 1 : -1;
    await db.from("tg_ask_log").update({ rating }).eq("id", id);
    return { answer: rating === 1 ? "Cảm ơn bạn! 🙏" : "Mình ghi nhận để cải thiện nhé 🙏", clearButtons: true };
  }
  await db.from("tg_ask_log").update({ picked: arg }).eq("id", id);
  if (arg === "week") return { answer: "Đang lấy…", send: await releaseList(db, "week"), clearButtons: true };
  if (arg === "over") return { answer: "Đang lấy…", send: await askFriday(db, "quá hạn"), clearButtons: true };
  if (arg === "help") return { answer: "OK", send: helpHtml(false), clearButtons: true };
  const lk = await linkedProfile(cb.from.id).catch(() => null);
  if (!lk) return { answer: "Bạn chưa liên kết tài khoản — nhắn riêng cho mình /link email-đăng-nhập-app.", clearButtons: false };
  return { answer: "Mình gửi vào tin nhắn riêng nhé", dm: { chat: lk.dm_chat_id, text: await myTasksHtml(lk.profile_id) }, clearButtons: true };
}

// /misses — admin / dev only: the questions Friday could not answer in the last 14 days (grouped), and answers rated 👎
export async function missesHtml(db, profileId) {
  const { data: p } = await db.from("profiles").select("role").eq("id", profileId).maybeSingle();
  if (!p || !["admin", "dev"].includes(p.role)) return "Lệnh này chỉ dành cho admin / dev.";
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: rows } = await db.from("tg_ask_log").select("question, outcome, rating, picked, created_at").gte("created_at", since).or("outcome.eq.miss,rating.eq.-1").order("created_at", { ascending: false }).limit(300);
  if (!rows?.length) return "Không có câu nào Friday trả lời sai trong 14 ngày qua. 🎉";
  const groups = new Map();
  for (const r of rows) { const k = norm(r.question).slice(0, 80); const g = groups.get(k) || { q: r.question, n: 0, down: 0, picks: {} }; g.n += 1; if (r.rating === -1) g.down += 1; if (r.picked) g.picks[r.picked] = (g.picks[r.picked] || 0) + 1; groups.set(k, g); }
  const L = ["<b>🧩 Câu Friday chưa trả lời tốt (14 ngày)</b>"];
  [...groups.values()].sort((a, b) => b.n - a.n).slice(0, 25).forEach((g) => L.push(`• ×${g.n} “${esc(g.q.replace(/\s+/g, " ").slice(0, 100))}”${g.down ? ` · 👎${g.down}` : ""}${Object.keys(g.picks).length ? " · chọn: " + esc(Object.entries(g.picks).map(([k, v]) => `${k}×${v}`).join(", ")) : ""}`));
  return L.join("\n");
}
