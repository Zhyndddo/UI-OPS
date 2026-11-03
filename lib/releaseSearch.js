// Round 579 — server-side release search for the ticket pickers. The pickers used to filter only the newest 200-300 releases
// in the browser, so older products (e.g. before August) could never be found. This asks the database instead.
import { supabase } from "./supabaseClient";

export async function searchReleases(q, limit = 30) {
  const t = String(q || "").trim().replace(/[%,()*]/g, " ").replace(/\s+/g, " ").slice(0, 60);
  if (t.length < 2 || !supabase) return [];
  const { data, error } = await supabase
    .from("releases")
    .select("id, did, title, main_artist, label, release_date, isrc, upc")
    .or(`title.ilike.%${t}%,main_artist.ilike.%${t}%,did.ilike.%${t}%`)
    .order("created_at", { ascending: false })
    .limit(limit);
  return error ? [] : data || [];
}

// merge: local (already loaded) matches first, then server hits not already present
export function mergeReleases(local, remote, max) {
  const seen = new Set(local.map((r) => r.id));
  return [...local, ...remote.filter((r) => !seen.has(r.id))].slice(0, max);
}
