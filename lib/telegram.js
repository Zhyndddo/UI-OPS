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
export function splitText(text, max = 3800) {
  const out = [];
  let cur = "";
  for (const line of String(text).split("\n")) {
    if (cur && (cur + "\n" + line).length > max) { out.push(cur); cur = line; } else cur = cur ? cur + "\n" + line : line;
  }
  if (cur) out.push(cur);
  return out;
}

// Which chat does TELEGRAM_INTERNAL_CHAT_ID really point to? (name + type + whether it has Topics) — shown by the Config test button.
export async function describeChat() {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_INTERNAL_CHAT_ID;
  if (!token || !chat) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chat)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return { error: j.description || `HTTP ${r.status}` };
    const c = j.result || {};
    return { title: c.title || c.username || c.first_name || "?", type: c.type, topics: !!c.is_forum, id: c.id, thread_id_set: !!process.env.TELEGRAM_THREAD_ID };
  } catch (e) { return { error: e.message }; }
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

// Round 610 — /status: one short block. /missing: the full list of releases still missing data (soonest first), cut to fit one message.
export function renderStatusTelegram(digest) {
  const tk = digest.ticketNotDoneRows.reduce((s, r) => s + r.count, 0);
  const ws = digest.workstationRows.reduce((s, r) => s + r.count, 0);
  const miss = digest.missingDataRows.length;
  const overdue = digest.missingDataRows.filter((r) => r.daysLeft <= 0).length;
  const top = [...digest.ticketNotDoneRows, ...digest.workstationRows].filter((r) => r.count > 0).sort((a, b) => b.count - a.count).slice(0, 3);
  const L = [`<b>📊 Tình hình</b> · ${esc(digest.date)}`,
    `• Ticket chưa xong: <b>${tk}</b>`,
    `• Workstation chưa xong: <b>${ws}</b>`,
    `• Release thiếu dữ liệu: <b>${miss}</b>${overdue ? ` (${overdue} đã tới/quá hạn)` : ""}`];
  if (top.length) L.push(`• Nhiều nhất: ${top.map((r) => `${esc(r.label)} ${r.count}`).join(" · ")}`);
  L.push("", "Danh sách đầy đủ: /missing");
  return L.join("\n");
}

export function renderMissingTelegram(digest, signals = {}) {
  const rows = [...digest.missingDataRows].sort((a, b) => a.daysLeft - b.daysLeft);
  if (!rows.length) return "✅ Không release nào đang thiếu dữ liệu.";
  const L = [`<b>🔎 Thiếu dữ liệu</b> · ${rows.length} release (gần hạn nhất trước)`];
  let size = L[0].length, shown = 0;
  for (const r of rows) {
    const line = `• ${esc(r.title)}${r.artist ? " — " + esc(r.artist) : ""}: thiếu ${esc(r.missing.join(", "))} (${r.daysLeft <= 0 ? "đã tới/quá hạn" : "còn " + r.daysLeft + " ngày"})${r.owner !== undefined ? " · PIC: " + esc(r.owner ? String(r.owner).trim().split(/\s+/).pop() : "chưa có") : ""}${signals[r.title] ? (signals[r.title].state === "done" ? " 💬✅ chat nói đã xong" : " 💬 có nhắc trong chat") : ""}`;
    if (size + line.length > 3700) break;
    L.push(line); size += line.length + 1; shown += 1;
  }
  if (shown < rows.length) L.push(`… và ${rows.length - shown} release nữa — xem trong app.`);
  return L.join("\n");
}

// Round 611 — send to ANY chat (a person's private chat for /mytasks). Returns { ok, blocked } — blocked = the person never pressed Start.
export async function sendTelegramTo(chatId, html) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "no token" };
  let sent = 0;
  for (const part of splitText(html)) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: part, parse_mode: "HTML", disable_web_page_preview: true }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return { ok: false, sent, blocked: r.status === 403, error: j.description || String(r.status) };
    sent += 1;
  }
  return { ok: true, sent };
}

export { todayUTC };
