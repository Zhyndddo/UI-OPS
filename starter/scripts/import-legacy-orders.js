#!/usr/bin/env node
// One-time import — v1 (Firebase/Firestore) → v2 (Supabase) migration for
// the only two v1 collections that actually had data: Phái Sinh
// (Firestore collection "segmentOrders", filtered to type="phai_sinh")
// and Manual Claim (Firestore collection "manualClaim", type="manual_claim").
// Both map cleanly onto the generic `tickets` table here — same tab_id /
// data (jsonb) / status / status_log shape every other ticket type uses,
// with field names in `data` matching 1:1 what schema.sql's entity_fields
// already define for phai_sinh/manual_claim (see schema.sql ~line 1156+),
// so no new columns or migration needed for this one.
//
// Input: two plain JSON arrays exported from the Firestore console via
// the browser (window._db) — NOT the native Firebase export format.
// Each array element is a Firestore document as-is: { id, ...fields },
// with any Firestore Timestamp field showing up as { seconds, nanoseconds }
// instead of a real Date/ISO string — this script converts those.
//
// Dropped on import, not written anywhere:
//   - `id` (kept only as `legacy_id`, not part of `data`)
//   - `type` (implied by which tab_id the row gets)
//   - `artistDisplay`, `contributorDisplay`, `releaseDisplay` (phai_sinh
//     only) — computed/derived strings the old renderer built on the fly,
//     not real stored data; the new UI computes its own equivalent from
//     artist/composer/etc, so carrying these forward would just be stale
//     duplicate text.
//
// requesterSegment values seen in the export: "AR", "OPS",
// "GUEST_REQUESTER". AR/OPS pass straight through — v2's requester_segment
// is a free-text column, not a fixed enum. "GUEST_REQUESTER" doesn't have
// an obvious v2 equivalent (v1's guest-vs-real-account split doesn't exist
// in v2's auth model) — it's imported as-is rather than guessed at; if
// that's wrong, it's clearer to fix in one place at the end than to guess
// on ~40 possible mappings.
//
// No release-matching (unlike import-brief.js/import-booking.js) — these
// tickets aren't tied to a release's DID in the source data, and the v2
// forms treat "Related DID" as optional. Left blank.
//
// Defaults to a DRY RUN — pass --confirm to actually write anything.
// Strongly recommended: run scripts/backup.js first.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-legacy-orders.js phai-sinh-export.json manual-claim-export.json
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-legacy-orders.js phai-sinh-export.json manual-claim-export.json --confirm

const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const files = args.filter((a) => !a.startsWith("--") && a.trim() !== ""); // GitHub Actions passes an empty string for an unset optional input

if (files.length === 0) {
  console.error("Usage: node scripts/import-legacy-orders.js <phai-sinh-export.json> <manual-claim-export.json> [--confirm]");
  console.error("(pass either or both — the script figures out which is which from each row's `type` field)");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Fields that go into `data` (jsonb) for each ticket type, matching
// schema.sql's entity_fields for phai_sinh / manual_claim exactly.
// Anything in the source row NOT in this list (the computed *Display
// fields, plus id/type/status/statusLog/createdAt/updatedAt/requester*
// which are handled separately below) is dropped.
const DATA_FIELDS = {
  phai_sinh: ["typeRequest", "label", "tenBai", "artist", "composer", "producer", "mixer", "url", "refLink", "description", "tacQuyen", "releaseDate", "releaseTime", "note", "lyricist", "featureArtist"],
  manual_claim: ["label", "tenBai", "artist", "url", "note"],
};

function tsToIso(ts) {
  if (!ts) return null;
  if (typeof ts === "string") return ts; // already a plain date string (e.g. releaseDate)
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000 + Math.round((ts.nanoseconds || 0) / 1e6)).toISOString();
  return null;
}

function convertStatusLog(statusLog) {
  const out = {};
  for (const [status, ts] of Object.entries(statusLog || {})) {
    const iso = tsToIso(ts);
    if (iso) out[status] = iso;
  }
  return out;
}

async function importRows(rows, typeKey, source) {
  const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", typeKey).single();
  if (tabErr || !tab) {
    console.error(`Couldn't find ticket_tabs row for key="${typeKey}" — did schema.sql get redeployed? Skipping ${source}.`);
    return { created: 0, skipped: 0, failed: 0 };
  }

  let created = 0, skipped = 0, failed = 0;
  const fieldList = DATA_FIELDS[typeKey];

  for (const row of rows) {
    if (row.type !== typeKey) {
      console.log(`${source} / ${row.id}: SKIP — type="${row.type}", not "${typeKey}" (unexpected in this file, left for the other import pass).`);
      skipped++;
      continue;
    }

    const data = {};
    for (const f of fieldList) {
      if (row[f] !== undefined && row[f] !== "") data[f] = row[f];
    }

    const statusLog = convertStatusLog(row.statusLog);
    const status = row.status || tab.default_status;
    const createdAt = tsToIso(row.createdAt);
    const updatedAt = tsToIso(row.updatedAt) || createdAt;

    console.log(`${source} / ${row.id}: "${row.tenBai || "(no tenBai)"}" — ${row.artist || "?"} — status=${status} — segment=${row.requesterSegment || "(none)"}`);

    if (!confirm) continue;

    const { data: existing } = await supabase.from("tickets").select("id").eq("legacy_id", row.id).maybeSingle();
    if (existing) {
      console.log(`  -> already imported (legacy_id ${row.id} exists), skipping.`);
      skipped++;
      continue;
    }

    const payload = {
      tab_id: tab.id,
      data,
      status,
      status_log: statusLog,
      requester_segment: row.requesterSegment || null,
      requester_name: row.requesterName || null,
      legacy_id: row.id,
    };
    if (createdAt) payload.created_at = createdAt;
    if (updatedAt) payload.updated_at = updatedAt;

    const { error: insertErr } = await supabase.from("tickets").insert(payload);
    if (insertErr) {
      console.error(`  -> FAILED: ${insertErr.message}`);
      failed++;
      continue;
    }
    created++;
  }

  return { created, skipped, failed };
}

async function main() {
  let totals = { created: 0, skipped: 0, failed: 0 };

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(raw) || raw.length === 0) {
      console.log(`${file}: empty or not a JSON array, skipping.`);
      continue;
    }
    // Figure out which ticket type this file holds from its first row's
    // `type` field, rather than trusting the filename.
    const typeKey = raw[0]?.type;
    if (!DATA_FIELDS[typeKey]) {
      console.error(`${file}: first row's type="${typeKey}" isn't phai_sinh or manual_claim — skipping this file entirely.`);
      continue;
    }
    console.log(`\n=== ${file} (${raw.length} rows, type=${typeKey}) ===`);
    const result = await importRows(raw, typeKey, file);
    totals.created += result.created;
    totals.skipped += result.skipped;
    totals.failed += result.failed;
  }

  console.log(`\n${confirm ? "Done." : "Dry run complete — nothing written."} Created: ${totals.created}, Skipped: ${totals.skipped}, Failed: ${totals.failed}.`);
  if (!confirm) console.log("Re-run with --confirm to actually write these rows.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
