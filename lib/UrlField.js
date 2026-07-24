"use client";

// One universal pattern for every URL field in the app — each line is its
// own URL (plain textarea, Enter/Shift+Enter both just break the line,
// that's native behavior, nothing special needed), and every non-empty
// line gets a small 🔗 that opens it in a new tab. Stored as one
// newline-joined string in the same text column that already existed —
// no schema change, multi-URL support just falls out of how the text is
// split for display.
export default function UrlField({ value, onChange, onBlur, styles, placeholder, rows }) {
  const urls = (value || "").split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <div>
      <textarea
        className={styles.textarea}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder || "https://…\nhttps://… (one per line if there's more than one)"}
        rows={rows || Math.max(2, urls.length)}
        style={{ fontSize: 13 }}
      />
      {urls.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
          {urls.map((u, i) => (
            <a
              key={i}
              href={u}
              target="_blank"
              rel="noopener noreferrer"
              title={u}
              style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}
            >
              🔗 {urls.length > 1 ? `Link ${i + 1}` : "Open"}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
