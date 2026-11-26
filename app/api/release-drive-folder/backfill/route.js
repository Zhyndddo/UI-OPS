// Round 712 — backfill the Drive folder set for releases that have an EMPTY Link Drive (only upcoming + the last 60 days, real dates, not cancelled).
//   GET            -> { total, items:[first 60], from }           (dry run — nothing is created)
//   POST { limit } -> creates up to `limit` (max 10, oldest date first, stops after ~45 s) -> { done, results:[{id,did,title,ok,url|error}], remaining }
// Same logic as one release's "Create Drive folder" (lib/releaseDriveFolder.js): never overwrites a Link Drive that someone filled meanwhile.
import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../../lib/supabaseAdmin";
import { createReleaseFolder } from "../../../../lib/releaseDriveFolder";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const DUMMY = "2026-12-31";   // the team's "no date yet" placeholder
const DAYS_BACK = 60;
const bad = (error, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

async function allowed(request) {
  const p = await getCallerProfile(request);
  return p && (p.role === "dev" || p.role === "admin" || p.role === "superadmin" || p.segment === "AR") ? p : null;
}
const fromDate = () => new Date(Date.now() + 7 * 3600000 - DAYS_BACK * 86400000).toISOString().slice(0, 10);
function pending(db, limit) {
  return db.from("releases").select("id, did, title, main_artist, release_date", { count: "exact" })
    .or("drive_link.is.null,drive_link.eq.").is("cancelled_at", null).gte("release_date", fromDate()).neq("release_date", DUMMY)
    .order("release_date", { ascending: true }).limit(limit);
}

export async function GET(request) {
  if (!supabaseAdmin) return bad("Server not configured.", 500);
  if (!(await allowed(request))) return bad("Not authorized.", 403);
  const { data, count, error } = await pending(supabaseAdmin, 60);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ total: count ?? (data || []).length, items: data || [], from: fromDate() }, { headers: noStore });
}

export async function POST(request) {
  if (!supabaseAdmin) return bad("Server not configured.", 500);
  if (!(await allowed(request))) return bad("Not authorized.", 403);
  let b = null; try { b = await request.json(); } catch { /* below */ }
  const limit = Math.max(1, Math.min(10, parseInt(b?.limit, 10) || 10));
  const { data, error } = await pending(supabaseAdmin, limit);
  if (error) return bad(error.message, 500);
  const t0 = Date.now(), results = [];
  for (const r of data || []) {
    if (Date.now() - t0 > 45000) break;   // keep inside the function time limit; the rest stays for the next click
    const f = await createReleaseFolder(supabaseAdmin, r.id).catch((e) => ({ ok: false, error: e.message }));
    results.push({ id: r.id, did: r.did, title: r.title, ok: !!f.ok, url: f.url || null, error: f.ok ? null : f.error || "failed" });
  }
  const left = await pending(supabaseAdmin, 1);
  return NextResponse.json({ done: results.filter((x) => x.ok).length, results, remaining: left.count ?? 0 }, { headers: noStore });
}
