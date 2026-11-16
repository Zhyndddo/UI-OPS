// Round 630 — afternoon reminders with a button. Each linked person who turned on /alert gets, at the 13:30 digest, one message per
// release of theirs that is due in 0-2 days with data still missing, with  ✅ Đã xử lý  /  😴 Mai nhắc lại.
// The buttons only change what FRIDAY remembers (stop / snooze nagging) — they never edit the release in the app.
import { releaseUrl } from "./tgTags";
import { vnDayStart } from "./tgRecap";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const vnToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const DUE_DAYS = 2, MAX_PER_PERSON = 5;

async function post(chatId, html, markup) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false };
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: markup }) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.ok, blocked: r.status === 403 };
}

// digest.missingDataRows must already have loadOwners() applied.
export async function sendReminders(db, digest) {
  const today = vnToday(), now = new Date();
  const { data: links, error } = await db.from("tg_links").select("tg_user_id, profile_id, dm_chat_id, alerts");
  if (error) return { error: error.message };
  const rows = digest.missingDataRows || [];
  const res = { people: 0, sent: 0, blocked: 0 };
  for (const lk of links || []) {
    if (lk.alerts !== true) continue;
    const mine = rows.filter((r) => (r.ownerId === lk.profile_id || (r.opsIds || []).includes(lk.profile_id)) && r.daysLeft >= 0 && r.daysLeft <= DUE_DAYS);
    if (!mine.length) continue;
    const { data: ex } = await db.from("tg_reminders").select("*").eq("profile_id", lk.profile_id).in("release_id", mine.map((r) => r.id));
    const by = Object.fromEntries((ex || []).map((e) => [e.release_id, e]));
    const due = mine.filter((r) => { const e = by[r.id]; if (!e) return true; if (e.status === "done") return false; if (e.status === "snoozed" && e.snooze_until && new Date(e.snooze_until) > now) return false; return e.last_sent_on !== today; }).slice(0, MAX_PER_PERSON);
    if (!due.length) continue;
    res.people += 1;
    for (const r of due) {
      const { data: row } = await db.from("tg_reminders").upsert({ profile_id: lk.profile_id, release_id: r.id, release_title: r.title, status: "open", snooze_until: null, last_sent_on: today }, { onConflict: "profile_id,release_id" }).select("id").maybeSingle();
      if (!row) continue;
      const when = r.daysLeft === 0 ? "hôm nay" : `còn ${r.daysLeft} ngày`;
      const text = `⏰ <b>${esc(r.title)}</b>${r.artist ? " — " + esc(r.artist) : ""}\nPhát hành ${when} · còn thiếu: ${esc(r.missing.join(", "))}\n<a href="${releaseUrl(r.id)}">Mở release trong app</a>`;
      const out = await post(lk.dm_chat_id, text, { inline_keyboard: [[{ text: "✅ Đã xử lý", callback_data: `rm:${row.id}:d` }, { text: "😴 Mai nhắc lại", callback_data: `rm:${row.id}:s` }]] });
      if (out.ok) res.sent += 1; else { if (out.blocked) res.blocked += 1; break; }
    }
  }
  return res;
}

// callback_query "rm:<id>:d|s". Returns { answer, edit }.
export async function handleReminder(db, cb, linkedProfile) {
  const [, idRaw, act] = String(cb.data || "").split(":");
  const id = parseInt(idRaw, 10);
  if (!id || !["d", "s"].includes(act)) return { answer: "?" };
  const { data: row } = await db.from("tg_reminders").select("*").eq("id", id).maybeSingle();
  if (!row) return { answer: "Không tìm thấy." };
  const lk = await linkedProfile(cb.from.id).catch(() => null);
  if (!lk || lk.profile_id !== row.profile_id) return { answer: "Nút này không phải của bạn." };
  const title = esc(row.release_title || "release");
  if (act === "d") {
    await db.from("tg_reminders").update({ status: "done", snooze_until: null }).eq("id", id);
    return { answer: "Đã ghi nhận ✅", edit: `✅ <b>${title}</b> — đã ghi nhận xử lý. Friday ngừng nhắc (app không tự cập nhật, nhớ tick checklist trong release).` };
  }
  const until = vnDayStart(-1, new Date());   // start of tomorrow, Vietnam time
  await db.from("tg_reminders").update({ status: "snoozed", snooze_until: until.toISOString() }).eq("id", id);
  return { answer: "Mai nhắc lại 😴", edit: `😴 <b>${title}</b> — mai Friday nhắc lại.` };
}
