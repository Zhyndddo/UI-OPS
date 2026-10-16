import { findDuplicateTicketKeys } from "./duplicateTicketGuard";
import { computeNextMaPL } from "./phuLucCounter";

// Round 523 — single place that makes sure a locked-in package has its
// Phụ Lục Truyền Thông ticket. Previously three call sites each had their
// own copy, gated on the release having been in a pipeline stage, and none
// checked the insert error — so a failed insert (e.g. the R521 anon
// notification-trigger rollback) was silent.
//
// Safe to call repeatedly: re-checks the live DB for a non-deleted ticket
// with data.releaseId = release.id before inserting.
// Returns { ok, created, existed, error }.
export async function ensurePhuLucTicket(supabase, release) {
  if (!supabase || !release?.id) return { ok: false, created: false, existed: false, error: "missing release" };
  const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id").eq("key", "phu_luc").single();
  if (tabErr || !tab) return { ok: false, created: false, existed: false, error: tabErr?.message || "phu_luc tab not found" };

  const dupes = await findDuplicateTicketKeys(supabase, tab.id, [{ label: release.id, filters: { releaseId: release.id } }]);
  if (dupes.length > 0) return { ok: true, created: false, existed: true, error: null };

  const maPL = await computeNextMaPL(release.label);
  const { error } = await supabase.from("tickets").insert({ tab_id: tab.id, data: { releaseId: release.id, maPL } });
  if (error) {
    console.error("[ensurePhuLucTicket] insert failed for release", release.id, error.message);
    return { ok: false, created: false, existed: false, error: error.message };
  }
  return { ok: true, created: true, existed: false, error: null };
}
