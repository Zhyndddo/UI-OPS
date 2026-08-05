// Shared TSV-paste parser for Batch Phái Sinh — both the create form
// (app/tickets/batch-phai-sinh/new) and the expanded batch table's "+ Add
// via paste" (app/tickets/batch-phai-sinh/[id]) use this, so the expected
// column order only lives in one place. Column order matches the "NHẠC SỐ
// Nguyễn Văn Chung x VIEENT — TRACKING LIST" example sheet's KHO NHẠC tab
// exactly (copy a range from that kind of sheet — or any sheet built the
// same way — and paste straight in; a header row, if pasted along with
// the data, is auto-detected and skipped).
export const BATCH_ITEM_COLUMNS = [
  "Tên bài hát", "Version", "Thể loại", "Artist", "Composer", "Producer", "Mixer",
  "Ngày Phát Hành", "UPC", "ISRC", "Link Audio", "Link Artwork", "Lyrics", "Smartlink",
  "Ngày nhận", "Ngày hoàn thành", "Tác quyền", "Type", "Status", "Note", "Link Labelmaster",
];

const FIELD_KEYS = [
  "ten_bai", "version", "the_loai", "artist", "composer", "producer", "mixer",
  "release_date", "upc", "isrc", "link_audio", "link_artwork", "lyrics", "smartlink",
  "ngay_nhan", "ngay_hoan_thanh", "tac_quyen", "type_request", "status", "note", "link_labelmaster",
];

// Sheet only ever used ✅Hoàn thành / ❌Đã huỷ / blank — mapped onto this
// app's usual REQUESTED/PROCESS/COMPLETE/CANCELED vocabulary. Anything
// unrecognized falls back to REQUESTED rather than silently dropping the
// row.
function mapStatus(raw) {
  const v = (raw || "").trim();
  if (v.includes("Hoàn thành") || v.includes("Hoan thanh")) return "COMPLETE";
  if (v.includes("huỷ") || v.includes("hủy") || v.includes("huy")) return "CANCELED";
  if (v.includes("PROCESS") || v.includes("Đang")) return "PROCESS";
  return "REQUESTED";
}

// Lenient date parse — accepts YYYY-MM-DD as-is, otherwise hands off to
// Date.parse (covers common pasted formats like DD/MM/YYYY or M/D/YYYY
// depending on locale) and reformats to YYYY-MM-DD. Returns null rather
// than throwing on anything it can't make sense of, so a bad date cell
// doesn't block the rest of the row.
function parseDateLenient(raw) {
  const v = (raw || "").trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Parses a pasted TSV block into an array of phai_sinh_batch_items-shaped
// objects (snake_case keys, ready to insert). Rows with no Tên bài hát are
// skipped (that's the one required field). Returns { rows, skipped } —
// skipped counts blank/header-only lines so the UI can report "N rows
// parsed, M skipped" instead of a bare number that might look wrong.
export function parseBatchPaste(text) {
  const lines = (text || "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const rows = [];
  let skipped = 0;
  for (const line of lines) {
    const cells = line.split("\t");
    // Header-row detection — if the first cell matches the expected
    // header text (case-insensitive), skip this line entirely rather than
    // importing it as a fake song called "Tên bài hát".
    if ((cells[0] || "").trim().toLowerCase() === BATCH_ITEM_COLUMNS[0].toLowerCase()) {
      continue;
    }
    const tenBai = (cells[0] || "").trim();
    if (!tenBai) {
      skipped++;
      continue;
    }
    const row = {};
    FIELD_KEYS.forEach((key, i) => {
      const raw = (cells[i] || "").trim();
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
    rows.push(row);
  }
  return { rows, skipped };
}
