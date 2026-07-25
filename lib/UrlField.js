"use client";

// One universal pattern for every URL field in the app. Collapses to a
// plain single-line box by default (matching a normal input, no extra
// chrome) — only grows into a multi-line textarea, with a list of
// individually-openable links below, once there are actually 2+ URLs in
// it. A single URL just gets a small inline open icon, no separate row.
// Stored as one newline-joined string in the same text column that
// already existed — no schema change.
export default function UrlField({ value, onChange, onBlur, styles, placeholder }) {
  const urls = (value || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const isMulti = urls.length >= 2;

  if (!isMulti) {
    return (
      <div style={{ position: "relative" }}>
        <input
          className={styles.input}
          style={{ paddingRight: urls.length === 1 ? 30 : undefined }}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder || "https://…"}
        />
        {urls.length === 1 && (
          <a
            href={urls[0]}
            target="_blank"
            rel="noopener noreferrer"
            title={urls[0]}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 13, textDecoration: "none" }}
          >
            🔗
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      <textarea
        className={styles.textarea}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder || "https://…\nhttps://…"}
        rows={urls.length}
        style={{ fontSize: 13, minHeight: 0 }}
      />
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
            🔗 Link {i + 1}
          </a>
        ))}
      </div>
    </div>
  );
}
