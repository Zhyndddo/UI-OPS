// Round 561 — runs every 12 hours (vercel.json): pulls kworb's Vietnam Spotify totals + daily chart and YouTube trending and stores the tracks that are
// ours or suspicious. See lib/kworbVn.js. Same CRON_SECRET convention as the other cron routes.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { runKworbVnRefresh } from "../../../../lib/kworbVn";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  try {
    return NextResponse.json(await runKworbVnRefresh(supabaseAdmin));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
