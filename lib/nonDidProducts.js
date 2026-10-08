import { supabase } from "./supabaseClient";

// Round 488 — reusable list of products that have no release DID (see
// sql/pending/add-round488-non-did-products.sql). A booking ticket for one
// carries data.productName (and an empty relatedDid); Cost Marketing turns each
// product into a pseudo-release keyed by the product's own id, with its short
// `code` ("ND-XXXXXX") standing in for the DID.
export async function fetchNonDidProducts() {
  if (!supabase) return [];
  // Round 492 — release_date exists only after the Round 492 SQL; fall back so
  // the list still loads before it is run.
  let res = await supabase.from("non_did_products").select("id, name, artist, note, code, release_date, label").order("name");
  if (res.error) res = await supabase.from("non_did_products").select("id, name, artist, note, code").order("name");
  return res.error ? [] : res.data || [];
}

// Finds the product with this name (case-insensitive) or creates it, so free
// text typed twice never makes two products. Returns { product, error }.
export async function ensureNonDidProduct(rawName, profileId, extra = {}) {
  const name = String(rawName || "").trim().replace(/\s+/g, " ");
  if (!name) return { product: null, error: new Error("Product name is empty.") };
  const find = async () => {
    const { data } = await supabase.from("non_did_products").select("id, name, artist, note, code").ilike("name", name.replace(/[%_]/g, (m) => `\\${m}`)).limit(1);
    return data?.[0] || null;
  };
  const existing = await find();
  if (existing) return { product: existing, error: null };
  // Round 492 — new products get a DID-style code from their own sequence
  // (ND-<initials>-<ddmmyyyy>-<seq>) via create_non_did_product(); if that
  // function isn't installed yet, fall back to the old random ND-XXXXXX code.
  const artist = String(extra.artist || "").trim() || null;
  const releaseDate = extra.releaseDate || null;
  let { data, error } = await supabase.rpc("create_non_did_product", { p_name: name, p_artist: artist, p_release_date: releaseDate, p_label: String(extra.label || "").trim() || null, p_created_by: profileId || null });
  if (Array.isArray(data)) data = data[0];
  if (error || !data) {
    const r = await supabase.from("non_did_products").insert({ name, artist, created_by: profileId || null }).select("id, name, artist, note, code").single();
    data = r.data; error = r.error;
  }
  if (error) {
    const again = await find(); // lost a race with someone typing the same name
    if (again) return { product: again, error: null };
    return { product: null, error };
  }
  return { product: data, error: null };
}

// Row key used by the NON-PACKAGE BOOKING workstation for tickets without a DID.
export function nonDidRowKey(name) {
  return `ND:${String(name || "").trim().toLowerCase()}`;
}
