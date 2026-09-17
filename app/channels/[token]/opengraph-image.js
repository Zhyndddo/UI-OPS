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
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "VIEENT Channel Reference";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same dark palette as app/globals.css's :root theme (--bg / --bg-card /
// --border / --text / --text-muted / --accent) — kept as literal hex here
// since next/og renders in an isolated environment that can't read the
// app's CSS custom properties.
const COLORS = {
  bg: "#0a0a0a",
  card: "#121212",
  border: "#262626",
  text: "#f4f4f4",
  muted: "#999999",
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
          backgroundImage: `radial-gradient(circle at 82% 18%, rgba(255,107,26,0.16), rgba(10,10,10,0) 55%)`,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "36px",
          }}
        >
          <div
            style={{
              display: "flex",
              width: "14px",
              height: "14px",
              borderRadius: "999px",
              background: COLORS.accent,
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: "26px",
              fontWeight: 800,
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: COLORS.accent,
            }}
          >
            VIEENT
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "68px",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: COLORS.text,
            lineHeight: 1.08,
          }}
        >
          Channel Reference
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "22px",
            fontSize: "30px",
            fontWeight: 600,
            color: COLORS.muted,
          }}
        >
          Platforms · Followers · Distribution Support booking
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "56px",
            padding: "14px 26px",
            border: `1px solid ${COLORS.border}`,
            borderRadius: "10px",
            background: COLORS.card,
            fontSize: "24px",
            fontWeight: 700,
            color: COLORS.text,
            alignSelf: "flex-start",
          }}
        >
          Distribution Support — Media Booking 2026
        </div>
      </div>
    ),
    { ...size }
  );
}
