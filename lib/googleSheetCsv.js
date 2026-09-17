// Round 357 — pulled the CSV-fetch-and-parse guts out of
// app/api/channel-reference-sheet/route.js so the new daily auto-fetch
// cron (app/api/cron/channel-reference-sheet/route.js) can call the exact
// same fetch/parse/retry logic in-process, instead of the cron making an
// HTTP round-trip back into this app's own API route (which would need
// its own auth story and just adds a hop for no benefit — same process,
// same request lifecycle either way). Behavior is unchanged from Round
// 343-345 — see that route's own history for why each piece here exists
// (the browser-like User-Agent, the two-attempt retry, the 25s timeout).
const FETCH_TIMEOUT_MS = 25000;
const MAX_BYTES = 2 * 1024 * 1024; // safety cap — this is a preview table, not a data export

function notPublicError(detail) {
  return `Sheet not accessible (${detail}) — check it's shared as "Anyone with the link," or try again in a moment.`;
}

// Minimal RFC4180 CSV parser (quoted fields, embedded commas/newlines, ""
// as an escaped quote) — no dependency needed for what Google's own CSV
// export already produces cleanly.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (c === "\r") {
      // skip — \n (handled above) closes the row either way
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

async function attemptFetchSheetCsv(exportUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(exportUrl, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      return { ok: false, error: notPublicError(`HTTP ${res.status}`) };
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("csv") && !contentType.includes("text")) {
      return { ok: false, error: notPublicError(`got ${contentType || "unknown"} instead of CSV`) };
    }

    const text = await res.text();
    if (text.length > MAX_BYTES) {
      return { ok: false, error: "Sheet too large to preview." };
    }

    const rows = parseCsv(text);
    if (rows.length === 0) return { ok: true, data: { headers: [], rows: [] } };
    const [headers, ...body] = rows;
    return { ok: true, data: { headers, rows: body } };
  } catch (err) {
    const detail = err?.name === "AbortError" ? `timed out after ${FETCH_TIMEOUT_MS / 1000}s` : err?.message || "network error";
    return { ok: false, error: `Failed to fetch sheet (${detail}).` };
  }
}

// Fetches + parses a Google Sheet's public CSV export, with one automatic
// retry (same "transient hiccup" reasoning as the API route). Returns
// { ok: true, data: { headers, rows } } or { ok: false, error }.
export async function fetchSheetCsv(spreadsheetId, gid) {
  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await attemptFetchSheetCsv(exportUrl);
    if (result.ok) return result;
    lastError = result;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1200));
  }
  return lastError;
}
