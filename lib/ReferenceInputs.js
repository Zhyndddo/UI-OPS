"use client";

import { useState } from "react";
import { LABEL_PREFIX, hasLabelPrefix, stripLabelPrefix } from "./labelHelpers";

// Shared autocomplete pattern — free text underneath (not a hard foreign
// key), matching an existing labels/artists row lets you pick it instead
// of retyping. Used identically by the New Release create form and the
// release detail popup, so there's exactly one implementation to keep
// working, not two that can drift apart.
//
// Same "HĐ - " prefix treatment as the Label List admin page (app/labels/
// page.js): when the current value carries the prefix, it renders as a
// fixed, non-editable badge in front of the input instead of live text
// inside it — only the suffix is actually typed/edited here. value/onChange
// still carry the FULL name (prefix included) to every caller, exactly as
// before, so nothing downstream (validateLabelNameEdit, autocomplete
// matching against labels.label_name, etc.) needs to change.
export function LabelInput({ value, onChange, onBlur, labels, placeholder, styles }) {
  const [open, setOpen] = useState(false);
  const showBadge = hasLabelPrefix(value);
  const displayValue = showBadge ? stripLabelPrefix(value) : value || "";
  const matches =
    (value || "").trim().length > 0
      ? labels.filter((l) => l.label_name.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8)
      : [];

  function toFullValue(suffixOrFull) {
    if (!showBadge) return suffixOrFull;
    return suffixOrFull ? LABEL_PREFIX + suffixOrFull : "";
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {showBadge && (
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap", flexShrink: 0 }}>
            {LABEL_PREFIX}
          </span>
        )}
        <input
          className={styles.input}
          style={{ flex: 1, minWidth: 0 }}
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => { onChange(toFullValue(e.target.value)); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={(e) => {
            setTimeout(() => setOpen(false), 150);
            onBlur?.({ target: { value: toFullValue(e.target.value) } });
          }}
        />
      </div>
      {open && matches.length > 0 && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
            background: "var(--bg-hover)", border: "1px solid #333", borderRadius: 6,
            marginTop: 4, maxHeight: 200, overflowY: "auto",
          }}
        >
          {matches.map((l) => (
            <div
              key={l.label_name}
              onClick={() => { onChange(l.label_name); setOpen(false); }}
              onMouseDown={(e) => e.preventDefault()}
              style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--border)" }}
            >
              {hasLabelPrefix(l.label_name) && <span style={{ color: "var(--accent)", fontWeight: 700 }}>{LABEL_PREFIX}</span>}
              {hasLabelPrefix(l.label_name) ? stripLabelPrefix(l.label_name) : l.label_name}
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
            background: "var(--bg-hover)", border: "1px solid #333", borderRadius: 6,
            marginTop: 4, maxHeight: 200, overflowY: "auto",
          }}
        >
          {matches.map((a) => (
            <div
              key={a.stage_name}
              onClick={() => { onChange(a.stage_name); setOpen(false); }}
              onMouseDown={(e) => e.preventDefault()}
              style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--border)" }}
            >
              {a.stage_name}
              {a.labels?.label_name && <span style={{ color: "var(--text-faint)", marginLeft: 8 }}>— {a.labels.label_name}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
