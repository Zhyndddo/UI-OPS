"use client";

import LinkOrEditCell from "./LinkOrEditCell";
import { COPYRIGHT_ITEMS, COPYRIGHT_OWNER_OPTIONS, COPYRIGHT_VALIDITY_PRESETS, normalizeCopyrightChecklist } from "./copyrightChecklist";

function addMonths(dateStr, months) {
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  const d = new Date(base.getFullYear(), base.getMonth() + months, base.getDate());
  return d.toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Round 88 follow-up — shared UI for the Copyright Checklist group, used
// identically by the New Release create form and the release detail
// page's Overview tab (same "one component, two callers" pattern
// GateFields already is). `value` is the raw releases.copyright_checklist
// jsonb (possibly null/partial/old-shape — normalized here), `onChange
// (nextValue)` gets the whole updated object back.
export default function CopyrightChecklistFields({ styles, value, onChange }) {
  const data = normalizeCopyrightChecklist(value);

  function patchEntry(itemKey, entryPatch) {
    onChange({ ...data, [itemKey]: { ...data[itemKey], ...entryPatch } });
  }

  return (
    <>
      <div className={styles.subheading} style={{ marginTop: 8 }}>Copyright Checklist</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
        {COPYRIGHT_ITEMS.map((item) => (
          <CopyrightItem key={item.key} styles={styles} item={item} entry={data[item.key]} onPatch={(p) => patchEntry(item.key, p)} />
        ))}
      </div>
    </>
  );
}

function CopyrightItem({ styles, item, entry, onPatch }) {
  const isHopTac = entry.owner === "hopTac";

  function applyPreset(preset) {
    if (preset.key === "perpetual") {
      onPatch({ validFrom: entry.validFrom || todayStr(), validTo: "", perpetual: true });
      return;
    }
    const from = entry.validFrom || todayStr();
    onPatch({ validFrom: from, validTo: addMonths(from, preset.months), perpetual: false });
  }

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{item.label}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {/* Field 1 — Owner */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>Owner</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {COPYRIGHT_OWNER_OPTIONS.map((opt) => (
              <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                <input
                  type="radio"
                  name={`${item.key}-owner`}
                  checked={entry.owner === opt.key}
                  onChange={() => onPatch({ owner: opt.key, ...(opt.key === "self" ? { ownerName: "" } : {}) })}
                />
                {opt.label}
              </label>
            ))}
          </div>
          {isHopTac && (
            <input
              className={styles.input}
              style={{ width: "100%", marginTop: 8 }}
              placeholder="Hợp tác với ai…"
              value={entry.ownerName || ""}
              onChange={(e) => onPatch({ ownerName: e.target.value })}
            />
          )}
        </div>

        {/* Field 2 — Validity Period */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>Validity Period</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {COPYRIGHT_VALIDITY_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={styles.btnSmall}
                onClick={() => applyPreset(p)}
                style={
                  (p.key === "perpetual" ? entry.perpetual : !entry.perpetual && entry.validTo === addMonths(entry.validFrom, p.months))
                    ? { border: "1px solid var(--accent)", color: "var(--accent-soft)" }
                    : undefined
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="date"
              className={styles.input}
              style={{ padding: "6px 8px", fontSize: 12 }}
              value={entry.validFrom || ""}
              onChange={(e) => onPatch({ validFrom: e.target.value })}
            />
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>→</span>
            <input
              type="date"
              className={styles.input}
              style={{ padding: "6px 8px", fontSize: 12 }}
              value={entry.validTo || ""}
              disabled={entry.perpetual}
              placeholder={entry.perpetual ? "Vĩnh viễn" : undefined}
              onChange={(e) => onPatch({ validTo: e.target.value, perpetual: false })}
            />
          </div>
          {entry.perpetual && (
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>Vĩnh viễn — không có ngày kết thúc.</div>
          )}
        </div>

        {/* Field 3 — Contract */}
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
