"use client";

// Round 289 — small hoverable legend for the color-coded row highlights
// used across several pages (see lib/releaseDateHighlight.js's
// rowHighlightColor — the yellow "today" / light blue "this week" row
// tints — and --missing-highlight in globals.css, the purple missing-data
// ring). Per explicit request: those colors had no on-page explanation
// anywhere, just a background tint with no label. Doesn't take up layout
// space by default — small colored dots + "Colors" label, full meanings
// in a native title tooltip on hover, same lightweight idiom every other
// hover explanation on these pages already uses (title=).
//
// `entries` is [{ color, label }] in the order they should read.
export default function ColorLegend({ entries }) {
  const text = entries.map((e) => `● ${e.label}`).join("\n");
  return (
    <span
      title={text}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        color: "var(--text-faint)",
        border: "1px solid var(--border-strong)",
        borderRadius: 12,
        padding: "3px 10px",
        cursor: "help",
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
    </span>
  );
}
