// Round 610 — daily group-chat recap. The webhook stores each text message of the internal group in tg_chat_log;
// this file turns a day of messages into a table-style recap (Telegram HTML + email HTML). An AI summary line is added
// only when ANTHROPIC_API_KEY is set in Vercel; without it the recap is purely extractive (counts + flagged lines).
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const VN_OFFSET_MS = 7 * 3600 * 1000;

// Start of a Vietnam calendar day (00:00 +07) as a UTC Date. daysAgo=0 → today.
export function vnDayStart(daysAgo = 0, now = new Date()) {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const midnightVn = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - daysAgo * 86400000;
  return new Date(midnightVn - VN_OFFSET_MS);
}
export const vnDateLabel = (d) => new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

const FLAG = /(\?|cần|nhờ|gấp|deadline|hạn|trễ|chưa xong|lỗi|bug|thiếu|check|kiểm tra|xác nhận|duyệt|ticket|release|phát hành|hợp đồng|phụ lục)/i;

const STOP = new Set("và của là có không được cho với này đó các những một để trong khi thì mà cũng đã sẽ đang rồi nha nhé ạ ơi anh chị em mình bạn tôi ai gì nào sao vậy thế như nên hay hoặc nhưng vì nếu còn lại ra vào lên xuống ok oke okie dạ vâng ừ ờ thôi luôn đi nữa thật rất quá lắm the and for you that this with".split(" "));
function keywordsOf(texts, n = 4) {
  const c = new Map();
  for (const t of texts) for (const w of new Set(t.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])) if (!STOP.has(w)) c.set(w, (c.get(w) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, n).map(([w, k]) => (k > 1 ? `${w}×${k}` : w));
}

export async function loadMessages(supabase, from, to, chatId) {
  const { data, error } = await supabase.from("tg_chat_log").select("sender, thread_id, text, sent_at")
    .eq("chat_id", String(chatId)).gte("sent_at", from.toISOString()).lt("sent_at", to.toISOString()).order("sent_at").limit(5000);
  if (error) throw new Error(error.message);
  return data || [];
}

export function analyse(msgs) {
  const people = new Map(), topics = new Map(), flagged = [];
  for (const m of msgs) {
    const p = people.get(m.sender) || { n: 0, flagged: 0, texts: [] }; p.n += 1; p.texts.push(m.text); people.set(m.sender, p);
    const t = m.thread_id || 0; topics.set(t, (topics.get(t) || 0) + 1);
    if (m.text.length >= 12 && FLAG.test(m.text)) { flagged.push(m); p.flagged += 1; }
  }
  return {
    total: msgs.length,
    people: [...people.entries()].map(([name, v]) => ({ name, n: v.n, flagged: v.flagged, kw: keywordsOf(v.texts) })).sort((a, b) => b.n - a.n),
    topics: [...topics.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n),
    flagged,
  };
}

// Optional: 3-5 line Vietnamese summary. Returns null when no key / any failure (the recap still goes out).
export async function aiSummary(msgs) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || msgs.length < 5) return null;
  const log = msgs.map((m) => `${m.sender}: ${m.text}`).join("\n").slice(-12000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.RECAP_AI_MODEL || "claude-haiku-4-5", max_tokens: 500,
        messages: [{ role: "user", content: `Dưới đây là tin nhắn trong nhóm chat nội bộ của một công ty âm nhạc trong một ngày. Tóm tắt bằng tiếng Việt trong 3-5 gạch đầu dòng ngắn: quyết định đã chốt, việc còn treo (ghi rõ ai), câu hỏi chưa ai trả lời. Bỏ qua chuyện đùa. Không bịa.\n\n${log}` }] }),
    });
    const j = await r.json();
    return j?.content?.[0]?.text?.trim() || null;
  } catch (e) { return null; }
}

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function renderRecapTelegram(a, label, ai) {
  const L = [`<b>🗒️ Tóm tắt chat nhóm</b> · ${esc(label)}`];
  if (!a.total) { L.push("", "Chưa có tin nhắn nào được ghi lại trong khoảng này."); return L.join("\n"); }
  L.push(`${a.total} tin · ${a.people.length} người`);
  if (ai) L.push("", "<b>Tóm tắt nhanh</b>", esc(ai));
  L.push("", "<b>Ai nói bao nhiêu · từ khóa hay dùng</b>");
  a.people.slice(0, 10).forEach((p) => L.push(`• ${esc(p.name)}: ${p.n} tin${p.flagged ? ` (${p.flagged} việc/câu hỏi)` : ""}${p.kw.length ? ` — <i>${esc(p.kw.join(", "))}</i>` : ""}`));
  if (a.topics.length > 1) L.push("", "<b>Theo topic</b>", a.topics.slice(0, 6).map((t) => `${t.id ? "#" + t.id : "General"}: ${t.n}`).join(" · "));
  if (a.flagged.length) {
    L.push("", "<b>Việc / câu hỏi cần theo dõi</b>");
    a.flagged.slice(-12).forEach((m) => L.push(`• <b>${esc(m.sender)}</b>: ${esc(cut(m.text.replace(/\s+/g, " "), 140))}`));
  }
  return L.join("\n");
}

export function renderRecapHtml(a, label, ai) {
  const h = (s) => esc(s);
  const peopleRows = a.people.map((p) => `<tr style="border-bottom:1px solid #eee"><td>${h(p.name)}</td><td>${p.n}</td><td>${p.flagged}</td><td>${h(p.kw.join(", "))}</td></tr>`).join("");
  const flagRows = a.flagged.map((m) => `<tr style="border-bottom:1px solid #eee;vertical-align:top"><td style="white-space:nowrap">${new Date(new Date(m.sent_at).getTime() + VN_OFFSET_MS).toISOString().slice(11, 16)}</td><td>${h(m.sender)}</td><td>${m.thread_id ? "#" + m.thread_id : "General"}</td><td>${h(cut(m.text.replace(/\s+/g, " "), 300))}</td></tr>`).join("");
  return `<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;color:#222">
  <h2 style="margin-bottom:4px">VIEENT OPS — Tóm tắt chat nhóm</h2>
  <p style="color:#666;margin-top:0">${h(label)} · ${a.total} tin · ${a.people.length} người</p>
  ${ai ? `<h3>Tóm tắt nhanh</h3><p style="background:#f5f5f5;border-radius:6px;padding:10px 14px;white-space:pre-wrap">${h(ai)}</p>` : ""}
  <h3>Ai nói bao nhiêu</h3>
  <table cellpadding="6" style="border-collapse:collapse;width:100%"><tr style="text-align:left;border-bottom:1px solid #ccc"><th>Người</th><th>Tin nhắn</th><th>Việc/câu hỏi</th><th>Từ khóa</th></tr>${peopleRows || '<tr><td colspan="4" style="color:#888">Không có tin nhắn.</td></tr>'}</table>
  <h3 style="margin-top:24px">Việc / câu hỏi cần theo dõi</h3>
  <table cellpadding="6" style="border-collapse:collapse;width:100%"><tr style="text-align:left;border-bottom:1px solid #ccc"><th>Giờ</th><th>Người</th><th>Topic</th><th>Nội dung</th></tr>${flagRows || '<tr><td colspan="4" style="color:#888">Không có.</td></tr>'}</table>
  </div>`;
}
