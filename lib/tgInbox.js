// Round 660 — Friday's inbox for tickets.
//   • a ticket newly assigned to a linked person is pushed to their private chat (tick, every 10 min) with a  ✅ Xong  button
//   • "xong" / "done" as a REPLY to that message (or the button) sets the ticket to COMPLETE in the app, logged as that person
// Tickets that already existed when the person linked are baseline ("seen") and never pushed.
import { TICKET_TYPE_LABELS } from "./teamTypes";
import { queueDm } from "./tgOutbox";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CUTOFF = "2026-07-01";
const TERMINAL = ["COMPLETE", "CANCELED", "REFUND"], TERMINAL_RC = ["Hoàn thành", "Từ chối", "Hủy"], TERMINAL_DESIGN = ["COMPLETE", "CANCEL"];
const undone = (key, st) => (key === "report_conflict" ? !TERMINAL_RC.includes(st) : key === "design" ? !TERMINAL_DESIGN.includes(st) : !TERMINAL.includes(st));
const LABEL_KEYS = ["tenBai", "title", "songTitle", "projectName", "project", "assetTitle", "artistName", "request", "name", "artist", "label"];
const labelOf = (d, id) => { for (const k of LABEL_KEYS) { const v = d?.[k]; if (typeof v === "string" && v.trim()) return v.trim().slice(0, 120); } return `Ticket #${String(id).slice(0, 8)}`; };
const picsOf = (t) => [...new Set([...(t.pic_profile_ids || []), t.pic_profile_id].filter(Boolean))];
const SITE = "https://internal.vieent.com";
export const DONE_RE = /^\s*(xong|done|đã xong|da xong|hoàn thành|hoan thanh|ok xong|xong rồi|xong roi)\s*[.!]*\s*$/i;

// the status that means "finished" for a ticket type, or null when we don't know one
function completeStatus(tab) {
  const opts = tab.status_options || [];
  if (tab.key === "report_conflict") return opts.includes("Hoàn thành") ? "Hoàn thành" : null;
  return opts.includes("COMPLETE") ? "COMPLETE" : null;
}

// mark everything currently assigned to this person as "seen" (called right after linking, so old tickets are not pushed)
export async function seedInbox(db, profileId, dmChatId) {
  const { data } = await db.from("tickets").select("id").is("deleted_at", null).gte("created_at", CUTOFF).or(`pic_profile_id.eq.${profileId},pic_profile_ids.cs.{${profileId}}`).limit(2000);
  const rows = (data || []).map((t) => ({ profile_id: profileId, kind: "ticket", ref_id: t.id, dm_chat_id: dmChatId, status: "seen" }));
  for (let i = 0; i < rows.length; i += 500) await db.from("tg_inbox").upsert(rows.slice(i, i + 500), { onConflict: "profile_id,kind,ref_id", ignoreDuplicates: true });
}

export async function completeTicket(db, ticketId, profileId) {
  const { data: t } = await db.from("tickets").select("id, tab_id, status, status_log, data, pic_profile_id, pic_profile_ids, deleted_at").eq("id", ticketId).maybeSingle();
  if (!t || t.deleted_at) return { ok: false, text: "Không tìm thấy ticket này nữa." };
  const label = labelOf(t.data, t.id);
  if (!picsOf(t).includes(profileId)) return { ok: false, text: `Bạn không phải PIC của “${label}”, nên mình không đóng được.` };
  const { data: tab } = await db.from("ticket_tabs").select("key, label, status_options").eq("id", t.tab_id).maybeSingle();
  if (!tab) return { ok: false, text: "Không tìm thấy loại ticket." };
  if (!undone(tab.key, t.status)) return { ok: true, text: `“${label}” đã ở trạng thái ${t.status} rồi.`, label };
  const next = completeStatus(tab);
  if (!next) return { ok: false, text: `Loại ticket “${TICKET_TYPE_LABELS[tab.key] || tab.label}” mình chưa tự đóng được — bạn mở app đổi trạng thái nhé.` };
  const now = new Date().toISOString();
  const { data: upd, error } = await db.from("tickets").update({ status: next, status_log: { ...(t.status_log || {}), [next]: now } }).eq("id", t.id).eq("status", t.status).select("id");
  if (error) return { ok: false, text: "Lỗi khi cập nhật: " + error.message };
  if (!upd?.length) return { ok: false, text: "Ticket vừa được ai đó đổi trạng thái, bạn kiểm tra lại trong app nhé." };
  await db.from("audit_log").insert({ actor: profileId, action: "complete", entity: "ticket", entity_id: t.id, field: "status", before_val: t.status, after_val: next }).then(() => {}, () => {});
  await db.from("tg_inbox").update({ status: "done" }).eq("profile_id", profileId).eq("kind", "ticket").eq("ref_id", t.id);
  return { ok: true, text: `✅ Đã đánh dấu “${label}” là ${next} trong app.`, label, status: next };
}

// callback_query "tk:<ticketId>"
export async function handleTicketCb(db, cb, linkedProfile) {
  const id = String(cb.data || "").split(":")[1];
  if (!id) return { answer: "?" };
  const lk = await linkedProfile(cb.from.id).catch(() => null);
  if (!lk) return { answer: "Bạn chưa liên kết tài khoản." };
  const r = await completeTicket(db, id, lk.profile_id);
  return r.ok ? { answer: "Đã xong ✅", edit: `✅ <b>${esc(r.label)}</b> — ${esc(r.text.replace(/^✅ /, ""))}` } : { answer: r.text.slice(0, 190) };
}

// "xong" typed in the private chat. As a reply to a pushed ticket = that ticket; alone = a list of buttons to choose from.
export async function handleDone(db, m, lk) {
  const replyId = m.reply_to_message?.message_id;
  if (replyId) {
    const { data: row } = await db.from("tg_inbox").select("kind, ref_id").eq("dm_chat_id", m.chat.id).eq("dm_msg_id", replyId).eq("profile_id", lk.profile_id).maybeSingle();
    if (!row) return { text: "Tin này không phải một ticket mình đã gửi, nên mình không biết đóng việc nào. Trả lời trực tiếp vào tin “Ticket mới giao cho bạn” nhé." };
    return { text: esc((await completeTicket(db, row.ref_id, lk.profile_id)).text) };
  }
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: rows } = await db.from("tg_inbox").select("ref_id, title").eq("profile_id", lk.profile_id).eq("kind", "ticket").eq("status", "open").gte("created_at", since).order("created_at", { ascending: false }).limit(6);
  if (!rows?.length) return { text: "Mình không thấy ticket nào mình đã gửi cho bạn gần đây còn mở. Trả lời “xong” trực tiếp vào tin ticket cụ thể nhé." };
  return { text: "Bạn xong việc nào? (hoặc trả lời “xong” vào đúng tin ticket)", markup: { inline_keyboard: rows.map((r) => [{ text: "✅ " + String(r.title || "Ticket").slice(0, 50), callback_data: `tk:${r.ref_id}` }]) } };
}

// tick: tickets assigned to a linked person that were never pushed (and were not there when they linked)
export async function pushAssignments(db) {
  const { data: links } = await db.from("tg_links").select("profile_id");
  const linked = new Set((links || []).map((l) => l.profile_id));
  if (!linked.size) return { pushed: 0 };
  const [{ data: tabs }, { data: rows }, { data: seen }] = await Promise.all([
    db.from("ticket_tabs").select("id, key, label"),
    db.from("tickets").select("id, tab_id, status, data, pic_profile_id, pic_profile_ids, deadline, requester_name").is("deleted_at", null).gte("created_at", CUTOFF).or("pic_profile_id.not.is.null,pic_profile_ids.not.is.null").limit(3000),
    db.from("tg_inbox").select("profile_id, ref_id").eq("kind", "ticket").limit(20000),
  ]);
  const byTab = Object.fromEntries((tabs || []).map((t) => [t.id, t]));
  const done = new Set((seen || []).map((s) => `${s.profile_id}:${s.ref_id}`));
  const perPerson = new Map();
  let pushed = 0, queued = 0;
  for (const t of rows || []) {
    const tab = byTab[t.tab_id]; if (!tab || !undone(tab.key, t.status)) continue;
    for (const pid of picsOf(t)) {
      if (!linked.has(pid) || done.has(`${pid}:${t.id}`)) continue;
      const n = perPerson.get(pid) || 0; if (n >= 5) continue;   // at most 5 per person per tick; the rest follow next tick
      perPerson.set(pid, n + 1);
      const label = labelOf(t.data, t.id);
      const dl = t.deadline ? new Date(new Date(t.deadline).getTime() + 7 * 3600000).toISOString().slice(0, 10).split("-").reverse().slice(0, 2).join("/") : null;
      const html = [`<b>📌 Ticket mới giao cho bạn</b>`, `${esc(TICKET_TYPE_LABELS[tab.key] || tab.label)}: <b>${esc(label)}</b> <i>(${esc(t.status || "—")})</i>`, [t.requester_name ? "Người yêu cầu: " + esc(t.requester_name) : "", dl ? "Hạn: " + dl : ""].filter(Boolean).join(" · "), `<a href="${SITE}/task-table">Mở app</a> · trả lời “xong” vào tin này khi hoàn thành`].filter(Boolean).join("\n");
      const r = await queueDm(pid, html, { kind: "ticket", ref: t.id, title: label, markup: { inline_keyboard: [[{ text: "✅ Xong", callback_data: `tk:${t.id}` }]] } });
      if (r.sent) pushed += 1;
      if (r.queued) queued += 1;
      // a quiet-hours / blocked person must not be retried every tick: remember that we handled this ticket for them
      if (!r.sent) await db.from("tg_inbox").upsert({ profile_id: pid, kind: "ticket", ref_id: t.id, title: label, status: r.queued ? "open" : "seen" }, { onConflict: "profile_id,kind,ref_id", ignoreDuplicates: true });
    }
  }
  return { pushed, queued };
}
