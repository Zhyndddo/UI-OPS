"use client";

// One universal pattern for every URL field in the app. Collapses to a
// plain single-line box by default (matching a normal input, no extra
// chrome) — only grows into a multi-line textarea, with a list of
// individually-openable links below, once there are actually 2+ URLs in
// it. A single URL just gets a small inline open icon, no separate row.
// Stored as one newline-joined string in the same text column that
// already existed — no schema change.
// Round 88 follow-up 5 — `wide` opt-in, off by default everywhere this was
// already in use (Booking Board table cells, ticket forms, etc. all keep
// the original tight caps below — this changes nothing for them). Only the
// release detail page's URL tab passes `wide` — its fields sit in a full
// two-column form grid, not a narrow table column, so the ~110/150px caps
// from Round 80/81 (added specifically so a long URL/warning couldn't
// stretch a table column) were making every field look oddly short there
// for no reason relevant to that page. `wide` just drops the cap and lets
// the field fill its container's actual width instead.
export default function UrlField({ value, onChange, onBlur, styles, placeholder, disabled, disabledTitle, wide }) {
  const urls = (value || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const isMulti = urls.length >= 2;

  // Locked state — e.g. Smartlink while a release is in priority pitching
  // mode (see app/releases/[id]/page.js). Renders as a plain disabled box,
  // not editable, with the reason available as a hover title (truncated
  // to one line so it doesn't blow out narrow table cells).
  if (disabled) {
    return (
      // Round 80 — capped at maxWidth so a long URL/warning text can't
      // stretch its table column ("over-extend"). Round 81 item 3 —
      // tightened further to roughly the pixel width of "https://abc" per
      // the user's literal ask (was a much more generous 320).
      <div style={{ position: "relative", maxWidth: wide ? "none" : 110, width: wide ? "100%" : undefined }}>
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
      // Round 81 item 3 — tightened to ~"https://abc" width, see above.
      <div style={{ position: "relative", maxWidth: wide ? "none" : 110, width: wide ? "100%" : undefined }}>
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
    // Round 80 — same maxWidth cap as the two branches above. Round 81
    // item 3 — the multi-URL editing textarea keeps a little more room
    // than the single-URL display boxes (150 vs 110) since it's an actual
    // edit surface for pasting several links, not a read-only display.
    <div style={{ maxWidth: wide ? "none" : 150, width: wide ? "100%" : undefined }}>
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
