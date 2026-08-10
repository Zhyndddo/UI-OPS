import { supabase } from "./supabaseClient";

// Round 58 — extracted out of app/package-runner/page.js (round 77) so the
// exact same "simulation" commit can be reused from a second call site (the
// release detail page's Package Actions section — see runOne calls in
// app/releases/[id]/page.js) without copy-pasting the logic and risking it
// drifting out of sync between the two places.
//
// Replicates exactly what app/pick-package/[token]/page.js's confirmChoice()
// does when an artist picks a package on the real artist-facing magic link —
// same 3 writes (project_type, package_locked, package_total_value), same
// "auto-create the Phụ Lục ticket if this was still in the BRIEF & DATA/
// DEALING pipeline stage" side effect — just triggered directly instead of
// waiting on the artist to click through a link.
//
// "simple" picks (Chỉ Phát Hành, INT MEDIA, and any other contract type with
// no real itemized package) never seed release_package_items, matching
// confirmChoice's own behavior — a real itemized package only exists when
// Marketing has already built one via the Package Builder popup for that
// specific release; this never invents one.
// Round 80 — "SENT TO MARKETING" interlude added between BRIEF & DATA and
// DEALING (see app/releases/[id]/page.js's own PIPELINE_STAGES comment) —
// kept in sync here so a package resolved via the simulator from that
// stage still fires the same "was still pipeline, so seed a Phụ Lục
// ticket" side effect below.
export const PIPELINE_STAGES = ["BRIEF & DATA", "SENT TO MARKETING", "DEALING"];

export async function runOne({ did, legacyDid, contractType }, { allowOverwrite }) {
  const cleanDid = (did || "").trim();
  if (!cleanDid) return { ok: false, did, reason: "No DID given." };
  if (!contractType) return { ok: false, did: cleanDid, reason: "No package/contract type given." };

  const { data: release, error: findErr } = await supabase
    .from("releases")
    .select("id, did, title, main_artist, project_type, package_locked, legacy_id, pseudo_package_parent_did")
    .eq("did", cleanDid)
    .maybeSingle();
  if (findErr) return { ok: false, did: cleanDid, reason: findErr.message };
  if (!release) return { ok: false, did: cleanDid, reason: "No release found with that DID." };

  // Round 79 — a pseudo-package track inherits its parent EP/Album's
  // package live; it never goes through booking/package selection itself,
  // from ANY entry point (Package Runner's manual DID input included, not
  // just the release detail page's now-hidden buttons).
  if (release.pseudo_package_parent_did) {
    return {
      ok: false,
      did: cleanDid,
      reason: `This release is a pseudo-package track linked to parent DID "${release.pseudo_package_parent_did}" — it inherits that package automatically and can't be run through package selection itself.`,
      release,
    };
  }

  if (release.package_locked && !allowOverwrite) {
    return {
      ok: false,
      did: cleanDid,
      reason: `Package already locked (currently "${release.project_type}") — this tool won't overwrite an existing decision.`,
      release,
    };
  }

  const wasPipelineStage = PIPELINE_STAGES.includes(release.project_type);
  const updates = {
    project_type: contractType,
    package_total_value: null, // simple pick — no itemized package, same as confirmChoice()
    package_locked: true,
  };
  const cleanLegacy = (legacyDid || "").trim();
  if (cleanLegacy && !release.legacy_id) updates.legacy_id = cleanLegacy; // coalesce, never overwrite a real value

  const { error: updateErr } = await supabase.from("releases").update(updates).eq("id", release.id);
  if (updateErr) return { ok: false, did: cleanDid, reason: updateErr.message, release };

  let phuLucCreated = false;
  if (wasPipelineStage) {
    const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "phu_luc").single();
    if (tab) {
      await supabase.from("tickets").insert({ tab_id: tab.id, data: { releaseId: release.id } });
      phuLucCreated = true;
    }
  }

  return {
    ok: true,
    did: cleanDid,
    reason: null,
    release: { ...release, project_type: contractType, package_locked: true },
    phuLucCreated,
  };
}
