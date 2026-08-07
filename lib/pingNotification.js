import { supabase } from "./supabaseClient";

// Manual "Ping" — inserts directly into the same `notifications` table
// NotificationBell.js reads (see that file's header comment: it only ever
// reads, the DB-side notify_on_ticket_insert/notify_on_ticket_complete
// triggers are what normally write to it). This is the one deliberate
// exception — a person choosing to flag something right now, instead of
// it being wired to an automatic trigger. Used by Batch Phái Sinh (both
// the batch-level and per-item Ping buttons) per explicit request: keep
// automatic notifications minimal (created / fully complete / overdue
// only), let a human decide when something else needs attention.
//
// targetProfileIds — who to notify. Batch Phái Sinh's own callers resolve
// this as: the batch's (or item's) assigned PIC if one is set, else every
// OPS profile (Youtube/Publishing/Operation segments) as a fallback —
// there's no requester_profile_id column on tickets (only requester_name/
// requester_segment, free text), so a ping can't be targeted at "the
// specific AR person who requested this," only at whoever's assigned to
// work it or the team as a whole. Flagging that limitation here since a
// future round may want a real requester_profile_id column if per-person
// requester pings turn out to matter.
export async function sendPing({ targetProfileIds, ticketId, title, body, link }) {
  if (!supabase || !targetProfileIds || targetProfileIds.length === 0) return;
  const rows = targetProfileIds.map((profileId) => ({
    profile_id: profileId,
    ticket_id: ticketId,
    title,
    body,
    link,
    created_at: new Date().toISOString(),
  }));
  await supabase.from("notifications").insert(rows);
}

// Resolves "who should a ping about this batch/item go to" — the item's
// (or batch's) own PIC if set, else every OPS profile, matching
// flag_overdue_batch_items()'s own fallback in schema.sql so manual pings
// and the automatic overdue sweep land on the same people by default.
export async function resolvePingTargets(picProfileId) {
  if (picProfileId) return [picProfileId];
  if (!supabase) return [];
  const { data } = await supabase.from("profiles").select("id").or("segment.eq.OPS,segment.eq.Youtube,segment.eq.Publishing,segment.eq.Operation");
  return (data || []).map((p) => p.id);
}

// Round 34 — Design flow needs to notify a handful of app-level audiences
// that don't map to sendPing's "PIC or a whole team" model: specific dev
// profiles (urgent creation), a specific named account by email (the
// reminder/late/overload notifications all name "anh.duong@vieent.vn"
// explicitly), and a whole team by segment (AR, for the pending/revise
// count). All still just insert directly into `notifications` — same
// "manual/app-triggered, not a DB trigger" category as sendPing above,
// since these have no natural home on an existing DB trigger either.
export async function resolveProfilesByRole(role) {
  if (!supabase) return [];
  const { data } = await supabase.from("profiles").select("id").eq("role", role);
  return (data || []).map((p) => p.id);
}

export async function resolveProfilesByEmail(email) {
  if (!supabase || !email) return [];
  const { data } = await supabase.from("profiles").select("id").ilike("email", email);
  return (data || []).map((p) => p.id);
}

export async function resolveProfilesBySegment(segment) {
  if (!supabase || !segment) return [];
  const { data } = await supabase.from("profiles").select("id").eq("segment", segment);
  return (data || []).map((p) => p.id);
}
