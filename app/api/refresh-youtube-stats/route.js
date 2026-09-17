import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../lib/supabaseAdmin";
import { refreshYoutubeChannels } from "../../../lib/refreshYoutubeStats";

// Round 56 — item 3: auto-fetch follower/subscriber counts into
// booking_channels.follower_count, via YouTube's OFFICIAL Data API v3
// only (per explicit request — "official platform APIs only"). Why just
// YouTube: it's the one platform here where a plain API key can look up
// ANY public channel's stats by URL/handle, no OAuth needed. TikTok,
// Instagram, and Facebook do NOT offer that for arbitrary channels through
// any official route — their public APIs only return numbers for accounts
// the API caller has connected via OAuth/Business verification (i.e. only
// works for VIEENT's own Direct channels, and only after a real Business
// API integration is set up — a much bigger lift than a key-based route
// like this one, and out of scope for this round). If Direct-only TikTok/
// IG/FB stats become worth that investment later, this route is the
// pattern to extend, not start over.
//
// Setup required before this works (see DATA_FIXES.md round 56 for the
// full walkthrough):
//   1. Get a YouTube Data API v3 key from Google Cloud Console (no OAuth,
//      just an API key — free tier is generous for this volume).
//   2. Add it as the YOUTUBE_API_KEY environment variable in the Vercel
//      project (Settings -> Environment Variables), then redeploy.
// Without that env var set, this route returns a clear 500 rather than
// silently doing nothing.
//
// Round 359 — the actual fetch/parse/write logic moved to
// lib/refreshYoutubeStats.js so the new daily cron
// (app/api/cron/refresh-youtube-stats/route.js) can call the exact same
// implementation this admin-triggered button always has, instead of a
// second copy. This route's own job now is just: authenticate the caller
// (still required here — this is the button an admin clicks, unlike the
// cron which authenticates via CRON_SECRET instead), read the optional
// channelIds filter, and hand off.

export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server not configured (missing YOUTUBE_API_KEY — see DATA_FIXES.md round 56)." }, { status: 500 });
  }

  const caller = await getCallerProfile(request);
  if (!caller) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  // Optional { channelIds: [...] } to refresh a specific subset (e.g. one
  // row's own "Refresh" button) — omitted/empty means "every YouTube row
  // that has a url".
  let channelIds = [];
  try {
    const body = await request.json();
    channelIds = Array.isArray(body?.channelIds) ? body.channelIds : [];
  } catch {
    // no body sent — refresh everything, that's fine
  }

  try {
    const results = await refreshYoutubeChannels(supabaseAdmin, apiKey, channelIds);
    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
