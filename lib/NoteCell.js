"use client";

import { useState } from "react";
import styles from "../app/shared.module.css";

// Round 76 — shared "Note" cell for ticket tables. Previously every list
// page rendered notes as an always-open <textarea> sized to a fixed short
// height, which either clipped long notes or ate a chunk of row height on
// every row regardless of whether it had anything in it. Now shows a
// compact single-line preview (hover it — the native title= tooltip shows
// the full text, no JS needed) plus a small Edit button that pops a real
// modal with a properly sized textarea to actually read/write in.
//
// editable=false (used where a requester can only read the note, e.g.
// Design's requester view) drops the Edit button and just shows the
// hoverable preview.
export default function NoteCell({ value, onSave, editable = true, placeholder = "—" }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || "");

  function openModal() {
    setDraft(value || "");
    setOpen(true);
  }
  function save() {
    onSave(draft);
    setOpen(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 120 }}>
      <div
        title={value || ""}
        style={{
          flex: 1,
          fontSize: 12,
          color: value ? "var(--text)" : "var(--text-faint)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 160,
        }}
      >
        {value || placeholder}
      </div>
      {editable && (
        <button type="button" onClick={openModal} className={styles.btnSmall} style={{ flexShrink: 0, padding: "2px 8px", fontSize: 10 }}>
          Edit
        </button>
      )}

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 20, width: "min(560px, 90vw)" }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Note</div>
            <textarea
              autoFocus
              className={styles.textarea}
              style={{ width: "100%", minHeight: 220, fontSize: 13, boxSizing: "border-box" }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button type="button" onClick={() => setOpen(false)} className={styles.btnSmall}>
                Cancel
              </button>
              <button type="button" onClick={save} className={styles.btnPrimary} style={{ padding: "6px 14px" }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
