// Round 601 — tiny Telegram sender + digest text. The bot token and group id live ONLY in Vercel env vars:
//   TELEGRAM_BOT_TOKEN        from @BotFather (/newbot)
//   TELEGRAM_INTERNAL_CHAT_ID the internal group's id (negative number, e.g. -1001234567890)
//   TELEGRAM_THREAD_ID        optional — only if the group has Topics and you want one specific topic
import { todayUTC } from "./digestData";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function telegramConfigured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_INTERNAL_CHAT_ID);
}

// Telegram allows 4096 characters per message — split on line breaks so a long digest becomes 2-3 messages, never cut mid-line.
function splitText(text, max = 3800) {
  const out = [];
  let cur = "";
  for (const line of String(text).split("\n")) {
    if (cur && (cur + "\n" + line).length > max) { out.push(cur); cur = line; } else cur = cur ? cur + "\n" + line : line;
  }
  if (cur) out.push(cur);
  return out;
}

export async function sendTelegram(html) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_INTERNAL_CHAT_ID;
  if (!token || !chat) return { ok: false, error: "Chưa cấu hình TELEGRAM_BOT_TOKEN / TELEGRAM_INTERNAL_CHAT_ID trên Vercel." };
  const thread = process.env.TELEGRAM_THREAD_ID ? parseInt(process.env.TELEGRAM_THREAD_ID, 10) : null;
  let sent = 0;
  for (const part of splitText(html)) {
    const body = { chat_id: chat, text: part, parse_mode: "HTML", disable_web_page_preview: true };
    if (thread) body.message_thread_id = thread;
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return { ok: false, sent, error: `Telegram: ${j.description || r.status}` };
    sent += 1;
  }
  return { ok: true, sent };
}

const SLOTS = {
  morning: { title: "☀️ Tổng hợp buổi sáng", full: true },
  noon: { title: "🌤️ Đầu giờ chiều — còn lại", full: false },
  evening: { title: "🌇 18:00 — chốt ngày", full: false },
};
export const slotOf = (s) => (SLOTS[s] ? s : null);

// digest = buildDigest() from lib/digestData.js. Only non-zero rows are shown so the message stays short.
export function renderDigestTelegram(digest, slot) {
  const cfg = SLOTS[slot] || SLOTS.morning;
  const lines = [`<b>${cfg.title}</b> · ${esc(digest.date)}`];
  if (cfg.full) {
    lines.push("", `<b>Hôm qua (${esc(digest.activityDate)})</b>`);
    if (digest.ticketRows.length) digest.ticketRows.forEach((r) => lines.push(`• ${esc(r.label)}: gửi ${r.sent} · xong ${r.completed}`));
    else lines.push("• Không có hoạt động ticket.");
  }
  const tk = digest.ticketNotDoneRows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  lines.push("", "<b>Ticket chưa xong</b>");
  if (tk.length) tk.forEach((r) => lines.push(`• ${esc(r.label)}: <b>${r.count}</b>`)); else lines.push("• Không còn ticket tồn.");
  const ws = digest.workstationRows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  lines.push("", "<b>Workstation chưa xong</b>");
  if (ws.length) ws.forEach((r) => lines.push(`• ${esc(r.label)}: <b>${r.count}</b>`)); else lines.push("• Không còn việc tồn.");
  const missing = [...digest.missingDataRows].sort((a, b) => a.daysLeft - b.daysLeft).slice(0, cfg.full ? 8 : 5);
  if (missing.length) {
    lines.push("", "<b>Thiếu dữ liệu (gần hạn nhất)</b>");
    missing.forEach((r) => lines.push(`• ${esc(r.title)}${r.artist ? " — " + esc(r.artist) : ""}: thiếu ${esc(r.missing.join(", "))} (${r.daysLeft <= 0 ? "đã tới/quá hạn" : "còn " + r.daysLeft + " ngày"})`));
  }
  return lines.join("\n");
}

export { todayUTC };
