// Round 356 — the share-preview image for the channel-reference magic
// link, per explicit request ("setup SEO - để share lên fb, social on
// this url"). Next.js's file-convention system (this exact filename,
// opengraph-image.js, inside the same route segment) auto-generates the
// og:image and Twitter-card image tags — layout.js's generateMetadata
// doesn't need to reference this file at all.
//
// Rendered on the fly with next/og's ImageResponse rather than shipping a
// static PNG, so it can't go stale if the brand colors in app/globals.css
// ever change, and it renders on a real edge function per Open Graph
// scraper hit rather than needing a rebuild to update. Kept to plain
// ASCII copy (no Vietnamese diacritics) deliberately — next/og's default
// font doesn't cover Vietnamese combining marks, and a share-card is not
// the place to discover missing glyphs as boxes/dropped accents.
//
// Round 424 tried a dark card with the VSounder cover photo as a full
// background — explicitly rejected ("im not happy with the og vsounder
// preview5 png you send... let me clarify it"). Round 425 replaces that
// with the spec given in that follow-up, verbatim:
//   - light theme background (no watermark)
//   - the orange VIEENT [mark] — from the "vieent badge" folder
//   - "Channel Reference" title -> the VSOUNDER logo
//   - the Platforms/Followers/... line stays, just darker for light theme
//   - remove the last sentence (the "Distribution Support — Media
//     Booking 2026" pill)
//
// Round 426 — "remove the top icon too (i forgot vsounder already have
// the logo right under it)": the standalone orange VIEENT mark Round 425
// put above the wordmark was redundant — VSOUNDER_WORDMARK_LIGHT_DATA_URI
// already has its own small VIEENT badge baked into the "empowered by
// VIEENT" tagline under the logo. Removed; VIEENT_BADGE_ORANGE_DATA_URI
// is no longer imported here (still exported from lib/brandAssets.js in
// case it's wanted elsewhere later).
import { ImageResponse } from "next/og";
import { VSOUNDER_WORDMARK_LIGHT_DATA_URI } from "../../../lib/brandAssets";

export const runtime = "edge";
export const alt = "VSounder — Channel Reference";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// app/globals.css's light-theme :root vars (see that file's [data-theme
// light]-equivalent block), kept as literal hex here since next/og
// renders in an isolated environment that can't read the app's CSS
// custom properties.
const COLORS = {
  bg: "#f7f3ee",
  border: "#ddd6c8",
  // "keep, just darker color for the light theme" — --text-faint from
  // globals.css's light block, a dark warm grey rather than the
  // near-black --text (that stays reserved for real headings).
  muted: "#3a3527",
  accent: "#ff6b1a",
};

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px",
          background: COLORS.bg,
          fontFamily: "sans-serif",
        }}
      >
        <img
          src={VSOUNDER_WORDMARK_LIGHT_DATA_URI}
          width={520}
          height={221}
          style={{ display: "flex" }}
        />
        <div
          style={{
            display: "flex",
            marginTop: "28px",
            fontSize: "30px",
            fontWeight: 600,
            color: COLORS.muted,
          }}
        >
          Platforms · Followers · Distribution Support booking
        </div>
      </div>
    ),
    { ...size }
  );
}
