// Small shared helpers — formatting, status colors, pill math. Kept plain
// JS (no framework dependency) so any page can import what it needs.

export function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("vi-VN");
}

export function fmtDateTime(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("vi-VN");
}

// Metadata pill: 6 checklist items on a release (Tab 1 of the popup).
export function metadataPercent(release) {
  const keys = ["meta_audio", "meta_artwork", "meta_working_files", "meta_lyric", "meta_mv", "meta_doc"];
  const done = keys.filter((k) => release?.[k]).length;
  return Math.round((done / keys.length) * 100);
}

// Ticket lifecycle status — mirrors the ticket_status() Postgres function,
// computed client-side too since list views often need it without a round
// trip, and it keeps the demo readable without relying on the DB function
// being callable directly from supabase-js (which needs an RPC wrapper).
export function ticketStatus(t) {
  if (t.cancel_at) return "Cancel";
  if (t.refund_at) return "Refund";
  if (t.completed_at) {
    if (t.deadline && new Date(t.completed_at) > new Date(t.deadline)) return "Trễ";
    return "Đã hoàn thành";
  }
  if (t.started_at) return "Đã thực hiện";
  if (t.received_at) return "Đang thực hiện";
  return "Chưa thực hiện";
}

export function statusColor(status) {
  const map = {
    "Chưa thực hiện": { bg: "rgba(255,255,255,0.06)", fg: "#999" },
    "Đang thực hiện": { bg: "rgba(255,193,7,0.15)", fg: "#ffca4d" },
    "Đã thực hiện": { bg: "rgba(33,150,243,0.15)", fg: "#5cb3ff" },
    "Đã hoàn thành": { bg: "rgba(76,175,80,0.15)", fg: "#7ee6a8" },
    "Trễ": { bg: "rgba(244,67,54,0.15)", fg: "#ff8a80" },
    Refund: { bg: "rgba(156,39,176,0.15)", fg: "#d191e0" },
    Cancel: { bg: "rgba(120,120,120,0.15)", fg: "#aaa" },
  };
  return map[status] || { bg: "rgba(255,255,255,0.06)", fg: "#999" };
}

// Phụ Lục's own domain-specific status, separate from the generic
// ticket lifecycle status — both apply to the same ticket at once.
export function phuLucStatus(data) {
  const link = data?.linkPhuLuc;
  const ngayKy = data?.ngayKy;
  const ngayGui = data?.ngayGui;
  if (link && ngayKy) return "Đã Ký";
  if (link && ngayGui) return "Chờ Ký";
  if (link) return "Đã Soạn";
  return "Chưa Soạn";
}
