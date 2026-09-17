// Round 356 — SEO / Open Graph for the channel-reference magic link, per
// explicit request ("setup SEO - để share lên fb, social on this url...
// https://ui-ops.vercel.app/channels/<token>#sheet-preview"). page.js in
// this same route segment is a "use client" component, and Next.js App
// Router forbids exporting metadata (or generateMetadata) from a client
// component — the fix is this sibling layout.js, a plain server
// component, whose only job is to supply the <head> metadata Next merges
// around whatever page.js renders. `children` passes straight through
// untouched; nothing here changes how the page itself looks or behaves.
//
// Metadata content: the same global_settings-backed intro block the page
// itself displays (lib/channelReferenceIntro.js — title/text set from the
// Booking Channels admin page, shared by every viewer of every token, not
// per-link) is read again here, server-side, so a share-preview headline
// matches what's actually on the page instead of a hardcoded string. Best
// effort / fail-open, same convention readChannelReferenceIntro already
// uses internally: a missing/unreachable row (or missing Supabase env
// vars at build time) still yields sane fallback copy rather than a
// broken preview or a build failure.
//
// The actual preview IMAGE is a separate file in this same folder —
// opengraph-image.js — which Next.js's file-convention system picks up
// automatically and wires into both <meta property="og:image"> and the
// Twitter card without anything needed here.
//
// A URL fragment (the "#sheet-preview" part of the URL the user pasted)
// never reaches the server — browsers strip it before the request goes
// out — so it can't select different metadata; every /channels/<token>
// URL (any fragment or none) gets the same share preview. That's the
// correct behavior here since this page has no distinct per-section
// content to preview differently.
//
// Round 358 — "https://internal.vieent.com/channels/... is the new SEO
// URL": SITE_URL switched from the vercel.app domain to the custom
// internal.vieent.com domain per explicit correction. If that domain's
// DNS/Vercel claim (see the earlier conversation about the "Claim Domain
// Ownership" TXT record) isn't fully live yet, this just means the
// og:url meta tag points at a domain that isn't resolving yet — worth
// flipping back to the vercel.app URL (or updating this constant again)
// once that's confirmed live, since a scraper hitting a dead og:url can
// fail the whole preview even if the page itself is still reachable at
// the old domain.
import { supabase } from "../../../lib/supabaseClient";
import { readChannelReferenceIntro } from "../../../lib/channelReferenceIntro";

const SITE_URL = "https://internal.vieent.com";
const FALLBACK_TITLE = "Channel Reference — VIEENT";
const FALLBACK_DESCRIPTION =
  "VIEENT channel reference list — platforms, follower counts, and Distribution Support booking info.";

function truncate(text, max) {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export async function generateMetadata({ params }) {
  const intro = await readChannelReferenceIntro(supabase);
  const title = intro.title ? `${intro.title} — VIEENT` : FALLBACK_TITLE;
  const description = truncate(intro.text, 200) || FALLBACK_DESCRIPTION;
  const url = `${SITE_URL}/channels/${params.token}`;

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
}

export default function ChannelTokenLayout({ children }) {
  return children;
}
