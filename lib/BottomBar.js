"use client";

import { SIDEBAR_WIDTH } from "./Sidebar";
import { useBottomBarSlot } from "./BottomBarContext";

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
export default function BottomBar({ isMobile }) {
  const { active } = useBottomBarSlot();

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
        <img
          src="/vieent-logo-watermark.png"
          alt="VIEENT"
          style={{ height: 16, width: "auto", flexShrink: 0, opacity: 0.9 }}
        />
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
      <img
        src="/vieent-logo-watermark.png"
        alt="VIEENT"
        style={{ height: 24, width: "auto", flexShrink: 0, opacity: 0.9 }}
      />
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", overflow: "hidden" }}>
        {active?.right}
      </div>
    </div>
  );
}
