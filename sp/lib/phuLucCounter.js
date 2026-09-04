import { supabase } from "./supabaseClient";

// Round 161 — Mã PL auto-numbering for the Phụ Lục Truyền Thông ticket
// (app/tickets/phu-luc/page.js, /new, and the auto-create path in
// app/pick-package/[token]/page.js's confirmChoice()). Per explicit
// request: the sequence is scoped per LABEL ("filter the table based on
// the label table" — a release under Label A and one under Label B can
// both legitimately be "PL_1"), not one app-wide counter. No zero-padding
// — PL_1, PL_9, PL_10, PL_11… per explicit confirmation.
//
// Computed live off the MAX existing "PL_<n>" found for that label, not a
// stored running counter and not a plain COUNT of rows in the label's
// group — a plain count would collide/mis-skip the instant any ticket in
// that label group was deleted, or its Mã PL manually fixed to something
// out of sequence (see canEditPhuLucMaPL in lib/permissions.js, exactly
// the "any exception" case this needs to coexist with). Reading the real
// max and adding 1 keeps working correctly regardless of gaps or manual
// overrides — it just never re-issues a number that's already in use.
//
// Non-numeric or non-"PL_n"-shaped Mã PL values (a manual exception fix
// might legitimately be something else entirely, e.g. a legacy code
// carried over from the imported backfill — see DATA_FIXES round 161)
// are simply ignored for the max computation, not treated as errors.
export async function computeNextMaPL(label) {
  if (!supabase) return "PL_1";
  const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "phu_luc").single();
  if (!tab) return "PL_1";
  const { data: tickets } = await supabase.from("tickets").select("data").eq("tab_id", tab.id).is("deleted_at", null);
  const releaseIds = [...new Set((tickets || []).map((t) => t.data?.releaseId).filter(Boolean))];
  const targetLabel = label || "";
  let max = 0;
  if (releaseIds.length > 0) {
    const { data: rels } = await supabase.from("releases").select("id, label").in("id", releaseIds);
    const labelById = {};
    (rels || []).forEach((r) => (labelById[r.id] = r.label || ""));
    (tickets || []).forEach((t) => {
      if ((labelById[t.data?.releaseId] || "") !== targetLabel) return;
      const m = /^PL_(\d+)$/.exec(t.data?.maPL || "");
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    });
  }
  return `PL_${max + 1}`;
}
