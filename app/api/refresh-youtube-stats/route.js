import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../lib/supabaseAdmin";

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

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3/channels";

// Best-effort channel-identifier resolution from whatever URL shape is on
// file — booking_channels.url is free-typed from the reference sheet, so
// this has to handle the 3 real shapes YouTube URLs come in.
function parseYoutubeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const path = u.pathname.replace(/\/+$/, "");
    const channelMatch = path.match(/\/channel\/([\w-]+)/);
    if (channelMatch) return { kind: "id", value: channelMatch[1] };
    const handleMatch = path.match(/\/(@[\w.-]+)/);
    if (handleMatch) return { kind: "handle", value: handleMatch[1] };
    const userMatch = path.match(/\/user\/([\w-]+)/);
    if (userMatch) return { kind: "username", value: userMatch[1] };
    // "/c/CustomName" (legacy custom URLs) has no official lookup-by-name
    // endpoint in the Data API's cheap `channels` call — treat as
    // unresolvable rather than burning a much pricier `search` quota unit
    // per row on every refresh.
    return null;
  } catch {
    return null;
  }
}

async function fetchSubscriberCount(apiKey, ref) {
  const params = new URLSearchParams({ part: "statistics", key: apiKey });
  if (ref.kind === "id") params.set("id", ref.value);
  else if (ref.kind === "handle") params.set("forHandle", ref.value);
  else if (ref.kind === "username") params.set("forUsername", ref.value);
  const res = await fetch(`${YOUTUBE_API_BASE}?${params.toString()}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || `YouTube API error (${res.status})`);
  const item = body.items?.[0];
  if (!item) throw new Error("Channel not found");
  if (item.statistics?.hiddenSubscriberCount) throw new Error("Subscriber count is hidden on this channel");
  return Number(item.statistics?.subscriberCount ?? null);
}

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

  let query = supabaseAdmin.from("booking_channels").select("id, name, url").eq("platform", "YouTube").not("url", "is", null);
  if (channelIds.length > 0) query = query.in("id", channelIds);
  const { data: channels, error: fetchErr } = await query;
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const results = { updated: [], skipped: [], errors: [] };
  for (const channel of channels || []) {
    const ref = parseYoutubeUrl(channel.url);
    if (!ref) {
      results.skipped.push({ id: channel.id, name: channel.name, reason: "Couldn't resolve a channel ID/handle/username from this URL — /c/ custom URLs aren't supported, use the /channel/UC... or /@handle link instead." });
      continue;
    }
    try {
      const subscriberCount = await fetchSubscriberCount(apiKey, ref);
      await supabaseAdmin.from("booking_channels").update({ follower_count: subscriberCount, stats_synced_at: new Date().toISOString() }).eq("id", channel.id);
      results.updated.push({ id: channel.id, name: channel.name, follower_count: subscriberCount });
    } catch (err) {
      results.errors.push({ id: channel.id, name: channel.name, reason: err.message });
    }
  }

  return NextResponse.json(results);
}
