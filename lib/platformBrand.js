// Round 354 — "can you switch the platform icon to this folder. Also
// based on the platform color, also color the counter cell accordingly":
// shared lookup between lib/PlatformIcon.js (the channel row's platform
// badge) and app/channels/[token]/page.js (the counter strip tiles), so
// both pull from the same single source of truth for "what platform is
// this and what's its brand color" instead of duplicating the mapping in
// two places.
//
// The icon set itself is the user's own color PNGs (staged from their
// device folder "social-icons-color-png" — the same pack this page used
// to source its monochrome Round 347 icons from, this time kept in
// color), downscaled to 128px and copied into public/brand/platform-
// icons/. Round 347's inline-SVG-for-load-speed approach is deliberately
// NOT reused here: the user explicitly asked for these exact PNG assets
// this time, and 5 small (10-14KB) images loaded once and cached by the
// browser for the rest of the session is a fine trade against matching
// their real brand artwork exactly.
//
// Round 366 — "change the vsounder file icon photo with these files from
// social-media-logos-set color": same 5 platforms, swapped in-place for a
// richer/deeper-color revision of the same icon pack (staged from the
// user's device folder "social-media-logos-set color" — file names there
// were facebook/instagram/tiktok/youtube/thread.png, the last one renamed
// to threads.png to match this file's existing key). No path or code
// changes needed — same filenames, same slots.
const ALIASES = {
  // PLATFORM_ORDER in page.js uses "Thread" (singular) as the actual
  // data value; "threads" is kept too in case a value ever comes through
  // pluralized.
  threads: "thread",
};

export function resolvePlatformKey(platform) {
  const key = (platform || "").trim().toLowerCase();
  if (!key) return null;
  return ALIASES[key] || key;
}

export const PLATFORM_ICON_SRC = {
  facebook: "/brand/platform-icons/facebook.png",
  instagram: "/brand/platform-icons/instagram.png",
  tiktok: "/brand/platform-icons/tiktok.png",
  youtube: "/brand/platform-icons/youtube.png",
  thread: "/brand/platform-icons/threads.png",
};

// Round 354 — "based on the platform color, also color the counter cell
// accordingly": each platform's real brand color, as an {accent,
// accentBg} pair — same shape GROUP_META in page.js already uses for the
// channel-group headers, so the counter tiles pick up the same "solid
// accent + soft tinted background" visual language instead of inventing
// a new one. accentBg is a low-opacity tint (not the raw brand color)
// specifically so it stays legible as a tile BACKGROUND in both the
// dark and light theme — TikTok's and Threads' real brand color is
// literally black, which would either vanish into the dark theme or
// read as a jarring black block in the light theme if used solid.
export const PLATFORM_COLORS = {
  facebook: { accent: "#1877f2", accentBg: "rgba(24, 119, 242, 0.14)" },
  instagram: { accent: "#e1306c", accentBg: "rgba(225, 48, 108, 0.14)" },
  tiktok: { accent: "#fe2c55", accentBg: "rgba(254, 44, 85, 0.14)" },
  youtube: { accent: "#ff0000", accentBg: "rgba(255, 0, 0, 0.12)" },
  thread: { accent: "#6b6b6b", accentBg: "rgba(107, 107, 107, 0.16)" },
};
