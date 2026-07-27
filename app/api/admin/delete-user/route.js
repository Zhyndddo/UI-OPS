import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../../lib/supabaseAdmin";

// admin/dev only. Removes the person entirely — both their real login
// (auth.users, via the admin API, which the browser can never do on its
// own) and their profiles row. profiles.auth_id has ON DELETE SET NULL,
// so deleting just the auth user would leave an orphaned, roster-less
// profiles row behind — this deletes both explicitly so "delete" really
// means delete, not "half gone."
export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }

  const caller = await getCallerProfile(request);
  if (!caller || (caller.role !== "admin" && caller.role !== "dev")) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { profileId } = await request.json();
  if (!profileId) {
    return NextResponse.json({ error: "profileId is required." }, { status: 400 });
  }

  const { data: target } = await supabaseAdmin.from("profiles").select("auth_id").eq("id", profileId).maybeSingle();

  if (target?.auth_id) {
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(target.auth_id);
    // Not fatal — the auth user might already be gone (e.g. never
    // accepted an invite yet), still proceed to remove the profile row.
    if (authErr) {
      console.error("Failed to delete auth user (continuing to delete profile row):", authErr);
    }
  }

  const { error: profileErr } = await supabaseAdmin.from("profiles").delete().eq("id", profileId);
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
