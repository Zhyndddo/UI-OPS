#!/usr/bin/env node
// One-time batch — the BRIEF import (scripts/import-brief.js) creates
// `releases` rows with the Metadata Checklist already ticked from the
// sheet, but never sends Upload itself (importing a row isn't the same
// as a human clicking "Send Upload" on it). This finds every imported
// release (has a `legacy_id`) that's already uploadReady by the exact
// same rule the button on the release detail page uses — required
// checklist 4/4 (Audio/Artwork/Lyric/Metadata — see REQUIRED_META_KEYS
// in app/releases/[id]/page.js) plus Title/Artist/Release Date filled —
// but hasn't been sent yet (`requested` is not true), and does exactly
// what clicking Send Upload does: creates the Newrelease Upload ticket,
// sets `requested = true`, and creates the Media Booking ticket
// (mirrors sendUpload()/sendPackageTicket() in
// app/releases/[id]/page.js — kept in sync with that logic by hand,
// since this is a one-off script, not shared code).
//
// Only touches releases with a `legacy_id` (i.e. came from an import) —
// on purpose, so this never accidentally sends Upload for a release
// someone is still actively working on through the normal UI. Safe to
// re-run: skips any release that already has `requested = true`, or
// already has a Newrelease Upload / Media Booking ticket for its DID.
//
// Defaults to a DRY RUN — pass --confirm to actually write anything.
// Strongly recommended: run scripts/backup.js first.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-send-upload.js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-send-upload.js --confirm

const { createClient } = require("@supabase/supabase-js");

const confirm = process.argv.includes("--confirm");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Must match REQUIRED_META_KEYS in app/releases/[id]/page.js exactly.
const REQUIRED_META_KEYS = ["meta_audio", "meta_artwork", "meta_lyric", "meta_doc"];

async function main() {
  const { data: releases, error: relErr } = await supabase
    .from("releases")
    .select("id, did, title, main_artist, label, release_date, requested, legacy_id, " + REQUIRED_META_KEYS.join(", "))
    .not("legacy_id", "is", null)
    .or("requested.is.null,requested.eq.false");
  if (relErr) {
    console.error(relErr.message);
    process.exit(1);
  }

  const { data: uploadTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "newrelease_upload").single();
  const { data: mbTab } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "media_booking").single();
  if (!uploadTab || !mbTab) {
    console.error("Couldn't find newrelease_upload / media_booking ticket_tabs — did schema.sql get redeployed?");
    process.exit(1);
  }

  let sent = 0, skipped = 0, notReady = 0, failed = 0;

  for (const r of releases || []) {
    const requiredDone = REQUIRED_META_KEYS.filter((k) => r[k] === "true").length;
    const nameGroupFilled = r.title && r.main_artist && r.release_date;
    if (requiredDone < REQUIRED_META_KEYS.length || !nameGroupFilled) {
      notReady++;
      continue; // not actually uploadReady — leave alone, same rule as the live button
    }

    console.log(`${r.did}: "${r.title}" — ${r.main_artist} — checklist ${requiredDone}/${REQUIRED_META_KEYS.length}, ready to send.`);

    if (!confirm) continue;

    const { data: existingUpload } = await supabase.from("tickets").select("id").eq("tab_id", uploadTab.id).eq("data->>releaseId", r.did).is("deleted_at", null).maybeSingle();
    if (existingUpload) {
      console.log(`  -> Newrelease Upload ticket already exists for ${r.did}, skipping insert (still marking requested=true below if not already).`);
    } else {
      const { error: upErr } = await supabase.from("tickets").insert({
        tab_id: uploadTab.id,
        data: { releaseId: r.did, project: r.title, artist: r.main_artist, label: r.label },
      });
      if (upErr) { console.error(`  -> FAILED (upload ticket): ${upErr.message}`); failed++; continue; }
    }

    const { error: patchErr } = await supabase.from("releases").update({ requested: true }).eq("id", r.id);
    if (patchErr) { console.error(`  -> FAILED (requested flag): ${patchErr.message}`); failed++; continue; }

    const { data: existingMb } = await supabase.from("tickets").select("id").eq("tab_id", mbTab.id).eq("data->>releaseId", r.did).is("deleted_at", null).maybeSingle();
    if (existingMb) {
      console.log(`  -> Media Booking ticket already exists for ${r.did}, skipping.`);
    } else {
      const { error: mbErr } = await supabase.from("tickets").insert({
        tab_id: mbTab.id,
        data: { releaseId: r.did, proposedPackage: null },
        status: mbTab.default_status,
        status_log: { [mbTab.default_status]: new Date().toISOString() },
        requester_segment: "AR",
      });
      if (mbErr) console.error(`  -> Media Booking ticket FAILED (not fatal — Upload ticket still sent): ${mbErr.message}`);
    }

    sent++;
  }

  console.log(`\n${confirm ? "Done." : "Dry run complete — nothing written."} Sent: ${sent}, Not ready yet: ${notReady}, Skipped: ${skipped}, Failed: ${failed}.`);
  if (!confirm) console.log("Re-run with --confirm to actually send these.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
