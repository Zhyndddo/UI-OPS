"use client";

import { useState } from "react";

// Matches v1's refLink/url column exactly: shows as a clickable link
// (opens new tab) by default when the value is a real URL, with a small
// pencil to switch to an editable input. Not a multi-line UrlField —
// this is specifically the single-link, link-first-input-second pattern
// v1 used for Phái Sinh/Manual Claim's URL columns.
export default function LinkOrEditCell({ value, onSave, styles, placeholder }) {
  const isValidUrl = /^https?:\/\/\S+$/i.test((value || "").trim());
  const [editing, setEditing] = useState(!isValidUrl);
  const [draft, setDraft] = useState(value || "");

  if (!editing && isValidUrl) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--accent)", fontSize: 12 }}
        >
          {value}
        </a>
        <button
          onClick={() => { setDraft(value || ""); setEditing(true); }}
          title="Edit link"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", fontSize: 11, flexShrink: 0, padding: 0 }}
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <input
      autoFocus={editing && isValidUrl}
      className={styles.input}
      style={{ padding: "4px 8px", fontSize: 12 }}
      placeholder={placeholder || "https://…"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        onSave(draft);
        if (/^https?:\/\/\S+$/i.test(draft.trim())) setEditing(false);
      }}
    />
  );
}
