#!/usr/bin/env node
// One-time backfill — imports the legacy "Phụ Lục Truyền Thông" tracking
// sheet (2728 rows, header at row 5) into v2's Phụ Lục ticket type.
//
// MATCHING: same convention as import-booking.js/import-ops-tracking.js —
// column B ('✍️DID') is the legacy DID, matched against releases.legacy_id.
// Rows with no DID at all (most of the sheet — only 503 of 2728 rows carry
// one; the rest are blank template rows) are skipped, not errored. Rows
// whose DID doesn't match any release (import-brief.js must run first) are
// logged and skipped, not errored.
//
// COLUMNS IMPORTED (per matched row):
//   ✍️Phụ Lục      -> releases.link_phu_luc  — ONLY when the cell is an
//                      actual URL (starts with http). Most rows instead
//                      hold a plain note ("Kí phụ lục áp dụng từ ngày
//                      17/4", "none", …) which isn't a document link —
//                      those are left alone rather than written as a
//                      bogus "URL".
//   ✍️NGÀY GỬI PL  -> releases.phu_luc_ngay_gui
//   ✍️NGÀY KÍ PL   -> releases.phu_luc_ngay_ky
//   ✍️GIÁ TRỊ PL   -> releases.phu_luc_gia_tri (Round 161's new column)
//   UPC             -> releases.upc
//   ✍️MÃ PL        -> the release's Phụ Lục ticket's data.maPL
//   VCPMC ĐỘC QUYỀN
//     SAO CHÉP      -> ticket.data.vcpmcDocQuyen (true when non-blank) +
//                      ticket.data.vcpmcNote (the original text, e.g. "ĐQSC
//                      3 năm" — the sheet has a real duration string here,
//                      the app's own field is a plain checkbox with no
//                      duration, so the original text is preserved
//                      alongside rather than lost)
//
// NOT imported — locked/computed columns per the sheet's own legend ("🔒
// Không điền vào cột có biểu tưởng ổ khóa"): 🔒Loại Dự án, 🔒Tên Dự Án,
// 🔒Thông tin dự án, the "Đã Kí"-style PL-status column right after ✍️Phụ
// Lục (the live app computes this itself from link/dates — see
// phuLucStatus() in app/tickets/phu-luc/page.js), 🔒LABEL_MA PL, 🔒Deadline
// kí PL, 🔒Ten label, 🔒Max PL, 🔒SO PL, 🔒LABEL, 🔒TÊN BÀI HÁT, 🔒TÊN NGHỆ
// SĨ, 🔒NGÀY PHÁT HÀNH, 🔒LOẠI DỰ ÁN, Goi ho tro, 🔒ĐÃ KÍ, 🔒STARTDATE,
// 🔒DEADLINE — all either formula-derived reflections of data the live DB
// already has, or (NGÀY UPDATE VCPMC / STATUS UPDATE VCPMC) completely
// empty across all 2728 rows.
//
// RELEASE FIELDS ARE COALESCE-ONLY — never overwrite a value the live app
// already has (same rule scripts/backfill-legacy-id.js uses): the sheet is
// a point-in-time snapshot, and anyone who's touched a release's Phụ Lục
// fields since then has more current data than this import.
//
// TICKET: creates the release's Phụ Lục ticket if it doesn't have one yet
// (data.maPL/vcpmcDocQuyen/vcpmcNote seeded from the row, legacy_id set to
// the row's DID for idempotent re-runs — same pattern
// import-legacy-orders.js uses). If a ticket already exists for that
// release (e.g. created live since this snapshot, or by a prior run of
// this script), its maPL/vcpmc fields are only filled in where currently
// blank — never overwritten.
//
// KNOWN DATA ISSUE — flag before running: DID "KQLK2404AR2" (ECM Squad)
// appears TWICE in the source sheet with the same Mã PL ("PL_01") but two
// DIFFERENT Phụ Lục links and Ngày Gửi dates. This script keeps the LAST
// occurrence in the sheet and logs a warning for this DID — worth checking
// by hand which link is actually correct before/after running.
//
// Defaults to a DRY RUN — pass --confirm to actually write anything.
// Strongly recommended: run scripts/backup.js first.
//
//   npm install xlsx --no-save
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-phu-luc.js phu_luc_import.xlsx
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-phu-luc.js phu_luc_import.xlsx --confirm

const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");

const HEADER_ROW = 5; // 1-indexed — "✍️LABEL CHÍNH | ✍️DID | …"
const FIRST_DATA_ROW = 6;

// col index (0-based), matching the header row exactly as exported.
const COL = {
  LABEL: 0,
  DID: 1,
  PHU_LUC: 5, // note/link column
  NGAY_GUI: 7,
  NGAY_KY: 8,
  MA_PL: 9,
  GIA_TRI: 24,
  VCPMC: 25,
  UPC: 28,
};

function excelDateToISO(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
}

function main() {
  return run();
}

async function run() {
  const confirm = process.argv.includes("--confirm");
  const filePath = process.argv[2];
  if (!filePath || filePath === "--confirm") {
    console.error("Usage: node scripts/import-phu-luc.js <path-to-xlsx> [--confirm]");
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "phu_luc").single();
  if (tabErr || !tab) {
    console.error(`Couldn't find ticket_tabs row for key="phu_luc" — is this the right DB? ${tabErr?.message || ""}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const headerRow = rows[HEADER_ROW - 1];
  if (!headerRow || !String(headerRow[COL.DID] || "").includes("DID")) {
    console.error(`Expected a "DID" header at row ${HEADER_ROW}, column B — found "${headerRow?.[COL.DID]}". Sheet layout may have changed.`);
    process.exit(1);
  }
  const dataRows = rows.slice(FIRST_DATA_ROW - 1);

  // Dedupe by DID, keeping the LAST occurrence — see the known
  // KQLK2404AR2 duplicate flagged in the file header comment above.
  const byDid = new Map();
  const dupWarnings = [];
  for (const row of dataRows) {
    const did = row[COL.DID] ? String(row[COL.DID]).trim() : null;
    if (!did) continue;
    if (byDid.has(did)) dupWarnings.push(did);
    byDid.set(did, row);
  }
  if (dupWarnings.length > 0) {
    console.log(`⚠ ${dupWarnings.length} DID(s) appeared more than once in the sheet — kept the LAST occurrence for each, verify by hand:`);
    [...new Set(dupWarnings)].forEach((d) => console.log(`   - ${d}`));
    console.log("");
  }

  console.log(`${confirm ? "IMPORTING" : "DRY RUN —"} ${byDid.size} unique DID(s) found.\n`);

  let matched = 0, noMatch = 0, labelMismatch = 0, releaseFieldsUpdated = 0, ticketsCreated = 0, ticketsAlreadyExist = 0, ticketFieldsFilled = 0, failed = 0;

  for (const [did, row] of byDid.entries()) {
    const sheetLabel = row[COL.LABEL] ? String(row[COL.LABEL]).trim() : null;
    const phuLucRaw = row[COL.PHU_LUC] ? String(row[COL.PHU_LUC]).trim() : null;
    const linkPhuLuc = phuLucRaw && /^https?:\/\//i.test(phuLucRaw) ? phuLucRaw : null;
    const ngayGui = excelDateToISO(row[COL.NGAY_GUI]);
    const ngayKy = excelDateToISO(row[COL.NGAY_KY]);
    const maPL = row[COL.MA_PL] ? String(row[COL.MA_PL]).trim() : null;
    const giaTri = row[COL.GIA_TRI] != null && row[COL.GIA_TRI] !== "" ? String(row[COL.GIA_TRI]) : null;
    const vcpmcRaw = row[COL.VCPMC] ? String(row[COL.VCPMC]).trim() : null;
    const upc = row[COL.UPC] ? String(row[COL.UPC]).trim() : null;

    const { data: rel, error: lookupErr } = await supabase
      .from("releases")
      .select("id, did, title, label, link_phu_luc, phu_luc_ngay_gui, phu_luc_ngay_ky, phu_luc_gia_tri, upc")
      .eq("legacy_id", did)
      .maybeSingle();
    if (lookupErr) {
      console.error(`${did}: lookup FAILED — ${lookupErr.message}`);
      failed++;
      continue;
    }
    if (!rel) {
      console.log(`${did}: no matching release (legacy_id) — skipping.`);
      noMatch++;
      continue;
    }
    matched++;
    if (sheetLabel && rel.label && sheetLabel.toLowerCase() !== rel.label.toLowerCase()) {
      console.log(`  [${did}] label mismatch — sheet says "${sheetLabel}", release "${rel.did}" (${rel.title}) has "${rel.label}". Importing anyway (DID match wins) — verify by hand.`);
      labelMismatch++;
    }

    // Release fields — coalesce only, never overwrite an existing value.
    const relPatch = {};
    if (linkPhuLuc && !rel.link_phu_luc) relPatch.link_phu_luc = linkPhuLuc;
    if (ngayGui && !rel.phu_luc_ngay_gui) relPatch.phu_luc_ngay_gui = ngayGui;
    if (ngayKy && !rel.phu_luc_ngay_ky) relPatch.phu_luc_ngay_ky = ngayKy;
    if (giaTri && !rel.phu_luc_gia_tri) relPatch.phu_luc_gia_tri = giaTri;
    if (upc && !rel.upc) relPatch.upc = upc;

    if (Object.keys(relPatch).length > 0) {
      console.log(`[${did}] -> ${rel.did}: release fields ${JSON.stringify(relPatch)}`);
      if (confirm) {
        const { error: updErr } = await supabase.from("releases").update(relPatch).eq("id", rel.id);
        if (updErr) { console.error(`  -> release update FAILED: ${updErr.message}`); failed++; }
        else releaseFieldsUpdated++;
      } else {
        releaseFieldsUpdated++;
      }
    }

    // Ticket — create if missing, else coalesce-fill maPL/vcpmc fields only.
    const { data: existingTicket, error: ticketLookupErr } = await supabase
      .from("tickets")
      .select("id, data")
      .eq("tab_id", tab.id)
      .eq("data->>releaseId", rel.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (ticketLookupErr) {
      console.error(`  [${did}] ticket lookup FAILED: ${ticketLookupErr.message}`);
      failed++;
      continue;
    }

    if (!existingTicket) {
      const data = { releaseId: rel.id };
      if (maPL) data.maPL = maPL;
      if (vcpmcRaw) { data.vcpmcDocQuyen = true; data.vcpmcNote = vcpmcRaw; }
      console.log(`  [${did}] no ticket yet -> creating with ${JSON.stringify(data)}`);
      if (confirm) {
        const { error: insErr } = await supabase.from("tickets").insert({
          tab_id: tab.id,
          data,
          status: tab.default_status,
          status_log: { [tab.default_status]: new Date().toISOString() },
          legacy_id: did,
        });
        if (insErr) { console.error(`  -> ticket insert FAILED: ${insErr.message}`); failed++; }
        else ticketsCreated++;
      } else {
        ticketsCreated++;
      }
    } else {
      ticketsAlreadyExist++;
      const newData = { ...(existingTicket.data || {}) };
      let changed = false;
      if (maPL && !newData.maPL) { newData.maPL = maPL; changed = true; }
      if (vcpmcRaw && newData.vcpmcDocQuyen == null) { newData.vcpmcDocQuyen = true; newData.vcpmcNote = vcpmcRaw; changed = true; }
      if (changed) {
        console.log(`  [${did}] ticket already exists — filling blank fields: ${JSON.stringify(newData)}`);
        if (confirm) {
          const { error: updErr } = await supabase.from("tickets").update({ data: newData }).eq("id", existingTicket.id);
          if (updErr) { console.error(`  -> ticket update FAILED: ${updErr.message}`); failed++; }
          else ticketFieldsFilled++;
        } else {
          ticketFieldsFilled++;
        }
      }
    }
  }

  console.log(`\n${confirm ? "Done." : "Dry run complete — nothing written."}`);
  console.log(`Matched: ${matched}, No release match: ${noMatch}, Label mismatches (imported anyway): ${labelMismatch}, Failed: ${failed}`);
  console.log(`Release field updates: ${releaseFieldsUpdated}, Tickets created: ${ticketsCreated}, Tickets already existed: ${ticketsAlreadyExist} (of which fields filled: ${ticketFieldsFilled})`);
  if (!confirm) console.log("Re-run with --confirm to actually write these changes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
