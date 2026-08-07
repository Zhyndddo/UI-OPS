import { supabase } from "./supabaseClient";

// Keeps the parent batch ticket's own `status` in sync with its children,
// so "batch fully complete" can ride the EXISTING notify_on_ticket_complete
// DB trigger (fires when a ticket's status becomes 'COMPLETE') instead of
// needing new trigger logic — see add-round33-batch-phai-sinh.sql's header
// comment. Call this after any child item's status changes.
//
// Rule: every item COMPLETE or CANCELED -> parent becomes COMPLETE (fires
// the trigger, notifies AR). If the parent was COMPLETE but a child got
// reopened (status set back to REQUESTED/PROCESS after the batch had
// already resolved), the parent drops back to PROCESS — a real state
// change, not a no-op, so anyone watching the batch list sees it's active
// again.
export async function recomputeBatchStatus(batchTicketId) {
  if (!supabase || !batchTicketId) return;
  const { data: items } = await supabase
    .from("phai_sinh_batch_items")
    .select("status")
    .eq("batch_ticket_id", batchTicketId)
    .is("deleted_at", null);
  if (!items || items.length === 0) return;

  const allResolved = items.every((i) => i.status === "COMPLETE" || i.status === "CANCELED");
  const { data: ticket } = await supabase.from("tickets").select("status, status_log").eq("id", batchTicketId).single();
  if (!ticket) return;

  if (allResolved && ticket.status !== "COMPLETE") {
    await supabase.from("tickets").update({
      status: "COMPLETE",
      status_log: { ...ticket.status_log, COMPLETE: new Date().toISOString() },
    }).eq("id", batchTicketId);
  } else if (!allResolved && ticket.status === "COMPLETE") {
    await supabase.from("tickets").update({
      status: "PROCESS",
      status_log: { ...ticket.status_log, PROCESS: new Date().toISOString() },
    }).eq("id", batchTicketId);
  }
}

// Progress summary for the batch list page — { done, total }, where "done"
// counts COMPLETE + CANCELED (same "resolved" definition as above).
export function batchProgress(items) {
  const total = items.length;
  const done = items.filter((i) => i.status === "COMPLETE" || i.status === "CANCELED").length;
  return { done, total };
}
