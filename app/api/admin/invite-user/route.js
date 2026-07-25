import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../../lib/supabaseAdmin";

// Called when an admin/dev adds someone in Config -> Team. Sends a real
// Supabase invite email with a link to /set-password — the person sets
// their own password, it's never seen or chosen by the admin.
export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }

  const caller = await getCallerProfile(request);
  if (!caller || (caller.role !== "admin" && caller.role !== "dev")) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { email, profileId } = await request.json();
  if (!email || !profileId) {
    return NextResponse.json({ error: "email and profileId are required." }, { status: 400 });
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
