// Round 564 — sitemap.xml: the indexable public channel-reference page(s) only.
import { SEO_INDEXED_TOKENS, SITE_URL } from "../lib/channelReferencePublic";

export default function sitemap() {
  return SEO_INDEXED_TOKENS.map((t) => ({ url: `${SITE_URL}/channels/${t}`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 }));
}
