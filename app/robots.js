// Round 564 — robots.txt. Google may read ONLY the public channel-reference page(s) (lib/channelReferencePublic.js
// SEO_INDEXED_TOKENS) plus the files they need to render; the rest of the app (login-only anyway) and every /api route —
// including the rate-sheet route — is off limits to crawlers.
import { SEO_INDEXED_TOKENS, SITE_URL } from "../lib/channelReferencePublic";

export default function robots() {
  return {
    rules: [{
      userAgent: "*",
      allow: [...SEO_INDEXED_TOKENS.map((t) => `/channels/${t}`), "/sitemap.xml", "/robots.txt", "/_next/static/", "/_next/image", "/brand/", "/fonts/", "/vieent-logo-watermark.png"],
      disallow: ["/api/", "/"],
    }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
