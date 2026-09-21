// Round 360 — the actual "auto re-direct" half of the custom URL minter
// ("Internal.vieent.com/vsounder"). Lives at the app's root level as a
// single dynamic segment, which is deliberate: Next.js always resolves a
// real static route (app/booking-channels, app/channels/[token], etc.)
// before it ever falls through to a sibling [slug] catch-all at the same
// level — see lib/shortLinks.js's RESERVED_SLUGS comment — so this can
// live at "/" without any risk of hijacking an existing page's URL, and
// the app's own routes never need to know this file exists.
//
// Deliberately public / no login check — same as any other redirect
// link this app hands out (channel_reference_share_links,
// pick-package/[token], etc.). Only MINTING a slug (app/api/short-links/
// route.js, app/short-links/page.js) requires a signed-in user; using
// one that's already minted has to work for anyone who got the link.
//
// Round 361 — "will the address bar show /vsounder or the real URL?":
// for a destination that's a page THIS app already serves (see
// lib/shortLinks.js's INTERNAL_HOSTNAMES/canRewriteToDestination), this
// now REWRITES instead of redirecting — the browser keeps showing
// /vsounder in the address bar the whole time, because it's not being
// bounced anywhere; Next.js is just rendering that other internal page
// under this URL. A destination outside this app still gets a normal
// redirect — proxying someone else's site through our own domain has
// real downsides (broken relative links/assets, broken back button,
// most sites block being framed/proxied anyway) that aren't worth it
// for a link we don't control the content of.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { normalizeSlug, canRewriteToDestination } from "../../lib/shortLinks";

// Round 391 — "i try to make new short link but the short link didn't
// work, returns nothing": the link WAS created fine (showed up in the
// admin list), but visiting it kept returning this route's own
// "Not found." — because this is a plain server-side GET Route Handler
// with no cookie/header read and no cache opt-out, which is exactly the
// shape Next.js's App Router will cache (its Data Cache wraps the global
// fetch this file's supabaseAdmin call goes through, and Vercel can
// cache the route's own response on top of that) — so the very first hit
// to a given slug (even a 404 for one that doesn't exist yet, or one hit
// right after a fresh deploy) can get cached and then keep being served
// forever, never re-checking the database. Every OTHER "magic link"-
// style page in this app is either a client component (fetches happen
// in the visitor's own browser, no server cache involved) or a route
// that reads cookies/headers (getCallerProfile — that alone already
// forces Next to treat it as dynamic) — this was the one exception.
// `dynamic = "force-dynamic"` makes every request re-run this handler
// and re-query Supabase, no caching at any layer; correct here anyway
// since the destination can be revoked/changed at any time and
// click_count/last_used_at need to update on every real visit.
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const slug = normalizeSlug(params.slug);

  if (!supabaseAdmin) {
    // Server not configured — fail closed to a plain 404 rather than a
    // 500 that looks like a broken link when it's really a missing env
    // var; same "the exact detail is in the server logs, the visitor
    // just sees a dead link" tradeoff every other public link route in
    // this app makes.
    return new NextResponse("Not found.", { status: 404 });
  }

  const { data: link } = await supabaseAdmin
    .from("short_links")
    .select("id, destination_url, revoked_at, click_count")
    .eq("slug", slug)
    .maybeSingle();

  if (!link || link.revoked_at) {
    return new NextResponse("Not found.", { status: 404 });
  }

  // Best-effort click tracking — never blocks or fails the redirect
  // itself if this write has trouble.
  supabaseAdmin
    .from("short_links")
    .update({ click_count: (link.click_count || 0) + 1, last_used_at: new Date().toISOString() })
    .eq("id", link.id)
    .then(() => {});

  if (canRewriteToDestination(link.destination_url)) {
    // Round 361 — rewrite: same-app destination, so the visitor's
    // address bar stays on /<slug> the whole time. Built off THIS
    // request's own origin (request.url), not the stored destination's
    // hostname, so a visitor on internal.vieent.com/vsounder stays on
    // internal.vieent.com and one on ui-ops.vercel.app/vsounder (if that
    // URL is ever used directly) stays there too — only the
    // path+query from the stored destination gets applied.
    const dest = new URL(link.destination_url);
    const rewritten = new URL(request.url);
    rewritten.pathname = dest.pathname;
    rewritten.search = dest.search;
    return NextResponse.rewrite(rewritten);
  }

  return NextResponse.redirect(link.destination_url, { status: 302 });
}
