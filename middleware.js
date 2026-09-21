// Round 395 — "is this it? i haven't do 394. I want to fix it without
// reverting". Production Vercel function logs for /atbk (grabbed by the
// user straight from the Vercel dashboard) named the real error, not a
// theory:
//
//   Error: NextResponse.rewrite() was used in a app route handler,
//   this is not currently supported. Please remove the invocation to
//   continue.
//
// That's unconditional — NextResponse.rewrite() simply isn't supported
// from an App Router Route Handler (app/[slug]/route.js, where this
// used to live) at all, for ANY destination, on this Next.js version.
// Round 394's "just redirect pick-package instead of rewriting it" was
// a real, working fix, but only a workaround for the symptom — it kept
// the underlying broken call in place for every OTHER internal
// destination (/channels/..., or the app's own future routes), which
// would have 500'd the exact same way the moment anyone tried it.
// Reverted here per explicit request ("I want to fix it without
// reverting" — meaning: fix it for real, not fall back to giving up the
// masked-URL feature for this one destination).
//
// The actual fix: NextResponse.rewrite() IS supported — from
// Middleware, which is Next.js's documented mechanism for exactly this
// "decide per-request whether to rewrite based on some lookup" use
// case. This file replaces app/[slug]/route.js's GET handler entirely;
// that file is now just a static fallback 404 (see its own comment) for
// the rare case something reaches it without going through here first.
//
// Runtime note: middleware always runs on Vercel's Edge runtime (no
// Node runtime option on this Next.js version) — supabase-js is
// fetch-based and edge-compatible, same client used everywhere else in
// this app, so no special handling needed for that.
//
// Matcher: Next.js's own documented pattern for "run on everything
// except Next's internal static/image assets and favicon.ico" — api/*
// added to the exclusion too, since those are real routes with their
// own auth, never short-link slugs. Still matches every real page route
// in the app (/booking, /releases/123, ...) and other top-level static
// files (robots.txt, sitemap.xml — both already in RESERVED_SLUGS
// below, same as they were when app/[slug]/route.js's catch-all handled
// this) — the early segment-count / RESERVED_SLUGS check below exits
// before touching the database for all of those, so the added cost per
// normal page request is just a cheap string split, not a Supabase
// round trip.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

import { NextResponse } from "next/server";
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { RESERVED_SLUGS, normalizeSlug, canRewriteToDestination } from "./lib/shortLinks";

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  const segments = pathname.split("/").filter(Boolean);

  // A short-link slug is always exactly one path segment
  // (lib/shortLinks.js's SLUG_FORMAT has no "/" in its allowed
  // characters) — anything else (the homepage, /releases/123,
  // /pick-package/<token>, ...) is definitely a real app route, not a
  // slug, so let it fall straight through without a database lookup.
  if (segments.length !== 1) return NextResponse.next();

  const slug = normalizeSlug(segments[0]);

  // Every one of this app's own top-level routes — a real route always
  // wins over a same-named slug (enforced at mint time too, see
  // lib/shortLinks.js's validateSlugFormat), so skip the lookup and let
  // Next.js's normal routing handle it.
  if (RESERVED_SLUGS.has(slug)) return NextResponse.next();

  if (!supabaseAdmin) return NextResponse.next();

  const { data: link } = await supabaseAdmin
    .from("short_links")
    .select("id, destination_url, revoked_at, click_count")
    .eq("slug", slug)
    .maybeSingle();

  // No matching (or revoked) slug — fall through to Next.js's normal
  // routing, which resolves to app/[slug]/route.js's plain 404 (nothing
  // else can match a single unknown segment at this level).
  if (!link || link.revoked_at) return NextResponse.next();

  // Best-effort click tracking — never blocks or fails the
  // redirect/rewrite itself if this write has trouble.
  supabaseAdmin
    .from("short_links")
    .update({ click_count: (link.click_count || 0) + 1, last_used_at: new Date().toISOString() })
    .eq("id", link.id)
    .then(() => {});

  if (canRewriteToDestination(link.destination_url)) {
    // Same-app destination: the visitor's address bar stays on /<slug>
    // the whole time, because it's not being bounced anywhere — Next.js
    // is just rendering that other internal page under this URL. Built
    // off THIS request's own origin (request.url), not the stored
    // destination's hostname, so a visitor on internal.vieent.com/
    // vsounder stays on internal.vieent.com and one on ui-ops.vercel.app
    // /vsounder (if that URL is ever used directly) stays there too —
    // only the path+query from the stored destination gets applied.
    const dest = new URL(link.destination_url);
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = dest.pathname;
    rewritten.search = dest.search;
    return NextResponse.rewrite(rewritten);
  }

  // A destination outside this app still gets a normal redirect —
  // proxying someone else's site through our own domain has real
  // downsides (broken relative links/assets, broken back button, most
  // sites block being framed/proxied anyway) that aren't worth it for a
  // link we don't control the content of.
  return NextResponse.redirect(link.destination_url, { status: 302 });
}
