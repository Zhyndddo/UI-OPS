// Round 632 — who receives recaps beyond the internal group.
//  * dmCopies: private Telegram DM copy to the profiles picked in Config → notification_settings.recap_dm_profiles
//    (they must have run /link with Friday in a private chat; unlinked / blocked ones are reported, never fatal).
//  * emailRecipients: digest_recipients (or admin/dev when empty) PLUS everyone in the OPS segment, de-duplicated.
import { sendTelegramTo } from "./telegram";

export async function dmCopies(db, html) {
  const out = { sent: 0, unlinked: [], blocked: [], failed: [] };
  try {
    const { data: s } = await db.from("notification_settings").select("recap_dm_profiles").eq("id", 1).maybeSingle();
    const ids = s?.recap_dm_profiles || [];
    if (!ids.length) return out;
    const [{ data: links }, { data: profs }] = await Promise.all([
      db.from("tg_links").select("profile_id, dm_chat_id").in("profile_id", ids),
      db.from("profiles").select("id, name").in("id", ids),
    ]);
    const nameOf = Object.fromEntries((profs || []).map((p) => [p.id, p.name || p.id]));
    for (const id of ids) {
      const lk = (links || []).find((l) => l.profile_id === id && l.dm_chat_id);
      if (!lk) { out.unlinked.push(nameOf[id] || id); continue; }
      const r = await sendTelegramTo(lk.dm_chat_id, html).catch((e) => ({ ok: false, error: e.message }));
      if (r.ok) out.sent += 1;
      else if (r.blocked) out.blocked.push(nameOf[id] || id);
      else out.failed.push(nameOf[id] || id);
    }
  } catch (e) { out.error = e.message; }
  return out;
}

export async function emailRecipients(db, configured) {
  let list = [...(configured || [])];
  if (!list.length) {
    const { data: admins } = await db.from("profiles").select("email").in("role", ["admin", "dev"]);
    list = (admins || []).map((p) => p.email).filter(Boolean);
  }
  const { data: ops } = await db.from("profiles").select("email").eq("segment", "OPS");
  list.push(...(ops || []).map((p) => p.email).filter(Boolean));
  const seen = new Set();
  return list.filter((e) => { const k = String(e).trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}
