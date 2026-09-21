// Round 392 — "what about SEO, can you make SEO out of the magic link?"
// / "set up SEO for me please" — same "share preview on FB/Zalo/social"
// idea as app/channels/[token]/layout.js (Round 356/358), applied to
// THIS app's other, more-discussed magic link:
// /pick-package/[token] — the release package-picker link this whole
// conversation (and many rounds before it) has been calling "the magic
// link" or "the booking magic link".
//
// Same reason this has to be a sibling layout.js rather than metadata
// exported from page.js: that page.js is "use client" (it's a live,
// interactive package picker), and Next.js App Router forbids exporting
// metadata/generateMetadata from a client component. This file is a
// plain server component whose only job is supplying <head> metadata;
// `children` passes straight through untouched, nothing about the page
// itself changes.
//
// Unlike the channel-reference link (same generic content for every
// token), each pick-package token is release-specific — so the preview
// title mirrors exactly what page.js already sets as document.title
// once loaded ("Package Offer — <release title>", or "Media Report —
// <release title>" once release.media_report_status flips, see that
// file's useEffect) rather than a generic app name, and the description
// names the artist so a share preview is actually useful at a glance
// instead of just branding. Best-effort / fail-open, same convention
// readChannelReferenceIntro uses: an unknown token, a revoked/missing
// release, or a Supabase hiccup at request time all fall back to plain
// generic copy rather than a broken share preview or a failed request —
// this route is public and hit by link-preview scrapers with no
// Supabase session, same as everywhere else in this app.
//
// Deliberately does NOT put package pricing/line-item numbers in the
// preview text — those are the actual sensitive content of the offer,
// and a share-preview snippet renders before whoever's chat app even
// opens the link, unlike the page itself which is only reachable via
// the token.
//
// Round 393 — BUG FIX: this shipped claiming "best-effort / fail-open,
// same convention readChannelReferenceIntro uses" in the comment above,
// but the code underneath never actually did that — no `if (!supabase)`
// guard, no try/catch around either query, unlike
// lib/channelReferenceIntro.js's readChannelReferenceIntro, which has
// both. generateMetadata throwing is a hard 500 (Next.js has no
// error.js boundary for a layout's own metadata generation — it fails
// the whole request), and because /<slug> short links that point in-app
// REWRITE rather than redirect (see app/[slug]/route.js), the crash
// surfaced under the SHORT link's URL, not visibly under
// /pick-package/<token> — reported as "internal.vieent.com ... HTTP
// ERROR 500" on an /<slug> link that pointed at a package offer.
// Wrapped the whole lookup in try/catch and added the same
// `if (!supabase) return fallback` guard every other public magic-link
// page in this app already has, so an unknown token, a revoked/missing
// release, an RLS denial, or any other Supabase hiccup all fall back to
// the generic title/description instead of crashing the page.
import { supabase } from "../../../lib/supabaseClient";

const SITE_URL = "https://internal.vieent.com";
const FALLBACK_TITLE = "Package Offer — VIEENT";
const FALLBACK_DESCRIPTION = "A VIEENT distribution support package offer.";
const FALLBACK_METADATA = { title: FALLBACK_TITLE, description: FALLBACK_DESCRIPTION };

export async function generateMetadata({ params }) {
  if (!supabase) return FALLBACK_METADATA;

  try {
    const { data: link } = await supabase.from("magic_links").select("release_id").eq("token", params.token).maybeSingle();
    if (!link) return FALLBACK_METADATA;

    const { data: release } = await supabase
      .from("releases")
      .select("title, main_artist, media_report_status")
      .eq("id", link.release_id)
      .maybeSingle();
    if (!release) return FALLBACK_METADATA;

    const kind = release.media_report_status ? "Media Report" : "Package Offer";
    const title = `${kind} — ${release.title}`;
    const description = release.main_artist ? `${release.main_artist} · VIEENT distribution support` : FALLBACK_DESCRIPTION;
    const url = `${SITE_URL}/pick-package/${params.token}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url,
        siteName: "VIEENT Task Tracking",
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    };
  } catch {
    return FALLBACK_METADATA;
  }
}

export default function PickPackageTokenLayout({ children }) {
  return children;
}
