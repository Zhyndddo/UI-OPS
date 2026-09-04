"use client";

// Round 152 — reusable custom start/end date-range filter, meant to sit
// right next to a page's search box (SearchBox.js) in the same toolbar
// row. Explicit request: a genuinely NEW filter, not a repurposing of any
// existing preset (today/this-week/this-month) filter already on a page —
// this is additive, independent controlled state a page ANDs together
// with whatever other filters it already has.
//
// Purely presentational + two controlled `type="date"` inputs — same
// division of responsibility as SearchBox/matchesQuery: this component
// owns the UI, the consuming page owns the state and decides which date
// field to check it against via matchesDateRange() below. That split is
// what makes this droppable into any other team's dashboard later (per
// explicit "the other team may ask for it too") — a new page just needs
// its own start/end useState pair and one matchesDateRange() call in its
// existing filter chain, no page-specific logic lives in here.
export default function DateRangeFilter({ start, end, onStartChange, onEndChange, style }) {
  const inputStyle = {
    padding: "7px 10px",
    fontSize: 12,
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    background: "var(--bg-input)",
    color: "var(--text)",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, ...style }}>
      <input
        type="date"
        value={start || ""}
        onChange={(e) => onStartChange(e.target.value)}
        title="From release date"
        style={inputStyle}
      />
      <span style={{ color: "var(--text-faint)", fontSize: 12 }}>–</span>
      <input
        type="date"
        value={end || ""}
        onChange={(e) => onEndChange(e.target.value)}
        title="To release date"
        style={inputStyle}
      />
      {(start || end) && (
        <button
          onClick={() => { onStartChange(""); onEndChange(""); }}
          title="Clear date range"
          style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

// Shared inclusive-both-ends range check. `dateStr` is whatever the row's
// date field holds (a "YYYY-MM-DD" string, or a full timestamp — only the
// first 10 chars are compared, so either works); `start`/`end` are the
// two <input type="date"> values above (also "YYYY-MM-DD", or "" when
// unset). No date-range filter active (both blank) always passes, same
// "no-op when empty" convention as matchesQuery.
export function matchesDateRange(dateStr, start, end) {
  if (!start && !end) return true;
  if (!dateStr) return false;
  const d = String(dateStr).slice(0, 10);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}
