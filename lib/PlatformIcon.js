// Round 347 — "switch the name of the platform in the table into the
// icon... reduce the load speed. because i know storing png would take a
// lot to load": the channel reference magic link's per-row platform badge
// (see app/channels/[token]/page.js's .rowPlatform) used to render the
// platform as plain uppercase text (TIKTOK, FACEBOOK, ...). Traded for a
// real brand glyph here — but as hand-vectorized inline SVG path data
// (traced from the user's own EPS icon pack with potrace, then minified
// with svgo), NOT as <img src="...png">. A raster PNG per platform would
// mean 5–10 separate image requests plus 15–30KB each; these 5 paths
// together are under 4KB total, ship inside the JS bundle (zero extra
// network requests), and render crisp at any size since they're vectors.
// Single-color (`fill="currentColor"`) so each one automatically follows
// whatever text color the badge is styled with — including the dark/
// light theme lock — instead of needing separate light/dark asset
// variants like the PNG pack did.
const ICONS = {
  facebook: {
    viewBox: "0 0 135 252.76",
    paths: [
      "M86.5.86c-17.6 2.9-32.5 13.6-39.4 28.3-5.5 11.6-6.2 16-6.8 42.8l-.5 24.8H0v45h40v111h49l.2-55.3.3-55.2 18.5-.5 18.4-.5 3.3-21c1.8-11.6 3.2-21.6 3.3-22.2 0-1-5.3-1.3-21.7-1.5l-21.8-.3-.3-14.9c-.1-8.2.2-17.4.8-20.5 1.3-7 5.3-12.9 11-16.1 4.1-2.3 5.7-2.5 19.3-2.8l14.7-.4V2.96l-2.7-.6C120.9.06 96.1-.74 86.5.86",
    ],
  },
  instagram: {
    viewBox: "0 0 206.09 205.87",
    paths: [
      "M50.29.98c-17.7 3-34.7 15.4-43.2 31.8-7 13.4-7.1 14.4-7.1 70.3 0 32 .4 51.6 1.1 55 3.5 16.8 17.1 34 33 41.6 4.6 2.2 10.8 4.5 13.7 5.1 3.4.7 23 1.1 55 1.1 54.6 0 56.7-.2 68.5-6.1 17.1-8.5 29.3-24 33.2-42.5 2.1-10.1 2.1-97.7 0-107.9-3.8-18.1-16.2-34.4-32.5-42.4-14-6.9-16.2-7.1-69.5-7-25.9.1-49.3.5-52.2 1m103 19.4c16.9 4.4 29.1 16.9 32.6 33.3.7 3.5 1.1 20.7 1.1 50 0 47.7-.3 50.9-5.1 60.4-2.7 5.4-9.9 13-15.7 16.7-9.7 6.1-10.8 6.2-65.9 5.9l-49.8-.3-7-3.4c-9-4.5-16.2-11.7-20.6-20.6l-3.4-7v-104l3.2-6.8c5.9-12.4 17.9-22.2 30.3-24.6 2.5-.5 24.8-.9 49.5-1 37-.1 46.1.2 50.8 1.4",
      "M151.29 38.88c-4.1 2.4-5.3 4.8-5.3 10.2 0 5 1.9 8.2 6 10.3 5.3 2.8 12 1.1 15.4-3.7.9-1.2 1.6-4.3 1.6-6.8 0-5.2-1.8-8.3-6-10.5-3.9-2-7.9-1.9-11.7.5m-61.4 15.4c-17 4.7-31.3 19.6-35.4 36.7-9.8 41.8 32.6 76.2 71.3 57.8 7.9-3.8 18.3-13.7 22.4-21.5 5.6-10.4 7.4-25.8 4.4-37-4.6-17.4-19.9-32.5-36.8-36.4-5.9-1.3-20.3-1.1-25.9.4m22.9 17.6c17.2 4.4 27.3 24.2 21.5 42-2.3 7.1-10.4 15.9-17.5 19.1-8 3.5-19.3 3.4-27-.4-7.2-3.5-14-11-16.8-18.5-5.7-15 2.1-33.9 16.6-40.3 8.2-3.7 14.2-4.2 23.2-1.9",
    ],
  },
  tiktok: {
    viewBox: "0 0 189.91 222.48",
    paths: [
      "M103.71 80.7c-.3 80.4-.3 80.8-2.5 86.1-7.6 18.7-29.6 28-47.6 20.3-6-2.6-14.3-10.3-17.2-16.1-5.2-10.4-5.2-20.9.1-31.7 5-10.3 17.5-18.3 29.1-18.6l5.3-.2V87.7l-9.2.6c-16.8.9-30 7-42.3 19.2C6.51 120.4.91 133.4.11 151.7c-.3 8.2 0 13.1 1.3 18.7 5.2 23.7 24.5 43.6 48.5 50.2 10.3 2.8 27.3 2.4 37.5-.9 18.9-6.2 32.8-18.4 41.1-36.2 6-13 6.4-17 6.4-70.8V64.2l7.8 7.7c4.5 4.5 10.2 9 13.9 10.9 7.7 4 19.8 7.2 27.5 7.2h5.8V53.4l-7.2-1.7c-23-5.3-42-24.2-46.1-45.5l-1.2-6.2h-31.4z",
    ],
  },
  youtube: {
    viewBox: "0 0 192.87 134.8",
    paths: [
      "M33.98 1c-11.8 2.3-24.6 12.3-29.5 23.1-3.7 8.1-4.5 16.1-4.5 43.3s.8 35.2 4.5 43.3c5.1 11.1 17.6 20.8 30 23.2 4.2.8 23.7 1 66 .8l60-.3 5.5-2.3a44.6 44.6 0 0 0 24.3-24.5c2-4.9 2.2-7.3 2.5-37.4.4-35.3-.2-40.2-5.5-49.2-5.7-9.8-16.6-17.5-28.1-20-6.4-1.3-118.3-1.4-125.2 0m70.3 52.5c25.3 13.7 25.7 14 25.7 16 0 .8-10.6 6.7-25.1 14-25.7 12.8-27.7 13.5-31.6 10.2-1.8-1.5-1.9-50.1 0-51.6 1.6-1.3 4.8-2.1 6.5-1.6.8.2 11.8 6.1 24.5 13",
    ],
  },
  thread: {
    viewBox: "0 0 175.18 203.06",
    paths: [
      "M70.11.6c-37.5 6.7-60.7 31.6-68.3 73.3-2.4 12.8-2.4 41.7 0 54.7 5.9 32.2 20.8 53.8 45.1 65.5 15.1 7.2 33.4 10.2 51.7 8.5 20-1.9 33.7-7.2 46.2-17.7 13-10.9 20.4-24.8 21.3-40.4 1.4-21.4-8.2-39-26.5-48.7l-6.1-3.2-.6-5.8c-1.5-12.5-7.6-25-15.3-31-12.3-9.8-33.3-11.9-48.6-4.9-5.7 2.6-16.6 12-16.6 14.2 0 .7 3.1 3.3 6.9 5.8l6.9 4.6 2.8-3.1c4.6-4.7 10.1-7.1 18-7.6 12.2-.8 20.6 3.3 24.7 12 5 10.4 6 9.6-12 9.5-12.6-.1-17 .2-21.8 1.7-13.1 4-20.9 10-25.4 19.5-3.4 7.4-3.6 19.2-.4 26.3 5.3 11.6 17.4 19.3 32.1 20.5 13.8 1 24.7-2.2 33.9-10.2 5.1-4.3 11.4-16.3 13.2-25.3.8-3.4 1.8-6.2 2.3-6.2s3.4 2.5 6.3 5.5c4.3 4.4 5.8 6.9 7.5 12.1 2.4 7.9 2.5 11.1.4 18.9-4.2 16.2-18.5 28.9-38.4 34.2-10.2 2.7-32.1 2.4-42.5-.5-33.2-9.5-49.8-36.7-49.8-81.7s16.9-72.7 50-81.7c11-3 32.5-3 43.4 0 21.8 5.9 37.4 20 45 40.7 1.2 3.3 2.5 6.3 2.9 6.8.4.4 4.3-.2 8.7-1.4l8.1-2.2-1-3.6c-1.8-6.7-10.7-23.8-15.8-30.2-7-8.9-15-15.2-25.5-20.5-14-7-21.1-8.5-41-8.9-9.3-.2-19.2 0-21.8.5m40.3 103.8c5.3.8 5.8 1.9 4 10.4-2 9.1-6.4 15.6-13 19.1-5.1 2.7-6.2 2.9-14.2 2.5-7.4-.3-9.2-.8-12.8-3.2-9.8-6.5-9.7-17.7.1-24.7 5.9-4.2 22.7-6.1 35.9-4.1",
    ],
  },
};

// A few obvious alternate spellings/casings this data actually uses (see
// PLATFORM_ORDER in app/channels/[token]/page.js — "Thread", singular)
// or could plausibly contain, mapped onto the 5 keys above. Anything not
// in here just falls through to the text fallback below rather than
// guessing wrong.
const ALIASES = {
  threads: "thread",
};

function resolveIcon(platform) {
  const key = (platform || "").trim().toLowerCase();
  if (!key) return null;
  return ICONS[key] || ICONS[ALIASES[key]] || null;
}

// `size` is the glyph's own box (px); the badge around it (.rowPlatform,
// see page.module.css) supplies the padding/background. Falls back to
// the plain platform text — same "never silently drop" convention the
// rest of this codebase uses for an unrecognized value — for any
// platform outside the 5 this icon set covers, so a future platform
// added to booking_channels never renders blank.
export default function PlatformIcon({ platform, size = 13, className, style }) {
  const icon = resolveIcon(platform);
  if (!icon) {
    return <span className={className}>{(platform || "").toUpperCase()}</span>;
  }
  return (
    <svg
      viewBox={icon.viewBox}
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {icon.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
