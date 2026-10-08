import { supabase } from "./supabaseClient";

// Round 488 — reusable list of products that have no release DID (see
// sql/pending/add-round488-non-did-products.sql). A booking ticket for one
// carries data.productName (and an empty relatedDid); Cost Marketing turns each
// product into a pseudo-release keyed by the product's own id, with its short
// `code` ("ND-XXXXXX") standing in for the DID.
export async function fetchNonDidProducts() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("non_did_products").select("id, name, artist, note, code").order("name");
  return error ? [] : data || [];
}

// Finds the product with this name (case-insensitive) or creates it, so free
// text typed twice never makes two products. Returns { product, error }.
export async function ensureNonDidProduct(rawName, profileId) {
  const name = String(rawName || "").trim().replace(/\s+/g, " ");
  if (!name) return { product: null, error: new Error("Product name is empty.") };
  const find = async () => {
    const { data } = await supabase.from("non_did_products").select("id, name, artist, note, code").ilike("name", name.replace(/[%_]/g, (m) => `\\${m}`)).limit(1);
    return data?.[0] || null;
  };
  const existing = await find();
  if (existing) return { product: existing, error: null };
  const { data, error } = await supabase.from("non_did_products").insert({ name, created_by: profileId || null }).select("id, name, artist, note, code").single();
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
