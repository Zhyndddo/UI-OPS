// Round 665 — "Duplicate request": copy a ticket's fields into a NEW ticket of the same tab (fresh status, no PIC, requester = whoever clicked).
// Used by Report Conflict and Manual Claim. Keys starting "__" (edited-by-requester markers etc.) are not copied.
export async function duplicateTicket(supabase, tab, ticket, profile) {
  if (!tab || !ticket) return { error: { message: "Missing ticket" } };
  const data = {};
  Object.entries(ticket.data || {}).forEach(([k, v]) => { if (!k.startsWith("__")) data[k] = v; });
  const now = new Date().toISOString();
  const { data: row, error } = await supabase.from("tickets").insert({
    tab_id: tab.id,
    data,
    status: tab.default_status,
    status_log: { [tab.default_status]: now },
    requester_segment: profile?.segment || null,
    requester_name: profile?.name || null,
  }).select("*, profiles!tickets_pic_profile_id_fkey(name)").maybeSingle();
  return { error, row };
}
