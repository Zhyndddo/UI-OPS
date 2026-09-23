// Round 392 — the share-preview image for the booking/package-picker
// magic link, same next/og file-convention idiom as
// app/channels/[token]/opengraph-image.js (Round 356) — this exact
// filename is picked up automatically and wired into both og:image and
// the Twitter-card image, nothing in layout.js needs to reference it.
//
// Kept generic (not per-release) on purpose, same call channels/[token]
// made: next/og renders in an isolated environment per request, so a
// truly per-release image (pulling in release.title/main_artist) would
// mean an extra Supabase round trip on every single link-preview scrape
// just to re-draw text that's ALREADY in the og:title/og:description
// meta tags from layout.js — most chat apps show title+description
// beside the image anyway, so the image's job here is just "looks like
// VIEENT branding you can trust", not repeating the same words a second
// time. Plain ASCII copy (no Vietnamese diacritics) for the same reason
// channels/[token]'s image is ASCII-only: next/og's default font doesn't
// cover Vietnamese combining marks.
//
// Round 423 — per explicit request, the orange-dot + "VIEENT" text
// wordmark below is replaced with the real badge artwork (the same one
// BottomBar.js renders), pulled in as a data URI from lib/brandAssets.js
// since next/og's edge runtime can't read /public directly.
import { ImageResponse } from "next/og";
import { VIEENT_BADGE_DATA_URI } from "../../../lib/brandAssets";

export const runtime = "edge";
export const alt = "VIEENT Package Offer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same dark palette as app/globals.css's :root theme / the channels
// share-image — kept as literal hex since next/og can't read the app's
// CSS custom properties.
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
        <img
          src={VIEENT_BADGE_DATA_URI}
          width={260}
          height={53}
          style={{ display: "flex", marginBottom: "36px" }}
        />
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
          Package Offer
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
          Distribution Support — Media Booking
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
          VIEENT Task Tracking
        </div>
      </div>
    ),
    { ...size }
  );
}
