// Round 359 — "are we fetching the followers number on every channel?"
// Clarified answer: only YouTube ever could (official Data API v3, no
// OAuth needed for a public channel lookup — see lib/refreshYoutubeStats.js
// for why TikTok/Instagram/Facebook/Thread can't work this way), and even
// that was manual-only until now (the "↻ Refresh YouTube Stats" button on
// the Booking Channels admin page). Per explicit follow-up ("Yes, add it
// to the daily cron"), this route puts that same refresh on the daily
// 8:00 Asia/Ho_Chi_Minh schedule (vercel.json) alongside the Channel
// Reference sheet cron from the previous round — same CRON_SECRET
// convention, same fail-open-if-unset behavior, see that route's own
// comment for the reasoning.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { refreshYoutubeChannels } from "../../../../lib/refreshYoutubeStats";

export const maxDuration = 60;

export async function GET(request) {
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
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    // Same "not configured yet" shape as the button's own route — this
    // cron will start working automatically the day YOUTUBE_API_KEY gets
    // added in Vercel, no code change needed then.
    return NextResponse.json({ skipped: true, reason: "YOUTUBE_API_KEY not configured yet." });
  }

  try {
    const results = await refreshYoutubeChannels(supabaseAdmin, apiKey, []);
    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
