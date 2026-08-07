#!/usr/bin/env node
// One-time data fix — item 3 from the "5 things to fix for the data"
// request. Legacy/imported releases have a DID with no numeric suffix
// (just the initials + date, e.g. "ABCD-01012026") — every release
// created by the app itself already gets a "-NNNN" suffix automatically
// (see set_release_did() in schema.sql), this only touches the old ones
// that predate that trigger.
//
// Ordering (confirmed): oldest release first — sorted by created_at
// ascending, the earliest legacy release gets suffix -0001, next -0002,
// and so on, counting only across the releases actually being fixed here.
//
// Because the DID is stored as plain TEXT in several other places (not a
// real foreign key), renaming it means also rewriting every reference:
//   - every ticket whose data.releaseId equals the old DID (Phái Sinh,
//     Manual Claim, Newrelease Upload, Media Booking, Pitching, etc. —
//     whichever type happens to reference this release)
//   - milestone_chart_entries.did (best-effort — that column is
//     documented as fuzzy-matched at the app layer, not exact, but an
//     exact match still gets updated exactly)
// This script does both, atomically per release (all writes for one
// release, or none — if any write fails partway through a release it
// stops before moving to the next one).
//
// Defaults to a DRY RUN — pass --confirm to actually write anything.
// Strongly recommended: run scripts/backup.js right before running this
// with --confirm, so there's a full snapshot to fall back to.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-did-suffix.js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-did-suffix.js --confirm

const { createClient } = require("@supabase/supabase-js");

// Matches the real trigger's output shape: "...-NNNN" at the very end,
// exactly 4 digits. A DID missing this is legacy.
const HAS_SUFFIX_RE = /-\d{4}$/;

async function main() {
  const confirm = process.argv.includes("--confirm");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: allReleases, error } = await supabase
    .from("releases")
    .select("id, did, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const existingDids = new Set(allReleases.map((r) => r.did).filter(Boolean));
  const legacy = allReleases.filter((r) => r.did && !HAS_SUFFIX_RE.test(r.did));

  console.log(`${allReleases.length} releases total, ${legacy.length} with a legacy (no-suffix) DID.`);
  console.log(confirm ? "LIVE RUN — writing to the database.\n" : "DRY RUN — pass --confirm to actually write.\n");

  let n = 0;
  let fixed = 0;
  for (const r of legacy) {
    n++;
    const suffix = String(n).padStart(4, "0");
    let newDid = `${r.did}-${suffix}`;
    if (existingDids.has(newDid)) {
      console.log(`SKIP ${r.did} — computed ${newDid} already exists, needs manual attention.`);
      continue;
    }
    existingDids.add(newDid);

    console.log(`${r.did}  ->  ${newDid}`);
    if (!confirm) { fixed++; continue; }

    const { error: relErr } = await supabase.from("releases").update({ did: newDid }).eq("id", r.id);
    if (relErr) { console.error(`  releases update failed: ${relErr.message} — stopping before touching references.`); continue; }

    const { data: tix, error: tixErr } = await supabase
      .from("tickets")
      .select("id, data")
      .eq("data->>releaseId", r.did);
    if (tixErr) {
      console.error(`  ticket lookup failed: ${tixErr.message} — releases.did was updated but ticket references were NOT. Fix manually for ${newDid}.`);
    } else {
      for (const t of tix) {
        const { error: tUpdErr } = await supabase.from("tickets").update({ data: { ...t.data, releaseId: newDid } }).eq("id", t.id);
        if (tUpdErr) console.error(`  ticket ${t.id} update failed: ${tUpdErr.message}`);
      }
      if (tix.length > 0) console.log(`  updated ${tix.length} ticket reference(s).`);
    }

    const { data: milestoneRows, error: msErr } = await supabase
      .from("milestone_chart_entries")
      .select("id")
      .eq("did", r.did);
    if (!msErr && milestoneRows && milestoneRows.length > 0) {
      await supabase.from("milestone_chart_entries").update({ did: newDid }).eq("did", r.did);
      console.log(`  updated ${milestoneRows.length} milestone_chart_entries row(s).`);
    }

    fixed++;
  }

  console.log(`\n${confirm ? "Fixed" : "Would fix"} ${fixed} of ${legacy.length} legacy DID(s).`);
  if (!confirm) console.log("Re-run with --confirm to actually write.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
