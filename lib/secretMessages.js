// Round 269 — Secret Messages: shared matching logic between the sidebar's
// unread-count poll, the popup-on-arrival check, and the recipient's own
// read page, so all three always agree on "is this message for me" instead
// of drifting into three slightly different copies of the same rule.

import { hasUnrestrictedSecretMessageReach } from "./permissions";

export const SECRET_MESSAGE_TARGET_TYPES = ["individual", "segment", "subteam", "role", "all"];

// ── Round 306 — team-scoped sending ──────────────────────────────────────
// Secret Messages moved from a dev-only tool to a "team-based allowance":
// any admin can send, but (Legal excepted, see
// hasUnrestrictedSecretMessageReach) only within their own team. "Role" and
// "all" both broadcast across every team by nature, so a scoped admin
// simply isn't offered those two target types at all — there's no sensible
// "role, but only within my team" or "everyone, but only my team" reading
// of either.
export function allowedSecretMessageTargetTypes(profile) {
  if (hasUnrestrictedSecretMessageReach(profile)) return SECRET_MESSAGE_TARGET_TYPES;
  return ["individual", "segment", "subteam"];
}
// The "Person" picker's options for a scoped admin — their own team only.
// Unrestricted senders keep seeing everyone, unchanged.
export function scopedSecretMessageProfiles(profile, allProfiles) {
  if (hasUnrestrictedSecretMessageReach(profile)) return allProfiles || [];
  return (allProfiles || []).filter((p) => p.segment === profile?.segment);
}
// The "Subteam" picker's options for a scoped admin — only subteams that
// belong to their own team. subteamChoices is the {team, name}[] shape
// already built from SUBTEAM_OPTIONS at the call site.
export function scopedSecretMessageSubteamChoices(profile, subteamChoices) {
  if (hasUnrestrictedSecretMessageReach(profile)) return subteamChoices || [];
  return (subteamChoices || []).filter((s) => s.team === profile?.segment);
}
// Sent-history visibility: a scoped admin shouldn't see every OTHER team's
// secret messages just because they can now reach Config^H^H^H the Secret
// Messages page at all — that would leak e.g. a Legal-to-individual message
// to an OPS admin. They see messages they sent themselves, plus anything
// targeted within their own team (segment/subteam/individual all resolved
// against that team). "role" and "all" messages are never in a scoped
// admin's own-team scope, even if they happen to also work on that team —
// those are cross-team by construction, and only ever sendable/visible to
// an unrestricted sender in the first place. Unrestricted senders (dev, or
// an admin on Legal) see the full history, unchanged from before.
//
// profileById is a Map/lookup of profile id -> profile (for resolving
// 'individual' targets to a segment) and subteamTeamByName maps a subteam
// name -> the team it belongs to (for resolving 'subteam' targets) — both
// built once at the call site from data it's already loaded anyway.
export function isSecretMessageInAdminScope(profile, msg, profileById, subteamTeamByName) {
  if (hasUnrestrictedSecretMessageReach(profile)) return true;
  if (!msg || !profile) return false;
  if (msg.created_by === profile.id) return true;
  if (msg.target_type === "segment") return msg.target_value === profile.segment;
  if (msg.target_type === "subteam") return subteamTeamByName?.[msg.target_value] === profile.segment;
  if (msg.target_type === "individual") return profileById?.[msg.target_value]?.segment === profile.segment;
  return false; // 'role' / 'all' — cross-team by nature, never in-scope for a scoped admin
}

export function isSecretMessageForProfile(msg, profile) {
  if (!msg || !profile) return false;
  switch (msg.target_type) {
    case "all":
      return true;
    case "individual":
      return msg.target_value === profile.id;
    case "segment":
      return !!profile.segment && msg.target_value === profile.segment;
    case "subteam":
      return !!profile.subteam && msg.target_value === profile.subteam;
    case "role":
      return !!profile.role && msg.target_value === profile.role;
    default:
      return false;
  }
}

// Fetches every non-deleted secret_messages row and filters to the ones
// targeted at this profile. Deliberately fetches the small "all active"
// set rather than trying to push the individual/segment/subteam/role OR
// logic into a PostgREST filter string — the table is expected to stay
// small (dev-authored, one-off messages, not a firehose), so this is cheap
// and keeps the matching rule in one place (above) instead of duplicated
// as a query string too.
export async function loadMyActiveSecretMessages(supabase, profile) {
  if (!supabase || !profile?.id) return [];
  const { data } = await supabase
    .from("secret_messages")
    .select("*, sender:profiles!secret_messages_created_by_fkey(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data || []).filter((m) => isSecretMessageForProfile(m, profile));
}

// Round 297 — per-recipient "hide" list, separate from the dev-side
// deleted_at column. Round 273 deliberately removed dev's ability to
// delete a sent message (permanent record, no covering tracks) — this is
// a different thing: once a recipient is done reading a message, THEY can
// hide it from their own sidebar/list for clarity, without touching the
// underlying row at all. Same localStorage-per-profile pattern as the
// existing "seen" list above (`vieent_secret_seen_${profile.id}`, which
// only gates the one-time popup) — this is a second, independent list
// that also gates the sidebar badge/link and the /secret-messages list.
// Purely client-side/per-device by design, matching the existing seen
// list's convention; no schema change needed.
function hiddenStorageKey(profileId) {
  return `vieent_secret_hidden_${profileId}`;
}

export function getHiddenSecretMessageIds(profileId) {
  if (!profileId || typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(hiddenStorageKey(profileId)) || "[]");
  } catch {
    return [];
  }
}

export function hideSecretMessageForProfile(profileId, messageId) {
  if (!profileId || !messageId || typeof window === "undefined") return;
  try {
    const hidden = getHiddenSecretMessageIds(profileId);
    if (!hidden.includes(messageId)) {
      window.localStorage.setItem(hiddenStorageKey(profileId), JSON.stringify([...hidden, messageId].slice(-500)));
    }
  } catch {}
}

// Human-readable description of who a message was sent to — used in the
// dev composer's history list.
export function describeTarget(msg) {
  if (!msg) return "";
  switch (msg.target_type) {
    case "all": return "Everyone";
    case "individual": return msg.recipientName ? `${msg.recipientName} (individual)` : "One person";
    case "segment": return `Team: ${msg.target_value}`;
    case "subteam": return `Subteam: ${msg.target_value}`;
    case "role": return `Role: ${msg.target_value}`;
    default: return msg.target_type || "—";
  }
}
