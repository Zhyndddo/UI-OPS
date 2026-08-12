"use client";

import LinkOrEditCell from "./LinkOrEditCell";
import { COPYRIGHT_ITEMS, normalizeCopyrightChecklist } from "./copyrightChecklist";

// Round 88 (2nd follow-up) — shared UI for the Copyright Checklist group,
// used by the New Release create form, the release detail page's
// Copyrights tab (release-level), and per-track inside that same tab for
// EP/Album (see TracklistSection in app/releases/[id]/page.js). `value`
// is the raw copyright_checklist jsonb (possibly null/partial/old-shape —
// normalized here), `onChange(nextValue)` gets the whole updated object
// back.
export default function CopyrightChecklistFields({ styles, value, onChange, compact = false }) {
  const data = normalizeCopyrightChecklist(value);

  function patchEntry(itemKey, entryPatch) {
    onChange({ ...data, [itemKey]: { ...data[itemKey], ...entryPatch } });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 14 }}>
      {COPYRIGHT_ITEMS.map((item) => (
        <CopyrightItem key={item.key} styles={styles} item={item} entry={data[item.key]} onPatch={(p) => patchEntry(item.key, p)} compact={compact} />
      ))}
    </div>
  );
}

function CopyrightItem({ styles, item, entry, onPatch, compact }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: compact ? 10 : 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{item.label}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        {/* Field 1 — Owner: free text, expandable (resizable textarea) */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>Owner</div>
          <textarea
            className={styles.textarea}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 12, minHeight: 36, resize: "vertical" }}
            rows={1}
            placeholder="Ai sở hữu / nắm quyền…"
            value={entry.owner || ""}
            onChange={(e) => onPatch({ owner: e.target.value })}
          />
        </div>

        {/* Field 2 — Validity Period: 2 date pickers, OR "Không thời hạn" */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>Validity Period</div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-faint)", marginBottom: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!!entry.noTimeLimit}
              onChange={(e) => onPatch({ noTimeLimit: e.target.checked, ...(e.target.checked ? { validFrom: "", validTo: "" } : {}) })}
            />
            Không thời hạn
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", opacity: entry.noTimeLimit ? 0.4 : 1 }}>
            <input
              type="date"
              className={styles.input}
              style={{ padding: "6px 8px", fontSize: 12 }}
              value={entry.validFrom || ""}
              disabled={entry.noTimeLimit}
              onChange={(e) => onPatch({ validFrom: e.target.value })}
            />
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>→</span>
            <input
              type="date"
              className={styles.input}
              style={{ padding: "6px 8px", fontSize: 12 }}
              value={entry.validTo || ""}
              disabled={entry.noTimeLimit}
              onChange={(e) => onPatch({ validTo: e.target.value })}
            />
          </div>
        </div>

        {/* Field 3 — Contract: unchanged */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>Contract</div>
          <LinkOrEditCell
            styles={styles}
            value={entry.contract}
            placeholder="Link hợp đồng, hoặc ghi chú…"
            onSave={(v) => onPatch({ contract: v })}
          />
        </div>
      </div>
    </div>
  );
}
