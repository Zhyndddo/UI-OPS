"use client";

import { useState } from "react";

// Round 289 — small hoverable legend for the color-coded row highlights
// used across several pages (see lib/releaseDateHighlight.js's
// rowHighlightColor — the yellow "today" / light blue "this week" row
// tints — and --missing-highlight in globals.css, the purple missing-data
// ring). Per explicit request: those colors had no on-page explanation
// anywhere, just a background tint with no label.
//
// Round 326 — switched from a native title= hover tooltip to a real
// click-to-open popover, per explicit report: "they only show a ?
// [cursor] but can click on or show more" — a title tooltip needs a
// mouse hovering it, so it silently never worked at all on touch devices
// (phone/tablet), and even on desktop it's easy to miss since nothing
// about a plain "Colors" pill signals it's interactive beyond the cursor
// change. Same click-to-open + click-outside-to-close popover pattern
// already used elsewhere in this app (e.g. app/labels/page.js's LBL Tag
// definitions popup) instead of a second bespoke implementation.
//
// `entries` is [{ color, label }] in the order they should read.
export default function ColorLegend({ entries }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Tap to see what these colors mean"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          color: "var(--text-faint)",
          background: "none",
          border: "1px solid var(--border-strong)",
          borderRadius: 12,
          padding: "3px 10px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {entries.map((e, i) => (
          <span
            key={i}
            style={{ width: 8, height: 8, borderRadius: "50%", background: e.color, display: "inline-block", marginLeft: i > 0 ? 2 : 0, flexShrink: 0 }}
          />
        ))}
        Colors
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 449 }} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              zIndex: 450,
              minWidth: 240,
              maxWidth: 320,
              background: "var(--bg-card)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              padding: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {entries.map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: e.color, display: "inline-block", flexShrink: 0, marginTop: 3 }} />
                <span style={{ fontSize: 12, color: "var(--text)" }}>{e.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
