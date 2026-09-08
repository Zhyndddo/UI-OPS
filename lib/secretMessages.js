// Round 269 — Secret Messages: shared matching logic between the sidebar's
// unread-count poll, the popup-on-arrival check, and the recipient's own
// read page, so all three always agree on "is this message for me" instead
// of drifting into three slightly different copies of the same rule.

export const SECRET_MESSAGE_TARGET_TYPES = ["individual", "segment", "subteam", "role", "all"];

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
