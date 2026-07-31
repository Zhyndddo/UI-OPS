#!/usr/bin/env node
// One-time repair — releases imported by import-brief.js / import-ops-
// tracking.js before this round carry project_type values with a legacy
// prefix v2 doesn't use ("New Release - Chỉ Phát Hành", sometimes "SONY -
// New Release - Độc Quyền 5 năm"). v2's project_type is meant to be the
// bare contract type (see contract_type_packages in schema.sql —
// "Chỉ Phát Hành", "Độc Quyền 5 năm", etc, no prefix). The dashboard
// combines release_category + " - " + project_type for display, and
// release_category defaults to "New Release" too — so an already-
// prefixed project_type shows up doubled ("New Release - New Release -
// Chỉ Phát Hành"). A bare leftover "NEW RELEASE" (the sheet's own
// placeholder for "nothing really resolved yet") maps to v2's actual
// default pipeline stage, BRIEF & DATA.
//
// Both import scripts now normalize this at import time (see
// normalizeProjectType in each) — this script is only for releases that
// were written before that fix landed. Only touches releases whose
// project_type actually changes under normalization; never touches
// releases whose project_type is already a bare v2-style value.
//
// Defaults to a DRY RUN — pass --confirm to actually write anything.
// Strongly recommended: run scripts/backup.js first.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/repair-project-type-prefix.js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/repair-project-type-prefix.js --confirm

const { createClient } = require("@supabase/supabase-js");

function normalizeProjectType(raw) {
  if (raw == null) return raw;
  let s = String(raw).trim();
  s = s.replace(/^(SONY\s*-\s*)?New Release\s*-\s*/i, "");
  s = s.trim();
  if (!s || s.toUpperCase() === "NEW RELEASE") return "BRIEF & DATA";
  return s;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data: releases, error } = await supabase.from("releases").select("id, did, title, project_type");
  if (error) {
    console.error(`Fetch failed: ${error.message}`);
    process.exit(1);
  }

  const changes = (releases || [])
    .map((r) => ({ r, normalized: normalizeProjectType(r.project_type) }))
    .filter(({ r, normalized }) => normalized !== r.project_type);

  console.log(`${confirm ? "REPAIRING" : "DRY RUN —"} ${releases.length} releases checked; ${changes.length} need project_type normalized.\n`);

  let updated = 0, failed = 0;

  for (const { r, normalized } of changes) {
    console.log(`${r.did} ("${r.title}"): "${r.project_type}" -> "${normalized}"`);
    if (!confirm) continue;

    const { error: updateErr } = await supabase.from("releases").update({ project_type: normalized }).eq("id", r.id);
    if (updateErr) {
      console.error(`  -> FAILED: ${updateErr.message}`);
      failed++;
      continue;
    }
    updated++;
  }

  console.log(`\n${confirm ? "Done." : "Dry run complete — nothing written."} Updated: ${updated}, Failed: ${failed}.`);
  if (!confirm) console.log("Re-run with --confirm to actually write these updates.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
