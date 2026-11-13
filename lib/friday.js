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

// compact = true → shorter version for /status
export function renderActions(digest, stuck, compact = false) {
  const rows = digest.missingDataRows || [];
  const L = ["<b>🎯 Friday: nên làm gì trước</b>"];
  const near = rows.filter((r) => r.daysLeft > 0 && r.daysLeft <= NEAR_DAYS).sort((a, b) => a.daysLeft - b.daysLeft);
  const over = rows.filter((r) => r.daysLeft <= 0);
  const empty = rows.filter((r) => r.missing.length >= EMPTY_AT);
  const emptySet = new Set(empty);
  let n = 0;
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
