// Round 87 — the Hợp Tác tag system on the Label List. Each of the 3 tags
// (see LABEL_HOP_TAC_OPTIONS in pickerOptions.js) now tracks its own
// "send to legal?" decision and, if yes, the resulting Hợp Đồng ticket —
// instead of being a plain yes/no pill. Shared by app/labels/page.js (the
// only place that writes this), app/releases/[id]/page.js and
// app/new-release/page.js (which only read it, to show the same status
// colors and to lock Phụ Lục Publishing once the label's Hợp Đồng
// Publishing is done).
//
// Data shape — labels.hop_tac_status, a jsonb object keyed by tag:
//   { [tag]: { sentToLegal: boolean, ticketId: number|null, done: boolean } }
// - sentToLegal true + ticketId set + done false  -> ticket in flight (gold)
// - sentToLegal true + ticketId set + done true   -> ticket finished (green)
// - sentToLegal false + done true                 -> no ticket, marked
//   complete directly ("already done before this system") (green)
// - tag absent entirely, or present with done false and no ticketId       -> not started (grey)

// Which ticket type (see lib/ticketConfigs.js / lib/teamTypes.js) each tag
// sends to when "send to legal" is Yes. These 3 types already existed
// (Round 82 item 3, "blank template" Legal Request tickets attached to a
// release by DID) — labels attach to them by data.labelId/data.labelName
// instead, a new use of the same freeform `data` jsonb column, no schema
// change needed on `tickets` itself.
export const HOP_TAC_TICKET_TYPE = {
  Youtube: "hop_dong_youtube",
  Publishing: "hop_dong_publishing",
  "Nhạc Số": "hop_dong_nhac_so",
};

export function hopTacTagEntry(label, tag) {
  return (label?.hop_tac_status || {})[tag] || null;
}

// grey (not started) / gold (ticket sent, not finished) / green (done —
// either the ticket finished, or "send to legal" was No and it was marked
// complete directly).
export function hopTacTagStatus(label, tag) {
  const entry = hopTacTagEntry(label, tag);
  if (!entry) return "none";
  if (entry.done) return "done";
  if (entry.sentToLegal && entry.ticketId) return "pending";
  return "none";
}

export function hopTacStatusColor(status) {
  if (status === "done") return { bg: "var(--success-bg)", fg: "var(--success-fg)" };
  if (status === "pending") return { bg: "var(--warn-bg)", fg: "var(--warn-fg)" };
  return { bg: "var(--bg-hover)", fg: "var(--text-faint)" };
}

// A label counts as under contract the moment ANY one of its 3 tags is
// done — per explicit request ("either of the hợp tác tag is complete
// with green color"), replacing the old "always manual" Contract Signed
// button as the normal path; that button stays as a fallback for labels
// that never go through the tag flow at all.
export function anyHopTacDone(label) {
  return Object.keys(HOP_TAC_TICKET_TYPE).some((tag) => hopTacTagStatus(label, tag) === "done");
}

// Item 6 — signing a label's Hợp Đồng Publishing means every future
// product under that label needs no separate Phụ Lục Publishing addendum,
// so that gate gets force-locked to "No" or disabled going forward. Only
// Publishing is wired up this round — Youtube/Nhạc Số don't have an
// unambiguous matching Phụ Lục gate yet (flagged separately), so they're
// left alone until that's confirmed.
export function publishingHdDone(label) {
  return hopTacTagStatus(label, "Publishing") === "done";
}
