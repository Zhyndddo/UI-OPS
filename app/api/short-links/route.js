// Round 360 — the minter's server side. Admin-only (same getCallerProfile
// gate as app/api/refresh-youtube-stats/route.js) — minting/listing/
// revoking short links needs to go through a signed-in user, unlike the
// public redirect itself (app/[slug]/route.js), which has to work for
// anyone with the link, logged in or not.
import { NextResponse } from "next/server";
import { supabaseAdmin, getCallerProfile } from "../../../lib/supabaseAdmin";
import { normalizeSlug, validateSlugFormat } from "../../../lib/shortLinks";

export async function GET(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }
  const caller = await getCallerProfile(request);
  if (!caller) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const { data, error } = await supabaseAdmin.from("short_links").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ links: data || [] });
}

export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }
  const caller = await getCallerProfile(request);
  if (!caller) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const slug = normalizeSlug(body?.slug);
  const destinationUrl = (body?.destinationUrl || "").trim();
  const label = (body?.label || "").trim();

  const formatError = validateSlugFormat(slug);
  if (formatError) return NextResponse.json({ error: formatError }, { status: 400 });

  if (!destinationUrl) return NextResponse.json({ error: "Destination URL can't be blank." }, { status: 400 });
  try {
    // eslint-disable-next-line no-new
    new URL(destinationUrl);
  } catch {
    return NextResponse.json({ error: "Destination isn't a valid URL (include https://)." }, { status: 400 });
  }

  // Round 360 — "make sure no url is the same... no where else can the
  // app generate same /vsounder any more": the app-level pre-check that
  // gives a clear, specific error message; the table's own `unique`
  // constraint on slug (sql/pending/add-round360-short-links.sql) is the
  // real guarantee underneath it, in case two mint requests ever race.
  const { data: existing } = await supabaseAdmin.from("short_links").select("id, revoked_at").eq("slug", slug).maybeSingle();
  if (existing && !existing.revoked_at) {
    return NextResponse.json({ error: `"${slug}" is already in use — pick a different slug, or revoke the existing one first.` }, { status: 409 });
  }

  const { data: created, error: insertErr } = await supabaseAdmin
    .from("short_links")
    .insert({
      slug,
      destination_url: destinationUrl,
      label: label || null,
      created_by: caller.email || caller.id || null,
    })
    .select()
    .single();

  if (insertErr) {
    // A unique-constraint violation lands here if two mint requests for
    // the same slug raced past the pre-check above at the exact same
    // moment — rare, but the DB constraint is what actually prevents it,
    // this just turns that into a readable message instead of a raw
    // Postgres error.
    if (insertErr.code === "23505") {
      return NextResponse.json({ error: `"${slug}" is already in use — pick a different slug.` }, { status: 409 });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ link: created });
}

export async function PATCH(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)." }, { status: 500 });
  }
  const caller = await getCallerProfile(request);
  if (!caller) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const id = body?.id;
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  // Round 360 — revoke, not delete: same "keep every one ever minted"
  // convention channel_reference_share_links uses — a revoked slug still
  // shows up in the list (so "why doesn't /vsounder work anymore" has an
  // answer) but its own unique row means the slug can be re-minted later
  // if someone wants to reuse it (the POST handler above only blocks on
  // an existing NON-revoked row with that slug).
  const { data: updated, error } = await supabaseAdmin
    .from("short_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ link: updated });
}
