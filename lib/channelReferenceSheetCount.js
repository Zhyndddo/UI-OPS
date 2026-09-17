// Round 357 — pulled out of app/channels/[token]/page.js so the new daily
// auto-fetch cron (app/api/cron/channel-reference-sheet/route.js) counts
// the sheet exactly the same way the page itself does, instead of a
// second hand-copied implementation drifting out of sync with it later.
// Logic itself is unchanged from Round 348/349 — see the page's own git
// history for the reasoning behind "sum every 'N kênh' row" and "a
// column-title row is one whose first cell is blank but another isn't."

// Round 348 — "look at the số lượng row... it has 50 kênh, 120 kênh,..
// sum those numbers". Strips non-digit characters out of each cell and
// sums whatever numbers turn up — a "simple sum across the row" per
// explicit spec.
export function sumRowNumbers(row) {
  if (!row) return 0;
  return row.reduce((sum, cell) => {
    const digits = String(cell || "").replace(/[^\d]/g, "");
    if (!digits) return sum;
    const n = parseInt(digits, 10);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

// Round 349 — detect every row that actually has "kênh"-suffixed cells —
// not a fixed row index — so however many "N kênh" rows the sheet ends up
// with (1, 2, 5...) they all get counted.
export function isKenhCountRow(row) {
  if (!row) return false;
  return row.some((cell) => /kênh\s*$/i.test(String(cell || "").trim()));
}

// Round 349 — a column-title row is the one where the first cell is
// BLANK but at least one other cell in the row has text.
export function isColumnTitleRow(row) {
  if (!row || row.length === 0) return false;
  if (String(row[0] || "").trim() !== "") return false;
  return row.slice(1).some((cell) => String(cell || "").trim() !== "");
}

// Sums every "N kênh" row in a parsed sheet body (the array of data rows,
// header row already stripped) — the one number this page/cron cares
// about computing.
export function computeSheetCount(rows) {
  return (rows || []).filter(isKenhCountRow).reduce((sum, row) => sum + sumRowNumbers(row), 0);
}
