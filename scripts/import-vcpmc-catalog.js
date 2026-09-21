#!/usr/bin/env node
// Round 408 — one-time bulk load of VCPMC's full catalog export
// ("VCPMC_toan_bo.csv" — Tên bài hát / Tác giả nhạc / Tác giả lời / Ca sĩ /
// Tìm thấy qua) into the new `vcpmc_catalog` table (see
// sql/pending/add-round408-vcpmc-catalog.sql — run THAT first, this script
// assumes the table already exists).
//
// ~178k rows — far too much to hand-write as SQL INSERTs (tens of MB,
// painful to paste into Supabase's SQL Editor) or to embed in this repo as
// JSON like the smaller scripts/import-*.js imports do, so this reads the
// CSV directly. Uses the `xlsx` package already in package.json (it
// parses CSV, including quoted fields with embedded commas — this sheet
// has plenty, e.g. multi-author cells like "LỤC HUY, LENA") rather than a
// hand-rolled CSV split.
//
// Dedup: builds a Set of (title|composer|lyricist), lowercased, from
// whatever's ALREADY in vcpmc_catalog before inserting, and skips any row
// that already exists — same idea as scripts/import-booking-channels.js.
// Makes this safe to re-run if it gets interrupted partway (resumes from
// wherever it left off) and safe to run again later if VIEENT sends an
// updated export (only genuinely new rows get inserted; nothing already
// in the table is touched, so any admin-entered "manual" rows or reports
// against existing rows are untouched).
//
// Dry-run by default; pass --confirm to actually write.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-vcpmc-catalog.js data/vcpmc-catalog-import.csv
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-vcpmc-catalog.js data/vcpmc-catalog-import.csv --confirm

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");

const args = process.argv.slice(2).filter((a) => a !== "--confirm");
const confirm = process.argv.includes("--confirm");
const csvPath = args[0] || path.join(__dirname, "..", "data", "vcpmc-catalog-import.csv");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function norm(v) {
  return (v || "").toString().trim();
}
function dedupeKey(title, composer, lyricist) {
  return `${title.toLowerCase()}|${composer.toLowerCase()}|${lyricist.toLowerCase()}`;
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found at ${csvPath}. Pass the path as the first argument.`);
    process.exit(1);
  }
  const raw = fs.readFileSync(csvPath, "utf8");
  const wb = XLSX.read(raw, { type: "string" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  console.log(`Read ${rows.length} row(s) from ${csvPath}.`);

  // Fetch existing keys for resume/re-run safety — see file header comment.
  console.log("Fetching existing vcpmc_catalog rows to dedupe against...");
  const existingKeys = new Set();
  {
    const PAGE = 10000;
    let from = 0;
    for (;;) {
      const { data, error } = await supabase.from("vcpmc_catalog").select("title, composer, lyricist").range(from, from + PAGE - 1);
      if (error) {
        console.error("Failed reading existing rows:", error.message);
        process.exit(1);
      }
      (data || []).forEach((r) => existingKeys.add(dedupeKey(r.title || "", r.composer || "", r.lyricist || "")));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
  }
  console.log(`${existingKeys.size} existing row(s) already in the table.`);

  let skippedNoTitle = 0, skippedDuplicate = 0;
  const payload = [];
  for (const row of rows) {
    const title = norm(row["Tên bài hát"]);
    if (!title) {
      skippedNoTitle++;
      continue;
    }
    const composer = norm(row["Tác giả nhạc"]);
    const lyricist = norm(row["Tác giả lời"]);
    const key = dedupeKey(title, composer, lyricist);
    if (existingKeys.has(key)) {
      skippedDuplicate++;
      continue;
    }
    existingKeys.add(key); // guard against dupes within the file itself too
    payload.push({
      title,
      composer: composer || null,
      lyricist: lyricist || null,
      singer: norm(row["Ca sĩ"]) || null,
      source_note: norm(row["Tìm thấy qua"]) || null,
      status: "active",
      source: "import",
    });
  }

  console.log(`${payload.length} row(s) to insert. Skipped: ${skippedNoTitle} (no title), ${skippedDuplicate} (already exist).`);

  if (!confirm) {
    console.log("Dry run — re-run with --confirm to actually insert.");
    return;
  }
  if (payload.length === 0) {
    console.log("Nothing new to insert.");
    return;
  }

  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);
    const { error } = await supabase.from("vcpmc_catalog").insert(chunk);
    if (error) {
      console.error(`FAILED on chunk starting at row ${i}: ${error.message}`);
      console.error("Safe to re-run this script from scratch — already-inserted rows are skipped automatically.");
      process.exit(1);
    }
    inserted += chunk.length;
    if (inserted % 5000 === 0 || inserted === payload.length) {
      console.log(`Inserted ${inserted}/${payload.length}...`);
    }
  }

  console.log(`Done. Inserted ${inserted} row(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
