// Round 360/361 — the original "auto re-direct" for the custom URL
// minter ("Internal.vieent.com/vsounder") lived here as a Route
// Handler's GET.
//
// Round 395 — moved to root middleware.js. Production logs confirmed
// NextResponse.rewrite() is unconditionally unsupported from a Route
// Handler on this Next.js version ("NextResponse.rewrite() was used in
// a app route handler, this is not currently supported") — every
// masked-rewrite short link (pointing at any internal page) 500'd
// because of it, not just the one that got reported. Middleware is
// Next.js's actual supported mechanism for a per-request rewrite
// decision, so all of the lookup/rewrite/redirect/click-tracking logic
// moved there — see middleware.js's header comment for the full story.
//
// This file still exists as a static fallback: if a request somehow
// reaches this far (middleware's own matcher should already route
// unknown slugs to NextResponse.next(), which resolves to exactly this
// file for a single unmatched segment), it's not a slug middleware
// recognized as valid, so a plain 404 is correct. No database lookup
// here anymore — middleware already did that lookup and would have
// rewritten or redirected before the request ever got this far if the
// slug were real.
import { NextResponse } from "next/server";

export async function GET() {
  return new NextResponse("Not found.", { status: 404 });
}
