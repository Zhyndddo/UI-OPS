"use client";

import { useState } from "react";

const URL_RE = /^https?:\/\/\S+$/i;

// Multi-line sibling of LinkOrEditCell — the value can hold several
// pasted rows (Excel rows, or just Enter between links). Each non-blank
// line that looks like a real URL renders as its own clickable link;
// anything else renders as plain text. The cell/row naturally grows
// taller with more lines — no separate expand control needed. A pencil
// icon switches to a plain multi-line textarea for editing.
export default function MultiLinkCell({ value, onSave, styles, placeholder }) {
  const lines = (value || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const hasContent = lines.length > 0;
  const [editing, setEditing] = useState(!hasContent);
  const [draft, setDraft] = useState(value || "");

  if (!editing && hasContent) {
    return (
      // Round 80 — capped at maxWidth so a long pasted URL can't stretch
      // its table column wide ("over-extend"); minWidth: 0 on the flex
      // item is the actual fix that lets the ellipsis below engage at all
      // — a flex item's default min-width is "auto" (its own content
      // size), which silently overrides overflow/textOverflow and lets it
      // grow to fit the text anyway unless this is set.
      <div style={{ display: "flex", alignItems: "flex-start", gap: 4, maxWidth: 320 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
          {lines.map((line, i) =>
            URL_RE.test(line) ? (
              <a
                key={i}
                href={line}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--accent)", fontSize: 12 }}
              >
                {line}
              </a>
            ) : (
              <span key={i} style={{ fontSize: 12, color: "var(--text-faint)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {line}
              </span>
            )
          )}
        </div>
        <button
          onClick={() => { setDraft(value || ""); setEditing(true); }}
          title="Edit links"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", fontSize: 11, flexShrink: 0, padding: 0 }}
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <textarea
      autoFocus={editing && hasContent}
      className={styles.textarea}
      style={{ fontSize: 12, minHeight: 40, width: "100%", boxSizing: "border-box" }}
      placeholder={placeholder || "https://…  (one per line)"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        onSave(draft);
        const remaining = draft.split("\n").map((l) => l.trim()).filter(Boolean);
        if (remaining.length > 0) setEditing(false);
      }}
    />
  );
}
