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
//
// Round 270 — the single "Tác quyền" free-text column was split into 3,
// one per right (Q1 Bản ghi / Q2 Người biểu diễn / Q3 Tác giả), matching
// how New Release's Copyright Checklist already breaks rights out
// (lib/copyrightChecklist.js's COPYRIGHT_ITEMS), per explicit request
// ("a column copyrights for each row (3 rights just like the new
// release)"). Deliberately kept to just an Owner-per-right text field
// here (not the full Owner/Contract/Validity structure New Release uses)
// — the batch table is a flat spreadsheet-style grid, not a per-track
// popup editor, and that was the explicitly requested scope. The old
// single `tac_quyen` column/DB field is left in place untouched (still
// readable on any row imported before this round) rather than migrated
// or removed, so no existing data is disturbed — see
// sql/pending/add-round270-phai-sinh-rights-columns.sql.
export const BATCH_ITEM_COLUMNS = [
  "Tên Album", "Tên bài hát", "Version", "Thể loại", "Artist", "Composer", "Producer", "Mixer",
  "Ngày Phát Hành", "UPC", "ISRC", "Link Audio", "Link Artwork", "Lyrics", "Smartlink",
  "Ngày nhận", "Ngày hoàn thành",
  "Tác quyền Q1 (Bản ghi)", "Tác quyền Q2 (Người biểu diễn)", "Tác quyền Q3 (Tác giả)",
  "Type", "Status", "Note", "Link Labelmaster",
];

const FIELD_KEYS = [
  "album_name", "ten_bai", "version", "the_loai", "artist", "composer", "producer", "mixer",
  "release_date", "upc", "isrc", "link_audio", "link_artwork", "lyrics", "smartlink",
  "ngay_nhan", "ngay_hoan_thanh",
  "tac_quyen_master", "tac_quyen_vocal", "tac_quyen_author",
  "type_request", "status", "note", "link_labelmaster",
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

// ───────────────────────────────────────────────────────────────────────
// Flexible import — columns are matched by their HEADER NAME instead of
// position, so a sheet in any column order (or with extra columns the app
// doesn't know) imports without being rebuilt to the template. Header
// names are matched ignoring case, accents and punctuation, in Vietnamese
// or English ("Tên bài hát" / "ten bai" / "Song" / "Track name" all mean
// the same column). A sheet whose first rows contain no recognisable
// header falls back to the fixed template order, exactly as before, so
// nothing that already imported keeps working differently.
export const BATCH_FIELD_KEYS = FIELD_KEYS;
export const BATCH_FIELD_LABELS = Object.fromEntries(FIELD_KEYS.map((k, i) => [k, BATCH_ITEM_COLUMNS[i]]));

export function normHeader(s) {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const HEADER_ALIASES = {
  album_name: ["ten album", "album", "album name", "ten album ep", "album ep"],
  ten_bai: ["ten bai hat", "ten bai", "bai hat", "song", "song name", "song title", "track", "track name", "track title", "title", "ten ca khuc", "ca khuc", "ten bai hat title"],
  version: ["version", "phien ban"],
  the_loai: ["the loai", "genre"],
  artist: ["artist", "nghe si", "ca si", "main artist", "ten nghe si", "ten ca si"],
  composer: ["composer", "nhac si", "tac gia", "songwriter", "sang tac", "nhac si sang tac"],
  producer: ["producer", "nha san xuat", "san xuat"],
  mixer: ["mixer", "mixing", "mix"],
  release_date: ["ngay phat hanh", "release date", "release", "ngay ph", "phat hanh", "release day", "date"],
  upc: ["upc", "barcode"],
  isrc: ["isrc"],
  link_audio: ["link audio", "audio", "audio link", "link nhac", "file audio", "link file audio"],
  link_artwork: ["link artwork", "artwork", "cover", "link cover", "artwork link", "anh bia", "link anh bia", "cover art"],
  lyrics: ["lyrics", "lyric", "loi bai hat", "loi", "link lyrics"],
  smartlink: ["smartlink", "smart link", "link smartlink", "link smart"],
  ngay_nhan: ["ngay nhan", "received", "received date", "date received", "ngay nhan yeu cau"],
  ngay_hoan_thanh: ["ngay hoan thanh", "completed", "completed date", "done date", "ngay xong", "date completed"],
  tac_quyen_master: ["tac quyen q1 ban ghi", "tac quyen q1", "q1 ban ghi", "q1", "quyen ban ghi", "master", "master rights"],
  tac_quyen_vocal: ["tac quyen q2 nguoi bieu dien", "tac quyen q2", "q2 nguoi bieu dien", "q2", "quyen nguoi bieu dien", "vocal", "vocal rights"],
  tac_quyen_author: ["tac quyen q3 tac gia", "tac quyen q3", "q3 tac gia", "q3", "quyen tac gia", "author rights"],
  type_request: ["type", "type request", "loai", "loai yeu cau"],
  status: ["status", "trang thai", "tinh trang"],
  note: ["note", "notes", "ghi chu", "ghi chu them"],
  link_labelmaster: ["link labelmaster", "labelmaster", "label master", "link label master"],
};

const ALIAS_LOOKUP = (() => {
  const m = new Map();
  for (const [key, list] of Object.entries(HEADER_ALIASES)) {
    for (const a of list) if (!m.has(a)) m.set(a, key);
  }
  for (const k of FIELD_KEYS) {
    const n = normHeader(BATCH_FIELD_LABELS[k]);
    if (n) m.set(n, k); // the template's own header always wins
  }
  return m;
})();

// One row of header cells -> an array (one entry per column) of field key
// or null. The first column to claim a field keeps it; a repeated header
// is left unmapped so the user can choose in the mapping step.
export function autoMapHeaders(cells) {
  const used = new Set();
  return (cells || []).map((c) => {
    const key = ALIAS_LOOKUP.get(normHeader(c)) || null;
    if (!key || used.has(key)) return null;
    used.add(key);
    return key;
  });
}

const POSITIONAL_MAPPING = FIELD_KEYS.slice();

function isBlankRow(cells) {
  return !cells || cells.every((c) => (c ?? "").toString().trim() === "");
}

// Finds the header row (within the first 10 non-blank rows) and the column
// mapping. { mode: "header", headerIndex, mapping, headers } when a header
// row is recognised (it names a song-title column, or at least two known
// columns); otherwise { mode: "position", ... } = the fixed template order.
export function detectBatchLayout(rowsOfCells) {
  const rows = rowsOfCells || [];
  let seen = 0;
  for (let i = 0; i < rows.length && seen < 10; i++) {
    if (isBlankRow(rows[i])) continue;
    seen++;
    const mapping = autoMapHeaders(rows[i]);
    const hits = mapping.filter(Boolean).length;
    if (hits >= 2 || (hits >= 1 && mapping.includes("ten_bai"))) {
      return { mode: "header", headerIndex: i, mapping, headers: (rows[i] || []).map((c) => (c ?? "").toString().trim()) };
    }
  }
  return { mode: "position", headerIndex: -1, mapping: POSITIONAL_MAPPING.slice(), headers: null };
}

// Converts one row's cells into a phai_sinh_batch_items-shaped object using
// `mapping` (field key per column index). Returns null if there is no Tên
// bài hát (the one required field) — caller counts that as skipped.
function cellsToItem(cells, mapping) {
  const row = {};
  FIELD_KEYS.forEach((key) => {
    if (key === "release_date" || key === "ngay_nhan" || key === "ngay_hoan_thanh") row[key] = null;
    else if (key === "status") row.status = mapStatus("");
    else if (key === "type_request") row.type_request = "Phái Sinh";
    else row[key] = null;
  });
  let tenBai = "";
  mapping.forEach((key, i) => {
    if (!key) return;
    const raw = (cells[i] ?? "").toString().trim();
    if (key === "ten_bai") tenBai = raw;
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
  if (!tenBai) return null;
  return row;
}

// Applies a layout (from detectBatchLayout, or one the user adjusted in the
// mapping step) to rows of cells. Rows above and including the header row
// are ignored; in position mode a legacy template header row is skipped.
export function applyBatchLayout(rowsOfCells, layout) {
  const rows = [];
  let skipped = 0;
  const lay = layout || detectBatchLayout(rowsOfCells);
  const list = rowsOfCells || [];
  for (let i = 0; i < list.length; i++) {
    const cells = list[i];
    if (isBlankRow(cells)) continue; // fully blank row, not "skipped" — just not a row at all
    if (lay.mode === "header" && i <= lay.headerIndex) continue;
    if (lay.mode !== "header" && (cells[0] ?? "").toString().trim().toLowerCase() === BATCH_ITEM_COLUMNS[0].toLowerCase()) continue;
    const row = cellsToItem(cells, lay.mapping);
    if (!row) {
      skipped++;
      continue;
    }
    rows.push(row);
  }
  return { rows, skipped };
}

// Parses a pasted TSV block into phai_sinh_batch_items-shaped objects.
// Returns { rows, skipped } — skipped counts rows with no song title so the
// UI can report "N rows parsed, M skipped". Header-aware like the file path.
export function parseBatchPaste(text) {
  const lines = (text || "").split(/\r?\n/).filter((l) => l.trim() !== "");
  return applyBatchLayout(lines.map((l) => l.split("\t")));
}

// Round 41 — same mapping, but input is already an array of arrays (one per
// spreadsheet row), as produced by lib/BatchFileImport.js reading an
// uploaded file with SheetJS. Kept separate from parseBatchPaste so a cell
// containing a literal tab or newline can't corrupt the row split.
export function parseBatchRows(rowsOfCells, layout) {
  return applyBatchLayout(rowsOfCells, layout);
}
