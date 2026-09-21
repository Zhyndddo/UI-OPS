// Round 404 item 3 — a release's critical info (release date/time, main
// artist, feature artist, title) changing after other teams may have
// already worked off the old values. Per explicit decision, notifies
// (union of all three, deduped):
//   1. Everyone with an OPEN ticket or workstation row on this release
//      (they're the ones who may have already used the old info).
//   2. Every OPS admin.
//   3. Whoever's on the release's own Marketing subteam tag(s), if any.
// Fires as a new system_messages row (see lib/systemMessages.js) — this
// is the app noticing something, not a person sending a message.

import { isOpsTeam } from "./teamTypes";
import { isAdminOrAbove } from "./permissions";
import { effectiveSubteamTags } from "./releaseTags";
import { createSystemMessage } from "./systemMessages";

export const RELEASE_CRITICAL_FIELDS = {
  release_date: "Release Date",
  release_time: "Release Time",
  main_artist: "Main Artist",
  feature_artist: "Feature Artist",
  title: "Title",
};

// A broad, deliberately loose "not clearly finished" filter — this app's
// terminal-status vocab varies by ticket type (see lib/notDoneCounts.js's
// TERMINAL_EXECUTOR/TERMINAL_REPORT_CONFLICT_EXECUTOR/TERMINAL_DESIGN),
// and getting every one of those exactly right isn't worth the
// complexity for a "heads up, something changed" notice — better to
// occasionally notify someone whose ticket juuust completed than to
// silently miss a type this list doesn't know about.
const CLEARLY_DONE_STATUSES = ["COMPLETE", "CANCELED", "CANCEL", "REFUND", "Hoàn thành", "Từ chối", "Hủy"];

// Collects every profile id that currently has a stake in this release —
// an open ticket pointing at it (by did OR id, since ticket types split
// on which one they store, see lib/GateFields.js's GATE_TICKET_TYPES
// comment) or a workstation_assignments row for it.
async function collectReleaseStakeholderIds(supabase, release) {
  const ids = new Set();

  const { data: byDid } = release.did
    ? await supabase.from("tickets").select("pic_profile_id, pic_profile_ids, status").eq("data->>releaseId", release.did).is("deleted_at", null)
    : { data: [] };
  const { data: byId } = await supabase.from("tickets").select("pic_profile_id, pic_profile_ids, status").eq("data->>releaseId", release.id).is("deleted_at", null);
  [...(byDid || []), ...(byId || [])].forEach((t) => {
    if (CLEARLY_DONE_STATUSES.includes(t.status)) return;
    if (t.pic_profile_id) ids.add(t.pic_profile_id);
    (t.pic_profile_ids || []).forEach((pid) => ids.add(pid));
  });

  const { data: assigns } = await supabase.from("workstation_assignments").select("pic_profile_id").eq("release_id", release.id);
  (assigns || []).forEach((a) => { if (a.pic_profile_id) ids.add(a.pic_profile_id); });

  return ids;
}

// The 3 changed-field-agnostic recipient sets, resolved together against
// one profiles fetch. `allProfiles` is optional — pass it if the caller
// already has a fresh list (e.g. the release detail page usually does),
// otherwise this fetches its own.
export async function resolveReleaseChangeRecipients(supabase, release, allProfiles) {
  const profiles = allProfiles || (await supabase.from("profiles").select("id, role, segment, subteam").then(({ data }) => data || []));
  const ids = await collectReleaseStakeholderIds(supabase, release);
  profiles.forEach((p) => {
    if (isOpsTeam(p.segment) && isAdminOrAbove(p)) ids.add(p.id);
  });
  const subteamTags = effectiveSubteamTags(release);
  if (subteamTags.length > 0) {
    profiles.forEach((p) => {
      if (p.segment === "Marketing" && p.subteam && subteamTags.includes(p.subteam)) ids.add(p.id);
    });
  }
  return ids;
}

// Called from app/releases/[id]/page.js's saveTab() after a successful
// write. `changedFields` is {key: {from, to}} for whichever of
// RELEASE_CRITICAL_FIELDS actually changed this save. `actorProfileId` is
// excluded from the recipient set — no point telling someone about the
// edit they just made themselves. Fire-and-forget from the caller's
// perspective (returns a promise, but saveTab doesn't need to await it
// before finishing the save) — a failure here should never block or roll
// back the release write itself.
export async function notifyReleaseCriticalChange(supabase, { release, changedFields, actorProfileId, allProfiles }) {
  const fieldKeys = Object.keys(changedFields || {});
  if (!supabase || fieldKeys.length === 0) return null;

  const ids = await resolveReleaseChangeRecipients(supabase, release, allProfiles);
  ids.delete(actorProfileId);
  if (ids.size === 0) return null;

  const changeLines = fieldKeys.map((k) => {
    const { from, to } = changedFields[k];
    const label = RELEASE_CRITICAL_FIELDS[k] || k;
    return `${label}: ${from || "—"} → ${to || "—"}`;
  });

  return createSystemMessage(supabase, {
    kind: "release_critical_change",
    title: `${release.title || release.did || "A release"} — info changed`,
    body: `${release.title || "This release"}'s critical info was updated after you were already assigned:\n\n${changeLines.join("\n")}`,
    link: `/releases/${release.id}`,
    recipientProfileIds: [...ids],
    source: { releaseId: release.id, did: release.did, changedFields },
    hoursValid: 24,
  });
}
