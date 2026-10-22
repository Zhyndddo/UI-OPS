// Round 517 — share-preview metadata (title / description / og + twitter card) for the Cost Marketing report magic link
// (/cost-report/[token]), same approach as app/pick-package/[token]/layout.js (Round 392/393): page.js is "use client", and
// Next.js forbids exporting metadata from a client component, so this server layout supplies <head> only; children pass
// straight through. The og:image comes from the sibling opengraph-image.js (file convention).
//
// Deliberately NO cost / net numbers in the preview text: a chat app renders the snippet before anyone opens the link.
// Only the snapshot's title and month label are used. Best-effort / fail-open like the pick-package layout: unknown token,
// RLS denial or a Supabase hiccup all fall back to generic copy instead of crashing the request (generateMetadata
// throwing is a hard 500).
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const SITE_URL = "https://internal.vieent.com";
const FALLBACK_TITLE = "Cost Report — VIEENT";
const FALLBACK_DESCRIPTION = "A VIEENT marketing cost report.";
const FALLBACK_METADATA = { title: FALLBACK_TITLE, description: FALLBACK_DESCRIPTION };

export async function generateMetadata({ params }) {
  if (!supabaseAdmin) return FALLBACK_METADATA;
  try {
    const { data: snap } = await supabaseAdmin.from("cost_mkt_snapshots").select("title, month_label").eq("token", params.token).maybeSingle();
    if (!snap) return FALLBACK_METADATA;
    const title = snap.title ? `${snap.title} — Cost report` : FALLBACK_TITLE;
    const description = snap.month_label ? `${snap.month_label} · VIEENT marketing cost report` : FALLBACK_DESCRIPTION;
    const url = `${SITE_URL}/cost-report/${params.token}`;
    return {
      title,
      description,
      openGraph: { title, description, url, siteName: "VIEENT Task Tracking", type: "website" },
      twitter: { card: "summary_large_image", title, description },
    };
  } catch {
    return FALLBACK_METADATA;
  }
}

export default function CostReportTokenLayout({ children }) {
  return children;
}
