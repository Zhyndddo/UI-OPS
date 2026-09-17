import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { readChannelReferenceIntro, parseGoogleSheetUrl } from "../../../lib/channelReferenceIntro";
import { fetchSheetCsv } from "../../../lib/googleSheetCsv";

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

// Round 344 — BUG FIX: the actual error on the page ("Failed to fetch
// sheet.") only ever comes from the outer catch block below — meaning
// `fetch()` itself threw, not that Google returned a non-2xx/non-CSV
// response (those two cases got their own detailed messages in Round
// 343, and neither is showing). The most likely thing that throws here
// is our OWN 8-second AbortController firing before Google's export
// finished generating — plausible for a sheet with real size/formatting
// to it, and would explain "it showed before" (a smaller/simpler sheet,
// or a faster response that day) without any code change in between.
// Raised the budget well past that, and `maxDuration` below raises the
// Vercel function's own ceiling to match (Hobby plans cap this at 10s
// regardless — this only helps on Pro/Enterprise, but doesn't hurt
// either way). The catch block below also now says explicitly whether
// THIS was a timeout, instead of folding every possible network failure
// into one unhelpful line.
//
// Round 345 — now up to 2 attempts (see the retry loop below), so
// maxDuration needs enough room for two full FETCH_TIMEOUT_MS windows
// plus the retry delay between them (worst case ~51s) without Vercel's
// own platform timeout cutting it off first.
export const maxDuration = 60;

// Round 357 — the actual fetch/parse/retry implementation (and its
// notPublicError/parseCsv helpers) moved to lib/googleSheetCsv.js so the
// new daily auto-fetch cron (app/api/cron/channel-reference-sheet/
// route.js) can reuse it verbatim instead of a second copy drifting out
// of sync. Nothing about the request/response shape below changed.

export async function GET(request) {
  const rawUrl = new URL(request.url).searchParams.get("url");
  if (!rawUrl) return NextResponse.json({ error: "Missing url param." }, { status: 400 });

  const requested = parseGoogleSheetUrl(rawUrl);
  if (!requested) return NextResponse.json({ error: "Not a Google Sheets URL." }, { status: 400 });

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }

  // SSRF guard: only ever fetch one of the (up to 2, as of Round 365)
  // sheets currently configured on the Channel Reference intro, never an
  // arbitrary caller-supplied sheet — same "must match a value we
  // already trust" idiom crawl-og-image uses for its own og:image crawl.
  const intro = await readChannelReferenceIntro(supabaseAdmin);
  const matchesConfigured = (rawConfiguredUrl) => {
    const configured = parseGoogleSheetUrl(rawConfiguredUrl);
    return configured && configured.spreadsheetId === requested.spreadsheetId && configured.gid === requested.gid;
  };
  if (!matchesConfigured(intro.sheetUrl) && !matchesConfigured(intro.sheetUrl2)) {
    return NextResponse.json({ error: "url does not match a configured Channel Reference sheet." }, { status: 403 });
  }

  // Round 345 — "I want to make sure it stay works": one automatic retry
  // (short delay in between) before giving up (now inside
  // lib/googleSheetCsv.js's fetchSheetCsv), since the two most likely
  // failure modes found so far (Round 343's bot-detection theory, Round
  // 344's timeout theory) are both the kind of transient hiccup a second
  // attempt can just sail through.
  const result = await fetchSheetCsv(requested.spreadsheetId, requested.gid);
  if (result.ok) return NextResponse.json(result.data, { headers: { "Cache-Control": "public, max-age=60" } });
  return NextResponse.json({ error: result.error }, { status: 502 });
}
