import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { readChannelReferenceIntro, parseGoogleSheetUrl } from "../../../lib/channelReferenceIntro";

// Round 339 — server-side fetch of the Channel Reference magic link's
// configured Google Sheet ("embed the first sheet... use the normal url
// as a click for details"). Public, no-login route (same as
// app/api/crawl-og-image/route.js) since the magic link itself is public,
// but deliberately NOT a general-purpose "fetch any Google Sheet" proxy —
// see the SSRF-guard comment below, same idiom crawl-og-image uses
// (only ever fetch a URL that matches something we already trust).
//
// Data is pulled fresh on every call (no caching beyond a 60s edge hint)
// per explicit spec ("fetched live on each page load") rather than a
// periodic refresh — this is a small, occasionally-viewed magic link, not
// high-traffic, so the extra round-trip per view is cheap and the data
// is never stale.

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 2 * 1024 * 1024; // safety cap — this is a preview table, not a data export

const NOT_PUBLIC_ERROR = 'Sheet not accessible — check it\'s shared as "Anyone with the link."';

// Minimal RFC4180 CSV parser (quoted fields, embedded commas/newlines,
// "" as an escaped quote) — no dependency needed for what Google's own
// CSV export already produces cleanly.
function parseCsv(text) {
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
  // Drop fully-blank rows (a trailing blank line, or a genuinely empty
  // row Sheets sometimes exports) rather than rendering an empty <tr>.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export async function GET(request) {
  const rawUrl = new URL(request.url).searchParams.get("url");
  if (!rawUrl) return NextResponse.json({ error: "Missing url param." }, { status: 400 });

  const requested = parseGoogleSheetUrl(rawUrl);
  if (!requested) return NextResponse.json({ error: "Not a Google Sheets URL." }, { status: 400 });

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }

  // SSRF guard: only ever fetch the ONE sheet currently configured on the
  // Channel Reference intro, never an arbitrary caller-supplied sheet —
  // same "must match a value we already trust" idiom crawl-og-image uses
  // for its own og:image crawl.
  const intro = await readChannelReferenceIntro(supabaseAdmin);
  const configured = parseGoogleSheetUrl(intro.sheetUrl);
  if (!configured || configured.spreadsheetId !== requested.spreadsheetId || configured.gid !== requested.gid) {
    return NextResponse.json({ error: "url does not match the configured Channel Reference sheet." }, { status: 403 });
  }

  const exportUrl = `https://docs.google.com/spreadsheets/d/${requested.spreadsheetId}/export?format=csv&gid=${requested.gid}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(exportUrl, { signal: controller.signal, redirect: "follow" });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // A sheet that isn't actually shared publicly most commonly 400s
      // or 401s here rather than serving a login page for the CSV export
      // endpoint specifically.
      return NextResponse.json({ error: NOT_PUBLIC_ERROR }, { status: 502 });
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("csv") && !contentType.includes("text")) {
      // The other failure shape: a 200 OK that's actually Google's HTML
      // sign-in interstitial, not CSV — content-type is the tell since
      // the HTTP status alone doesn't catch this case.
      return NextResponse.json({ error: NOT_PUBLIC_ERROR }, { status: 502 });
    }

    const text = await res.text();
    if (text.length > MAX_BYTES) {
      return NextResponse.json({ error: "Sheet too large to preview." }, { status: 502 });
    }

    const rows = parseCsv(text);
    if (rows.length === 0) {
      return NextResponse.json({ headers: [], rows: [] }, { headers: { "Cache-Control": "public, max-age=60" } });
    }
    const [headers, ...body] = rows;
    return NextResponse.json({ headers, rows: body }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return NextResponse.json({ error: "Failed to fetch sheet." }, { status: 502 });
  }
}
