// FRIDAY action engine (Round 612) — turns the digest's plain numbers into "do this first".
// Pure rules, no AI: priority = near deadline → overdue grouped by what is missing → nearly-empty releases → stuck tickets.
import { TICKET_TYPE_LABELS } from "./teamTypes";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CUTOFF = "2026-07-01", STUCK_DAYS = 7, NEAR_DAYS = 7, EMPTY_AT = 4;
const TERMINAL = ["COMPLETE", "CANCELED", "REFUND"], TERMINAL_RC = ["Hoàn thành", "Từ chối", "Hủy"], TERMINAL_DESIGN = ["COMPLETE", "CANCEL"];
const undone = (key, st) => (key === "report_conflict" ? !TERMINAL_RC.includes(st) : key === "design" ? !TERMINAL_DESIGN.includes(st) : !TERMINAL.includes(st));
const LABEL_KEYS = ["tenBai", "title", "songTitle", "projectName", "name", "artist", "label"];
const labelOf = (d, id) => { for (const k of LABEL_KEYS) { const v = d?.[k]; if (typeof v === "string" && v.trim()) return v.trim(); } return `Ticket #${id}`; };
const short = (r) => esc(r.title) + (r.artist ? ` — ${esc(String(r.artist).split(",")[0])}` : "");

// Tickets still open and untouched for STUCK_DAYS (last status change, else creation).
export async function loadStuck(supabase) {
  const { data: tabs } = await supabase.from("ticket_tabs").select("id, key, label");
  const byTab = Object.fromEntries((tabs || []).map((t) => [t.id, t]));
  const { data: rows } = await supabase.from("tickets").select("id, tab_id, status, data, created_at, status_log, pic_profile_id, pic_profile_ids")
    .is("deleted_at", null).gte("created_at", CUTOFF).limit(2000);
  const now = Date.now(), out = [];
  for (const t of rows || []) {
    const tab = byTab[t.tab_id]; if (!tab || !undone(tab.key, t.status)) continue;
    let last = new Date(t.created_at).getTime();
    for (const v of Object.values(t.status_log || {})) { const x = new Date(v).getTime(); if (x > last) last = x; }
    const days = Math.floor((now - last) / 86400000);
    if (days >= STUCK_DAYS) out.push({ type: TICKET_TYPE_LABELS[tab.key] || tab.label, label: labelOf(t.data, t.id), status: t.status, days, pics: (t.pic_profile_ids?.length ? t.pic_profile_ids : [t.pic_profile_id]).filter(Boolean) });
  }
  const ids = [...new Set(out.flatMap((s) => s.pics))];
  const names = {};
  if (ids.length) { const { data: ps } = await supabase.from("profiles").select("id, name").in("id", ids); (ps || []).forEach((p) => { names[p.id] = p.name; }); }
  out.forEach((s) => { s.who = s.pics.map((i) => names[i]).filter(Boolean).join(", ") || "chưa có PIC"; });
  return out.sort((a, b) => b.days - a.days);
}

// ---- Chat signals: what people SAID in the group about each release that the app still lists as missing data ----
const norm = (s) => String(s ?? "").toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const DONE_RE = /(xong|done|hoàn thành|hoan thanh|đã (up|upload|gửi|có|nộp|bổ sung|đẩy|cập nhật|ok)|ok rồi|có rồi|đủ rồi|up rồi|gửi rồi)/i;
const WAIT_RE = /(chưa|thiếu|chờ|đợi|trễ|bao giờ|khi nào|gấp|\?\s*$)/i;
const ago = (iso) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? "hôm nay" : d === 1 ? "hôm qua" : `${d} ngày trước`; };
const cutText = (s, n) => { const t = String(s).replace(/\s+/g, " "); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

// -> { [release title]: { state: "done"|"waiting"|"mention", count, sender, text, when } }  (titles shorter than 6 characters are skipped: too many false hits)
export async function loadChatSignals(supabase, rows, days = 7) {
  const chatId = process.env.TELEGRAM_INTERNAL_CHAT_ID;
  if (!chatId || !rows?.length) return {};
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase.from("tg_chat_log").select("sender, text, sent_at").eq("chat_id", String(chatId)).gte("sent_at", since).order("sent_at").limit(5000);
  const msgs = (data || []).map((m) => ({ ...m, n: ` ${norm(m.text)} ` }));
  const out = {};
  for (const r of rows) {
    const t = norm(r.title);
    if (t.length < 6) continue;
    const hits = msgs.filter((m) => m.n.includes(` ${t} `));
    if (!hits.length) continue;
    const last = hits[hits.length - 1];
    out[r.title] = { state: DONE_RE.test(last.text) ? "done" : WAIT_RE.test(last.text) ? "waiting" : "mention", count: hits.length, sender: last.sender, text: last.text, when: ago(last.sent_at) };
  }
  return out;
}

// compact = true → shorter version for /status
export function renderActions(digest, stuck, compact = false, signals = {}, gaps = []) {
  const rows = digest.missingDataRows || [];
  const L = ["<b>🎯 Friday: nên làm gì trước</b>"];
  const near = rows.filter((r) => r.daysLeft > 0 && r.daysLeft <= NEAR_DAYS).sort((a, b) => a.daysLeft - b.daysLeft);
  const over = rows.filter((r) => r.daysLeft <= 0);
  const empty = rows.filter((r) => r.missing.length >= EMPTY_AT);
  const emptySet = new Set(empty);
  let n = 0;
  const said = (state) => rows.filter((r) => signals[r.title]?.state === state);
  const sayLine = (r) => { const g = signals[r.title]; return `• ${short(r)}: app còn thiếu ${esc(r.missing.join(", "))} · <b>${esc(g.sender)}</b> (${g.when}): "${esc(cutText(g.text, 90))}"`; };
  if (gaps.length) {
    L.push("", `<b>📥 Chat báo đã gửi dự án nhưng app chưa thấy — ${gaps.length}</b>`, "→ nhờ PIC kiểm tra đã tạo ticket / release chưa.");
    gaps.slice(0, compact ? 3 : 5).forEach((g) => L.push(`• ${esc(g.title)}${g.artists?.length ? " — " + esc(g.artists.join(", ")) : ""} · PIC ${esc(g.pic_name || g.pic_text || "?")}`));
  }
  const doneSaid = said("done"), waitSaid = said("waiting");
  if (doneSaid.length) {
    L.push("", `<b>💬 Chat nói đã xong nhưng app chưa cập nhật — ${doneSaid.length}</b>`, "→ nhờ PIC cập nhật vào app (hoặc xác nhận lại).");
    doneSaid.slice(0, compact ? 3 : 5).forEach((r) => L.push(sayLine(r)));
  }
  if (waitSaid.length) {
    L.push("", `<b>💬 Chat đang hỏi / chờ — ${waitSaid.length}</b>`);
    waitSaid.slice(0, compact ? 2 : 4).forEach((r) => L.push(sayLine(r)));
  }
  if (near.length) {
    L.push("", `<b>⏰ Sắp đến hạn (trong ${NEAR_DAYS} ngày) — ${near.length}</b>`);
    near.slice(0, compact ? 3 : 6).forEach((r) => L.push(`${++n}. ${short(r)}: còn thiếu ${esc(r.missing.join(", "))} · còn ${r.daysLeft} ngày`));
  }
  // overdue grouped by exactly what is missing → one action per group instead of one line per release
  const groups = new Map();
  over.filter((r) => !emptySet.has(r)).forEach((r) => { const k = r.missing.join(", "); (groups.get(k) || groups.set(k, []).get(k)).push(r); });
  const gl = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  if (gl.length) {
    L.push("", `<b>🔥 Đã quá hạn — nhóm theo thứ còn thiếu</b>`);
    gl.slice(0, compact ? 3 : 5).forEach(([k, list]) => {
      L.push(`${++n}. <b>${list.length}</b> release chỉ còn thiếu <b>${esc(k)}</b> (vd: ${list.slice(0, 3).map((r) => esc(r.title)).join(", ")}) → nhắc PIC bổ sung`);
    });
    if (gl.length > (compact ? 3 : 5)) L.push(`… và ${gl.length - (compact ? 3 : 5)} nhóm khác, xem /missing`);
  }
  if (empty.length) {
    L.push("", `<b>❓ Gần như chưa có dữ liệu — ${empty.length}</b>`, "Thiếu từ " + EMPTY_AT + " mục trở lên. Hỏi lại xem có ai đang làm không, hay chưa ai nhập.");
    empty.slice(0, compact ? 2 : 4).forEach((r) => L.push(`• ${short(r)}: đang thiếu ${r.missing.length} mục`));
  }
  if (stuck?.length) {
    L.push("", `<b>🧱 Ticket đứng yên từ ${STUCK_DAYS} ngày — ${stuck.length}</b>`);
    stuck.slice(0, compact ? 3 : 5).forEach((s) => L.push(`• ${esc(s.type)}: ${esc(s.label)} (${esc(s.status || "—")}) — đứng yên ${s.days} ngày · PIC: ${esc(s.who)}`));
    if (stuck.length > (compact ? 3 : 5)) L.push(`… và ${stuck.length - (compact ? 3 : 5)} ticket khác`);
  }
  if (!near.length && !gl.length && !empty.length && !(stuck && stuck.length)) L.push("", "Hiện chưa có việc gấp. 🎉");
  return L.join("\n");
}
