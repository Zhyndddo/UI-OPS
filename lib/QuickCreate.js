"use client";

import { useState } from "react";
import { supabase } from "./supabaseClient";
import { withLabelPrefix, LABEL_PREFIX } from "./labelHelpers";
import { findExistingArtist, findExistingLabel, isUniqueViolation } from "./nameDedupe";

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
  const [dup, setDup] = useState(null); // Round 592 — the row that already has this name
  const [submitting, setSubmitting] = useState(false);

  const isLabel = kind === "label";

  async function handleCreate() {
    setError(null);
    setDup(null);
    if (!name.trim()) {
      setError("Required.");
      return;
    }
    setSubmitting(true);
    // Round 592 — never create a second copy of a name that already exists (ignores case / accents / "HĐ - ")
    const existing = await (isLabel ? findExistingLabel(supabase, name) : findExistingArtist(supabase, name));
    if (existing) {
      setSubmitting(false);
      setDup(existing);
      setError(`Already exists: ${isLabel ? existing.label_name : existing.stage_name}`);
      return;
    }
    const payload = isLabel ? { label_name: withLabelPrefix(name) } : { stage_name: name.trim() };
    const { data, error: err } = await supabase.from(isLabel ? "labels" : "artists").insert(payload).select().single();
    setSubmitting(false);
    if (err) {
      if (isUniqueViolation(err)) {
        const again = await (isLabel ? findExistingLabel(supabase, name) : findExistingArtist(supabase, name));
        if (again) setDup(again);
        setError("Already exists (someone just added it).");
        return;
      }
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
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 4,
              zIndex: 300,
              width: "min(260px, calc(100vw - 24px))",
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
            {dup && (
              <button type="button" onClick={() => { onCreated(dup); setDup(null); setError(null); setName(""); setOpen(false); }}
                style={{ marginBottom: 8, background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                Use the existing one
              </button>
            )}
            <input
              autoFocus
              placeholder={isLabel ? "Label name…" : "Nghệ danh…"}
              value={name}
              onChange={(e) => { setName(e.target.value); if (dup) { setDup(null); setError(null); } }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleCreate(); }
              }}
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
              type="button"
              onClick={handleCreate}
              disabled={submitting}
              style={{ width: "100%", background: "var(--accent)", color: "var(--accent-on)", border: "none", borderRadius: 6, padding: "7px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
