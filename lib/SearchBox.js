"use client";

// Round 76 — shared "quick index" search box, dropped into every ticket
// and workstation list page. Pure client-side substring filter (see
// matchesQuery below) — no new query, so it's instant and works against
// whatever's already loaded/paginated on the page.
export default function SearchBox({ value, onChange, placeholder = "Search…" }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        padding: "7px 12px",
        fontSize: 12,
        border: "1px solid var(--border-strong)",
        borderRadius: 6,
        background: "var(--bg-input)",
        color: "var(--text)",
        width: 200,
        marginBottom: 12,
      }}
    />
  );
}

// Case-insensitive substring match against every value in a row (including
// nested objects like `data`/`profiles`) — one implementation shared by
// every list page so "quick index" behaves identically everywhere.
export function matchesQuery(row, query) {
  if (!query || !query.trim()) return true;
  const q = query.trim().toLowerCase();
  try {
    return JSON.stringify(row).toLowerCase().includes(q);
  } catch {
    return true;
  }
}
