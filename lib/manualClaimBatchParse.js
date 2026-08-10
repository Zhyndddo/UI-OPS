// Round 81 item 4 — mass-import for Manual Claim tickets, "like the one
// in phai sinh" (see lib/phaiSinhBatchParse.js) but simpler: Manual Claim
// has no batch/child-item concept, so each pasted row becomes its own
// standalone ticket (a normal `tickets` insert, not a
// phai_sinh_batch_items child row). Textbox-paste only, per explicit
// request ("import by textbox") — no file-upload variant like Phái Sinh's
// BatchFileImport was asked for here.
export const MANUAL_CLAIM_BATCH_COLUMNS = ["Label", "Tên Bài", "Artist", "Claim Timestamp", "URL", "Note"];

const FIELD_KEYS = ["label", "tenBai", "artist", "claimTimestamp", "url", "note"];

// Manual Claim's own required fields (lib/ticketConfigs.js's manual_claim
// entry): label, tenBai, artist, url. A pasted row missing any of those
// is skipped rather than silently creating a ticket that's missing
// required data.
function cellsToItem(cells) {
  const row = {};
  FIELD_KEYS.forEach((key, i) => {
    row[key] = (cells[i] ?? "").toString().trim();
  });
  if (!row.label || !row.tenBai || !row.artist || !row.url) return null;
  return row;
}

function isHeaderRow(cells) {
  return (cells[0] ?? "").toString().trim().toLowerCase() === MANUAL_CLAIM_BATCH_COLUMNS[0].toLowerCase();
}

// Parses a pasted TSV block into an array of Manual Claim `data`-shaped
// objects. Returns { rows, skipped } so the UI can report "N parsed, M
// skipped" instead of a bare count that might look wrong.
export function parseManualClaimBatchPaste(text) {
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
