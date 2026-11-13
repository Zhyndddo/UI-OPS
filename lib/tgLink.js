// Round 611 — account linking + /mytasks for the Telegram bot.
//   private chat:  /link you@vieent.com  → a 6-digit code is EMAILED to that address → /code 123456 → linked
//                  /mytasks → your open tickets in this chat      /unlink → forget the link
//   internal group: /mytasks → the list is sent to the person's private chat (nothing is posted in the group)
// Proof of identity = being able to read mail at the app account's address, so nobody can claim someone else's tasks.
import { createHash, randomInt } from "crypto";
import { supabaseAdmin as db } from "./supabaseAdmin";
import { sendMail } from "./mail";
import { TICKET_TYPE_LABELS } from "./teamTypes";

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
  return "✅ Đã liên kết! Gõ /mytasks (ở đây hoặc trong nhóm) để nhận danh sách việc của bạn.";
}

export async function unlink(tgUserId) {
  await db.from("tg_links").delete().eq("tg_user_id", tgUserId);
  return "Đã huỷ liên kết.";
}

// Open tickets where this person is a PIC, grouped by ticket type. Workstation rows are not included yet.
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
  if (!total) { L.push("", "Không có ticket nào đang mở. 🎉"); return L.join("\n"); }
  L.push(`${total} ticket đang mở`);
  for (const g of [...groups.values()].sort((a, b) => b.items.length - a.items.length)) {
    L.push("", `<b>${esc(g.label)}</b> (${g.items.length})`);
    g.items.slice(0, 8).forEach((s) => L.push("• " + s));
    if (g.items.length > 8) L.push(`… và ${g.items.length - 8} nữa`);
  }
  return L.join("\n");
}
