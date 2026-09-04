#!/usr/bin/env node
// One-time import: historical Design tab tickets from
// "2026 REQUEST DESIGN VIDEO VIEENT 1.xlsx" into the generic `tickets`
// table (tab key "design").
//
// Source workbook has 12 sheets. Investigation found the real per-task
// data lives almost entirely in one place:
//   - BACKLOG (biggest, messiest sheet — 4505 rows x 73 cols) actually
//     contains two UNRELATED tables sharing row-space: a team-assignment
//     matrix in columns A-W, and — the one this script uses — a clean
//     one-row-per-task master table in columns BE:BT (57-72), header at
//     spreadsheet row 3. 895 populated task rows.
//   - REQUEST/RECEIVE/PROCESS/ARCHIVED are near-empty "live snapshot"
//     tabs (mostly just their own header row + a stray sorting-index
//     column) — checked every row of each by hand. Only ONE real ticket
//     turned up that wasn't already in BACKLOG: a single still-open
//     REQUESTED row in the REQUEST tab ("Congrats Post", requested
//     2026-07-31, not yet in BACKLOG because it hasn't finished
//     processing yet). That row is included below with source REQUEST;
//     everything else in this import comes from BACKLOG.
//   - SOCIAL/ARTIST/OTHER are raw Google-Form-response sheets, mostly
//     placeholder/instruction rows — not per-task records, not imported.
//   - TỔNG QUAN / Trang tính13 are summary/dashboard sheets — not
//     imported.
//
// data/design-tickets-import.json is the raw export (896 rows: 895 from
// BACKLOG + 1 from REQUEST), field names matching the sheet's own header
// row almost verbatim (priority, task, platform, size, executor,
// description, start_date, deadline, status, code, ngay_request,
// ngay_receive, ngay_process, ngay_complete, ngay_refund, ngay_archived,
// _source). All mapping into the app's actual `tickets` shape happens
// here, not in the export, per this repo's usual raw-export-then-map-in-JS
// convention (see import-legacy-orders.js).
//
// Field mapping, matching app/tickets/design/new/page.js's insert shape
// exactly (data.typeRequest/priority/project/artist/platform/designType/
// size/description/task):
//   task column's first line is "{requestType} - {typeName}" (e.g.
//   "Create new - Congrats Post" or "Resize - Set 3video Cover"), second
//   line onward is "{project} - {artist}" (e.g. "Điều Em Muốn - Bùi Duy
//   Ngọc") IF it contains " - "; about a quarter of rows don't cleanly
//   split (extra line breaks, no dash, stray whitespace) — for those the
//   whole remainder is kept as `project` and `artist` is left blank
//   rather than guessing which part is which.
//     typeRequest: "create new"/"create new " (case-insensitive) -> "New
//       Design" (app's own vocabulary — the sheet never says "New
//       Design"); "resize" -> "Resize"; anything else passes through
//       as-is (matches REQUEST_TYPES = ["New Design","Revision","Resize"]
//       used by the create form — none of the 896 rows were "Revision",
//       but pass-through keeps this forward-compatible rather than
//       silently dropping an unrecognized value).
//     designType: the part of the first line after " - ".
//     priority: "Normal" -> "NORMAL", "Urgent" -> "URGENT" (app vocab is
//       LOW/NORMAL/HIGH/URGENT — sheet only ever used the middle two).
//     platform/size/description: passed through as free text — confirmed
//       via schema.sql that design_platforms/design_types/design_sizes
//       only drive the create-form's cascading dropdowns; once
//       submitted, platform/designType/size are plain TEXT in `data`,
//       not FKs. No vocabulary matching needed.
//     task: kept as the sheet's own original text verbatim (not
//       reconstructed from requestType/designType/project/artist) so the
//       historical record matches exactly what the source system stored,
//       even for the ~quarter of rows that don't cleanly parse.
//
// executor: sheet's Executor column (Như/Amy/Thư/Bảo/blank) is always
// stored as-is in the ticket's `executor` legacy free-text column. It is
// ALSO matched against `profiles.name` for `pic_profile_id`, but only on
// an exact (case-insensitive, trimmed) name match, and only when exactly
// one profile has that name — if zero or more than one profile matches,
// pic_profile_id is left null rather than guessing. This means matching
// only works if the profile's `name` field is literally "Như"/"Amy"/
// "Thư"/"Bảo" etc — a fuller real name (e.g. "Nguyễn Thị Như") will not
// match and pic_profile_id stays null (executor free text is still set
// either way, so nothing is lost, it just isn't linked). If profiles
// for these people are added AFTER this script has already been run
// with --confirm once, re-running it will NOT retroactively fix already-
// inserted tickets (the legacy_id idempotency check skips them) — use
// scripts/backfill-design-executor-profile.js for that instead.
//
// requester: the sheet's `code` column is a concatenated legacy ID
// (DDMMYYYYHHMMSS + submitter email + requestType + typeName, all run
// together with no separator, e.g.
// "02062026103413imthha.work@gmail.comCreate newSet 3video Cover"). The
// email is extracted where the pattern matches and kept in
// data._legacyImport.requesterEmail for reference, but requester_name /
// requester_segment / pic_profile_id are left null — there's no reliable
// way to resolve an email to a current profiles row from this sheet
// alone, and a wrong guess is worse than blank.
//
// status: COMPLETE/REFUND/PROCESS/REQUESTED all already match the design
// tab's status_options vocabulary as-is (see schema.sql's ticket_tabs
// row for "design") — passed straight through, no mapping needed.
//
// status_log: built from whichever of ngay_request/ngay_process/
// ngay_complete/ngay_refund are present, mapped to
// REQUESTED/PROCESS/COMPLETE/REFUND respectively. ngay_receive and
// ngay_archived have no matching entry in the design tab's
// status_options (that vocabulary has no RECEIVE/ARCHIVED bucket) — both
// are preserved as-is in data._legacyImport instead of being dropped or
// forced into a bucket they don't belong to.
//
// created_at: ALWAYS set explicitly on every row (never conditionally
// omitted) — best available date from ngay_request, falling back through
// start_date / ngay_process / ngay_complete / ngay_refund / deadline for
// the 9 rows missing ngay_request, and finally to import time for the
// handful with no usable date at all. Carrying the real historical
// creation time forward matches import-legacy-orders.js's convention.
// Setting it on every row (not just when available) isn't just
// cosmetic — PostgREST's bulk insert treats a key that's PRESENT on some
// rows of the array but ABSENT on others as an explicit NULL for the
// rows missing it (not "fall through to the column default"), so
// conditionally setting created_at only when ngay_request existed was
// actually inserting NULL into a NOT NULL column for every other row in
// the same batch — this is what broke the first real run.
//
// legacy_id: the sheet's `code` column, deduplicated — 14 codes in the
// 896-row export collide (same submitter+timestamp+task-type string
// reused, almost always because the *actual* deadline/detail differed
// row-to-row but the code-building formula didn't account for it). Since
// `tickets.legacy_id` is UNIQUE, every code after the first occurrence
// gets a "#2", "#3", ... suffix appended — this keeps every real row
// importable while still making re-runs of this script idempotent
// (dedup + suffixing is deterministic given the same input order).
//
// Idempotent via legacy_id — skips any row whose (possibly-suffixed)
// legacy_id already exists in `tickets`.
//
// Dry-run by default; pass --confirm to actually write.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-design-tickets.js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-design-tickets.js --confirm

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const confirm = process.argv.includes("--confirm");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const FILE = path.join(__dirname, "..", "data", "design-tickets-import.json");

function mapPriority(raw) {
  const v = (raw || "").trim().toLowerCase();
  if (v === "normal") return "NORMAL";
  if (v === "urgent") return "URGENT";
  return "NORMAL"; // fallback — none of the source rows were blank, but be safe
}

function mapRequestType(prefix) {
  const v = (prefix || "").trim().toLowerCase();
  if (v === "create new") return "New Design";
  if (v === "resize") return "Resize";
  if (v === "revision") return "Revision";
  return (prefix || "").trim() || "New Design";
}

// Parses the sheet's TASK column into {typeRequest, designType, project, artist}.
// See file header — about a quarter of rows don't have a clean second-line
// " - " split; for those `project` gets the whole remainder and `artist`
// is left blank rather than guessed.
function parseTask(task) {
  const lines = (task || "").split("\n");
  const firstLine = (lines[0] || "").trim();
  let requestTypeRaw = firstLine;
  let designType = "";
  const dashIdx = firstLine.indexOf(" - ");
  if (dashIdx !== -1) {
    requestTypeRaw = firstLine.slice(0, dashIdx).trim();
    designType = firstLine.slice(dashIdx + 3).trim();
  }
  const rest = lines.slice(1).join("\n").trim();
  let project = rest;
  let artist = "";
  if (rest.includes(" - ")) {
    const i = rest.indexOf(" - ");
    project = rest.slice(0, i).trim();
    artist = rest.slice(i + 3).trim();
  }
  return { typeRequest: mapRequestType(requestTypeRaw), designType, project, artist };
}

// Extracts the submitter email from the sheet's concatenated `code`
// column (see file header). Returns null if the pattern doesn't match —
// several rows have malformed/edge-case codes and this is best-effort
// reference data only, never used for matching.
function extractEmail(code) {
  if (!code) return null;
  const m = String(code).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

// Best available date for created_at — see the file header comment on
// why this must never return undefined/null for a row that's actually
// getting inserted (importNowIso is a fixed timestamp captured once at
// the top of main(), not a fresh Date() per row, so every fallback row
// in one run gets the same import time rather than drifting mid-batch).
function bestCreatedAt(row, importNowIso) {
  return row.ngay_request || row.start_date || row.ngay_process || row.ngay_complete || row.ngay_refund || row.deadline || importNowIso;
}

const STATUS_LOG_MAP = {
  ngay_request: "REQUESTED",
  ngay_process: "PROCESS",
  ngay_complete: "COMPLETE",
  ngay_refund: "REFUND",
};

async function main() {
  const importNowIso = new Date().toISOString(); // captured once — see bestCreatedAt's comment
  const rows = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (rows.length === 0) {
    console.log("No rows found in " + FILE);
    return;
  }

  const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, status_options, default_status").eq("key", "design").single();
  if (tabErr || !tab) {
    console.error("Couldn't find the 'design' ticket tab — has schema.sql been deployed? " + (tabErr?.message || ""));
    process.exit(1);
  }

  const { data: existing } = await supabase.from("tickets").select("legacy_id").eq("tab_id", tab.id).not("legacy_id", "is", null);
  const existingLegacyIds = new Set((existing || []).map((t) => t.legacy_id));

  // Executor -> profile matching (see file header). Only exact,
  // unambiguous name matches count.
  const { data: profiles } = await supabase.from("profiles").select("id, name");
  const profileNameCounts = new Map(); // lowercased name -> count of profiles with that name
  const profileIdByName = new Map(); // lowercased name -> id (only meaningful when count === 1)
  for (const p of profiles || []) {
    if (!p.name) continue;
    const key = p.name.trim().toLowerCase();
    profileNameCounts.set(key, (profileNameCounts.get(key) || 0) + 1);
    profileIdByName.set(key, p.id);
  }
  function matchExecutorProfile(executor) {
    if (!executor) return null;
    const key = executor.trim().toLowerCase();
    if (profileNameCounts.get(key) === 1) return profileIdByName.get(key);
    return null;
  }
  let executorMatched = 0, executorAmbiguousOrNoMatch = 0;

  // Dedup codes -> unique legacy_id, deterministic given the input order.
  const seenCodes = new Map(); // code -> count so far
  function uniqueLegacyId(code) {
    if (!code) return null;
    const n = (seenCodes.get(code) || 0) + 1;
    seenCodes.set(code, n);
    return n === 1 ? code : `${code}#${n}`;
  }

  let toInsert = 0, skippedExisting = 0, dupeCodesSeen = 0;
  const payload = [];

  for (const row of rows) {
    const legacyId = uniqueLegacyId(row.code);
    if (legacyId && legacyId !== row.code) dupeCodesSeen++;
    if (legacyId && existingLegacyIds.has(legacyId)) {
      skippedExisting++;
      continue;
    }

    const { typeRequest, designType, project, artist } = parseTask(row.task);
    const email = extractEmail(row.code);

    const statusLog = {};
    for (const [srcKey, statusKey] of Object.entries(STATUS_LOG_MAP)) {
      if (row[srcKey]) statusLog[statusKey] = row[srcKey];
    }
    // Fallback so every row has at least one status_log entry even if
    // ngay_request was blank in the source.
    if (Object.keys(statusLog).length === 0 && row.status) {
      statusLog[row.status] = row.start_date || row.deadline || null;
    }

    const legacyImport = { source: row._source || "BACKLOG" };
    if (email) legacyImport.requesterEmail = email;
    if (row.ngay_receive) legacyImport.ngayReceive = row.ngay_receive;
    if (row.ngay_archived) legacyImport.ngayArchived = row.ngay_archived;

    const status = tab.status_options?.includes(row.status) ? row.status : tab.default_status;
    const picProfileId = matchExecutorProfile(row.executor);
    if (row.executor) {
      if (picProfileId) executorMatched++;
      else executorAmbiguousOrNoMatch++;
    }

    const ticket = {
      tab_id: tab.id,
      data: {
        typeRequest,
        priority: mapPriority(row.priority),
        project,
        artist,
        platform: row.platform || "",
        designType,
        size: row.size != null ? String(row.size) : "",
        description: row.description || "",
        task: row.task || "",
        _legacyImport: legacyImport,
      },
      deadline: row.deadline || null,
      status,
      status_log: statusLog,
      requester_segment: null,
      requester_name: null,
      executor: row.executor || null,
      pic_profile_id: picProfileId,
      legacy_id: legacyId,
      created_at: bestCreatedAt(row, importNowIso),
    };

    payload.push(ticket);
    toInsert++;
  }

  console.log(`${payload.length} row(s) to insert. Skipped: ${skippedExisting} (already imported). Duplicate codes suffixed: ${dupeCodesSeen}.`);
  console.log(`Executor -> profile: ${executorMatched} matched (exact, unambiguous), ${executorAmbiguousOrNoMatch} left unlinked (no profile or ambiguous name) — executor text is set either way.`);

  if (!confirm) {
    console.log("Dry run — re-run with --confirm to actually insert.");
    console.log("Sample of first row that would be inserted:");
    console.log(JSON.stringify(payload[0], null, 2));
    return;
  }

  const CHUNK = 50;
  let inserted = 0;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);
    const { error } = await supabase.from("tickets").insert(chunk);
    if (error) {
      console.error(`FAILED on chunk starting at row ${i}: ${error.message}`);
      process.exit(1);
    }
    inserted += chunk.length;
    console.log(`Inserted ${inserted}/${payload.length}...`);
  }

  console.log(`Done. Inserted ${inserted} design ticket(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
