// Round 661 — long answers: the first part goes out with a "▶ Xem tiếp (2/3)" button; the rest waits in tg_pages and is sent ONE message
// at a time when someone taps. Nothing is cut and nothing is blasted at the group, so there is no flood / spam flag.
import { splitText } from "./telegram";

const tgPost = (token, method, body) => fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({}))).catch(() => ({}));
const nextBtn = (id, n, total) => ({ inline_keyboard: [[{ text: `▶ Xem tiếp (${n + 1}/${total})`, callback_data: `pg:${id}:${n}` }]] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// target = { chat_id, thread_id? }   opts = { html, replyTo, markup }  (markup goes on the LAST part)
export async function sendPaged(db, token, target, text, opts = {}) {
  const parts = splitText(text);
  const base = (t) => ({ chat_id: target.chat_id, text: t, disable_web_page_preview: true, ...(opts.html ? { parse_mode: "HTML" } : {}), ...(target.thread_id ? { message_thread_id: target.thread_id } : {}) });
  let pid = null;
  if (parts.length > 1 && db) {
    const { data } = await db.from("tg_pages").insert({ chat_id: String(target.chat_id), parts: parts.slice(1), last_markup: opts.markup || null }).select("id").maybeSingle();
    pid = data?.id || null;
  }
  if (parts.length > 1 && !pid) {   // table missing: fall back to the old behaviour (all parts, one second apart)
    for (let i = 0; i < parts.length; i++) {
      await tgPost(token, "sendMessage", { ...base(parts[i]), ...(i === 0 && opts.replyTo ? { reply_to_message_id: opts.replyTo, allow_sending_without_reply: true } : {}), ...(i === parts.length - 1 && opts.markup ? { reply_markup: opts.markup } : {}) });
      if (i < parts.length - 1) await sleep(1100);
    }
    return;
  }
  const body = base(parts[0]);
  if (opts.replyTo) { body.reply_to_message_id = opts.replyTo; body.allow_sending_without_reply = true; }
  if (pid) body.reply_markup = nextBtn(pid, 1, parts.length);
  else if (opts.markup) body.reply_markup = opts.markup;
  await tgPost(token, "sendMessage", body);
}

// callback_query "pg:<id>:<n>" — n = index into the stored remaining parts + 1 (part number counting from 1, part 1 already sent)
export async function handlePageCb(db, token, cb) {
  const [, idRaw, nRaw] = String(cb.data || "").split(":");
  const id = parseInt(idRaw, 10), n = parseInt(nRaw, 10);
  const { data: row } = await db.from("tg_pages").select("*").eq("id", id).maybeSingle();
  if (!row || !Array.isArray(row.parts) || !row.parts[n - 1]) return { answer: "Phần này đã hết hạn, hỏi lại giúp mình nhé." };
  const total = row.parts.length + 1, chat = cb.message?.chat?.id;
  if (!chat) return { answer: "?" };
  await tgPost(token, "editMessageReplyMarkup", { chat_id: chat, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });   // the tapped button disappears
  const last = n >= row.parts.length;
  await tgPost(token, "sendMessage", { chat_id: chat, text: row.parts[n - 1], parse_mode: "HTML", disable_web_page_preview: true, ...(cb.message.is_topic_message && cb.message.message_thread_id ? { message_thread_id: cb.message.message_thread_id } : {}), ...(last ? (row.last_markup ? { reply_markup: row.last_markup } : {}) : { reply_markup: nextBtn(id, n + 1, total) }) });
  return { answer: `Phần ${n + 1}/${total}` };
}
