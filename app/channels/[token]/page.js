// Round 564 — server component. The public channel-reference page used to be one big client component that showed
// "Loading…" and then fetched everything, so Google (and slow phones) saw an empty shell. Now the server reads the public
// data (channels, intro text, theme, the daily count) and renders it into the HTML; ChannelReferenceClient.js (the old
// page.js, unchanged in look) takes over in the browser.
//
// NOT in this HTML on purpose: the rate-sheet links and the rate tables (prices). They load only after a visitor presses
// "View rates" — see lib/channelReferencePublic.js.
//
// Cached for 5 minutes (revalidate). A revoked token can therefore still show for up to 5 minutes; the client refresh
// (api/magic) answers "no longer active" immediately after load.
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { readChannelReferenceIntro } from "../../../lib/channelReferenceIntro";
import { readMagicLinkThemeLock } from "../../../lib/magicLinkThemeLock";
import { readChannelReferenceSheetSnapshot } from "../../../lib/channelReferenceSheetSnapshot";
import { publicChannelRows, publicIntro, SITE_URL, SEO_INDEXED_TOKENS } from "../../../lib/channelReferencePublic";
import ChannelReferenceClient from "./ChannelReferenceClient";

export const revalidate = 300;

async function loadInitial(token) {
  if (!supabaseAdmin || !token) return null;
  try {
    const { data: link } = await supabaseAdmin.from("channel_reference_share_links").select("id, revoked_at").eq("token", token).maybeSingle();
    if (!link || link.revoked_at) return null;
    const [{ data: rows }, intro, themeLock, snap] = await Promise.all([
      supabaseAdmin.from("booking_channels").select("id, name, platform, channel_group, url, follower_count, note").not("channel_group", "is", null).order("follower_count", { ascending: false, nullsFirst: false }),
      readChannelReferenceIntro(supabaseAdmin),
      readMagicLinkThemeLock(supabaseAdmin),
      readChannelReferenceSheetSnapshot(supabaseAdmin),
    ]);
    return {
      rows: publicChannelRows(rows || [], false),
      intro: publicIntro(intro, false),
      themeLock: themeLock || null,
      snapshot: snap ? { count: snap.count, fetchedAt: snap.fetchedAt, sheetUrl: "" } : null,
    };
  } catch {
    return null;
  }
}

export default async function ChannelReferencePage({ params }) {
  const token = params.token;
  const initial = await loadInitial(token);
  const indexed = SEO_INDEXED_TOKENS.includes(token) && !!initial;
  const jsonLd = indexed ? {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: initial.intro.title ? `${initial.intro.title} — VIEENT` : "Channel Reference — VIEENT",
    description: (initial.intro.text || "").replace(/\s+/g, " ").trim().slice(0, 300) || undefined,
    url: `${SITE_URL}/channels/${token}`,
    publisher: { "@type": "Organization", name: "VIEENT", url: "https://vieent.com" },
  } : null;
  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <ChannelReferenceClient token={token} initial={initial} />
    </>
  );
}
