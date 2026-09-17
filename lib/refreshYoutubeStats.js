// Round 359 — pulled the actual subscriber-count-refresh logic out of
// app/api/refresh-youtube-stats/route.js (Round 56's admin-triggered
// "↻ Refresh YouTube Stats" button) so the new daily cron
// (app/api/cron/refresh-youtube-stats/route.js) can call the exact same
// implementation instead of a second copy. Behavior/comments below are
// unchanged from Round 56 — see that route's own history for why only
// YouTube gets this treatment (TikTok/Instagram/Facebook don't offer a
// plain API-key lookup for an arbitrary channel the way YouTube's Data
// API v3 does).
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3/channels";

// Best-effort channel-identifier resolution from whatever URL shape is on
// file — booking_channels.url is free-typed from the reference sheet, so
// this has to handle the 3 real shapes YouTube URLs come in.
export function parseYoutubeUrl(url) {
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

// Refreshes follower_count for every YouTube row in booking_channels (or
// just `channelIds` if given), writing stats_synced_at alongside each
// successful update. Returns { updated, skipped, errors } — same shape
// the admin route has always returned to the "↻ Refresh YouTube Stats"
// button's result panel.
export async function refreshYoutubeChannels(supabaseAdmin, apiKey, channelIds = []) {
  let query = supabaseAdmin.from("booking_channels").select("id, name, url").eq("platform", "YouTube").not("url", "is", null);
  if (channelIds.length > 0) query = query.in("id", channelIds);
  const { data: channels, error: fetchErr } = await query;
  if (fetchErr) throw new Error(fetchErr.message);

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
  return results;
}
