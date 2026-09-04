// Shared parser for Batch Phái Sinh / Kho Nhạc children rows — used by
// paste (TSV textarea) AND file import (round 41, .xlsx/.csv via
// lib/BatchFileImport.js), across the create form
// (app/tickets/phai-sinh/new) and the expanded batch table's "+ Add"
// (app/tickets/batch-phai-sinh/[id]), so the expected column order only
// lives in one place. Column order matches the "NHẠC SỐ Nguyễn Văn Chung
// x VIEENT — TRACKING LIST" example sheet's KHO NHẠC tab exactly (copy a
// range from that kind of sheet — or the delivered
// batch-phai-sinh-template.xlsx — and paste or upload it straight in; a
// header row is auto-detected and skipped either way).
// Round 116 originally appended "Tên Album" at the END rather than the
// front, to protect anyone already pasting from the reference "KHO NHẠC"
// sheet layout. Round 117 — moved to the FRONT after all, per explicit
// follow-up ("i haven't allow the gang to use it properly" — nobody's
// actually relied on the paste/import column order yet, so there's
// nothing to protect). Now matches the table UI's leftmost display
// position exactly. cellsToItem below no longer hardcodes "column 0 is
// the required field" — it looks up wherever "ten_bai" actually falls in
// FIELD_KEYS, so this list can be reordered again later without silently
// breaking the required-field check.
export const BATCH_ITEM_COLUMNS = [
  "Tên Album", "Tên bài hát", "Version", "Thể loại", "Artist", "Composer", "Producer", "Mixer",
  "Ngày Phát Hành", "UPC", "ISRC", "Link Audio", "Link Artwork", "Lyrics", "Smartlink",
  "Ngày nhận", "Ngày hoàn thành", "Tác quyền", "Type", "Status", "Note", "Link Labelmaster",
];

const FIELD_KEYS = [
  "album_name", "ten_bai", "version", "the_loai", "artist", "composer", "producer", "mixer",
  "release_date", "upc", "isrc", "link_audio", "link_artwork", "lyrics", "smartlink",
  "ngay_nhan", "ngay_hoan_thanh", "tac_quyen", "type_request", "status", "note", "link_labelmaster",
];

// Sheet only ever used ✅Hoàn thành / ❌Đã huỷ / blank — mapped onto this
// app's usual REQUESTED/PROCESS/COMPLETE/CANCELED vocabulary. Anything
// unrecognized falls back to REQUESTED rather than silently dropping the
// row. (Round 41's new UPLOADING/DELIVERY/RECHECKING statuses aren't
// something a source sheet would ever spell out, so they're not mapped
// here — those get set inside the app after import, same as before.)
function mapStatus(raw) {
  const v = (raw || "").trim();
  if (v.includes("Hoàn thành") || v.includes("Hoan thanh")) return "COMPLETE";
  if (v.includes("huỷ") || v.includes("hủy") || v.includes("huy")) return "CANCELED";
  if (v.includes("PROCESS") || v.includes("Đang")) return "PROCESS";
  return "REQUESTED";
}

// Lenient date parse — accepts YYYY-MM-DD as-is. Slash-separated dates
// (D/M/YYYY or DD/MM/YYYY) are parsed EXPLICITLY as day-first (matching
// how every real tracklist sheet we've seen writes dates,
// e.g. "2/6/2025" meaning 2 June) — a real bug found this way (round 36):
// this used to hand slash dates straight to `new Date(v)`, which assumes
// US M/D/YYYY. "25/5/2025" (25 May) has "month 25" under that reading, so
// it silently came back Invalid -> null -> blank; "2/6/2025" (2 June) came
// back as a VALID but WRONG date, 6 February, since day<=12 flips
// silently into a plausible month. Both symptoms showed up in the same
// paste. Building the YYYY-MM-DD string directly (no Date object involved
// for this branch) also sidesteps a separate off-by-one risk from
// toISOString()'s UTC conversion. Anything else falls back to Date.parse
// as before, still returning null rather than throwing on anything it
// can't make sense of.
function parseDateLenient(raw) {
  const v = (raw || "").trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const dmy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    const year = dmy[3];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return null;
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Round 117 — looked up by name instead of hardcoded as index 0, now that
// Tên Album sits in front of it in FIELD_KEYS/BATCH_ITEM_COLUMNS.
const TEN_BAI_INDEX = FIELD_KEYS.indexOf("ten_bai");

// Converts one row's cells (array, already split from either a pasted TSV
// line or a parsed spreadsheet row) into a phai_sinh_batch_items-shaped
// object. Returns null if there's no Tên bài hát (the one required
// field) — caller counts that as skipped.
function cellsToItem(cells) {
  const tenBai = (cells[TEN_BAI_INDEX] ?? "").toString().trim();
  if (!tenBai) return null;
  const row = {};
  FIELD_KEYS.forEach((key, i) => {
    const raw = (cells[i] ?? "").toString().trim();
    if (key === "release_date" || key === "ngay_nhan" || key === "ngay_hoan_thanh") {
      row[key] = parseDateLenient(raw);
    } else if (key === "status") {
      row.status = mapStatus(raw);
    } else if (key === "type_request") {
      row.type_request = raw || "Phái Sinh";
    } else {
      row[key] = raw || null;
    }
  });
  return row;
}

function isHeaderRow(cells) {
  return (cells[0] ?? "").toString().trim().toLowerCase() === BATCH_ITEM_COLUMNS[0].toLowerCase();
}

// Parses a pasted TSV block into an array of phai_sinh_batch_items-shaped
// objects. Returns { rows, skipped } — skipped counts blank/header-only
// lines so the UI can report "N rows parsed, M skipped" instead of a bare
// number that might look wrong.
export function parseBatchPaste(text) {
  const lines = (text || "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const rows = [];
  let skipped = 0;
  for (const line of lines) {
    const cells = line.split("\t");
    if (isHeaderRow(cells)) continue;
    const row = cellsToItem(cells);
    if (!row) {
      skipped++;
      continue;
    }
    rows.push(row);
  }
  return { rows, skipped };
}

// Round 41 — same mapping, but input is already an array of arrays (one
// per spreadsheet row), as produced by lib/BatchFileImport.js reading an
// uploaded .xlsx/.csv with SheetJS's `sheet_to_json(sheet, {header: 1})`.
// Kept separate from parseBatchPaste (rather than stringifying rows back
// into TSV and reusing that) so a cell that happens to contain a literal
// tab or newline character doesn't corrupt the row split.
export function parseBatchRows(rowsOfCells) {
  const rows = [];
  let skipped = 0;
  for (const cells of rowsOfCells || []) {
    if (!cells || cells.every((c) => (c ?? "").toString().trim() === "")) continue; // fully blank row, not "skipped" — just not a row at all
    if (isHeaderRow(cells)) continue;
    const row = cellsToItem(cells);
    if (!row) {
      skipped++;
      continue;
    }
    rows.push(row);
  }
  return { rows, skipped };
}
