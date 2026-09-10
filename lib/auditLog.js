// Round 281 — thin wrapper around the `audit_log` table, which existed in
// the schema (actor/action/entity/entity_id/field/before_val/after_val,
// plus a lookup index on created_at/actor/entity) but nothing ever wrote to
// it. Built after investigating Media Booking tickets reverting to
// REQUESTED — that turned out to be 4 legitimate UI-driven paths, but there
// was no way to tell WHO triggered any of them, only WHEN (status_log is
// timestamp-only). This is the general fix: every meaningful ticket/
// release/workstation-assignment change now writes one row here.
//
// Fire-and-forget by design — logging must never block or fail the primary
// action it's describing. Every failure is swallowed (and console.error'd)
// rather than thrown, same idiom as the rest of the app's non-critical
// writes (e.g. fanout_notification calls).
//
// `actor` is always a profiles.id (uuid, as text) — never a display name —
// so entries stay valid across name/role changes and are joinable back to
// profiles for display later. Pass null only for a genuinely system-
// initiated write with no human behind it — as of this round that's just
// the workstation auto-assign fallback (lib/workstationHelpers.js's
// autoAssignUnassigned, fires on page load, no click). Every other ticket/
// release mutation in the app traces back to a human action, even the
// "semi-automatic" release-detail cascades — attribute those to whoever
// performed the save/click that caused them.
import { supabase } from "./supabaseClient";

export async function logAudit({ actor, action, entity, entityId, field = null, before = null, after = null }) {
  if (!supabase) return;
  try {
    await supabase.from("audit_log").insert({
      actor: actor || null,
      action,
      entity,
      entity_id: entityId != null ? String(entityId) : null,
      field,
      before_val: before === undefined ? null : before,
      after_val: after === undefined ? null : after,
    });
  } catch (e) {
    // Best-effort — never let a logging failure surface to the user or
    // block the action it's describing.
    console.error("logAudit failed:", action, entity, entityId, e);
  }
}

// Convenience for the single most common shape: a ticket's status changed.
// "reopen" vs "status_change" vs "complete" is inferred from the tab's own
// status_options order — moving to an EARLIER status than the one being
// replaced (e.g. COMPLETE -> REQUESTED, PROCESS -> REQUESTED) is a reopen;
// moving to "COMPLETE" specifically is a complete; anything else (forward
// progress, e.g. REQUESTED -> PROCESS) is a plain status_change. Falls back
// to "status_change" when statusOptions isn't available to the caller.
export function classifyStatusChange(prevStatus, newStatus, statusOptions) {
  if (newStatus === "COMPLETE") return "complete";
  if (Array.isArray(statusOptions) && statusOptions.length > 0) {
    const prevIdx = statusOptions.indexOf(prevStatus);
    const nextIdx = statusOptions.indexOf(newStatus);
    if (prevIdx > -1 && nextIdx > -1 && nextIdx < prevIdx) return "reopen";
  }
  return "status_change";
}

export async function logTicketStatusChange({ actor, ticketId, prevStatus, newStatus, statusOptions }) {
  return logAudit({
    actor,
    action: classifyStatusChange(prevStatus, newStatus, statusOptions),
    entity: "ticket",
    entityId: ticketId,
    field: "status",
    before: prevStatus,
    after: newStatus,
  });
}

export async function logTicketCreate({ actor, ticketId }) {
  return logAudit({ actor, action: "create", entity: "ticket", entityId: ticketId });
}

export async function logTicketDelete({ actor, ticketId }) {
  return logAudit({ actor, action: "delete", entity: "ticket", entityId: ticketId });
}

// before/after are each a single PIC's profile id, or an array of profile
// ids for the tag-style PIC fields — pass whatever shape the caller has,
// it's stored as-is in the jsonb before_val/after_val columns.
export async function logPicReassign({ actor, entity, entityId, before, after }) {
  return logAudit({ actor, action: "reassign", entity, entityId, field: "pic", before, after });
}

export async function logDeadlineChange({ actor, entity, entityId, before, after }) {
  return logAudit({ actor, action: "deadline_change", entity, entityId, field: "deadline", before, after });
}
