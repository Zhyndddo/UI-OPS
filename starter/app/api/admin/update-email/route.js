import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../../lib/supabaseAdmin";

// admin/dev-only. Config -> Team's Email cell used to be plain text with
// no way to fix it after the fact — a problem the moment someone gets
// added with a placeholder/dummy email (e.g. via scripts/bulk-create-team.js,
// where a real address isn't known yet at creation time). Changing
// profiles.email alone isn't enough: AuthContext looks up profiles BY
// email once someone logs in, and login itself authenticates against
// auth.users' email, not profiles.email — so the two have to be updated
// together or the person's real email would authenticate to no profile
// at all. If this profile has no auth_id yet (never invited/created an
// auth user), only the profiles row is updated — nothing to keep in sync
// with on the auth side yet.
export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }

  const caller = await getCallerProfile(request);
  if (!caller || (caller.role !== "admin" && caller.role !== "dev")) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { profileId, authId, newEmail } = await request.json();
  if (!profileId || !newEmail) {
    return NextResponse.json({ error: "profileId and newEmail are required." }, { status: 400 });
  }

  if (authId) {
    // email_confirm: true — this is an admin correcting a record, not the
    // person themselves verifying a new address, so there's no "click a
    // link to confirm" step (and doing that would just re-trigger the same
    // rate-limited email sending this whole flow exists to avoid).
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(authId, { email: newEmail, email_confirm: true });
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }
  }

  const { error: profileErr } = await supabaseAdmin.from("profiles").update({ email: newEmail }).eq("id", profileId);
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
