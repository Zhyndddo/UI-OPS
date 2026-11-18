// Round 611 — account linking + /mytasks for the Telegram bot.
//   private chat:  /link you@vieent.com  → a 6-digit code is EMAILED to that address → /code 123456 → linked
//                  /mytasks → your open tickets in this chat      /unlink → forget the link
//   internal group: /mytasks → the list is sent to the person's private chat (nothing is posted in the group)
// Proof of identity = being able to read mail at the app account's address, so nobody can claim someone else's tasks.
import { createHash, randomInt } from "crypto";
import { supabaseAdmin as db } from "./supabaseAdmin";
import { sendMail } from "./mail";
import { sendTelegramTo } from "./telegram";
import { TICKET_TYPE_LABELS } from "./teamTypes";
import { internalChatIds } from "./tgChats";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hash = (code, uid) => createHash("sha256").update(`${code}:${uid}:${process.env.TELEGRAM_WEBHOOK_SECRET || ""}`).digest("hex");
const CUTOFF = "2026-07-01";   // same "old data" cutoff as the Task Table
const TERMINAL = ["COMPLETE", "CANCELED", "REFUND"], TERMINAL_RC = ["Hoàn thành", "Từ chối", "Hủy"], TERMINAL_DESIGN = ["COMPLETE", "CANCEL"];
const undone = (key, st) => (key === "report_conflict" ? !TERMINAL_RC.includes(st) : key === "design" ? !TERMINAL_DESIGN.includes(st) : !TERMINAL.includes(st));
const LABEL_KEYS = ["tenBai", "title", "songTitle", "projectName", "name", "artist", "label"];
const labelOf = (d, id) => { for (const k of LABEL_KEYS) { const v = d?.[k]; if (typeof v === "string" && v.trim()) return v.trim(); } return `Ticket #${id}`; };

export async function linkedProfile(tgUserId) {
  const { data } = await db.from("tg_links").select("profile_id, dm_chat_id").eq("tg_user_id", tgUserId).maybeSingle();
  return data || null;
}

export async function startLink(tgUserId, dmChatId, emailRaw) {
  const email = String(emailRaw || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return "Cú pháp: /link email-đăng-nhập-app (vd: /link ten@vieent.com)";
  const { data: p } = await db.from("profiles").select("id, email, name").ilike("email", email).maybeSingle();
  // same answer whether or not the address exists, so the bot can't be used to probe who has an account
  const generic = "Nếu email này có tài khoản, mình vừa gửi mã 6 số tới đó (hiệu lực 10 phút). Nhắn: /code 123456";
  if (!p) return generic;
  const code = String(randomInt(100000, 1000000));
  await db.from("tg_link_codes").upsert({ tg_user_id: tgUserId, profile_id: p.id, dm_chat_id: dmChatId, code_hash: hash(code, tgUserId), expires_at: new Date(Date.now() + 10 * 60000).toISOString(), attempts: 0 });
  const r = await sendMail(p.email, "VIEENT OPS — mã liên kết Telegram", `<p>Mã liên kết Telegram của bạn: <b style="font-size:20px">${code}</b></p><p>Hiệu lực 10 phút. Nếu không phải bạn yêu cầu, hãy bỏ qua email này.</p>`);
  if (!r.sent) return "Chưa gửi được email (" + r.reason + "). Báo admin kiểm tra cấu hình SMTP.";
  return generic;
}

export async function confirmLink(tgUserId, codeRaw) {
  const code = String(codeRaw || "").trim();
  const { data: c } = await db.from("tg_link_codes").select("*").eq("tg_user_id", tgUserId).maybeSingle();
  if (!c || new Date(c.expires_at) < new Date()) return "Mã đã hết hạn hoặc chưa có. Gõ lại /link email.";
  if (c.attempts >= 5) { await db.from("tg_link_codes").delete().eq("tg_user_id", tgUserId); return "Nhập sai quá nhiều lần. Gõ lại /link email để lấy mã mới."; }
  if (hash(code, tgUserId) !== c.code_hash) { await db.from("tg_link_codes").update({ attempts: c.attempts + 1 }).eq("tg_user_id", tgUserId); return "Mã chưa đúng."; }
  await db.from("tg_links").delete().eq("profile_id", c.profile_id);   // one Telegram account per person
  const { error } = await db.from("tg_links").upsert({ tg_user_id: tgUserId, profile_id: c.profile_id, dm_chat_id: c.dm_chat_id });
  await db.from("tg_link_codes").delete().eq("tg_user_id", tgUserId);
  if (error) return "Lỗi khi liên kết: " + error.message;
  return "✅ Đã liên kết! Gõ /mytasks (ở đây hoặc trong nhóm) để nhận danh sách việc của bạn. Muốn mỗi sáng được nhắc riêng: gõ /alert.";
}

export async function unlink(tgUserId) {
  await db.from("tg_links").delete().eq("tg_user_id", tgUserId);
  return "Đã huỷ liên kết.";
}

// Round 650 — "tóm tắt việc của tôi" typed in words (not only /mytasks)
const plain = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
export function wantsMyTasks(text) {
  const t = plain(text).replace(/@\w+/g, " ");
  const me = /\b(toi|minh|em|anh|chi|my|me|mine)\b/.test(t);
  if (/\b(ai|nguoi nao|who)\b.{0,25}\b(tag|nhac|goi|mention)\b/.test(t) && me) return true;
  if (/\b(inbox|hop thu)\b/.test(t) && me) return true;
  return /\b(viec|task|tasks|ticket|tickets)\b/.test(t) && me && /(tom tat|tong hop|sum ?up|summary|liet ke|danh sach|list|co gi|nao|what|show|xem|check|con)/.test(t);
}

// Open tickets where this person is a PIC, grouped by ticket type, plus (Round 650) what the group chat says about them:
// requests Friday collected for them and messages that @tag them in the last 7 days.
export async function myTasksHtml(profileId) {
  const { data: prof } = await db.from("profiles").select("name").eq("id", profileId).maybeSingle();
  const { data: tabs } = await db.from("ticket_tabs").select("id, key, label");
  const byTab = Object.fromEntries((tabs || []).map((t) => [t.id, t]));
  const { data: rows, error } = await db.from("tickets").select("id, tab_id, status, data, created_at")
    .is("deleted_at", null).gte("created_at", CUTOFF).or(`pic_profile_id.eq.${profileId},pic_profile_ids.cs.{${profileId}}`).order("created_at", { ascending: false }).limit(500);
  if (error) return "Lỗi khi lấy việc: " + error.message;
  const groups = new Map();
  for (const t of rows || []) {
    const tab = byTab[t.tab_id]; if (!tab || !undone(tab.key, t.status)) continue;
    const g = groups.get(tab.key) || { label: TICKET_TYPE_LABELS[tab.key] || tab.label, items: [] };
    g.items.push(`${esc(labelOf(t.data, t.id))} <i>(${esc(t.status || "—")})</i>`); groups.set(tab.key, g);
  }
  const total = [...groups.values()].reduce((s, g) => s + g.items.length, 0);
  const L = [`<b>📥 Việc của bạn</b>${prof?.name ? " · " + esc(prof.name) : ""}`];
  if (!total) L.push("", "Không có ticket nào đang mở. 🎉");
  else {
    L.push(`${total} ticket đang mở`);
    for (const g of [...groups.values()].sort((a, b) => b.items.length - a.items.length)) {
      L.push("", `<b>${esc(g.label)}</b> (${g.items.length})`);
      g.items.slice(0, 8).forEach((s) => L.push("• " + s));
      if (g.items.length > 8) L.push(`… và ${g.items.length - 8} nữa`);
    }
  }
  try { L.push(...(await chatInbox(profileId))); } catch (e) { /* the chat part is a bonus: never break the ticket list */ }
  return L.join("\n");
}

const vnShort = (iso) => new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(5, 16).replace("T", " ").split(" ").map((x, i) => (i ? x : x.split("-").reverse().join("/"))).join(" ");
const KIND_VI = { upload: "Upload", phai_sinh: "Phái sinh", presave: "Link pre-save" };

// Round 650 — the chat side of "my tasks": requests Friday collected with this person as PIC (14 days) and messages @tagging them (7 days)
export async function chatInbox(profileId) {
  const out = [];
  const since14 = new Date(Date.now() - 14 * 86400000).toISOString(), since7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: its } = await db.from("tg_intakes").select("kind, title, label, release_date, created_at, poster_name").eq("pic_profile_id", profileId).neq("status", "dismissed").gte("created_at", since14).order("created_at", { ascending: false }).limit(8);
  if (its?.length) {
    out.push("", `<b>💬 Việc từ chat (14 ngày)</b> (${its.length})`);
    its.forEach((i) => out.push(`• ${esc(KIND_VI[i.kind] || i.kind)}: ${esc(i.title)}${i.release_date ? ` <i>(phát hành ${esc(i.release_date.split("-").reverse().join("/"))})</i>` : ""} — ${esc(i.poster_name || "?")}, ${esc(vnShort(i.created_at))}`));
  }
  const { data: lk } = await db.from("tg_links").select("tg_username").eq("profile_id", profileId).maybeSingle();
  const uname = String(lk?.tg_username || "").replace(/[^\w]/g, "");
  const chats = internalChatIds();
  if (uname && chats.length) {
    const { data: tags } = await db.from("tg_chat_log").select("sender, text, sent_at").in("chat_id", chats).ilike("text", `%@${uname}%`).gte("sent_at", since7).order("sent_at", { ascending: false }).limit(8);
    if (tags?.length) {
      out.push("", `<b>🔔 Ai tag bạn trong chat (7 ngày)</b> (${tags.length})`);
      tags.forEach((t) => out.push(`• ${esc(vnShort(t.sent_at))} <b>${esc(t.sender)}</b>: ${esc(String(t.text).replace(/\s+/g, " ").slice(0, 110))}`));
    }
  } else if (!uname) out.push("", "<i>Mình chưa biết @username Telegram của bạn — nhắn một tin trong nhóm là mình ghi nhận để liệt kê ai tag bạn.</i>");
  return out;
}

// remember a linked person's @username (called from group messages, at most every 6 h per person)
const seenUser = new Map();
export async function rememberUsername(tgUserId, username) {
  const u = String(username || "").trim();
  if (!u || !tgUserId) return;
  const key = `${tgUserId}:${u}`;
  if (Date.now() - (seenUser.get(key) || 0) < 6 * 3600000) return;
  seenUser.set(key, Date.now());
  await db.from("tg_links").update({ tg_username: u }).eq("tg_user_id", tgUserId);
}

export async function setTagAlerts(tgUserId, arg) {
  const a = String(arg || "").trim().toLowerCase() || "on";
  if (!["on", "off"].includes(a)) return "Cú pháp: /tagalert (bật) hoặc /tagalert off (tắt) — nhắn riêng khi có người tag bạn trong nhóm.";
  const { data, error } = await db.from("tg_links").update({ tag_dm: a === "on" }).eq("tg_user_id", tgUserId).select("tg_user_id");
  if (error) return "Lỗi: " + error.message;
  if (!data?.length) return "Bạn chưa liên kết. Gõ /link email-đăng-nhập-app trước.";
  return a === "on" ? "✅ Đã bật: ai tag bạn trong nhóm, mình nhắn riêng cho bạn. Tắt bằng /tagalert off." : "Đã tắt nhắn riêng khi bị tag. Bật lại bằng /tagalert.";
}

// Round 651 — someone @tags a linked person in the internal group → the tagged person gets it in their private chat
export async function pushTagDms(m, text, botName) {
  const sender = m.from?.id;
  const names = [...new Set([...String(text).matchAll(/@(\w{4,32})/g)].map((x) => x[1].toLowerCase()))].filter((n) => n !== String(botName || "").toLowerCase() && n !== String(m.from?.username || "").toLowerCase());
  if (!names.length) return;
  const { data: links } = await db.from("tg_links").select("tg_user_id, dm_chat_id, tg_username, tag_dm").or(names.map((n) => `tg_username.ilike.${n}`).join(","));
  const who = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || m.from?.username || "Ai đó";
  const idStr = String(m.chat.id);
  const url = idStr.startsWith("-100") ? `https://t.me/c/${idStr.slice(4)}/${m.message_id}` : null;
  for (const l of links || []) {
    if (l.tag_dm === false || l.tg_user_id === sender) continue;
    const body = `<b>🔔 ${esc(who)}</b> tag bạn trong <i>${esc(m.chat.title || "nhóm")}</i>:\n“${esc(String(text).replace(/\s+/g, " ").slice(0, 300))}”`;
    await sendTelegramTo(l.dm_chat_id, body, url ? { inline_keyboard: [[{ text: "Mở tin nhắn", url }]] } : undefined);
  }
}
