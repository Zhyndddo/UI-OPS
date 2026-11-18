// Round 645 — server helpers: change log + the AR ticket for a song (service-role client). Never throws: logging / ticketing must not break the form.
export async function logRights(db, e) {
  try {
    await db.from("rights_declaration_log").insert({
      song_key: e.song_key || null, declaration_id: e.declaration_id || null, ticket_id: e.ticket_id || null,
      action: e.action, actor: e.actor || "public", reason: e.reason ? String(e.reason).slice(0, 1000) : null, detail: e.detail || null, ip: e.ip || null,
    });
  } catch (err) { console.error("[rights log]", err.message); }
}

// One ticket per song (key = title_key|artist_key). A new declaration for a song that already has a ticket REOPENS that ticket
// (status back to PENDING, pointing at the newest declaration) instead of making a second one.
export async function ensureRightsTicket(db, d) {   // d: { id, song_key, song_title, performer, signer_name, release_id? }
  try {
    const { data: tab } = await db.from("ticket_tabs").select("id").eq("key", "rights_declaration").maybeSingle();
    if (!tab) return null;   // SQL not run yet
    const patch = { declarationId: d.id, title: d.song_title, artist: d.performer || "", songKey: d.song_key, ...(d.release_id ? { releaseId: d.release_id } : {}) };
    const { data: old } = await db.from("tickets").select("id, data").eq("tab_id", tab.id).is("deleted_at", null).eq("data->>songKey", d.song_key).order("created_at").limit(1);
    if (old?.length) {
      await db.from("tickets").update({ data: { ...(old[0].data || {}), ...patch }, status: "PENDING", updated_at: new Date().toISOString() }).eq("id", old[0].id);
      return { id: old[0].id, reopened: true };
    }
    let pic = null;
    if (d.release_id) { const { data: r } = await db.from("releases").select("ar_pic_profile_id").eq("id", d.release_id).maybeSingle(); pic = r?.ar_pic_profile_id || null; }
    const { data: ins, error } = await db.from("tickets").insert({
      tab_id: tab.id, data: patch, requester_segment: "Public", requester_name: d.signer_name || null, status: "PENDING",
      ...(pic ? { pic_profile_id: pic, pic_profile_ids: [pic] } : {}),
    }).select("id").maybeSingle();
    if (error) { console.error("[rights ticket] insert failed:", error.message); return null; }
    return { id: ins?.id, reopened: false };
  } catch (err) { console.error("[rights ticket]", err.message); return null; }
}

export async function setRightsTicketStatus(db, ticketId, status) {
  if (!ticketId) return;
  try {
    const now = new Date().toISOString();
    const { data: t } = await db.from("tickets").select("status_log").eq("id", ticketId).maybeSingle();
    await db.from("tickets").update({ status, status_log: { ...(t?.status_log || {}), [status]: now }, updated_at: now }).eq("id", ticketId);
  } catch (err) { console.error("[rights ticket status]", err.message); }
}
