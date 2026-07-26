import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../../lib/supabaseAdmin";

// dev-only — undoes kick-user.
export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }

  const caller = await getCallerProfile(request);
  if (!caller || caller.role !== "dev") {
    return NextResponse.json({ error: "Not authorized — dev only." }, { status: 403 });
  }

  const { authId } = await request.json();
  if (!authId) {
    return NextResponse.json({ error: "authId is required." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(authId, { ban_duration: "none" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
