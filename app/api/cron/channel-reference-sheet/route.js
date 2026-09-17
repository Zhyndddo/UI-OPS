// Round 357 — the actual "auto fetch" for the Channel Reference magic
// link's External counter, per explicit request: "the auto fetch, run a
// fetch every day at 8:00 if we can. Either api call or simulation
// browser is fine." Up to now the sheet was only ever fetched live, on
// demand, when someone had the page open (app/api/channel-reference-
// sheet/route.js, called from a useEffect in page.js) — confirmed in the
// prior round there was no scheduled/background refresh at all. This
// route IS that scheduled refresh: it's wired to Vercel Cron (see
// vercel.json's "crons" entry, "0 1 * * *" = 01:00 UTC = 08:00
// Asia/Ho_Chi_Minh) to run once a day regardless of whether anyone views
// the page that day, using a plain server-side API call (Google's CSV
// export endpoint) rather than a headless-browser simulation — same
// method the live per-visit fetch already uses successfully, no need for
// the heavier option.
//
// What it does with the result: computes the same "N kênh" row-sum the
// page itself displays (lib/channelReferenceSheetCount.js — shared with
// page.js so the two can never disagree) and writes it, with a
// timestamp, into global_settings under a new key. page.js reads that
// snapshot to show "last auto-refreshed" next to the sheet section, and
// falls back to it if a viewer's own live fetch fails — see the
// CHANNEL_REFERENCE_SHEET_SNAPSHOT_KEY usage in
// lib/channelReferenceIntro.js and page.js.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { readChannelReferenceIntro, parseGoogleSheetUrl } from "../../../../lib/channelReferenceIntro";
import { fetchSheetCsv } from "../../../../lib/googleSheetCsv";
import { computeSheetCount } from "../../../../lib/channelReferenceSheetCount";
import { CHANNEL_REFERENCE_SHEET_SNAPSHOT_KEY } from "../../../../lib/channelReferenceSheetSnapshot";

export const maxDuration = 60;

export async function GET(request) {
  // Round 357 — Vercel Cron sends "Authorization: Bearer $CRON_SECRET" on
  // every invocation IF a CRON_SECRET env var is set on the project (see
  // Vercel's own docs on securing cron routes) — checked here the same
  // fail-open way the rest of this app treats optional config: if
  // CRON_SECRET isn't set yet (nobody's added it in Vercel Settings ->
  // Environment Variables), the route still runs rather than silently
  // never firing. Once CRON_SECRET is added there, this starts rejecting
  // any request that doesn't carry it — including a manual browser hit,
  // which is the point (this writes to the DB, so it shouldn't be
  // trivially triggerable by anyone who finds the URL).
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }

  const intro = await readChannelReferenceIntro(supabaseAdmin);
  const configured = parseGoogleSheetUrl(intro.sheetUrl);
  if (!configured) {
    // Nothing configured yet on the Booking Channels admin page — not an
    // error, just nothing to do today.
    return NextResponse.json({ skipped: true, reason: "No Channel Reference sheet configured." });
  }

  const result = await fetchSheetCsv(configured.spreadsheetId, configured.gid);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const count = computeSheetCount(result.data.rows);
  const fetchedAt = new Date().toISOString();
  const { error: writeErr } = await supabaseAdmin
    .from("global_settings")
    .upsert(
      { key: CHANNEL_REFERENCE_SHEET_SNAPSHOT_KEY, value: JSON.stringify({ count, fetchedAt, sheetUrl: intro.sheetUrl }), updated_at: fetchedAt },
      { onConflict: "key" }
    );
  if (writeErr) {
    return NextResponse.json({ error: `Fetched sheet ok but failed to save snapshot: ${writeErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count, fetchedAt });
}
