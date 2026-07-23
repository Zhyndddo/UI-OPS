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

// Ticket status is a real, manually-set field now (matching v1 exactly),
// not computed from timestamps — this just maps whichever vocabulary a
// given ticket type uses to a display color. Covers both the shared
// English vocab (REQUESTED/PROCESS/SUBMITTED/COMPLETE/REFUND/CANCELED)
// and Report Conflict's own real Vietnamese one — they're conceptually
// the same buckets (see ticketConfigs.js's STATUS_BUCKET map), just
// different literal values per type.
export function statusColor(status) {
  const map = {
    REQUESTED: { bg: "rgba(255,255,255,0.06)", fg: "#999" },
    PROCESS: { bg: "rgba(255,193,7,0.15)", fg: "#ffca4d" },
    SUBMITTED: { bg: "rgba(0,150,136,0.15)", fg: "#4dd0c4" },
    COMPLETE: { bg: "rgba(76,175,80,0.15)", fg: "#7ee6a8" },
    REFUND: { bg: "rgba(156,39,176,0.15)", fg: "#d191e0" },
    CANCELED: { bg: "rgba(244,67,54,0.15)", fg: "#ff8a80" },
    // Report Conflict's real vocabulary
    "Chưa bắt đầu": { bg: "rgba(255,255,255,0.06)", fg: "#999" },
    "Đã submit chờ duyệt": { bg: "rgba(255,193,7,0.15)", fg: "#ffca4d" },
    "Hoàn thành": { bg: "rgba(76,175,80,0.15)", fg: "#7ee6a8" },
    "Từ chối": { bg: "rgba(244,67,54,0.15)", fg: "#ff8a80" },
    "Hủy": { bg: "rgba(120,120,120,0.15)", fg: "#aaa" },
  };
  return map[status] || { bg: "rgba(255,255,255,0.06)", fg: "#999" };
}

// "Is this ticket in a done/terminal state" — covers both vocabularies at
// once (English COMPLETE/REFUND/CANCELED, and Report Conflict's Hoàn
// thành/Từ chối/Hủy), since Summary and other cross-type views need to
// count "done" uniformly regardless of which literal vocabulary a type uses.
export function isTicketDone(status) {
  return ["COMPLETE", "REFUND", "CANCELED", "Hoàn thành", "Từ chối", "Hủy"].includes(status);
}
