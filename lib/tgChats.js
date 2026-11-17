// Round 624 — several groups, ONE basket. TELEGRAM_CHAT_IDS="-100111,-100222" lists every group Friday reads;
// TELEGRAM_INTERNAL_CHAT_ID stays the MAIN group (scheduled digests / recaps post there only, and it is always included).
export function internalChatIds() {
  const main = String(process.env.TELEGRAM_INTERNAL_CHAT_ID || "").trim();
  const extra = String(process.env.TELEGRAM_CHAT_IDS || "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  return [...new Set([main, ...extra].filter(Boolean))];
}
export const isInternalChat = (id) => internalChatIds().includes(String(id));
export const mainChatId = () => String(process.env.TELEGRAM_INTERNAL_CHAT_ID || "").trim() || null;

// Round 631b — EXTRA chats: Friday answers a few commands there (/release, /status, /ask) and stores its messages in tg_chat_log
// under that chat's own id, but the chat is NOT part of the one basket (recaps, signals, #tags, intake only read internalChatIds()).
// TELEGRAM_EXTRA_CHAT_IDS="-100333,-100444"
export function extraChatIds() {
  const main = internalChatIds();
  return [...new Set(String(process.env.TELEGRAM_EXTRA_CHAT_IDS || "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))].filter((id) => !main.includes(id));
}
export const isExtraChat = (id) => extraChatIds().includes(String(id));
