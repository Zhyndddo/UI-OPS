#!/usr/bin/env node
// One-time data fix — item 1a from the "5 things to fix for the data"
// request. For every existing release that already has BOTH Linkshare
// (link_share) and Smartlink filled in (which in practice means it also
// has a UPC — Smartlink doesn't get generated without one), the 6-item
// Metadata Checklist and the OPS handoff are treated as already done in
// substance, they just never got ticked/clicked in the app. This script
// makes that real: it ticks all 6 checklist boxes and does exactly what
// clicking "SEND UPLOAD" on the release detail page does —
//   - sets requested = true
//   - creates a Newrelease Upload ticket (if the release doesn't have one)
//   - creates a Media Booking ticket (if the release doesn't have one),
//     same as the auto-triggered "Send Package Ticket" step, including
//     bumping project_type from 'BRIEF & DATA' to 'DEALING'
//
// Scope, confirmed: ONE-TIME BACKFILL ONLY. This does not change any live
// app behavior — going forward, people still tick the checklist and click
// Send Upload themselves. Re-running this script later is safe and a
// no-op for anything it already fixed (it only ever touches releases
// where requested is still false).
//
// Defaults to a DRY RUN — pass --confirm to actually write anything.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-ar-to-ops.js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-ar-to-ops.js --confirm

const { createClient } = require("@supabase/supabase-js");

const META_FIELDS = ["meta_audio", "meta_artwork", "meta_working_files", "meta_lyric", "meta_mv", "meta_doc"];

async function main() {
  const confirm = process.argv.includes("--confirm");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: releases, error } = await supabase
    .from("releases")
    .select("id, did, title, main_artist, label, link_share, smartlink, requested, project_type, package_ticket_sent, requester_segment")
    .not("link_share", "is", null)
    .not("smartlink", "is", null)
    .neq("link_share", "")
    .neq("smartlink", "")
    .eq("requested", false);
  if (error) throw new Error(error.message);

  console.log(`Found ${releases.length} release(s) with Linkshare + Smartlink filled in but not yet sent to OPS.`);
  console.log(confirm ? "LIVE RUN — writing to the database.\n" : "DRY RUN — pass --confirm to actually write.\n");

  const { data: uploadTab } = await supabase.from("ticket_tabs").select("id").eq("key", "newrelease_upload").single();
  const { data: mbTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "media_booking").single();

  let fixed = 0;
  for (const r of releases) {
    console.log(`- ${r.did} — ${r.title} / ${r.main_artist}`);
    if (!confirm) { fixed++; continue; }

    const patch = { requested: true };
    // meta_* columns are tri-state text ("false"/"true"/"update") now, not
    // real booleans — ticking "all done" means writing the string "true".
    META_FIELDS.forEach((f) => (patch[f] = "true"));
    if (!r.package_ticket_sent) {
      patch.package_ticket_sent = true;
      if (r.project_type === "BRIEF & DATA") patch.project_type = "DEALING";
    }
    const { error: updErr } = await supabase.from("releases").update(patch).eq("id", r.id);
    if (updErr) { console.error(`  releases update failed: ${updErr.message}`); continue; }

    if (uploadTab) {
      await supabase.from("tickets").insert({
        tab_id: uploadTab.id,
        data: { releaseId: r.did, project: r.title, artist: r.main_artist, label: r.label },
      });
    }

    if (mbTab && !r.package_ticket_sent) {
      const { data: existingMb } = await supabase
        .from("tickets")
        .select("id")
        .eq("tab_id", mbTab.id)
        .eq("data->>releaseId", r.did)
        .is("deleted_at", null)
        .limit(1);
      if (!existingMb || existingMb.length === 0) {
        await supabase.from("tickets").insert({
          tab_id: mbTab.id,
          data: { releaseId: r.did, proposedPackage: null },
          status: mbTab.default_status,
          status_log: { [mbTab.default_status]: new Date().toISOString() },
        });
      }
    }

    fixed++;
  }

  console.log(`\n${confirm ? "Fixed" : "Would fix"} ${fixed} release(s).`);
  if (!confirm) console.log("Re-run with --confirm to actually write.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
