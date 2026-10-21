"use client";

import { useEffect, useState } from "react";

// Round 535 — "select reference" field: pick from a list (type to filter) or
// add a new entry when it isn't there. The value can only ever be a listed
// option or a just-added one: typing something that matches nothing and
// clicking away puts the previous value back, so free typos can't slip in.
// `onAdd(text)` must save the new entry and resolve the canonical text (or
// null/undefined on failure, which leaves the field unchanged).
export default function ReferenceCombo({ value, onChange, options, onAdd, placeholder, addLabel = "Add", disabled, styles, width }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setText(value || ""); }, [value]);

  const q = text.trim().toLowerCase();
  const filtered = (q && q !== (value || "").toLowerCase() ? options.filter((o) => o.toLowerCase().includes(q)) : options).slice(0, 50);
  const exact = options.some((o) => o.toLowerCase() === q);
  const canAdd = !!onAdd && q.length > 0 && !exact;

  function pick(o) { onChange(o); setText(o); setOpen(false); }
  async function add() {
    setBusy(true);
    const saved = await onAdd(text.trim());
    setBusy(false);
    if (saved) pick(saved);
  }
  function commitOnBlur() {
    setTimeout(() => {
      setOpen(false);
      const hit = options.find((o) => o.toLowerCase() === text.trim().toLowerCase());
      if (hit) { if (hit !== value) onChange(hit); setText(hit); }
      else setText(value || ""); // unmatched text is dropped; use the "+ Add" row to create it
    }, 160);
  }

  return (
    <div style={{ position: "relative", width }}>
      <input
        className={styles.input}
        style={{ fontSize: 12, width: "100%" }}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={commitOnBlur}
      />
      {open && !disabled && (filtered.length > 0 || canAdd) && (
        <div style={{ position: "absolute", top: "100%", left: 0, minWidth: "100%", zIndex: 20, background: "var(--bg-hover)", border: "1px solid var(--border-strong)", borderRadius: 6, marginTop: 4, maxHeight: 220, overflowY: "auto" }}>
          {filtered.map((o) => (
            <div key={o} onMouseDown={(e) => { e.preventDefault(); pick(o); }} style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", fontWeight: o === value ? 700 : 400 }}>{o}</div>
          ))}
          {canAdd && (
            <div onMouseDown={(e) => { e.preventDefault(); if (!busy) add(); }} style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer", color: "var(--accent)", fontWeight: 700, borderTop: filtered.length ? "1px solid var(--border)" : "none" }}>
              {busy ? "Adding…" : `+ ${addLabel} “${text.trim()}”`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
