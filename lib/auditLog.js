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

// Round 453 — safety-net log for the Round 442 convergence bug (see
// claude/round452-root-cause-442-sql-never-applied.md). Media Booking's
// Summarize can still, by construction, write the same quantity+unit_price
// onto two different packages' lines for the same category/brand — that's
// not necessarily wrong by itself (two tiers CAN legitimately need the same
// number). What was actually wrong, pre-442, was the two numbers being
// silently tied together at the DB level via one shared row, so neither
// side could ever change independently again. Now that
// content_entries/package_categories are package-scoped, that can't happen
// at the data layer anymore — but this still logs every time a Summarize
// makes two sibling packages' numbers coincide, capturing what THIS
// package's own number was right before the write. If the old shared-row
// behavior were ever to resurface (a regression, a rollback, a schema
// drift someone doesn't notice), there's a paper trail of the last known
// distinct value instead of silence — see
// app/tickets/media-booking/page.js's checkPackageLineConvergence, the one
// call site.
export async function logPackageLineConvergence({
  actor, releaseId, packageId, packageName, categoryId, brand, lineId,
  beforeQuantity, beforeUnitPrice, afterQuantity, afterUnitPrice,
  matchedPackageId, matchedPackageName,
}) {
  return logAudit({
    actor,
    action: "package_line_converged",
    entity: "media_booking_package_line",
    entityId: lineId || `${packageId}:${categoryId}:${brand || ""}`,
    field: "quantity+unit_price",
    before: {
      release_id: releaseId, package_id: packageId, package_name: packageName,
      category_id: categoryId, brand: brand || "",
      quantity: beforeQuantity, unit_price: beforeUnitPrice,
    },
    after: {
      quantity: afterQuantity, unit_price: afterUnitPrice,
      matched_package_id: matchedPackageId, matched_package_name: matchedPackageName,
    },
  });
}

// Round 464 — who changed which Package Builder number, and from what.
// Added after a "2 năm" package kept reverting and the only evidence was
// the lines' updated_at (when, never who/why). One small row per human
// action (a line edit, a Summarize overwrite, a package create/delete or
// clone) — never per row inside a bulk operation, and never from a
// database trigger, so a clone copying 15 lines logs once, not 15 times.
// `source` says which code path wrote it: "edit" (typed in the line box),
// "summarize" (rebuilt from the DSP grid), "youtube_ads_edit", "delete_line",
// "create_package", "delete_package", "clone".
export async function logPackageLineChange({
  actor, releaseId, packageId, packageName, lineId, source,
  before = null, after = null,
}) {
  // Skip no-op writes (same quantity/amount/unit_price) so re-Summarizing
  // an unchanged grid doesn't fill the log.
  if (before && after) {
    const same = ["quantity", "amount", "unit_price"].every((k) => (before[k] ?? null) === (after[k] ?? null));
    if (same) return;
  }
  return logAudit({
    actor,
    action: `package_${source}`,
    entity: "media_booking_package_line",
    entityId: lineId || packageId,
    field: "quantity+amount+unit_price",
    before: { release_id: releaseId, package_id: packageId, package_name: packageName, ...(before || {}) },
    after,
  });
}

export async function logPackageEvent({ actor, releaseId, packageId, packageName, source, detail = null }) {
  return logAudit({
    actor,
    action: `package_${source}`,
    entity: "media_booking_package",
    entityId: packageId,
    field: null,
    before: { release_id: releaseId, package_name: packageName },
    after: detail,
  });
}
