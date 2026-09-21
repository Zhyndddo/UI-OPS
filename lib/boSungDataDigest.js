// Round 404 item 4 — Bổ Sung DATA notifications, two pieces:
//
//   1. A one-time Secret Message when a ticket is first created (see
//      sendBoSungDataCreatedPing, called from app/tickets/bo-sung-data/
//      new/page.js) — no PIC is ever set at creation (see that page's
//      own form), so this always goes to AR's admins.
//   2. A daily compiled digest of every still-undone ticket, generated
//      lazily the first time an AR profile loads the app that day (see
//      ensureBoSungDataDigest, called from lib/Sidebar.js) — a ticket
//      with a PIC reminds just that PIC; unassigned ones go out to AR
//      admins instead, per explicit decision.
//
// The daily digest rides the new system_messages mechanism (lib/
// systemMessages.js) since it's the app compiling something on its own,
// not a person sending a message — same reasoning as the release
// critical-change notice (lib/releaseChangeNotify.js).

import { isAdminOrAbove } from "./permissions";
import { createSystemMessage, hasSystemMessageToday } from "./systemMessages";

async function fetchArAdmins(supabase) {
  const { data } = await supabase.from("profiles").select("id, role, segment").eq("segment", "AR");
  return (data || []).filter((p) => isAdminOrAbove(p));
}

// Item 4 piece 1 — called right after a successful bo_sung_data ticket
// insert. Always targets AR admins since pic_profile_ids is always empty
// at creation time (see app/tickets/bo-sung-data/new/page.js's insert).
export async function sendBoSungDataCreatedPing(supabase, { ticket, release }) {
  if (!supabase) return;
  const admins = await fetchArAdmins(supabase);
  if (admins.length === 0) return;
  const messageText = `[Auto] New Bổ Sung DATA ticket — ${release?.title || release?.did || "a release"} (${release?.main_artist || "—"}) needs a PIC.`;
  const rows = admins.map((a) => ({ created_by: null, target_type: "individual", target_value: a.id, message: messageText }));
  const { error } = await supabase.from("secret_messages").insert(rows);
  if (error) console.error("sendBoSungDataCreatedPing failed:", error);
}

function ticketLine(t, releaseMap) {
  const r = releaseMap[t.data?.releaseId];
  const label = r ? `${r.title} — ${r.main_artist}` : t.data?.title || t.data?.releaseId || "Unknown release";
  const daysOpen = Math.max(0, Math.round((Date.now() - new Date(t.created_at).getTime()) / 86400000));
  return `• ${label} (open ${daysOpen}d)`;
}

// Item 4 piece 2 — idempotent per (profile, day): a second call the same
// day is a no-op (see hasSystemMessageToday). Call this for any AR
// profile on first load of the day (see lib/Sidebar.js); it decides for
// itself whether there's anything worth telling this particular person.
export async function ensureBoSungDataDigest(supabase, profile) {
  if (!supabase || !profile?.id || profile.segment !== "AR") return;
  const already = await hasSystemMessageToday(supabase, { kind: "bo_sung_data_digest", profileId: profile.id });
  if (already) return;

  const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "bo_sung_data").single();
  if (!tab) return;
  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, data, created_at, pic_profile_ids")
    .eq("tab_id", tab.id)
    .is("deleted_at", null)
    .neq("status", "COMPLETE");
  const undone = tickets || [];
  if (undone.length === 0) return;

  const mine = undone.filter((t) => (t.pic_profile_ids || []).includes(profile.id));
  const isAdmin = isAdminOrAbove(profile);
  const unassigned = isAdmin ? undone.filter((t) => (t.pic_profile_ids || []).length === 0) : [];
  if (mine.length === 0 && unassigned.length === 0) return;

  const dids = [...new Set([...mine, ...unassigned].map((t) => t.data?.releaseId).filter(Boolean))];
  let releaseMap = {};
  if (dids.length > 0) {
    const { data: rels } = await supabase.from("releases").select("did, title, main_artist").in("did", dids);
    (rels || []).forEach((r) => { releaseMap[r.did] = r; });
  }

  const sections = [];
  if (mine.length > 0) sections.push(`Your tickets (${mine.length}):\n${mine.map((t) => ticketLine(t, releaseMap)).join("\n")}`);
  if (unassigned.length > 0) sections.push(`Unassigned (${unassigned.length}):\n${unassigned.map((t) => ticketLine(t, releaseMap)).join("\n")}`);

  await createSystemMessage(supabase, {
    kind: "bo_sung_data_digest",
    title: `Bổ Sung DATA — ${mine.length + unassigned.length} still open`,
    body: sections.join("\n\n"),
    link: "/tickets/bo-sung-data",
    recipientProfileIds: [profile.id],
    source: { ticketIds: [...mine, ...unassigned].map((t) => t.id) },
    hoursValid: 24,
  });
}
