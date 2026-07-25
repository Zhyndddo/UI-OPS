import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../../lib/supabaseAdmin";

// dev-only — lists everyone with a real login, their last sign-in time
// (the closest approximation Supabase offers to "who's logged in" —
// there's no literal live-session list), and whether they're currently
// kicked.
export async function GET(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }

  const caller = await getCallerProfile(request);
  if (!caller || caller.role !== "dev") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { data: authList, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: profiles } = await supabaseAdmin.from("profiles").select("id, name, email, role, segment, auth_id");
  const profileByAuthId = {};
  (profiles || []).forEach((p) => { if (p.auth_id) profileByAuthId[p.auth_id] = p; });

  const sessions = authList.users
    .map((u) => ({
      authId: u.id,
      email: u.email,
      lastSignInAt: u.last_sign_in_at,
      bannedUntil: u.banned_until || null,
      isKicked: !!u.banned_until && new Date(u.banned_until) > new Date(),
      profile: profileByAuthId[u.id] || null,
    }))
    .sort((a, b) => new Date(b.lastSignInAt || 0) - new Date(a.lastSignInAt || 0));

  return NextResponse.json({ sessions });
}
