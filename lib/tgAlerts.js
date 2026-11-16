// Round 624 — private morning alerts, opt-in. A linked person types /alert in the private chat and then gets ONE DM each weekday morning
// with only THEIR overdue / near-deadline releases (as AR or workstation PIC) and their stuck tickets, or a short "nothing today". /alert off stops it.
import { supabaseAdmin as db } from "./supabaseAdmin";
import { loadStuck } from "./friday";
import { sendTelegramTo } from "./telegram";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const vnToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const NEAR = 7;

export async function setAlerts(tgUserId, arg) {
  const a = String(arg || "").trim().toLowerCase() || "on";   // "/alert" alone = on
  if (!["on", "off"].includes(a)) return "Cú pháp: /alert (bật) hoặc /alert off (tắt) — nhắc riêng mỗi sáng các việc của bạn.";
  const { data, error } = await db.from("tg_links").update({ alerts: a === "on" }).eq("tg_user_id", tgUserId).select("tg_user_id");
  if (error) return "Lỗi: " + error.message;
  if (!data?.length) return "Bạn chưa liên kết. Gõ /link email-đăng-nhập-app trước.";
  return a === "on" ? "✅ Đã bật: mỗi sáng thứ 2-6 mình nhắn riêng việc của bạn (kể cả khi không có gì). Tắt bằng /alert off." : "Đã tắt nhắc riêng. Bật lại bằng /alert.";
}

// digest.missingDataRows must already have loadOwners() applied (ownerId / opsIds).
export async function sendPicAlerts(supabase, digest) {
  const today = vnToday();
  const { data: links, error } = await supabase.from("tg_links").select("tg_user_id, profile_id, dm_chat_id, alerts, last_alert_on");
  if (error) return { error: error.message };
  const stuck = await loadStuck(supabase).catch(() => []);
  const rows = digest.missingDataRows || [];
  const { data: segData } = await supabase.from("profiles").select("id, segment").in("id", (links || []).map((l) => l.profile_id));
  const segOf = Object.fromEntries((segData || []).map((p) => [p.id, p.segment]));
  const res = { people: 0, sent: 0, blocked: 0, quiet: 0 };
  for (const lk of links || []) {
    if (lk.alerts !== true || lk.last_alert_on === today) continue;
    res.people += 1;
    const pid = lk.profile_id;
    const mine = rows.filter((r) => r.ownerId === pid || (r.opsIds || []).includes(pid));
    const over = mine.filter((r) => r.daysLeft <= 0), near = mine.filter((r) => r.daysLeft > 0 && r.daysLeft <= NEAR).sort((a, b) => a.daysLeft - b.daysLeft);
    const st = stuck.filter((s) => s.pics.includes(pid));
    const L = ["<b>☀️ Friday nhắc riêng cho bạn</b>"];
    if (!over.length && !near.length && !st.length) { res.quiet += 1; L.push("", "Sáng nay bạn không có release quá hạn / sắp đến hạn và không có ticket nào đứng yên. 🎉"); }
    if (near.length) { L.push("", `<b>⏰ Sắp đến hạn — ${near.length}</b>`); near.slice(0, 6).forEach((r) => L.push(`• ${esc(r.title)}: thiếu ${esc(r.missing.join(", "))} · còn ${r.daysLeft} ngày`)); }
    if (over.length) { L.push("", `<b>🔥 Quá hạn — ${over.length}</b>`); over.slice(0, 8).forEach((r) => L.push(`• ${esc(r.title)}: thiếu ${esc(r.missing.join(", "))}`)); if (over.length > 8) L.push(`… và ${over.length - 8} release nữa (gõ /missing trong nhóm)`); }
    if (st.length) { L.push("", `<b>🧱 Ticket đứng yên ≥7 ngày — ${st.length}</b>`); st.slice(0, 5).forEach((s) => L.push(`• ${esc(s.type)}: ${esc(s.label)} (${esc(s.status || "—")}) — ${s.days} ngày`)); }
    const seg = segOf[pid];   // Round 630: one line about the whole team
    if (seg) { const tr = rows.filter((r) => r.ownerSeg === seg || (r.opsSegs || []).includes(seg)); const to = tr.filter((r) => r.daysLeft <= 0).length, tn = tr.filter((r) => r.daysLeft > 0 && r.daysLeft <= NEAR).length; if (to || tn) L.push("", `👥 Team ${esc(seg)}: ${to} quá hạn · ${tn} sắp đến hạn (gõ /team để xem)`); }
    L.push("", "<i>/alert off để tắt · /mytasks xem toàn bộ ticket</i>");
    const r = await sendTelegramTo(lk.dm_chat_id, L.join("\n"));
    if (r.ok) { res.sent += 1; await supabase.from("tg_links").update({ last_alert_on: today }).eq("tg_user_id", lk.tg_user_id); }
    else if (r.blocked) res.blocked += 1;
  }
  return res;
}
