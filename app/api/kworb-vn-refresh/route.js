// Round 561 — "Refresh now" button on Milestone -> Spotify VN. Same job as the 12-hour cron; the caller must be a signed-in
// dev or an OPS-team member (the people who can see that tab).
import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../lib/supabaseAdmin";
import { runKworbVnRefresh } from "../../../lib/kworbVn";
import { isOpsTeam } from "../../../lib/teamTypes";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  const caller = await getCallerProfile(request);
  if (!caller || !(caller.role === "dev" || isOpsTeam(caller.segment))) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  let dry = false;
  try { dry = !!(await request.json())?.dry; } catch {}   // "Test parse" sends {dry:true}: read + classify only, nothing saved
  try {
    return NextResponse.json(await runKworbVnRefresh(supabaseAdmin, { dry }));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
