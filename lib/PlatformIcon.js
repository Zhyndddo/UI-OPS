// Round 347 — the channel reference table's per-row platform badge, as an
// icon instead of plain text. Round 354 — "switch the platform icon to
// this folder": swapped from Round 347's hand-vectorized monochrome
// inline SVGs to the user's own color PNG pack (see lib/platformBrand.js
// for the shared icon-src/color lookup and the reasoning on why PNG this
// time). Falls back to the plain platform-name text for anything outside
// the 5 icons that pack covers — same never-silently-drop convention the
// rest of this page uses for an unrecognized value — so a future
// platform added to booking_channels never renders blank.
import { resolvePlatformKey, PLATFORM_ICON_SRC } from "./platformBrand";

// Round 355 — "make the platform icon be a bit bigger, about 1.3 - 1.5
// times is good enough": 16px -> 22px (~1.4x).
// Round 368 — "that said, can you make the icon a bit bigger, about 1.3
// current" (in the context of dropping the "Platform" column-title text):
// 22px -> 29px (22 * 1.3 = 28.6, rounded up).
export default function PlatformIcon({ platform, size = 29, className, style }) {
  const key = resolvePlatformKey(platform);
  const src = key && PLATFORM_ICON_SRC[key];
  if (!src) {
    return <span className={className}>{(platform || "").toUpperCase()}</span>;
  }
  return (
    <img
      src={src}
      alt={platform || ""}
      width={size}
      height={size}
      className={className}
      style={{ display: "block", objectFit: "contain", ...style }}
    />
  );
}
