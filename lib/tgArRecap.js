// Round 662 — recap of the AR group ONLY (typed as /recap [hôm qua] in that group): new songs / requests, updates on existing songs,
// unanswered questions with an owner. Built from tg_chat_log + tg_intakes of the AR chat(s); nothing from the internal group is mixed in.
import { arChatIds } from "./tgChats";
import { vnDayStart, vnDateLabel, loadMessages, analyse } from "./tgRecap";
import { loadIntakes } from "./tgIntake";
import { ACTION_LABELS } from "./chatActions";
import { addOwners } from "./tgOwners";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cut = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const NEW_KIND = { upload: "Upload", phai_sinh: "Phái sinh", presave: "Link pre-save" };
const dmy = (iso) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "");

export async function arRecapHtml(db, yesterday) {
  const ids = arChatIds();
  if (!ids.length) return "Chưa cấu hình nhóm AR (TELEGRAM_AR_CHAT_IDS).";
  const now = new Date(), from = vnDayStart(yesterday ? 1 : 0, now), to = yesterday ? vnDayStart(0, now) : now;
  const msgs = await loadMessages(db, from, to, ids);
  const an = analyse(msgs);
  await addOwners(db, an.open.slice(-8)).catch(() => {});
  const intakes = await loadIntakes(db, from.toISOString(), to.toISOString(), ids).catch(() => []);
  const label = vnDateLabel(from) + (yesterday ? "" : " (đến giờ)");
  const L = [`<b>🗒️ AR — tóm tắt chat</b> · ${esc(label)}`];
  if (!msgs.length) return L.concat(["", "Chưa có tin nhắn nào được ghi lại trong khoảng này."]).join("\n");
  L.push(`${an.total} tin · ${an.people.length} người`);

  const fresh = intakes.filter((i) => NEW_KIND[i.kind]), upd = intakes.filter((i) => ACTION_LABELS[i.kind]);
  const line = (i, kindLabel) => `• ${esc(kindLabel)}: <b>${esc(i.title)}</b>${i.artists?.length ? " — " + esc(i.artists.join(", ")) : ""}${i.label ? " · " + esc(i.label) : ""}${i.pic_name || i.pic_text ? " · PIC " + esc(i.pic_name || i.pic_text?.replace(/@/g, "")) : ""}${i.release_date ? " · phát hành " + esc(dmy(i.release_date)) + (i.release_time ? " " + esc(i.release_time) : "") : i.release_text ? " · " + esc(i.release_text) : ""}${i.poster_name ? " <i>(" + esc(i.poster_name) + ")</i>" : ""}`;
  L.push("", `<b>🆕 Bài mới / yêu cầu</b> (${fresh.length})`);
  if (fresh.length) fresh.forEach((i) => L.push(line(i, NEW_KIND[i.kind]))); else L.push("• Không thấy bài mới nào được gửi.");
  L.push("", `<b>🔁 Cập nhật bài đã có</b> (${upd.length})`);
  if (upd.length) upd.forEach((i) => L.push(line(i, ACTION_LABELS[i.kind]) + (i.notes ? `\n   <i>${esc(cut(i.notes, 140))}</i>` : ""))); else L.push("• Không thấy cập nhật nào khớp với bài trong app.");

  // messages that sound like an update / request but did not match a song in the app (so nothing said in the group is lost)
  const seen = intakes.map((i) => String(i.raw || ""));
  const other = an.flagged.filter((m) => !seen.some((r) => r && r.includes(m.text.slice(0, 40)))).slice(-12);
  if (other.length) { L.push("", "<b>💬 Tin nhắn khác cần theo dõi</b>"); other.forEach((m) => L.push(`• <b>${esc(m.sender)}</b>: ${esc(cut(m.text, 160))}`)); }

  L.push("", `<b>❓ Câu hỏi chưa ai trả lời</b> (${an.open.length})`);
  if (an.open.length) an.open.slice(-8).forEach((m) => L.push(`• <b>${esc(m.sender)}</b>: ${esc(cut(m.text, 140))}${m.owner ? " → <i>" + esc(m.owner) + "</i>" : ""}`)); else L.push("• Không có.");
  return L.join("\n");
}
