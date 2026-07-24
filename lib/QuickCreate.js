"use client";

import { useState } from "react";
import { supabase } from "./supabaseClient";
import { withLabelPrefix, LABEL_PREFIX } from "./labelHelpers";

// Small "+" popover for creating a Label or Artist inline, without leaving
// whatever form you're on — the main flow is still creating them in their
// own reference page; this is just a shortcut for the common "the one I
// need doesn't exist yet" case. Labels created here follow the exact same
// "HĐ - " prefix rule as the main Label List page (shared via labelHelpers),
// so there's no second, inconsistent creation path.
export default function QuickCreate({ kind, onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isLabel = kind === "label";

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Required.");
      return;
    }
    setSubmitting(true);
    const payload = isLabel ? { label_name: withLabelPrefix(name) } : { stage_name: name.trim() };
    const { data, error: err } = await supabase.from(isLabel ? "labels" : "artists").insert(payload).select().single();
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onCreated(data);
    setName("");
    setOpen(false);
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={isLabel ? "Quick-create a label" : "Quick-create an artist"}
        style={{
          background: "none",
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          width: 30,
          height: 30,
          cursor: "pointer",
          color: "var(--accent)",
          fontSize: 16,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        +
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 299 }} />
          <form
            onSubmit={handleCreate}
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 4,
              zIndex: 300,
              width: 260,
              background: "var(--bg-card)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              padding: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 8 }}>
              {isLabel ? "Quick-create Label" : "Quick-create Artist"}
            </div>
            {error && <div style={{ color: "var(--error-fg)", fontSize: 11, marginBottom: 6 }}>{error}</div>}
            <input
              autoFocus
              placeholder={isLabel ? "Label name…" : "Nghệ danh…"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg-input)",
                border: "1px solid var(--border-strong)",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 12,
                color: "var(--text)",
                marginBottom: 8,
                boxSizing: "border-box",
              }}
            />
            {isLabel && (
              <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 8 }}>
                Will be saved as "{withLabelPrefix(name || "…")}"
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              style={{ width: "100%", background: "var(--accent)", color: "var(--accent-on)", border: "none", borderRadius: 6, padding: "7px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
