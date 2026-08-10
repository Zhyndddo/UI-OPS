"use client";

// One universal pattern for every URL field in the app. Collapses to a
// plain single-line box by default (matching a normal input, no extra
// chrome) — only grows into a multi-line textarea, with a list of
// individually-openable links below, once there are actually 2+ URLs in
// it. A single URL just gets a small inline open icon, no separate row.
// Stored as one newline-joined string in the same text column that
// already existed — no schema change.
export default function UrlField({ value, onChange, onBlur, styles, placeholder, disabled, disabledTitle }) {
  const urls = (value || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const isMulti = urls.length >= 2;

  // Locked state — e.g. Smartlink while a release is in priority pitching
  // mode (see app/releases/[id]/page.js). Renders as a plain disabled box,
  // not editable, with the reason available as a hover title (truncated
  // to one line so it doesn't blow out narrow table cells).
  if (disabled) {
    return (
      // Round 80 — capped at maxWidth so a long URL/warning text can't
      // stretch its table column ("over-extend").
      <div style={{ position: "relative", maxWidth: 320 }}>
        <input
          className={styles.input}
          style={{ opacity: 0.5, cursor: "not-allowed", paddingRight: urls.length === 1 ? 30 : undefined }}
          value={value || ""}
          disabled
          readOnly
          title={disabledTitle}
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
        {disabledTitle && (
          <div
            title={disabledTitle}
            style={{ fontSize: 10, color: "var(--error-fg, #e57373)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            ⚠ {disabledTitle}
          </div>
        )}
      </div>
    );
  }

  if (!isMulti) {
    return (
      // Round 80 — same maxWidth cap as the disabled branch above.
      <div style={{ position: "relative", maxWidth: 320 }}>
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
    // Round 80 — same maxWidth cap as the two branches above.
    <div style={{ maxWidth: 320 }}>
      <textarea
        className={styles.textarea}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder || "https://…\nhttps://…"}
        rows={urls.length}
        style={{ fontSize: 13, minHeight: 0, width: "100%", boxSizing: "border-box" }}
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
