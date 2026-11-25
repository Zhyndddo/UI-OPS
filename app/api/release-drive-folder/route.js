// Round 693/694 — POST { releaseId } (signed-in staff) -> { ok, url, created } | { ok:false, error, code }
// Logic in lib/releaseDriveFolder.js (shared with Friday's Upload ask). Never overwrites an existing Link Drive; refuses a release without a release date.
import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../lib/supabaseAdmin";
import { createReleaseFolder } from "../../../lib/releaseDriveFolder";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured." }, { status: 500 });
  const caller = await getCallerProfile(request);
  if (!caller) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  let b = null; try { b = await request.json(); } catch { /* below */ }
  const releaseId = String(b?.releaseId || "");   // releases.id is a UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(releaseId)) return NextResponse.json({ ok: false, error: "releaseId missing." }, { status: 400 });
  const r = await createReleaseFolder(supabaseAdmin, releaseId);
  return NextResponse.json(r, { status: r.ok ? 200 : r.code === "drive" ? 502 : 400 });
}
