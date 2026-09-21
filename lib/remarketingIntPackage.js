// Round 409 — "i want it to automatically send to booking ticket
// proposed and treat as a final INT package" for any release whose
// Category (release_category) becomes "Remarketing". Per explicit
// decision this fires on BOTH creation (app/new-release/page.js) and any
// later edit that flips an existing release's category to "Remarketing"
// (app/releases/[id]/page.js's saveTab(), same hook point Round 404's
// notifyReleaseCriticalChange uses).
//
// Deliberately NOT the same 3-state flow the manual "Send INT Package"
// button (sendIntPackage, app/releases/[id]/page.js) walks a human
// through — that one waits for Marketing to build/complete the ticket
// before a human can lock it in (state C, dev/AR-only). This skips
// straight to locked, in one shot: creates the Media Booking ticket
// proposed as INT MEDIA, then immediately calls the same runOne() commit
// path Package Runner and sendIntPackage's own state C use — no human
// step in between, per explicit "auto-finalize immediately" decision.
//
// Per explicit decision: if the release already has an open Media
// Booking ticket, OR is already package_locked, this never overwrites
// that existing decision — it's left completely alone, and a
// system_messages notice (Round 404's mechanism) tells AR/OPS admins to
// double check it by hand instead.

import { runOne } from "./packageSimulator";
import { isOpsTeam } from "./teamTypes";
import { isAdminOrAbove } from "./permissions";
import { createSystemMessage } from "./systemMessages";

export async function ensureRemarketingIntPackage(supabase, { release, actorProfileId, allProfiles }) {
  if (!supabase || !release?.id || !release?.did) return { ok: false, reason: "no_release" };

  const { data: mbTab } = await supabase.from("ticket_tabs").select("id").eq("key", "media_booking").single();
  if (!mbTab) return { ok: false, reason: "no_media_booking_tab" };

  const { data: existingTicket } = await supabase
    .from("tickets")
    .select("id")
    .eq("tab_id", mbTab.id)
    .contains("data", { releaseId: release.did })
    .is("deleted_at", null)
    .maybeSingle();

  // Re-fetch fresh — `release` as passed in by either caller may be a
  // few fields short (new-release's payload) or a moment stale (the
  // release detail page's own in-memory `release`/`form`), and
  // package_locked/project_type/legacy_id specifically need to be current
  // right before deciding whether to touch this release at all.
  const { data: freshRelease } = await supabase
    .from("releases")
    .select("id, did, title, main_artist, package_locked, project_type, legacy_id")
    .eq("id", release.id)
    .maybeSingle();
  const alreadyLocked = !!freshRelease?.package_locked;

  if (existingTicket || alreadyLocked) {
    const profiles = allProfiles || (await supabase.from("profiles").select("id, role, segment").then(({ data }) => data || []));
    const recipientIds = new Set(
      profiles.filter((p) => p.segment === "AR" || (isOpsTeam(p.segment) && isAdminOrAbove(p))).map((p) => p.id)
    );
    recipientIds.delete(actorProfileId);
    if (recipientIds.size > 0) {
      await createSystemMessage(supabase, {
        kind: "remarketing_int_package_conflict",
        title: `${freshRelease?.title || release.title || release.did} — already has a package in progress`,
        body: `This release just became Remarketing, but it already ${existingTicket ? "has an open Media Booking ticket" : `is package-locked (currently "${freshRelease?.project_type || "—"}")`}. Left it untouched — check by hand if it should be the final INT package instead.`,
        link: `/releases/${release.id}`,
        recipientProfileIds: [...recipientIds],
        source: { releaseId: release.id, did: release.did, conflict: existingTicket ? "existing_ticket" : "already_locked" },
        hoursValid: 24,
      });
    }
    return { ok: false, reason: existingTicket ? "existing_ticket" : "already_locked" };
  }

  // Create the ticket, proposed as INT MEDIA — same insert shape
  // sendIntPackage's own "no ticket yet" state (A) writes.
  const { data: created, error: insertErr } = await supabase
    .from("tickets")
    .insert({
      tab_id: mbTab.id,
      data: { releaseId: release.did, proposedPackage: "INT MEDIA" },
      status: "REQUESTED",
      status_log: { REQUESTED: new Date().toISOString() },
      requester_segment: "AR",
      requester_profile_id: actorProfileId || null,
    })
    .select()
    .single();
  if (insertErr) {
    console.error("ensureRemarketingIntPackage's ticket insert failed:", insertErr);
    return { ok: false, reason: insertErr.message };
  }

  // Lock it straight to INT MEDIA — the exact commit path a real artist
  // magic-link confirm (or sendIntPackage's own state C) uses, so Phụ Lục
  // etc. auto-create identically to a real pick.
  const r = await runOne({ did: release.did, legacyDid: freshRelease?.legacy_id || "", contractType: "INT MEDIA" }, { allowOverwrite: false });
  if (!r.ok) {
    console.error("ensureRemarketingIntPackage's runOne failed:", r.reason);
    return { ok: false, reason: r.reason, ticketId: created?.id || null };
  }

  await supabase.from("releases").update({ int_media_requested: true }).eq("id", release.id);

  return { ok: true, ticketId: created?.id || null };
}
