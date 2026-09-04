// Round 80 — shared by every ticket list's status-change handler, since
// this app has no single choke point for "change a ticket's status": each
// ticket type is either the generic TicketListPage/PhuLucStyleTicketList
// engine, or its own fully bespoke page with its own updateStatus. Rather
// than re-invent this per file, every one of them imports this pair.
//
// When a status change is landing on a refund/cancel-shaped value — across
// ANY ticket type's own vocabulary (English REFUND/CANCELED, Design's
// CANCEL, Report Conflict's Từ chối/Hủy) — this requires a short note
// explaining why, and folds it into ticket.data.note so it's visible
// wherever Note already shows (the shared NoteCell's hover-preview for
// types that have a Note column) or, for types with no Note column/field
// at all, via a plain native title= hover added on the Status cell itself
// in each list (see each file's "Round 80" comment near its status <td>).
const NOTE_REQUIRED_STATUSES = ["REFUND", "CANCELED", "CANCEL", "Từ chối", "Hủy"];

export function statusNeedsNote(status) {
  return NOTE_REQUIRED_STATUSES.includes(status);
}

// Returns the new `data` object with the reason appended (existing note
// content, if any, is kept — this appends, never overwrites), or null if
// the person cancelled the prompt or left it blank, meaning the caller
// should abort the status change entirely rather than proceed without a
// reason.
export function withStatusNote(existingData, newStatus) {
  const reason = window.prompt(`Why is this ticket moving to "${newStatus}"? (required)`, "");
  if (reason === null) return null; // Cancel button
  const trimmed = reason.trim();
  if (!trimmed) {
    window.alert("A reason is required to move a ticket to this status.");
    return null;
  }
  const stamp = new Date().toLocaleString();
  const prior = (existingData?.note || "").trim();
  const appended = `[${newStatus} — ${stamp}] ${trimmed}`;
  return { ...existingData, note: prior ? `${prior}\n\n${appended}` : appended };
}
