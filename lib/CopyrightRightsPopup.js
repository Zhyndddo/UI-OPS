"use client";

import { useState } from "react";
import { COPYRIGHT_ITEMS, normalizeCopyrightChecklist, copyrightEntryIsDeclared } from "./copyrightChecklist";

// Round 115 — was CopyrightRightPopup (singular): one popup per (track,
// right), opened from one of 3 separate "+ Declare" buttons per track row.
// Per explicit request ("add 3 rights into 3 tabs for convenient input"),
// this is now ONE popup for the whole track's checklist (all 3 rights),
// switched between via tabs — fill in Master, flip to Vocal, flip to
// Author, Save once, instead of opening/closing the popup 3 separate
// times. `checklist` is the full (already normalized) 3-key object;
// `onSave(nextChecklist)` is called once with the full patched checklist.
export default function CopyrightRightsPopup({ trackLabel, checklist, onClose, onSave }) {
  const normalized = normalizeCopyrightChecklist(checklist);
  const [activeKey, setActiveKey] = useState(
    // Default to the first not-yet-declared tab, if any — that's the one
    // most likely to be why this popup was opened. Falls back to the
    // first tab if everything's already declared.
    COPYRIGHT_ITEMS.find((item) => !copyrightEntryIsDeclared(normalized[item.key]))?.key || COPYRIGHT_ITEMS[0].key
  );
  const [drafts, setDrafts] = useState(() => {
    const out = {};
    COPYRIGHT_ITEMS.forEach((item) => {
      const e = normalized[item.key];
      out[item.key] = {
        owner: e.owner || "",
        term: e.noTimeLimit || (!e.validFrom && !e.validTo) ? "perpetual" : "fixed",
        validFrom: e.validFrom || "",
        validTo: e.validTo || "",
        contract: e.contract || "",
        note: e.note || "",
      };
    });
    return out;
  });
  const [saving, setSaving] = useState(false);

  const draft = drafts[activeKey];
  function patchDraft(patch) {
    setDrafts((d) => ({ ...d, [activeKey]: { ...d[activeKey], ...patch } }));
  }

  async function handleSave() {
    setSaving(true);
    const next = {};
    COPYRIGHT_ITEMS.forEach((item) => {
      const d = drafts[item.key];
      next[item.key] = {
        owner: d.owner.trim(),
        noTimeLimit: d.term === "perpetual",
        validFrom: d.term === "fixed" ? d.validFrom : "",
        validTo: d.term === "fixed" ? d.validTo : "",
        contract: d.contract,
        note: d.note,
      };
    });
    await onSave(next);
    setSaving(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 24, maxWidth: 580, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>
            Declare Rights{trackLabel ? <span style={{ color: "var(--text-faint)", fontWeight: 600 }}> · {trackLabel}</span> : null}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* Round 115 item 2 — 3 tabs, one per right, instead of 3 separate
            popups. Each tab shows a small ✓ once it has a real owner typed
            in the CURRENT draft (updates live as you type, not just on
            open), so switching tabs shows progress at a glance. */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: "1px solid var(--border)" }}>
          {COPYRIGHT_ITEMS.map((item) => {
            const isActive = item.key === activeKey;
            const declared = !!drafts[item.key].owner.trim();
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveKey(item.key)}
                style={{
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  border: "none",
                  borderBottom: isActive ? "2px solid #ff6b1a" : "2px solid transparent",
                  background: "none",
                  color: isActive ? "inherit" : "var(--text-faint)",
                }}
              >
                {declared ? "✓ " : ""}{rightNameFor(item.key)}
              </button>
            );
          })}
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            Owner <span style={{ color: "#e57373" }}>*</span>
          </label>
          <input
            className="input"
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "inherit" }}
            value={draft.owner}
            onChange={(e) => patchDraft({ owner: e.target.value })}
            placeholder="Company or person holding this right"
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Term</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button
              type="button"
              onClick={() => patchDraft({ term: "perpetual" })}
              style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                border: draft.term === "perpetual" ? "1.5px solid #ff6b1a" : "1px solid var(--border)",
                background: draft.term === "perpetual" ? "var(--warn-bg, rgba(255,107,26,0.08))" : "var(--bg)",
                color: "inherit",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Perpetual</div>
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>No end date</div>
            </button>
            <button
              type="button"
              onClick={() => patchDraft({ term: "fixed" })}
              style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                border: draft.term === "fixed" ? "1.5px solid #ff6b1a" : "1px solid var(--border)",
                background: draft.term === "fixed" ? "var(--warn-bg, rgba(255,107,26,0.08))" : "var(--bg)",
                color: "inherit",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Fixed term</div>
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Runs between two dates</div>
            </button>
          </div>
          {draft.term === "fixed" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
              <input
                type="date"
                style={{ padding: "7px 10px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "inherit" }}
                value={draft.validFrom}
                onChange={(e) => patchDraft({ validFrom: e.target.value })}
              />
              <span style={{ fontSize: 11, color: "var(--text-faint)" }}>→</span>
              <input
                type="date"
                style={{ padding: "7px 10px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "inherit" }}
                value={draft.validTo}
                onChange={(e) => patchDraft({ validTo: e.target.value })}
              />
            </div>
          )}
        </div>

        {/* Round 109 note (still applies) — no file storage backend exists
            anywhere in this app, so Contract stays a link/text field. */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Contract / Link</label>
          <input
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "inherit" }}
            value={draft.contract}
            onChange={(e) => patchDraft({ contract: e.target.value })}
            placeholder="Link hợp đồng, hoặc ghi chú…"
          />
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Note</label>
          <textarea
            style={{ width: "100%", boxSizing: "border-box", minHeight: 60, resize: "vertical", padding: "9px 12px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "inherit", fontFamily: "inherit" }}
            value={draft.note}
            onChange={(e) => patchDraft({ note: e.target.value })}
            placeholder="Internal note about this right"
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "9px 18px", fontSize: 13, fontWeight: 600, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "inherit", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "9px 18px", fontSize: 13, fontWeight: 700, border: "none", borderRadius: 6, background: "#ff6b1a", color: "#0a0a0a", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : "Save all 3 rights"}
          </button>
        </div>
      </div>
    </div>
  );
}

function rightNameFor(key) {
  if (key === "master") return "Record producer right";
  if (key === "vocal") return "Performer right";
  if (key === "author") return "Author right";
  return key;
}
