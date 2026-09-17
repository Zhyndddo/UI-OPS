"use client";

import { SIDEBAR_WIDTH } from "./Sidebar";
import { useBottomBarSlot } from "./BottomBarContext";
import { useTheme } from "./ThemeContext";

// Round 284 — the UI shell's third piece, alongside Sidebar and TopBar:
// "top bar, left side bar, and bottom bar — bottom bar is for paging and
// this logo watermark." Fixed to the viewport bottom (same "out of flow,
// AppShell reserves the space" pattern TopBar already uses — see that
// file's own comment) so it stays put regardless of how tall the page's
// content is, mounted once, site-wide, on every AppShell page — even one
// with nothing to paginate right now still shows the watermark, per
// explicit request ("we are going to page everything... since they will
// pile up anyway").
//
// The actual pagination controls are NOT rendered here — they come from
// whichever page currently has a live lib/Pagination.js mounted, via
// BottomBarContext. Desktop: three-region flex layout — left region gets
// the "Showing X–Y of Z" count, the logo sits fixed-size in the true
// middle (flexed evenly between two equal-grow siblings so it stays
// centered regardless of how wide either side's content is), right region
// gets the page-size picker + prev/next. Either side is simply empty when
// nothing's registered — the logo still renders, centered, on its own.
// Mobile gets its own stacked branch below — see its comment for why.
// Round 317 — "fix the picture we add on the bottom bar in the shell,
// can you add a themed (dark/black) rectangle so it show up like a badge
// (so it show the whole empowered by VIEENT)". The watermark PNG was only
// the orange disc (the middle "EE" of the VIEENT wordmark, cropped tight)
// — no asset had the "VI"/"NT" text or "empowered by" text in a legible
// color, so that round recreated the rest of the lockup with real
// HTML/CSS text and wrapped it in a fixed dark/black pill.
//
// Round 341 — replaced entirely with a real supplied badge asset
// ("Replace that with the one in this folder") — public/brand/
// vieent-badge.png, the trimmed version of VIEENT-BADGE-nonshape 2.png
// from the user's own Downloads folder ("DISTRIBUTED BY VIEENT — A Music
// Distribution and Copyright Protection", white text baked into the
// image). No more hand-built HTML text lockup. That white text was
// invisible on the light theme's light page background (confirmed by
// compositing the image onto white before trusting it), so the light
// theme used to wrap the image in a fixed black rounded square as a
// workaround.
//
// Round 366 — "make a switch for the current bottom bar center batch with
// the file from folder vieent batch". That folder supplied a proper
// black-text counterpart of the exact same lockup (same ~4.85:1 aspect
// ratio as the existing white asset, just recolored) — public/brand/
// vieent-badge-black.png. That's the real fix for the light-theme problem
// the black-square wrapper above was only working around: the light theme
// now renders the black-text asset directly on the page background
// (readable without any wrapper), while dark/cosmic keep the original
// white-text asset on their dark background, same as before.
function EmpoweredByBadge({ compact, theme }) {
  const imgHeight = compact ? 22 : 32;
  const isLight = theme === "light";
  return (
    <img
      src={isLight ? "/brand/vieent-badge-black.png" : "/brand/vieent-badge.png"}
      alt="Distributed by VIEENT — A Music Distribution and Copyright Protection"
      style={{ height: imgHeight, width: "auto", display: "block", flexShrink: 0 }}
    />
  );
}

export default function BottomBar({ isMobile }) {
  const { active } = useBottomBarSlot();
  const { theme } = useTheme();

  // Round 284 follow-up — the single-row layout below measures out at
  // ~320px just for the pagination controls (select + Prev + "Page X / Y"
  // + Next) once real numbers are in there; alongside the count text and
  // logo that never fits in a 375px-wide phone bar, and the row's own
  // overflow:hidden was silently clipping the select and Prev button off
  // the left edge — reachable on desktop, invisible and unreachable on
  // mobile. Stack instead: logo on its own row up top (small, still
  // dead-center — the one thing every page shows regardless of whether
  // anything's registered), pagination controls on their own full-width
  // row below, with an overflow-x:auto safety net so even the narrowest
  // phones can scroll to reach Next rather than lose it entirely. The
  // count text is dropped on mobile — screen space goes to the controls
  // people actually tap; "Page X / Y" already conveys where they are.
  if (isMobile) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 300,
          background: "var(--bg-card)",
          borderTop: "1px solid var(--border)",
          minHeight: "var(--bottombar-height)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          padding: "6px 12px",
        }}
      >
        <EmpoweredByBadge compact theme={theme} />
        {active?.right && (
          <div style={{ maxWidth: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {active.right}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: SIDEBAR_WIDTH,
        right: 0,
        zIndex: 300,
        background: "var(--bg-card)",
        borderTop: "1px solid var(--border)",
        minHeight: "var(--bottombar-height)",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
      }}
    >
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "center", overflow: "hidden" }}>
        {active?.left}
      </div>
      <EmpoweredByBadge theme={theme} />
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", overflow: "hidden" }}>
        {active?.right}
      </div>
    </div>
  );
}
