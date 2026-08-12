"use client";

import { COPYRIGHT_ITEMS, COPYRIGHT_TYPE_OPTIONS, COPYRIGHT_CONTRACT_OPTIONS, normalizeCopyrightChecklist } from "./copyrightChecklist";

// Round 88 — shared UI for the Copyright Checklist group, used identically
// by the New Release create form and the release detail page's Overview
// tab (same "one component, two callers" pattern GateFields already is).
// `value` is the raw releases.copyright_checklist jsonb (possibly null/
// partial — normalized here), `onChange(nextValue)` gets the whole updated
// object back, same shape update() elsewhere in this app expects.
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
  const isExclusive = entry.type === "exclusive";
  const hasSubtype = isExclusive && !!entry.subtype;

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{item.label}</div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {COPYRIGHT_TYPE_OPTIONS.map((opt) => (
          <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
            <input
              type="radio"
              name={`${item.key}-type`}
              checked={entry.type === opt.key}
              onChange={() =>
                onPatch(
                  opt.key === "self"
                    ? { type: opt.key, subtype: null, subtypeName: "", contractType: null, contractText: "" }
                    : { type: opt.key }
                )
              }
            />
            {opt.label}
          </label>
        ))}
      </div>

      {isExclusive && (
        <div style={{ marginTop: 12, paddingLeft: 4, borderLeft: "2px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", paddingLeft: 10 }}>
            {item.subOptions.map((opt) => (
              <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                <input
                  type="radio"
                  name={`${item.key}-subtype`}
                  checked={entry.subtype === opt.key}
                  onChange={() => onPatch({ subtype: opt.key })}
                />
                {opt.label}
              </label>
            ))}
          </div>

          {hasSubtype && (
            <div style={{ paddingLeft: 10, marginTop: 10 }}>
              <input
                className={styles.input}
                style={{ width: "100%", maxWidth: 320 }}
                placeholder={`Tên ${item.subOptions.find((o) => o.key === entry.subtype)?.label || ""}…`}
                value={entry.subtypeName || ""}
                onChange={(e) => onPatch({ subtypeName: e.target.value })}
              />

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>
                  Có hợp đồng
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <select
                    className={styles.select}
                    style={{ minWidth: 180 }}
                    value={entry.contractType || ""}
                    onChange={(e) => onPatch({ contractType: e.target.value || null })}
                  >
                    <option value="">— chọn —</option>
                    {COPYRIGHT_CONTRACT_OPTIONS.map((o) => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                  {entry.contractType === "verbal" ? (
                    // Per explicit spec — a purely verbal confirmation
                    // doesn't get its own free-text field; this warning
                    // takes its place instead, nudging toward a real
                    // message/contract confirmation.
                    <div style={{ fontSize: 11, color: "var(--warn-fg)", flex: "1 1 220px", paddingTop: 7 }}>
                      Vui lòng confirm bằng tin nhắn hoặc hợp đồng
                    </div>
                  ) : (
                    <input
                      className={styles.input}
                      style={{ flex: "1 1 220px" }}
                      placeholder="Chi tiết / link tin nhắn hoặc hợp đồng…"
                      value={entry.contractText || ""}
                      onChange={(e) => onPatch({ contractText: e.target.value })}
                      disabled={!entry.contractType}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
