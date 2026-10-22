import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { loadPickPackage, confirmPick, submitPickFeedback } from "../../../lib/pickPackageServer";

// Round 540 — token-scoped read layer for the public magic-link pages
// (cost-report, performance-report, channels). These pages used to query
// Supabase straight from the browser with the public anon key, which meant
// the anon role needed SELECT on the whole share-link / snapshot /
// booking_channels tables (anyone with the public key could list every
// token). Now the browser only ever sends ONE token and this route (service
// role, server-side) returns just the row that token matches — so anon can
// be revoked from those tables.
//
// GET /api/magic?kind=cost|perf|channels&token=<token>
// Always 404 with a generic body for a bad/unknown token (no hint which part
// was wrong). Responses are never cached.

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });

export async function GET(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "server_not_configured" }, { status: 500, headers: noStore });
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") || "";
  const token = (searchParams.get("token") || "").trim();
  if (!token || token.length > 200 || !/^[A-Za-z0-9_-]+$/.test(token)) return notFound();

  try {
    if (kind === "cost") {
      const { data, error } = await supabaseAdmin.from("cost_mkt_snapshots").select("*").eq("token", token).maybeSingle();
      if (error || !data) return notFound();
      return NextResponse.json({ row: data }, { headers: noStore });
    }

    if (kind === "perf") {
      const { data, error } = await supabaseAdmin.from("performance_share_links").select("*").eq("token", token).maybeSingle();
      if (error || !data) return notFound();
      return NextResponse.json({ row: data }, { headers: noStore });
    }

    if (kind === "pick") {
      const bundle = await loadPickPackage(token);
      if (!bundle || !bundle.release) return notFound();
      return NextResponse.json(bundle, { headers: noStore });
    }

    if (kind === "channels") {
      const { data: link, error: linkErr } = await supabaseAdmin
        .from("channel_reference_share_links")
        .select("id, revoked_at")
        .eq("token", token)
        .maybeSingle();
      if (linkErr || !link) return notFound();
      if (link.revoked_at) return NextResponse.json({ revoked: true }, { headers: noStore });
      // Best-effort view stamp — never blocks the response.
      await supabaseAdmin
        .from("channel_reference_share_links")
        .update({ last_viewed_at: new Date().toISOString() })
        .eq("id", link.id)
        .then(() => {}, () => {});
      const { data: rows } = await supabaseAdmin
        .from("booking_channels")
        .select("id, name, platform, channel_group, url, follower_count, note")
        .not("channel_group", "is", null)
        .order("follower_count", { ascending: false, nullsFirst: false });
      return NextResponse.json({ rows: rows || [] }, { headers: noStore });
    }
  } catch (e) {
    return NextResponse.json({ error: "failed" }, { status: 500, headers: noStore });
  }
  return notFound();
}

// Round 541 — the two things an artist can DO on the pick-package page.
// POST /api/magic  { kind: "pick-confirm", token, value }
//                  { kind: "pick-feedback", token, text }
export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ error: "server_not_configured" }, { status: 500, headers: noStore });
  let body;
  try { body = await request.json(); } catch { return notFound(); }
  const token = String(body?.token || "").trim();
  if (!token || token.length > 200 || !/^[A-Za-z0-9_-]+$/.test(token)) return notFound();
  try {
    let res;
    if (body.kind === "pick-confirm") {
      const value = String(body.value || "");
      if (!value || value.length > 200) return notFound();
      res = await confirmPick(token, value);
    } else if (body.kind === "pick-feedback") {
      res = await submitPickFeedback(token, body.text);
    } else {
      return notFound();
    }
    if (res?.status) return NextResponse.json({ error: res.error }, { status: res.status, headers: noStore });
    return NextResponse.json(res, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: "failed" }, { status: 500, headers: noStore });
  }
}
