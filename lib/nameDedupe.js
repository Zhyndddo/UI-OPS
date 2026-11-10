// Round 592 — one place that answers "does this artist / label already exist?" for every create zone
// (reference tables, Quick Create "+", New Release quick-create, artist popup). Matching ignores case,
// accents, "đ" and extra spaces; for labels the "HĐ - " prefix is ignored too. Uses the SQL lookups from
// sql/pending/add-round592-name-dedupe.sql; if that file has not been run yet it falls back to a plain
// case-insensitive exact check, so nothing breaks in between.
import { stripLabelPrefix } from "./labelHelpers";

export const foldName = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase().replace(/\s+/g, " ").trim();

async function lookup(supabase, table, nameCol, rpcName, name, plain) {
  const typed = (name || "").trim();
  if (!supabase || !typed) return null;
  const { data, error } = await supabase.rpc(rpcName, { p_name: typed });
  let id = null;
  if (!error) id = Array.isArray(data) ? data[0]?.id : data?.id;
  else {
    const { data: row } = await supabase.from(table).select("id").ilike(nameCol, plain).limit(1).maybeSingle();
    id = row?.id;
  }
  if (!id) return null;
  const { data: full } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  return full || null;
}

// -> the existing artists row, or null
export function findExistingArtist(supabase, name) {
  const t = (name || "").trim().replace(/[%_\\]/g, (c) => "\\" + c);
  return lookup(supabase, "artists", "stage_name", "find_artist_by_name", name, t);
}

// -> the existing labels row, or null (a typed "ABC" finds "HĐ - ABC")
export async function findExistingLabel(supabase, name) {
  const base = stripLabelPrefix(name || "").replace(/[%_\\]/g, (c) => "\\" + c);
  return lookup(supabase, "labels", "label_name", "find_label_by_name", name, base);
}

// friendly text when the database unique rule (step 2 SQL) rejects a race
export const isUniqueViolation = (err) => !!err && (err.code === "23505" || /duplicate key|unique constraint/i.test(err.message || ""));
