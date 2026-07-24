"use client";

import { useState } from "react";

// Shared autocomplete pattern — free text underneath (not a hard foreign
// key), matching an existing labels/artists row lets you pick it instead
// of retyping. Used identically by the New Release create form and the
// release detail popup, so there's exactly one implementation to keep
// working, not two that can drift apart.
export function LabelInput({ value, onChange, onBlur, labels, placeholder, styles }) {
  const [open, setOpen] = useState(false);
  const matches =
    (value || "").trim().length > 0
      ? labels.filter((l) => l.label_name.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8)
      : [];

  return (
    <div style={{ position: "relative" }}>
      <input
        className={styles.input}
        placeholder={placeholder}
        value={value || ""}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          setTimeout(() => setOpen(false), 150);
          onBlur?.(e);
        }}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
            background: "#1a1a1a", border: "1px solid #333", borderRadius: 6,
            marginTop: 4, maxHeight: 200, overflowY: "auto",
          }}
        >
          {matches.map((l) => (
            <div
              key={l.label_name}
              onClick={() => { onChange(l.label_name); setOpen(false); }}
              onMouseDown={(e) => e.preventDefault()}
              style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #262626" }}
            >
              {l.label_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ArtistInput({ value, onChange, onBlur, artists, placeholder, styles }) {
  const [open, setOpen] = useState(false);
  const matches =
    (value || "").trim().length > 0
      ? artists.filter((a) => a.stage_name.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8)
      : [];

  return (
    <div style={{ position: "relative" }}>
      <input
        className={styles.input}
        placeholder={placeholder}
        value={value || ""}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          setTimeout(() => setOpen(false), 150); // lets a click on a suggestion register first
          onBlur?.(e);
        }}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
            background: "#1a1a1a", border: "1px solid #333", borderRadius: 6,
            marginTop: 4, maxHeight: 200, overflowY: "auto",
          }}
        >
          {matches.map((a) => (
            <div
              key={a.stage_name}
              onClick={() => { onChange(a.stage_name); setOpen(false); }}
              onMouseDown={(e) => e.preventDefault()}
              style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #262626" }}
            >
              {a.stage_name}
              {a.labels?.label_name && <span style={{ color: "#666", marginLeft: 8 }}>— {a.labels.label_name}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
