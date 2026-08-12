import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../../lib/supabaseAdmin";

// Called when a Team Lead+ adds someone in Config -> Team. Sends a real
// Supabase invite email with a link to /set-password — the person sets
// their own password, it's never seen or chosen by the admin.
//
// Round 57 — extended from admin/dev to teamlead+, but a "teamlead" caller
// is only allowed to invite someone into their OWN segment — this is the
// real server-side guard behind the client's segment-locking UI (Config's
// TeamSection hides/fixes the Team picker for a teamlead, but this check
// is what actually prevents someone from bypassing that by calling the
// route directly).
export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }

  const caller = await getCallerProfile(request);
  if (!caller || !["teamlead", "admin", "dev"].includes(caller.role)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { email, profileId } = await request.json();
  if (!email || !profileId) {
    return NextResponse.json({ error: "email and profileId are required." }, { status: 400 });
  }

  if (caller.role === "teamlead") {
    const { data: target } = await supabaseAdmin.from("profiles").select("segment, role").eq("id", profileId).maybeSingle();
    if (!target || target.segment !== caller.segment || target.role !== "exc") {
      return NextResponse.json({ error: "Team Leads can only invite Members into their own team." }, { status: 403 });
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/set-password`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await supabaseAdmin.from("profiles").update({ auth_id: data.user.id }).eq("id", profileId);

  return NextResponse.json({ ok: true });
}
